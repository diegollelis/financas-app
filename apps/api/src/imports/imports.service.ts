import {
  dueDateFor,
  installmentsCreated,
  normalizeName,
  normalizeStatementTitle,
  shiftPeriod,
  type CreateImportInput,
  type Import,
  type ImportInstallmentPlanInput,
  type ImportKind,
  type ImportMerchantAliasInput,
  type StatementBank,
} from '@financas/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategories } from '../categories/ensure-category.js';
import type { TransactionImport } from '../generated/prisma/client.js';
import { PeopleService } from '../people/people.service.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { toDate, toIsoDate } from '../transactions/dates.js';

type ImportRow = TransactionImport & {
  createdBy: { name: string } | null;
  _count: { installmentPlans: number };
};

const noDependents: Import['dependents'] = {
  recurrenceMonths: 0,
  splitTransactions: 0,
  installmentAdoptions: 0,
  plansUntil: null,
};

function toResponse(row: ImportRow, dependents = noDependents): Import {
  return {
    id: row.id,
    transactionCount: row.transactionCount,
    planCount: row._count.installmentPlans,
    label: row.label,
    statementDueDate: row.statementDueDate && toIsoDate(row.statementDueDate),
    kind: row.kind,
    bank: row.bank,
    firstPeriod: row.firstPeriod,
    lastPeriod: row.lastPeriod,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    dependents,
  };
}

/**
 * What an import brings and from which bank (ADR 0060). A client from before them is read as it
 * meant: a statement due date was only ever sent by Nubank's card statement (ADR 0055).
 */
function kindOf(input: CreateImportInput): { kind: ImportKind; bank: StatementBank | null } {
  if (input.kind) return { kind: input.kind, bank: input.bank ?? null };
  return input.statementDueDate
    ? { kind: 'CARD_STATEMENT', bank: 'NUBANK' }
    : { kind: 'TEMPLATE', bank: null };
}

const withCreator = {
  createdBy: { select: { name: true } },
  _count: { select: { installmentPlans: true } },
} as const;

/**
 * Spreadsheet imports of one workspace (ADR 0040). Same rules as the other resources: the
 * workspaceId comes from WorkspaceMemberGuard, every query filters by it and runs through
 * forWorkspace (RLS). Descriptions and amounts are personal data: never log them (ADR 0012).
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
  ) {}

  /** Newest first. */
  async list(workspaceId: string): Promise<Import[]> {
    const db = this.prisma.forWorkspace(workspaceId);
    const imports = await db.transactionImport.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: withCreator,
    });
    const ids = imports.map((item) => item.id);
    // What was built on the transactions of each import since (ADR 0060 note).
    const [own, installments] = await Promise.all([
      db.transaction.findMany({
        where: { workspaceId, importId: { in: ids } },
        select: {
          importId: true,
          occurrence: { select: { recurrenceId: true } },
          installmentPlan: { select: { importId: true } },
          _count: { select: { shares: true } },
        },
      }),
      db.transaction.groupBy({
        by: ['installmentPlanId'],
        where: { workspaceId, installmentPlan: { importId: { in: ids } } },
        _max: { period: true },
      }),
    ]);
    const plans = await db.installmentPlan.findMany({
      where: { workspaceId, importId: { in: ids } },
      select: { id: true, importId: true },
    });
    const lastOfPlan = new Map(
      installments.map((group) => [group.installmentPlanId, group._max.period]),
    );
    const dependentsOf = (importId: string): Import['dependents'] => {
      const mine = own.filter((transaction) => transaction.importId === importId);
      const until = plans
        .filter((plan) => plan.importId === importId)
        .map((plan) => lastOfPlan.get(plan.id) ?? null)
        .filter((period): period is string => period !== null)
        .sort()
        .at(-1);
      return {
        recurrenceMonths: mine.filter((transaction) => transaction.occurrence).length,
        splitTransactions: mine.filter((transaction) => transaction._count.shares > 0).length,
        // Made an installment plan after being imported ("Tornar parcelado"), not one it brought.
        installmentAdoptions: mine.filter(
          (transaction) =>
            transaction.installmentPlan && transaction.installmentPlan.importId !== importId,
        ).length,
        plansUntil: until ?? null,
      };
    };
    return imports.map((item) => toResponse(item, dependentsOf(item.id)));
  }

  /**
   * Creates the import and all its transactions in one nested write: all or nothing. Every
   * category is checked first, so a wrong one refuses the batch with a clear message. The
   * merchants named (ADR 0053) and the people (ADR 0042) are found or created before, and stay
   * if the import is undone.
   * A card statement (ADR 0055) also brings installment plans, created in the same write and
   * deleted with the import, and merchant aliases, created before and kept, like the merchants.
   */
  async create(workspaceId: string, userId: string, input: CreateImportInput): Promise<Import> {
    const plans = input.plans ?? [];
    const aliases = input.aliases ?? [];
    await ensureUsableCategories(this.prisma, workspaceId, [...input.transactions, ...plans]);
    const newAliases = await this.newAliases(workspaceId, aliases);
    const merchantIds = await this.merchantIds(workspaceId, [
      ...input.transactions.map((transaction) => transaction.merchantName),
      ...plans.map((plan) => plan.merchantName),
      ...aliases.map((alias) => alias.merchantName),
    ]);
    const merchantOf = (name: string | undefined) =>
      name ? (merchantIds.get(normalizeName(name)) ?? null) : null;
    const personIds = await this.personIds(
      workspaceId,
      input.transactions.map((transaction) => transaction.personName),
    );
    const personOf = (name: string | undefined) =>
      name ? (personIds.get(normalizeName(name)) ?? null) : null;
    if (newAliases.size > 0) {
      await this.prisma.forWorkspace(workspaceId).merchantAlias.createMany({
        data: [...newAliases].map(([normalized, { alias, merchantName }]) => ({
          workspaceId,
          merchantId: merchantOf(merchantName)!,
          alias,
          normalized,
        })),
      });
    }
    const installmentsOf = plans.map((plan) =>
      this.installments(workspaceId, plan, merchantOf(plan.merchantName)),
    );
    const periods = [
      ...input.transactions.map((transaction) => transaction.period),
      ...installmentsOf.flat().map((installment) => installment.period),
    ].sort();
    const created = await this.prisma.forWorkspace(workspaceId).transactionImport.create({
      data: {
        workspaceId,
        createdById: userId,
        transactionCount: periods.length,
        label: input.label ?? null,
        statementDueDate: input.statementDueDate ? toDate(input.statementDueDate) : null,
        ...kindOf(input),
        firstPeriod: periods[0] ?? '',
        lastPeriod: periods.at(-1) ?? '',
        installmentPlans: {
          create: plans.map((plan, index) => ({
            workspaceId,
            type: plan.type,
            description: plan.description,
            notes: plan.notes ?? null,
            categoryId: plan.categoryId,
            totalCents: plan.amountCents * installmentsCreated(plan),
            installments: plan.installments,
            firstNumber: plan.firstNumber ?? 1,
            firstPeriod: plan.firstPeriod,
            occurredOn: plan.occurredOn ? toDate(plan.occurredOn) : null,
            dueDay: plan.dueDay ?? null,
            dueMonthOffset: plan.dueMonthOffset ?? 0,
            paymentMethod: plan.paymentMethod ?? null,
            merchantId: merchantOf(plan.merchantName),
            transactions: { create: installmentsOf[index]! },
          })),
        },
        transactions: {
          createMany: {
            data: input.transactions.map((transaction) => ({
              workspaceId,
              type: transaction.type,
              description: transaction.description,
              notes: transaction.notes ?? null,
              categoryId: transaction.categoryId,
              amountCents: transaction.amountCents,
              period: transaction.period,
              dueDate: transaction.dueDate ? toDate(transaction.dueDate) : null,
              settledAt: transaction.settledAt ? toDate(transaction.settledAt) : null,
              occurredOn: transaction.occurredOn ? toDate(transaction.occurredOn) : null,
              paymentMethod: transaction.paymentMethod ?? null,
              merchantId: merchantOf(transaction.merchantName),
              personId: personOf(transaction.personName),
            })),
          },
        },
      },
      include: withCreator,
    });
    return toResponse(created);
  }

  /**
   * A plan's installments, as `InstallmentsService.create` makes them: from its first number
   * on, one per competência from the first, each of the statement line's amount (ADR 0055),
   * with the plan's merchant, as every installment carries it (ADR 0053).
   */
  private installments(
    workspaceId: string,
    plan: ImportInstallmentPlanInput,
    merchantId: string | null,
  ) {
    const firstNumber = plan.firstNumber ?? 1;
    const dueDay = plan.dueDay ?? null;
    return Array.from({ length: installmentsCreated(plan) }, (_, index) => {
      const period = shiftPeriod(plan.firstPeriod, index);
      return {
        workspaceId,
        type: plan.type,
        description: plan.description,
        notes: plan.notes ?? null,
        categoryId: plan.categoryId,
        amountCents: plan.amountCents,
        period,
        dueDate:
          dueDay === null ? null : toDate(dueDateFor(period, dueDay, plan.dueMonthOffset ?? 0)),
        occurredOn: plan.occurredOn ? toDate(plan.occurredOn) : null,
        paymentMethod: plan.paymentMethod ?? null,
        merchantId,
        installmentNumber: firstNumber + index,
      };
    });
  }

  /**
   * The aliases learned in the review (ADR 0055), checked before anything is written, merchants
   * included: one that is already another merchant's refuses the import, naming it; one the
   * merchant already has, or that repeats in the batch, is skipped. Gives the ones to create.
   */
  private async newAliases(workspaceId: string, aliases: ImportMerchantAliasInput[]) {
    const fresh = new Map<string, ImportMerchantAliasInput>();
    if (aliases.length === 0) return fresh;
    const existing = await this.prisma.forWorkspace(workspaceId).merchantAlias.findMany({
      where: { workspaceId },
      select: { normalized: true, merchant: { select: { name: true } } },
    });
    const owners = new Map(existing.map((item) => [item.normalized, item.merchant.name]));
    for (const item of aliases) {
      const normalized = normalizeStatementTitle(item.alias);
      if (!normalized || fresh.has(normalized)) continue;
      const owner = owners.get(normalized);
      if (owner === undefined) fresh.set(normalized, item);
      else if (normalizeName(owner) !== normalizeName(item.merchantName)) {
        throw new ConflictException({
          code: 'MERCHANT_ALIAS_EXISTS',
          message: `O apelido "${item.alias}" já é de "${owner}".`,
        });
      }
    }
    return fresh;
  }

  /**
   * The person of each name, ignoring case and accents, as the people page shows them (a member
   * by their account's name, ADR 0042 note): one the workspace has (reactivated if archived),
   * or a new contact.
   */
  private async personIds(workspaceId: string, names: (string | undefined)[]) {
    const wanted = new Map<string, string>();
    // The first spelling found names a new one.
    for (const name of names) {
      if (name && !wanted.has(normalizeName(name))) wanted.set(normalizeName(name), name);
    }
    const ids = new Map<string, string>();
    if (wanted.size === 0) return ids;
    const existing = await this.people.list(workspaceId);
    const db = this.prisma.forWorkspace(workspaceId);
    for (const [key, name] of wanted) {
      const found = existing.find((person) => normalizeName(person.name) === key);
      if (found?.archived) {
        await db.person.update({ where: { id: found.id }, data: { archivedAt: null } });
      }
      ids.set(key, found?.id ?? (await db.person.create({ data: { workspaceId, name } })).id);
    }
    return ids;
  }

  /**
   * The merchant of each name, ignoring case and accents, as the merchants routes do: one the
   * workspace has (reactivated if archived), or a new one.
   */
  private async merchantIds(workspaceId: string, names: (string | undefined)[]) {
    const wanted = new Map<string, string>();
    // The first spelling found names a new one.
    for (const name of names) {
      if (name && !wanted.has(normalizeName(name))) wanted.set(normalizeName(name), name);
    }
    const ids = new Map<string, string>();
    if (wanted.size === 0) return ids;
    const db = this.prisma.forWorkspace(workspaceId);
    const existing = await db.merchant.findMany({ where: { workspaceId } });
    for (const [key, name] of wanted) {
      const found = existing.find((merchant) => normalizeName(merchant.name) === key);
      if (found?.archivedAt) {
        await db.merchant.update({ where: { id: found.id }, data: { archivedAt: null } });
      }
      ids.set(key, found?.id ?? (await db.merchant.create({ data: { workspaceId, name } })).id);
    }
    return ids;
  }

  /**
   * Undoes an import: deleting it cascades to every transaction it brought, also those changed
   * since (the screen says so before asking), and to the installment plans it created, with
   * their installments (ADR 0055). Merchants and aliases stay.
   */
  async undo(workspaceId: string, importId: string): Promise<void> {
    if (!z.uuid().safeParse(importId).success) throw new NotFoundException();
    const { count } = await this.prisma
      .forWorkspace(workspaceId)
      .transactionImport.deleteMany({ where: { id: importId, workspaceId } });
    if (count === 0) throw new NotFoundException();
  }

  /**
   * "Remover do histórico" (ADR 0060 note): the import leaves the list, its transactions and plans
   * stay as they are, as if launched by hand. It can no longer be undone at once. One interactive
   * transaction with the RLS context (ADR 0028): unlink, then delete, or neither.
   */
  async forget(workspaceId: string, importId: string): Promise<void> {
    if (!z.uuid().safeParse(importId).success) throw new NotFoundException();
    const found = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      await tx.transaction.updateMany({
        where: { workspaceId, importId },
        data: { importId: null },
      });
      await tx.installmentPlan.updateMany({
        where: { workspaceId, importId },
        data: { importId: null },
      });
      const { count } = await tx.transactionImport.deleteMany({
        where: { id: importId, workspaceId },
      });
      return count > 0;
    });
    if (!found) throw new NotFoundException();
  }
}
