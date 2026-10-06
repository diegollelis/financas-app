import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from '@financas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecurrencesService } from '../recurrences/recurrences.service.js';
import { optionalDate, toIsoDate } from './dates.js';

/** Every read brings the recurrence that generated the transaction, if any (ADR 0038). */
const withRecurrence = { occurrence: { select: { recurrenceId: true } } } as const;

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof withRecurrence }>;

function toResponse(transaction: TransactionRow): Transaction {
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
    recurrenceId: transaction.occurrence?.recurrenceId ?? null,
    amountEstimated: transaction.amountEstimated,
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
      include: withRecurrence,
      // The enum order is CREDIT, DEBIT; UUIDv7 ids follow the order of creation.
      orderBy: [{ type: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    return transactions.map(toResponse);
  }

  async create(workspaceId: string, input: CreateTransactionInput): Promise<Transaction> {
    await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, input.type);
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
      },
      include: withRecurrence,
    });
    return toResponse(transaction);
  }

  async update(
    workspaceId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction> {
    const current = await this.find(workspaceId, transactionId);
    const type = input.type ?? current.type;
    const categoryId = input.categoryId ?? current.categoryId;
    // Only a change is checked: a transaction may keep a category archived after it was made.
    if (type !== current.type || categoryId !== current.categoryId) {
      await ensureUsableCategory(this.prisma, workspaceId, categoryId, type);
    }

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
          // Giving the amount, or settling, confirms an estimate (ADR 0038). Undoing a settlement
          // does not make it an estimate again.
          amountEstimated:
            input.amountCents !== undefined || (input.settledAt ?? null) !== null
              ? false
              : undefined,
        },
        include: withRecurrence,
      });
      return toResponse(transaction);
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
   * (ON DELETE SET NULL), so that month is not generated again (ADR 0038).
   */
  async remove(workspaceId: string, transactionId: string): Promise<void> {
    if (!z.uuid().safeParse(transactionId).success) throw new NotFoundException();
    const { count } = await this.prisma
      .forWorkspace(workspaceId)
      .transaction.deleteMany({ where: { id: transactionId, workspaceId } });
    if (count === 0) throw new NotFoundException();
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, transactionId: string) {
    if (!z.uuid().safeParse(transactionId).success) throw new NotFoundException();
    const transaction = await this.prisma
      .forWorkspace(workspaceId)
      .transaction.findFirst({ where: { id: transactionId, workspaceId } });
    if (!transaction) throw new NotFoundException();
    return transaction;
  }
}
