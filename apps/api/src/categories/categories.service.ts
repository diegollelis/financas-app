import {
  CATEGORY_USAGE_MONTHS,
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
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Category as CategoryRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

function toResponse(
  category: CategoryRow,
  recentUses = 0,
  destinationId: string | null = null,
): Category {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    archived: category.archivedAt !== null,
    recentUses,
    destinationId,
  };
}

/** Sorts names as a Brazilian reader expects ("Água" next to "Aluguel", not after "Viagem"). */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const typeOrder: Record<TransactionType, number> = { CREDIT: 0, DEBIT: 1 };

const ownedByDestination = () =>
  new ConflictException({
    code: 'CATEGORY_OF_DESTINATION',
    message:
      'Esta categoria é de um destino do orçamento: renomeie, arquive ou exclua pelo destino.',
  });

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
    const [categories, usage] = await Promise.all([
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
    ]);
    const uses = new Map(usage.map((row) => [row.categoryId, row._count._all]));
    return categories
      .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || collator.compare(a.name, b.name))
      .map((category) =>
        toResponse(category, uses.get(category.id) ?? 0, category.destination?.id ?? null),
      );
  }

  async create(workspaceId: string, input: CreateCategoryInput): Promise<Category> {
    await this.ensureNameIsFree(workspaceId, input.type, input.name);
    try {
      const category = await this.prisma
        .forWorkspace(workspaceId)
        .category.create({ data: { workspaceId, name: input.name, type: input.type } });
      return toResponse(category);
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
        },
        select: { name: true, type: true },
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
      return [{ workspaceId, name: category.name, type: category.type }];
    });
    // Someone creating the same name meanwhile: the unique index skips it.
    const { count } = data.length
      ? await this.prisma
          .forWorkspace(workspaceId)
          .category.createMany({ data, skipDuplicates: true })
      : { count: 0 };
    return { copied: count, skipped: requested.size - count };
  }

  async update(
    workspaceId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    const current = await this.find(workspaceId, categoryId);
    await this.ensureNotOwnedByDestination(workspaceId, categoryId);
    if (input.name !== undefined) {
      await this.ensureNameIsFree(workspaceId, current.type, input.name, categoryId);
    }
    let archivedAt: Date | null | undefined;
    if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
    if (input.archived === false) archivedAt = null;

    try {
      const category = await this.prisma.forWorkspace(workspaceId).category.update({
        where: { id: categoryId, workspaceId },
        data: { name: input.name, archivedAt },
      });
      return toResponse(category);
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
    if (!z.uuid().safeParse(categoryId).success) throw new NotFoundException();
    await this.ensureNotOwnedByDestination(workspaceId, categoryId);
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
