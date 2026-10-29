import {
  formatCents,
  shareDescription,
  todayIso,
  type CreateTransactionInput,
  type SettlePartInput,
  type SettlePartResponse,
  type SplitShareInput,
  type Transaction,
  type UpdateTransactionInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { ensureCardFits, ensureNewCard } from '../cards/ensure-card.js';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { shareCategoryId } from '../categories/share-category.js';
import { ensureUsableMerchant } from '../merchants/ensure-merchant.js';
import { ensureUsablePerson, resolveSplitPerson } from '../people/ensure-person.js';
import { ensureOpenPeriods } from '../periods/period-lock.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { RecurrencesService } from '../recurrences/recurrences.service.js';
import { optionalDate, toDate, toIsoDate } from './dates.js';
import { followDescription, followShares } from './share-description.js';

/** Every read brings what generated the transaction, if anything: a recurrence or a plan (ADR 0038). */
export const withOrigin = {
  occurrence: { select: { recurrenceId: true, recurrence: { select: { intervalMonths: true } } } },
  // The plan's count, for "3/10".
  installmentPlan: { select: { installments: true } },
} as const;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof withOrigin }>;

export function toTransactionResponse(transaction: TransactionRow): Transaction {
  return {
    id: transaction.id,
    type: transaction.type,
    description: transaction.description,
    notes: transaction.notes,
    categoryId: transaction.categoryId,
    amountCents: transaction.amountCents,
    period: transaction.period,
    dueDate: transaction.dueDate && toIsoDate(transaction.dueDate),
    settledAt: transaction.settledAt && toIsoDate(transaction.settledAt),
    occurredOn: transaction.occurredOn && toIsoDate(transaction.occurredOn),
    recurrenceId: transaction.occurrence?.recurrenceId ?? null,
    recurrenceIntervalMonths: transaction.occurrence?.recurrence.intervalMonths ?? null,
    amountEstimated: transaction.amountEstimated,
    installment:
      transaction.installmentPlanId && transaction.installmentNumber && transaction.installmentPlan
        ? {
            planId: transaction.installmentPlanId,
            number: transaction.installmentNumber,
            count: transaction.installmentPlan.installments,
          }
        : null,
    personId: transaction.personId,
    merchantId: transaction.merchantId,
    paymentMethod: transaction.paymentMethod,
    cardId: transaction.cardId,
    splitOfId: transaction.splitOfId,
  };
}

/**
 * Transactions (lançamentos) of one workspace. Same rules as categories: the workspaceId comes
 * from WorkspaceMemberGuard, every query filters by it and runs through forWorkspace (RLS).
 * The descriptions and amounts are personal data: never log them (ADR 0012).
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrences: RecurrencesService,
  ) {}

  /**
   * One competência: credits first, then debits; each by due date (none last), then creation.
   * Opening it first creates the pending transactions of the recurrences it lacks (ADR 0038).
   */
  async list(workspaceId: string, period: string): Promise<Transaction[]> {
    await this.recurrences.materialize(workspaceId, [period]);
    const transactions = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
      where: { workspaceId, period },
      include: withOrigin,
      // The enum order is CREDIT, DEBIT; UUIDv7 ids follow the order of creation.
      orderBy: [{ type: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    return transactions.map(toTransactionResponse);
  }

  /**
   * One transaction, or a split one: the transaction and, in the same nested write, one pending
   * share per person on the opposite side. A debit's shares are credits "a receber" in Reembolso
   * (ADR 0042); a credit's are debits "a pagar" in Repasse (ADR 0052). New names in the split
   * become people first.
   */
  async create(workspaceId: string, input: CreateTransactionInput): Promise<Transaction> {
    await ensureOpenPeriods(this.prisma, workspaceId, [input.period]);
    await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, input.type);
    if (input.personId) await ensureUsablePerson(this.prisma, workspaceId, input.personId);
    if (input.merchantId) await ensureUsableMerchant(this.prisma, workspaceId, input.merchantId);
    await ensureNewCard(this.prisma, workspaceId, input);
    const shares = input.split ? await this.shares(workspaceId, input, input.split) : [];
    const transaction = await this.prisma.forWorkspace(workspaceId).transaction.create({
      data: {
        workspaceId,
        type: input.type,
        description: input.description,
        notes: input.notes ?? null,
        categoryId: input.categoryId,
        amountCents: input.amountCents,
        period: input.period,
        dueDate: optionalDate(input.dueDate) ?? null,
        settledAt: optionalDate(input.settledAt) ?? null,
        occurredOn: optionalDate(input.occurredOn) ?? null,
        personId: input.personId ?? null,
        merchantId: input.merchantId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        cardId: input.cardId ?? null,
        ...(shares.length > 0 && { shares: { create: shares } }),
      },
      include: withOrigin,
    });
    return toTransactionResponse(transaction);
  }

  /** The shares of a split: each person resolved (or created), on the side opposite the input. */
  private async shares(
    workspaceId: string,
    input: Pick<
      CreateTransactionInput,
      'type' | 'categoryId' | 'description' | 'period' | 'dueDate' | 'occurredOn'
    >,
    split: SplitShareInput[],
  ) {
    const type = input.type === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const);
    const categoryId = await shareCategoryId(this.prisma, workspaceId, type, input.categoryId);
    const people = await Promise.all(
      split.map((share) => resolveSplitPerson(this.prisma, workspaceId, share)),
    );
    return split.map((share, index) => ({
      workspaceId,
      type,
      description: shareDescription(input.description),
      categoryId,
      amountCents: share.amountCents,
      period: input.period,
      // Due with the transaction it shares (ADR 0052 note), and of the same day (ADR 0055).
      dueDate: optionalDate(input.dueDate) ?? null,
      occurredOn: optionalDate(input.occurredOn) ?? null,
      personId: people[index]!.id,
    }));
  }

  async update(
    workspaceId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction> {
    const current = await this.find(workspaceId, transactionId);
    await this.ensureEditOpen(workspaceId, current, input);
    if (input.personId) await ensureUsablePerson(this.prisma, workspaceId, input.personId);
    // Only a change is checked, as with the category: it may keep a merchant archived later.
    if (input.merchantId && input.merchantId !== current.merchantId) {
      await ensureUsableMerchant(this.prisma, workspaceId, input.merchantId);
    }
    // The card and the method after the change go together (ADR 0062).
    await ensureCardFits(this.prisma, workspaceId, current, input);
    if (input.type !== undefined && input.type !== current.type) {
      await this.ensureTypeMayChange(workspaceId, current);
    }
    const moves = input.period !== undefined && input.period !== current.period;
    if (moves) await this.ensurePeriodMayChange(workspaceId, current);
    const type = input.type ?? current.type;
    const categoryId = input.categoryId ?? current.categoryId;
    // Only a change is checked: a transaction may keep a category archived after it was made.
    if (type !== current.type || categoryId !== current.categoryId) {
      await ensureUsableCategory(this.prisma, workspaceId, categoryId, type);
    }

    const shares = input.split
      ? await this.sharesOnEdit(workspaceId, current, input, input.split)
      : [];

    try {
      const transaction = await this.prisma.forWorkspace(workspaceId).transaction.update({
        where: { id: transactionId, workspaceId },
        data: {
          type: input.type,
          description: input.description,
          notes: input.notes,
          categoryId: input.categoryId,
          amountCents: input.amountCents,
          period: input.period,
          dueDate: optionalDate(input.dueDate),
          settledAt: optionalDate(input.settledAt),
          occurredOn: optionalDate(input.occurredOn),
          personId: input.personId,
          merchantId: input.merchantId,
          paymentMethod: input.paymentMethod,
          cardId: input.cardId,
          ...(shares.length > 0 && { shares: { create: shares } }),
          // Giving the amount, or settling, confirms an estimate (ADR 0038). Undoing a settlement
          // does not make it an estimate again.
          amountEstimated:
            input.amountCents !== undefined || (input.settledAt ?? null) !== null
              ? false
              : undefined,
        },
        include: withOrigin,
      });
      // A month of a split recurrence: its pending shares in percentages follow the amount given
      // (ADR 0052).
      if (input.amountCents !== undefined && input.amountCents !== current.amountCents) {
        await this.recurrences.followAmount(workspaceId, transactionId, input.amountCents);
      }
      // Its pending shares take the new name; an installment's keep their number (ADR 0052 note).
      if (input.description !== undefined && input.description !== current.description) {
        const installment =
          transaction.installmentNumber && transaction.installmentPlan
            ? {
                number: transaction.installmentNumber,
                count: transaction.installmentPlan.installments,
              }
            : undefined;
        await followDescription(
          this.prisma,
          workspaceId,
          transactionId,
          shareDescription(input.description, installment),
        );
      }
      // Into or out of a loan's category: its shares follow, to where the money comes back or the
      // debt is kept, or to Reembolso or Repasse (ADRs 0058, 0059). The type of a split one never
      // changes (TYPE_LOCKED), and shares created by this same edit were already put there.
      if (categoryId !== current.categoryId && shares.length === 0) {
        const shareType = type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
        await this.prisma.forWorkspace(workspaceId).transaction.updateMany({
          where: { workspaceId, splitOfId: transactionId },
          data: {
            categoryId: await shareCategoryId(this.prisma, workspaceId, shareType, categoryId),
          },
        });
      }
      // And its due date (ADR 0052 note), its day (ADR 0055) and its month (ADR 0029 note).
      const changed = (field: 'dueDate' | 'occurredOn') =>
        input[field] !== undefined && transaction[field]?.getTime() !== current[field]?.getTime();
      if (changed('dueDate') || changed('occurredOn') || moves) {
        await followShares(this.prisma, workspaceId, transactionId, {
          dueDate: changed('dueDate') ? transaction.dueDate : undefined,
          occurredOn: changed('occurredOn') ? transaction.occurredOn : undefined,
          period: moves ? transaction.period : undefined,
        });
      }
      return toTransactionResponse(transaction);
    } catch (error) {
      // Deleted by someone else between the read and the update.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  /**
   * Deleting a transaction a recurrence generated keeps its occurrence without a transaction
   * (ON DELETE SET NULL), so that month is not generated again (ADR 0038). The shares split from
   * a debit go with it only when asked (`withShares`); otherwise they stay, unlinked
   * (ON DELETE SET NULL, ADR 0042).
   */
  async remove(workspaceId: string, transactionId: string, withShares = false): Promise<void> {
    if (!z.uuid().safeParse(transactionId).success) throw new NotFoundException();
    const where = {
      workspaceId,
      OR: [{ id: transactionId }, ...(withShares ? [{ splitOfId: transactionId }] : [])],
    };
    const db = this.prisma.forWorkspace(workspaceId);
    const going = await db.transaction.findMany({ where, select: { period: true } });
    if (going.length === 0) throw new NotFoundException();
    await ensureOpenPeriods(
      this.prisma,
      workspaceId,
      going.map((row) => row.period),
    );
    const { count } = await db.transaction.deleteMany({ where });
    if (count === 0) throw new NotFoundException();
  }

  /**
   * Part of a pending transaction received or paid (ADR 0057): the part is launched, settled on
   * that day and in its competência, like the transaction in all else; the pending one keeps the
   * rest. When the part is all that is left, the pending one is deleted instead of settled, so the
   * money counts in the month it came, not in the competência of the debt. One interactive
   * transaction with the RLS context (ADR 0028): both or neither.
   */
  async settlePart(
    workspaceId: string,
    transactionId: string,
    input: SettlePartInput,
  ): Promise<SettlePartResponse> {
    const current = await this.find(workspaceId, transactionId);
    const origin = await this.prisma.forWorkspace(workspaceId).transaction.findFirstOrThrow({
      where: { id: current.id, workspaceId },
      select: {
        occurrence: { select: { recurrenceId: true } },
        _count: { select: { shares: true } },
      },
    });
    const refuse = (message: string) =>
      new ConflictException({ code: 'NOT_PARTIALLY_SETTLEABLE', message });
    if (current.settledAt) throw refuse('Este lançamento já foi quitado.');
    if (current.splitOfId) {
      throw refuse('Esta é a parte de uma divisão: receba ou pague o valor todo.');
    }
    if (origin._count.shares > 0) {
      throw refuse('Este lançamento está dividido: receba ou pague o valor todo.');
    }
    if (origin.occurrence || current.installmentPlanId) {
      throw refuse('Um mês de recorrência ou uma parcela se quita pelo valor todo.');
    }
    const invalid = (message: string) =>
      new BadRequestException({ code: 'INVALID_INPUT', message });
    if (input.settledAt > todayIso()) throw invalid('A data não pode ser no futuro.');
    if (input.amountCents > current.amountCents) {
      throw invalid(`O valor passa do que está pendente (${formatCents(current.amountCents)}).`);
    }

    // The part goes to the month of its day; a loan's own month may be closed (ADR 0063).
    await ensureOpenPeriods(this.prisma, workspaceId, [input.settledAt.slice(0, 7)]);
    const all = input.amountCents === current.amountCents;
    const result = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      const settled = await tx.transaction.create({
        data: {
          workspaceId,
          type: current.type,
          description: current.description,
          categoryId: current.categoryId,
          amountCents: input.amountCents,
          period: input.settledAt.slice(0, 7),
          settledAt: toDate(input.settledAt),
          occurredOn: toDate(input.settledAt),
          personId: current.personId,
          merchantId: current.merchantId,
          paymentMethod: current.paymentMethod,
          cardId: current.cardId,
        },
        include: withOrigin,
      });
      if (all) {
        await tx.transaction.delete({ where: { id: current.id, workspaceId } });
        return { settled, remaining: null };
      }
      const remaining = await tx.transaction.update({
        where: { id: current.id, workspaceId },
        data: { amountCents: current.amountCents - input.amountCents },
        include: withOrigin,
      });
      return { settled, remaining };
    });
    return {
      settled: toTransactionResponse(result.settled),
      remaining: result.remaining && toTransactionResponse(result.remaining),
    };
  }

  /**
   * An edit reaches the transaction's month, the one it moves to and, when what it changes
   * follows to its shares, their months too; all must be open (ADR 0063). It is checked first,
   * since the shares are written after the transaction itself.
   */
  private async ensureEditOpen(
    workspaceId: string,
    current: Awaited<ReturnType<TransactionsService['find']>>,
    input: UpdateTransactionInput,
  ) {
    const periods = [current.period, ...(input.period ? [input.period] : [])];
    const reachesShares = (
      ['amountCents', 'description', 'categoryId', 'dueDate', 'occurredOn', 'period'] as const
    ).some((field) => input[field] !== undefined);
    if (reachesShares) {
      const shares = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
        where: { workspaceId, splitOfId: current.id },
        select: { period: true },
      });
      periods.push(...shares.map((share) => share.period));
    }
    await ensureOpenPeriods(this.prisma, workspaceId, periods);
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  /**
   * The shares of a transaction split after it was launched (ADR 0052 note), as on creation: only
   * one launched once, with no person, not a share and not split yet; the others' shares within
   * its amount. They take what it will be after this change.
   */
  private async sharesOnEdit(
    workspaceId: string,
    current: Awaited<ReturnType<TransactionsService['find']>>,
    input: UpdateTransactionInput,
    split: SplitShareInput[],
  ) {
    const refuse = (message: string) => new ConflictException({ code: 'NOT_SPLITTABLE', message });
    const origin = await this.prisma.forWorkspace(workspaceId).transaction.findFirstOrThrow({
      where: { id: current.id, workspaceId },
      select: {
        occurrence: { select: { recurrenceId: true } },
        _count: { select: { shares: true } },
      },
    });
    if (current.splitOfId) throw refuse('Uma parte de divisão não se divide de novo.');
    if (origin._count.shares > 0) {
      throw refuse(
        'Este lançamento já está dividido. Para mudar, exclua as partes e divida de novo.',
      );
    }
    if (origin.occurrence || current.installmentPlanId) {
      throw refuse('Um mês de recorrência ou uma parcela não se divide sozinho.');
    }
    const personId = input.personId === undefined ? current.personId : input.personId;
    if (personId) throw refuse('Um lançamento dividido não fica ligado a uma só pessoa.');
    const amountCents = input.amountCents ?? current.amountCents;
    if (split.reduce((sum, share) => sum + share.amountCents, 0) > amountCents) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'As partes dos outros passam do valor do lançamento.',
      });
    }
    const dateOf = (field: 'dueDate' | 'occurredOn') => {
      const given = input[field];
      if (given !== undefined) return given;
      const stored = current[field];
      return stored ? toIsoDate(stored) : null;
    };
    return this.shares(
      workspaceId,
      {
        type: input.type ?? current.type,
        categoryId: input.categoryId ?? current.categoryId,
        description: input.description ?? current.description,
        period: input.period ?? current.period,
        dueDate: dateOf('dueDate'),
        occurredOn: dateOf('occurredOn'),
      },
      split,
    );
  }

  /**
   * The type of a transaction tied to others stays (ADR 0029 note): a split one and its shares are
   * on opposite sides, and a month of a recurrence or an installment is the series' type.
   */
  private async ensureTypeMayChange(
    workspaceId: string,
    current: Awaited<ReturnType<TransactionsService['find']>>,
  ) {
    const refuse = (message: string) => new ConflictException({ code: 'TYPE_LOCKED', message });
    if (current.splitOfId) {
      throw refuse('Esta é a parte de uma divisão: o tipo segue o do lançamento dividido.');
    }
    if (current.installmentPlanId) {
      throw refuse('Esta é uma parcela: o tipo é o do parcelamento.');
    }
    const origin = await this.prisma.forWorkspace(workspaceId).transaction.findFirstOrThrow({
      where: { id: current.id, workspaceId },
      select: {
        occurrence: { select: { recurrenceId: true } },
        _count: { select: { shares: true } },
      },
    });
    if (origin.occurrence) {
      throw refuse('Este é um mês de uma recorrência: o tipo é o da recorrência.');
    }
    if (origin._count.shares > 0) {
      throw refuse(
        'Este lançamento está dividido: o tipo não muda, porque as partes ficam do outro lado.',
      );
    }
  }

  /**
   * Only a transaction launched once moves to another month (ADR 0029 note): a month of a
   * recurrence is that month (its occurrence would be generated again), an installment keeps its
   * place in the plan, and a share goes where the transaction it shares goes.
   */
  private async ensurePeriodMayChange(
    workspaceId: string,
    current: Awaited<ReturnType<TransactionsService['find']>>,
  ) {
    const refuse = (message: string) => new ConflictException({ code: 'NOT_MOVABLE', message });
    if (current.splitOfId) {
      throw refuse('Esta é a parte de uma divisão: mova o lançamento dividido, e ela vai junto.');
    }
    if (current.installmentPlanId) {
      throw refuse('Uma parcela não muda de mês sozinha: edite o parcelamento.');
    }
    const origin = await this.prisma.forWorkspace(workspaceId).transaction.findFirstOrThrow({
      where: { id: current.id, workspaceId },
      select: { occurrence: { select: { recurrenceId: true } } },
    });
    if (origin.occurrence) {
      throw refuse('Este é um mês de uma recorrência: ele não muda de mês. Mude o vencimento.');
    }
  }

  private async find(workspaceId: string, transactionId: string) {
    if (!z.uuid().safeParse(transactionId).success) throw new NotFoundException();
    const transaction = await this.prisma
      .forWorkspace(workspaceId)
      .transaction.findFirst({ where: { id: transactionId, workspaceId } });
    if (!transaction) throw new NotFoundException();
    return transaction;
  }
}
