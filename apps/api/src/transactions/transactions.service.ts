import {
  shareDescription,
  type CreateTransactionInput,
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
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { shareCategoryId } from '../categories/share-category.js';
import { ensureUsableMerchant } from '../merchants/ensure-merchant.js';
import { ensureUsablePerson, resolveSplitPerson } from '../people/ensure-person.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecurrencesService } from '../recurrences/recurrences.service.js';
import { optionalDate, toIsoDate } from './dates.js';
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
    await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, input.type);
    if (input.personId) await ensureUsablePerson(this.prisma, workspaceId, input.personId);
    if (input.merchantId) await ensureUsableMerchant(this.prisma, workspaceId, input.merchantId);
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
      'type' | 'description' | 'period' | 'dueDate' | 'occurredOn'
    >,
    split: SplitShareInput[],
  ) {
    const type = input.type === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const);
    const categoryId = await shareCategoryId(this.prisma, workspaceId, type);
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
    if (input.personId) await ensureUsablePerson(this.prisma, workspaceId, input.personId);
    // Only a change is checked, as with the category: it may keep a merchant archived later.
    if (input.merchantId && input.merchantId !== current.merchantId) {
      await ensureUsableMerchant(this.prisma, workspaceId, input.merchantId);
    }
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
      // And its due date (ADR 0052 note) and its day (ADR 0055).
      const changed = (field: 'dueDate' | 'occurredOn') =>
        input[field] !== undefined && transaction[field]?.getTime() !== current[field]?.getTime();
      if (changed('dueDate') || changed('occurredOn')) {
        await followShares(this.prisma, workspaceId, transactionId, {
          dueDate: changed('dueDate') ? transaction.dueDate : undefined,
          occurredOn: changed('occurredOn') ? transaction.occurredOn : undefined,
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
    const { count } = await this.prisma.forWorkspace(workspaceId).transaction.deleteMany({
      where: {
        workspaceId,
        OR: [{ id: transactionId }, ...(withShares ? [{ splitOfId: transactionId }] : [])],
      },
    });
    if (count === 0) throw new NotFoundException();
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
        description: input.description ?? current.description,
        period: input.period ?? current.period,
        dueDate: dateOf('dueDate'),
        occurredOn: dateOf('occurredOn'),
      },
      split,
    );
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
