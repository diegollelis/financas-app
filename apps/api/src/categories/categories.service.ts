import {
  CATEGORY_HINT_MONTHS,
  CATEGORY_USAGE_MONTHS,
  MAX_DESCRIPTION_HINTS,
  type CategoryHints,
  currentPeriod,
  normalizeName,
  shiftPeriod,
  type Category,
  type CopyCategoriesInput,
  type CopyCategoriesResult,
  type CreateCategoryInput,
  type TransactionType,
  type UpdateCategoryInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Category as CategoryRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { categoriesInUse, categoryInUse } from './categories-in-use.js';
import { shareCategoryId } from './share-category.js';

function toResponse(
  category: CategoryRow,
  recentUses = 0,
  destinationId: string | null = null,
  inUse?: boolean,
): Category {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    archived: category.archivedAt !== null,
    recentUses,
    destinationId,
    splitRole: category.splitRole,
    neutral: category.neutral,
    returnCategoryId: category.returnCategoryId,
    ...(inUse !== undefined && { inUse }),
  };
}

/** Sorts names as a Brazilian reader expects ("Água" next to "Aluguel", not after "Viagem"). */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const typeOrder: Record<TransactionType, number> = { CREDIT: 0, DEBIT: 1 };

const ownedByDestination = () =>
  new ConflictException({
    code: 'CATEGORY_OF_DESTINATION',
    message: 'Esta categoria é de uma meta: renomeie, arquive ou exclua pela meta, no orçamento.',
  });

const ofSplit = () =>
  new ConflictException({
    code: 'CATEGORY_OF_SPLIT',
    message:
      'Esta categoria recebe as partes das divisões entre pessoas: ela não é renomeada, arquivada nem excluída.',
  });

const notALoan = () =>
  new ConflictException({
    code: 'NOT_A_LOAN_CATEGORY',
    message:
      'Só uma categoria marcada "Nem renda nem gasto" escolhe a categoria da devolução ou da dívida.',
  });

/** The other side: a debit's shares are credits, a credit's are debits. */
const opposite = (type: TransactionType): TransactionType =>
  type === 'DEBIT' ? 'CREDIT' : 'DEBIT';

/** What the chosen category is to a loan of that side (ADRs 0058, 0059), as the UI says it. */
const loanRole = (type: TransactionType) => (type === 'DEBIT' ? 'devolução' : 'dívida');

const categoryExists = () =>
  new ConflictException({
    code: 'CATEGORY_EXISTS',
    message: 'Já existe uma categoria com esse nome. Se ela estiver arquivada, reative-a.',
  });

/**
 * Prisma error codes: P2002 = unique constraint violated, P2003 = foreign key violated,
 * P2025 = record to update not found.
 */
function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025') {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Categories of one workspace. The workspaceId comes from WorkspaceMemberGuard; every query
 * filters by it and runs through forWorkspace, so RLS backs the filter up (ADRs 0008 and 0028).
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of them, archived too: credits first, then debits, each by name. */
  async list(workspaceId: string): Promise<Category[]> {
    const db = this.prisma.forWorkspace(workspaceId);
    const now = currentPeriod();
    const [categories, usage, used] = await Promise.all([
      db.category.findMany({
        where: { workspaceId },
        include: { destination: { select: { id: true } } },
      }),
      // One count per category, on the (workspace_id, period) index.
      db.transaction.groupBy({
        by: ['categoryId'],
        where: {
          workspaceId,
          period: { gte: shiftPeriod(now, 1 - CATEGORY_USAGE_MONTHS), lte: now },
        },
        _count: { _all: true },
      }),
      categoriesInUse(db, workspaceId),
    ]);
    const uses = new Map(usage.map((row) => [row.categoryId, row._count._all]));
    return categories
      .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || collator.compare(a.name, b.name))
      .map((category) =>
        toResponse(
          category,
          uses.get(category.id) ?? 0,
          category.destination?.id ?? null,
          used.has(category.id),
        ),
      );
  }

  /**
   * Which category, and which payment method, usually go with each merchant and each
   * description, per type (ADRs 0053, 0054), from the last 12 months: what the form fills an
   * empty field with. Shares of a split are left out: they repeat the description of
   * what was split, in Reembolso or Repasse, and would suggest those (ADR 0052 note). Only names and ids, no amount.
   */
  async hints(workspaceId: string): Promise<CategoryHints> {
    const db = this.prisma.forWorkspace(workspaceId);
    const now = currentPeriod();
    const where = {
      workspaceId,
      splitOfId: null,
      period: { gte: shiftPeriod(now, 1 - CATEGORY_HINT_MONTHS), lte: now },
    };
    const withMerchant = { ...where, merchantId: { not: null } };
    const withMethod = { ...where, paymentMethod: { not: null } };
    const [byMerchant, byDescription, methodByMerchant, methodByDescription] = await Promise.all([
      db.transaction.groupBy({
        by: ['merchantId', 'type', 'categoryId'],
        where: withMerchant,
        _count: { _all: true },
      }),
      db.transaction.groupBy({
        by: ['description', 'type', 'categoryId'],
        where,
        _count: { _all: true },
      }),
      db.transaction.groupBy({
        by: ['merchantId', 'type', 'paymentMethod'],
        where: { ...withMethod, merchantId: { not: null } },
        _count: { _all: true },
      }),
      db.transaction.groupBy({
        by: ['description', 'type', 'paymentMethod'],
        where: withMethod,
        _count: { _all: true },
      }),
    ]);
    // The most used choice of each key; descriptions are merged as normalizeName gives them.
    const best = <T, C extends string>(
      rows: { key: string; value: T; choice: C; count: number }[],
    ) => {
      const totals = new Map<string, { value: T; choice: C; count: number }>();
      for (const row of rows) {
        const id = `${row.key}|${row.choice}`;
        const total = totals.get(id);
        totals.set(id, { ...row, count: (total?.count ?? 0) + row.count });
      }
      const top = new Map<string, { value: T; choice: C; count: number }>();
      for (const [id, total] of totals) {
        const key = id.slice(0, id.lastIndexOf('|'));
        if ((top.get(key)?.count ?? 0) < total.count) top.set(key, total);
      }
      return [...top.values()].sort((a, b) => b.count - a.count);
    };
    const merchantKey = (row: { merchantId: string | null; type: TransactionType }) => ({
      key: `${row.merchantId}|${row.type}`,
      value: { merchantId: row.merchantId!, type: row.type },
    });
    const descriptionKey = (row: { description: string; type: TransactionType }) => {
      const description = normalizeName(row.description);
      return { key: `${description}|${row.type}`, value: { description, type: row.type } };
    };
    const merchants = best(
      byMerchant.map((row) => ({
        ...merchantKey(row),
        choice: row.categoryId,
        count: row._count._all,
      })),
    );
    const descriptions = best(
      byDescription.map((row) => ({
        ...descriptionKey(row),
        choice: row.categoryId,
        count: row._count._all,
      })),
    ).slice(0, MAX_DESCRIPTION_HINTS);
    const methodMerchants = best(
      methodByMerchant.map((row) => ({
        ...merchantKey(row),
        choice: row.paymentMethod!,
        count: row._count._all,
      })),
    );
    const methodDescriptions = best(
      methodByDescription.map((row) => ({
        ...descriptionKey(row),
        choice: row.paymentMethod!,
        count: row._count._all,
      })),
    ).slice(0, MAX_DESCRIPTION_HINTS);
    return {
      merchants: merchants.map(({ value, choice }) => ({ ...value, categoryId: choice })),
      descriptions: descriptions.map(({ value, choice }) => ({ ...value, categoryId: choice })),
      paymentMethods: {
        merchants: methodMerchants.map(({ value, choice }) => ({
          ...value,
          paymentMethod: choice,
        })),
        descriptions: methodDescriptions.map(({ value, choice }) => ({
          ...value,
          paymentMethod: choice,
        })),
      },
    };
  }

  async create(workspaceId: string, input: CreateCategoryInput): Promise<Category> {
    await this.ensureNameIsFree(workspaceId, input.type, input.name);
    try {
      const category = await this.prisma
        .forWorkspace(workspaceId)
        .category.create({ data: { workspaceId, name: input.name, type: input.type } });
      // Just created: nothing uses it yet.
      return toResponse(category, 0, null, false);
    } catch (error) {
      // Two simultaneous requests with the same name: the unique index decides.
      if (isPrismaError(error, 'P2002')) throw categoryExists();
      throw error;
    }
  }

  /**
   * Copies categories of another workspace the person is a member of (ADR 0048). Only active
   * ones, never a saving destination's (it belongs to the destination, ADR 0047), and none whose
   * name is already here for the same type, ignoring case and accents, archived ones too. The
   * source is read in its own RLS context, after checking the membership; this workspace is
   * written in its own. A source that is not the person's answers 404, as any other workspace.
   */
  async copy(
    workspaceId: string,
    userId: string,
    input: CopyCategoriesInput,
  ): Promise<CopyCategoriesResult> {
    const member = await this.prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId: input.sourceWorkspaceId, userId } },
    });
    if (!member) throw new NotFoundException();
    const requested = new Set(input.categoryIds);
    const [source, here] = await Promise.all([
      this.prisma.forWorkspace(input.sourceWorkspaceId).category.findMany({
        where: {
          workspaceId: input.sourceWorkspaceId,
          id: { in: [...requested] },
          archivedAt: null,
          destination: { is: null },
          // Every workspace has its own Reembolso and Repasse (ADR 0052 note).
          splitRole: null,
        },
        select: { id: true, name: true, type: true, neutral: true, returnCategoryId: true },
      }),
      this.prisma
        .forWorkspace(workspaceId)
        .category.findMany({ where: { workspaceId }, select: { name: true, type: true } }),
    ]);
    const key = (category: { name: string; type: TransactionType }) =>
      `${category.type}:${normalizeName(category.name)}`;
    const taken = new Set(here.map(key));
    const data = source.flatMap((category) => {
      if (taken.has(key(category))) return [];
      taken.add(key(category));
      return [{ workspaceId, name: category.name, type: category.type, neutral: category.neutral }];
    });
    // Someone creating the same name meanwhile: the unique index skips it.
    const db = this.prisma.forWorkspace(workspaceId);
    const created = data.length
      ? await db.category.createManyAndReturn({ data, skipDuplicates: true })
      : [];
    // A loan's return goes along when both were copied (ADR 0058).
    const newId = new Map(created.map((category) => [key(category), category.id]));
    const sourceKey = new Map(source.map((category) => [category.id, key(category)]));
    for (const category of source) {
      const loan = newId.get(key(category));
      const target = category.returnCategoryId && sourceKey.get(category.returnCategoryId);
      const returnCategoryId = target && newId.get(target);
      if (loan && returnCategoryId) {
        await db.category.update({ where: { id: loan }, data: { returnCategoryId } });
      }
    }
    return { copied: created.length, skipped: requested.size - created.length };
  }

  async update(
    workspaceId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    const current = await this.find(workspaceId, categoryId);
    if (current.splitRole) throw ofSplit();
    await this.ensureNotOwnedByDestination(workspaceId, categoryId);
    if (input.name !== undefined) {
      await this.ensureNameIsFree(workspaceId, current.type, input.name, categoryId);
    }
    let archivedAt: Date | null | undefined;
    if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
    if (input.archived === false) archivedAt = null;
    // Where a loan's money comes back, or a borrowing's debt is kept (ADRs 0058, 0059), stays
    // marked and offered while chosen.
    if (input.neutral === false || input.archived === true) {
      await this.ensureNotALoanReturn(workspaceId, categoryId);
    }
    const neutral = input.neutral ?? current.neutral;
    let returnCategoryId = input.returnCategoryId;
    if (returnCategoryId) {
      if (!neutral) throw notALoan();
      await this.ensureLoanReturn(workspaceId, returnCategoryId, opposite(current.type));
    }
    // Unmarked, it is no loan any more: its shares go back to Reembolso or Repasse.
    if (!neutral && current.returnCategoryId) returnCategoryId = null;

    try {
      const db = this.prisma.forWorkspace(workspaceId);
      const category = await db.category.update({
        where: { id: categoryId, workspaceId },
        data: { name: input.name, archivedAt, neutral: input.neutral, returnCategoryId },
      });
      if (returnCategoryId !== undefined && returnCategoryId !== current.returnCategoryId) {
        await this.moveLoanShares(workspaceId, categoryId, opposite(current.type));
      }
      return toResponse(category, 0, null, await categoryInUse(db, workspaceId, categoryId));
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw categoryExists();
      // Deleted by someone else between the read and the update.
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * Deletes a category. One in use can only be archived: the foreign key of transactions
   * (ADR 0029) refuses the delete, which becomes a 409.
   */
  async remove(workspaceId: string, categoryId: string): Promise<void> {
    const current = await this.find(workspaceId, categoryId);
    if (current.splitRole) throw ofSplit();
    await this.ensureNotOwnedByDestination(workspaceId, categoryId);
    await this.ensureNotALoanReturn(workspaceId, categoryId);
    try {
      const { count } = await this.prisma
        .forWorkspace(workspaceId)
        .category.deleteMany({ where: { id: categoryId, workspaceId } });
      if (count === 0) throw new NotFoundException();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'CATEGORY_IN_USE',
          message:
            'Esta categoria está em uso em lançamentos ou recorrências: ela não pode ser excluída, só arquivada.',
        });
      }
      throw error;
    }
  }

  /**
   * Where a loan's money comes back, or a borrowing's debt is kept (ADRs 0058, 0059): a category
   * of the other side in this workspace, marked "Nem renda nem gasto", offered (not archived) and
   * not Reembolso or Repasse.
   */
  private async ensureLoanReturn(
    workspaceId: string,
    returnCategoryId: string,
    type: TransactionType,
  ) {
    const target = await this.prisma.forWorkspace(workspaceId).category.findFirst({
      where: { id: returnCategoryId, workspaceId },
    });
    if (
      !target ||
      target.type !== type ||
      !target.neutral ||
      target.archivedAt ||
      target.splitRole
    ) {
      const side = type === 'CREDIT' ? 'entrada' : 'saída';
      throw new BadRequestException({
        code: 'INVALID_RETURN_CATEGORY',
        message: `Escolha uma categoria de ${side} marcada "Nem renda nem gasto".`,
      });
    }
  }

  /** The category chosen by a loans category stays marked, offered and in place (ADRs 0058, 0059). */
  private async ensureNotALoanReturn(workspaceId: string, categoryId: string) {
    const loan = await this.prisma.forWorkspace(workspaceId).category.findFirst({
      where: { workspaceId, returnCategoryId: categoryId },
      select: { name: true, type: true },
    });
    if (loan) {
      const role = loanRole(loan.type);
      throw new ConflictException({
        code: 'CATEGORY_RECEIVES_LOANS',
        message: `Esta categoria é a ${role} dos empréstimos de "${loan.name}". Troque lá, em "Categoria da ${role}", antes.`,
      });
    }
  }

  /**
   * The shares split from the transactions of this category, settled or not, go where they belong
   * now: the chosen category of the other side, or Reembolso or Repasse (ADRs 0058, 0059). So a
   * loan launched before the choice is fixed, and taking the choice back undoes it.
   */
  private async moveLoanShares(
    workspaceId: string,
    categoryId: string,
    shareType: TransactionType,
  ) {
    const target = await shareCategoryId(this.prisma, workspaceId, shareType, categoryId);
    await this.prisma.forWorkspace(workspaceId).transaction.updateMany({
      where: { workspaceId, type: shareType, splitOf: { is: { categoryId } } },
      data: { categoryId: target },
    });
  }

  /** A saving destination's category is renamed, archived and deleted with it (ADR 0047). */
  private async ensureNotOwnedByDestination(workspaceId: string, categoryId: string) {
    const destination = await this.prisma
      .forWorkspace(workspaceId)
      .budgetDestination.findFirst({ where: { workspaceId, categoryId } });
    if (destination) throw ownedByDestination();
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, categoryId: string): Promise<CategoryRow> {
    if (!z.uuid().safeParse(categoryId).success) throw new NotFoundException();
    const category = await this.prisma
      .forWorkspace(workspaceId)
      .category.findFirst({ where: { id: categoryId, workspaceId } });
    if (!category) throw new NotFoundException();
    return category;
  }

  /** Names are unique per workspace and type, ignoring case ("mercado" = "Mercado"). */
  private async ensureNameIsFree(
    workspaceId: string,
    type: TransactionType,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.prisma.forWorkspace(workspaceId).category.findFirst({
      where: {
        workspaceId,
        type,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw categoryExists();
  }
}
