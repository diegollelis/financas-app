import {
  dueDateFor,
  formatCents,
  installmentsCreated,
  normalizeName,
  normalizeStatementTitle,
  shiftPeriod,
  type CreateImportInput,
  type Import,
  type ImportCandidatesInput,
  type ImportCandidatesResponse,
  type ImportInstallmentPlanInput,
  type ImportKind,
  type ImportMatchInput,
  type ImportMerchantAliasInput,
  type ImportPartInput,
  type StatementBank,
  todayIso,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { ensureCardGiven, ensureUsableCard } from '../cards/ensure-card.js';
import { ensureUsableCategories } from '../categories/ensure-category.js';
import { Prisma, type TransactionImport } from '../generated/prisma/client.js';
import { PeopleService } from '../people/people.service.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { RecurrencesService } from '../recurrences/recurrences.service.js';
import { toDate, toIsoDate } from '../transactions/dates.js';
import { followShares } from '../transactions/share-description.js';
import { toTransactionResponse, withOrigin } from '../transactions/transactions.service.js';

type ImportRow = TransactionImport & {
  createdBy: { name: string } | null;
  _count: { installmentPlans: number; reconciled: number };
};

/** A movement of the statement is already in the app: the review was opened before it came. */
const lineImported = () =>
  new ConflictException({
    code: 'STATEMENT_LINE_IMPORTED',
    message: 'Um movimento deste extrato já foi importado. Abra o extrato de novo para conferir.',
  });

/** A transaction the review matched was deleted, or took another movement, meanwhile. */
const matchChanged = () =>
  new ConflictException({
    code: 'STATEMENT_MATCH_CHANGED',
    message:
      'Um dos lançamentos conferidos mudou ou foi excluído. Abra o extrato de novo para conferir.',
  });

/**
 * How the loans an import took parts of were before it (ADR 0061 note), kept with the import:
 * undoing it gives each one back what it took, or creates it again if nothing was left.
 */
const restoreDataSchema = z.object({
  parts: z.number().int(),
  loans: z.array(
    z.object({
      takenCents: z.number().int(),
      row: z.object({
        id: z.uuid(),
        type: z.enum(['CREDIT', 'DEBIT']),
        description: z.string(),
        notes: z.string().nullable(),
        categoryId: z.uuid(),
        amountCents: z.number().int(),
        period: z.string(),
        dueDate: z.string().nullable(),
        occurredOn: z.string().nullable(),
        importId: z.uuid().nullable(),
        personId: z.uuid().nullable(),
        merchantId: z.uuid().nullable(),
        paymentMethod: z.string().nullable(),
        // Kept since cards came (ADR 0062); an import made before has none.
        cardId: z.uuid().nullable().default(null),
      }),
    }),
  ),
});

type RestoreData = z.infer<typeof restoreDataSchema>;

const readRestoreData = (value: unknown): RestoreData | null => {
  const parsed = restoreDataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** The purchases of a card statement already in the app: matches without a bank movement. */
const cardMatches = (input: CreateImportInput) =>
  (input.matches ?? []).filter((match) => !match.externalId);

/** A part of a loan that cannot be taken: settled, split, a share, a month or an installment. */
const partRefused = (message: string) =>
  new ConflictException({ code: 'NOT_PARTIALLY_SETTLEABLE', message });

/**
 * An import writes up to 2,000 transactions in one interactive transaction: Prisma's default of
 * 5 seconds is too short for that on a remote database (Neon), so it gets more room.
 */
const IMPORT_TRANSACTION = { maxWait: 10_000, timeout: 60_000 };

/** A day `days` after an ISO date (before it, when negative). */
const shiftDay = (isoDate: string, days: number) =>
  new Date(toDate(isoDate).getTime() + days * 86_400_000);

/** How far around the statement a settled transaction may be the same movement. */
const SETTLED_WINDOW_DAYS = 7;

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
    reconciledCount: row._count.reconciled,
    partCount: readRestoreData(row.restoreData)?.parts ?? 0,
    label: row.label,
    statementDueDate: row.statementDueDate && toIsoDate(row.statementDueDate),
    kind: row.kind,
    bank: row.bank,
    cardId: row.cardId,
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
  _count: { select: { installmentPlans: true, reconciled: true } },
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
    private readonly recurrences: RecurrencesService,
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
    const matches = input.matches ?? [];
    const parts = input.parts ?? [];
    await ensureUsableCategories(this.prisma, workspaceId, [...input.transactions, ...plans]);
    await this.checkCards(workspaceId, input);
    const found = await this.checkMovements(
      workspaceId,
      input.transactions,
      matches,
      parts.map((part) => part.externalId),
    );
    const restore = await this.checkParts(workspaceId, parts);
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
      // Each part is launched in the month of its day (ADR 0057).
      ...parts.map((part) => part.settledAt.slice(0, 7)),
    ];
    // The months it covers: what it created, and the days of the movements it found in the app.
    const covered = [
      ...periods,
      // A card's match settles nothing: the month of the transaction it found (ADR 0061 note).
      ...matches.flatMap((match) => {
        const month = match.settledAt?.slice(0, 7) ?? found.get(match.transactionId)?.period;
        return month ? [month] : [];
      }),
    ].sort();
    // One interactive transaction with the RLS context (ADR 0028): the import with what it creates,
    // then the transactions it found, or nothing.
    const created = await this.prisma
      .$transaction(async (tx) => {
        await setWorkspaceContext(tx, workspaceId);
        const row = await tx.transactionImport.create({
          data: {
            ...this.importData(workspaceId, userId, input, {
              count: periods.length,
              covered,
              installmentsOf,
              merchantOf,
              personOf,
            }),
            ...(restore && { restoreData: restore }),
          },
          include: withCreator,
        });
        // The parts of loans, as "Recebimento parcial" makes them (ADR 0057): launched, settled,
        // in the month of their day, brought by this import; each loan keeps the rest or goes.
        for (const part of parts) {
          const loan = restore!.loans.find((item) => item.row.id === part.transactionId)!.row;
          await tx.transaction.create({
            data: {
              workspaceId,
              type: loan.type,
              description: loan.description,
              categoryId: loan.categoryId,
              amountCents: part.amountCents,
              period: part.settledAt.slice(0, 7),
              settledAt: toDate(part.settledAt),
              occurredOn: toDate(part.settledAt),
              personId: loan.personId,
              merchantId: loan.merchantId,
              paymentMethod: loan.paymentMethod as Prisma.TransactionCreateInput['paymentMethod'],
              cardId: loan.cardId,
              externalId: part.externalId,
              importId: row.id,
            },
          });
        }
        for (const { takenCents, row: loan } of restore?.loans ?? []) {
          if (takenCents === loan.amountCents) {
            await tx.transaction.delete({ where: { id: loan.id, workspaceId } });
          } else {
            await tx.transaction.update({
              where: { id: loan.id, workspaceId },
              data: { amountCents: loan.amountCents - takenCents },
            });
          }
        }
        for (const match of matches) {
          const wasPending = found.get(match.transactionId)?.pending === true;
          await tx.transaction.update({
            where: { id: match.transactionId, workspaceId },
            data: {
              externalId: match.externalId,
              reconciledImportId: row.id,
              // A pending one is settled on the day the money moved; a settled one keeps its day.
              // A card's purchase stays to pay until the bill (no settledAt).
              settledAt: wasPending && match.settledAt ? toDate(match.settledAt) : undefined,
              dueDate: match.dueDate ? toDate(match.dueDate) : undefined,
              occurredOn: match.occurredOn ? toDate(match.occurredOn) : undefined,
              amountCents: match.amountCents,
              // A purchase of the card's bill is on its card, in Crédito (ADR 0062 note).
              ...(input.cardId &&
                !match.externalId && { paymentMethod: 'CREDIT_CARD', cardId: input.cardId }),
              // Settling, or giving the amount, confirms an estimate (ADR 0038).
              amountEstimated:
                (wasPending && match.settledAt) || match.amountCents !== undefined
                  ? false
                  : undefined,
            },
          });
        }
        return { ...row, _count: { ...row._count, reconciled: matches.length } };
      }, IMPORT_TRANSACTION)
      .catch((error: unknown) => {
        // Another import brought one of these movements meanwhile (the unique key).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw lineImported();
        }
        // A transaction it matched was deleted meanwhile.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw matchChanged();
        }
        throw error;
      });
    // Its pending shares fall due with it, and are of the same day (ADR 0052 note, 0055).
    for (const match of matches) {
      if (match.dueDate || match.occurredOn) {
        await followShares(this.prisma, workspaceId, match.transactionId, {
          dueDate: match.dueDate ? toDate(match.dueDate) : undefined,
          occurredOn: match.occurredOn ? toDate(match.occurredOn) : undefined,
        });
      }
    }
    // A month of a split recurrence: its pending shares in percentages follow the amount (ADR 0052).
    for (const match of matches) {
      if (
        match.amountCents !== undefined &&
        match.amountCents !== found.get(match.transactionId)?.amountCents
      ) {
        await this.recurrences.followAmount(workspaceId, match.transactionId, match.amountCents);
      }
    }
    return toResponse(created);
  }

  /** The import's row with what it creates, in one nested write. */
  private importData(
    workspaceId: string,
    userId: string,
    input: CreateImportInput,
    made: {
      count: number;
      covered: string[];
      installmentsOf: ReturnType<ImportsService['installments']>[];
      merchantOf: (name: string | undefined) => string | null;
      personOf: (name: string | undefined) => string | null;
    },
  ) {
    const { installmentsOf, merchantOf, personOf } = made;
    const plans = input.plans ?? [];
    return {
      workspaceId,
      createdById: userId,
      transactionCount: made.count,
      label: input.label ?? null,
      statementDueDate: input.statementDueDate ? toDate(input.statementDueDate) : null,
      ...kindOf(input),
      cardId: input.cardId ?? null,
      firstPeriod: made.covered[0] ?? '',
      lastPeriod: made.covered.at(-1) ?? '',
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
          cardId: plan.cardId ?? null,
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
            cardId: transaction.cardId ?? null,
            merchantId: merchantOf(transaction.merchantName),
            personId: personOf(transaction.personName),
            externalId: transaction.externalId ?? null,
          })),
        },
      },
    } satisfies Prisma.TransactionImportUncheckedCreateInput;
  }

  /**
   * The cards an import names (ADR 0062), checked before anything is written: the statement's,
   * of this workspace and not archived (with Crédito, when it finds purchases already in the
   * app), and each transaction's and plan's with its method, required with Crédito and Débito
   * (ADR 0062 note).
   */
  private async checkCards(workspaceId: string, input: CreateImportInput) {
    for (const item of [...input.transactions, ...(input.plans ?? [])]) {
      ensureCardGiven(item.paymentMethod, item.cardId);
    }
    if (input.cardId && cardMatches(input).length > 0) {
      await ensureUsableCard(this.prisma, workspaceId, input.cardId, 'CREDIT_CARD');
    } else if (input.cardId) {
      const card = await this.prisma
        .forWorkspace(workspaceId)
        .card.findFirst({ where: { id: input.cardId, workspaceId } });
      if (!card || card.archivedAt) {
        throw new BadRequestException({
          code: 'INVALID_CARD',
          message: 'O cartão desta importação não foi encontrado ou está arquivado.',
        });
      }
    }
    const checked = new Set<string>();
    for (const item of [...input.transactions, ...(input.plans ?? [])]) {
      if (!item.cardId) continue;
      const key = `${item.cardId}|${item.paymentMethod ?? ''}`;
      if (checked.has(key)) continue;
      checked.add(key);
      await ensureUsableCard(this.prisma, workspaceId, item.cardId, item.paymentMethod);
    }
  }

  /**
   * The movements of an account statement (ADR 0061), checked before anything is written: none
   * may be in the app already, and each transaction matched must still be there without one.
   * Gives each matched one's amount and whether it is pending, to settle it and follow the amount.
   */
  private async checkMovements(
    workspaceId: string,
    transactions: CreateImportInput['transactions'],
    matches: ImportMatchInput[],
    partIds: string[],
  ): Promise<Map<string, { pending: boolean; amountCents: number; period: string }>> {
    const externalIds = [
      ...transactions.flatMap((transaction) => transaction.externalId ?? []),
      ...matches.flatMap((match) => match.externalId ?? []),
      ...partIds,
    ];
    if (externalIds.length === 0 && matches.length === 0) return new Map();
    const db = this.prisma.forWorkspace(workspaceId);
    const [known, matched] = await Promise.all([
      db.transaction.count({ where: { workspaceId, externalId: { in: externalIds } } }),
      db.transaction.findMany({
        where: { workspaceId, id: { in: matches.map((match) => match.transactionId) } },
        select: { id: true, externalId: true, settledAt: true, amountCents: true, period: true },
      }),
    ]);
    if (known > 0) throw lineImported();
    // One that took another movement meanwhile; a card's match brings none (ADR 0061 note).
    const withMovement = new Set(
      matches.filter((match) => match.externalId).map((match) => match.transactionId),
    );
    if (
      matched.length !== matches.length ||
      matched.some((row) => row.externalId !== null && withMovement.has(row.id))
    ) {
      throw matchChanged();
    }
    return new Map(
      matched.map((row) => [
        row.id,
        { pending: row.settledAt === null, amountCents: row.amountCents, period: row.period },
      ]),
    );
  }

  /**
   * The loans an account statement takes parts of (ADR 0061 note), checked as "Recebimento
   * parcial" checks one (ADR 0057): pending, launched once, not split and not a share; the parts
   * of each within what is pending, on days not in the future. Gives how each one is now, to give
   * it back on undo; null when there are none.
   */
  private async checkParts(
    workspaceId: string,
    parts: ImportPartInput[],
  ): Promise<RestoreData | null> {
    if (parts.length === 0) return null;
    if (parts.some((part) => part.settledAt > todayIso())) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'A data não pode ser no futuro.',
      });
    }
    const taken = new Map<string, number>();
    for (const part of parts) {
      taken.set(part.transactionId, (taken.get(part.transactionId) ?? 0) + part.amountCents);
    }
    const loans = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
      where: { workspaceId, id: { in: [...taken.keys()] } },
      include: {
        occurrence: { select: { recurrenceId: true } },
        _count: { select: { shares: true } },
      },
    });
    if (loans.length !== taken.size) throw matchChanged();
    for (const loan of loans) {
      if (loan.settledAt) throw partRefused('Um dos lançamentos já foi quitado.');
      if (loan.splitOfId || loan._count.shares > 0 || loan.occurrence || loan.installmentPlanId) {
        throw partRefused(
          'Um mês de recorrência, uma parcela ou uma divisão se quita pelo valor todo.',
        );
      }
      if ((taken.get(loan.id) ?? 0) > loan.amountCents) {
        throw new BadRequestException({
          code: 'INVALID_INPUT',
          message: `O valor passa do que está pendente (${formatCents(loan.amountCents)}).`,
        });
      }
    }
    return {
      parts: parts.length,
      loans: loans.map((loan) => ({
        takenCents: taken.get(loan.id) ?? 0,
        row: {
          id: loan.id,
          type: loan.type,
          description: loan.description,
          notes: loan.notes,
          categoryId: loan.categoryId,
          amountCents: loan.amountCents,
          period: loan.period,
          dueDate: loan.dueDate && toIsoDate(loan.dueDate),
          occurredOn: loan.occurredOn && toIsoDate(loan.occurredOn),
          importId: loan.importId,
          personId: loan.personId,
          merchantId: loan.merchantId,
          paymentMethod: loan.paymentMethod,
          cardId: loan.cardId,
        },
      })),
    };
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
        cardId: plan.cardId ?? null,
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
    const found = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      // The transactions it found in the app stay as they are, settled or not, without the
      // movement (ADR 0061): imported again, the statement matches them again.
      await tx.transaction.updateMany({
        where: { workspaceId, reconciledImportId: importId },
        data: { externalId: null },
      });
      const row = await tx.transactionImport.findFirst({
        where: { id: importId, workspaceId },
        select: { restoreData: true },
      });
      if (!row) return false;
      // Its parts of loans go with it (cascade); the loans get back what it took (ADR 0061 note).
      await tx.transactionImport.delete({ where: { id: importId, workspaceId } });
      for (const { takenCents, row: loan } of readRestoreData(row.restoreData)?.loans ?? []) {
        const still = await tx.transaction.findFirst({
          where: { id: loan.id, workspaceId },
          select: { amountCents: true },
        });
        if (still) {
          await tx.transaction.update({
            where: { id: loan.id, workspaceId },
            data: { amountCents: still.amountCents + takenCents },
          });
          continue;
        }
        // Nothing was left, so it went: created again as it was, with the import it came from,
        // if that one is still there.
        const from =
          loan.importId &&
          (await tx.transactionImport.findFirst({
            where: { id: loan.importId, workspaceId },
            select: { id: true },
          }));
        await tx.transaction.create({
          data: {
            id: loan.id,
            workspaceId,
            type: loan.type,
            description: loan.description,
            notes: loan.notes,
            categoryId: loan.categoryId,
            amountCents: loan.amountCents,
            period: loan.period,
            dueDate: loan.dueDate ? toDate(loan.dueDate) : null,
            occurredOn: loan.occurredOn ? toDate(loan.occurredOn) : null,
            importId: from ? loan.importId : null,
            personId: loan.personId,
            merchantId: loan.merchantId,
            paymentMethod: loan.paymentMethod as Prisma.TransactionCreateInput['paymentMethod'],
            cardId: loan.cardId,
          },
        });
      }
      return true;
    });
    if (!found) throw new NotFoundException();
  }

  /**
   * What an account statement may already be in the app (ADR 0061): the movements of the file
   * already imported, and the transactions without a movement that one may be. The months of
   * the recurrences are created first, as opening them would, so next month's salary is there.
   */
  async candidates(
    workspaceId: string,
    input: ImportCandidatesInput,
  ): Promise<ImportCandidatesResponse> {
    const first = input.from.slice(0, 7);
    const last = shiftPeriod(input.to.slice(0, 7), 1);
    const months: string[] = [];
    for (let period = first; period <= last; period = shiftPeriod(period, 1)) months.push(period);
    await this.recurrences.materialize(workspaceId, months);
    const db = this.prisma.forWorkspace(workspaceId);
    const [known, transactions] = await Promise.all([
      input.externalIds.length === 0
        ? []
        : db.transaction.findMany({
            where: { workspaceId, externalId: { in: input.externalIds } },
            select: { id: true, externalId: true },
          }),
      db.transaction.findMany({
        where: {
          workspaceId,
          externalId: null,
          OR: [
            { settledAt: null, period: { gte: shiftPeriod(first, -12), lte: last } },
            {
              settledAt: {
                gte: shiftDay(input.from, -SETTLED_WINDOW_DAYS),
                lte: shiftDay(input.to, SETTLED_WINDOW_DAYS),
              },
            },
          ],
        },
        orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
        include: withOrigin,
      }),
    ]);
    return {
      known: known.map((row) => ({ externalId: row.externalId!, transactionId: row.id })),
      transactions: transactions.map(toTransactionResponse),
    };
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
