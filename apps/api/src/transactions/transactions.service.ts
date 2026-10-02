import type {
  CreateTransactionInput,
  Transaction,
  TransactionType,
  UpdateTransactionInput,
} from '@financas/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Transaction as TransactionRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** `YYYY-MM-DD` ↔ the Date Prisma uses for a DATE column (midnight UTC, no time zone shift). */
const toDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

/** `undefined` keeps the field as it is; `null` clears it. */
function optionalDate(isoDate: string | null | undefined) {
  if (isoDate === undefined) return undefined;
  return isoDate === null ? null : toDate(isoDate);
}

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
  };
}

const invalidCategory = (message: string) =>
  new BadRequestException({ code: 'INVALID_CATEGORY', message });

/**
 * Transactions (lançamentos) of one workspace. Same rules as categories: the workspaceId comes
 * from WorkspaceMemberGuard, every query filters by it and runs through forWorkspace (RLS).
 * The descriptions and amounts are personal data: never log them (ADR 0012).
 */
@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** One competência: credits first, then debits; each by due date (none last), then creation. */
  async list(workspaceId: string, period: string): Promise<Transaction[]> {
    const transactions = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
      where: { workspaceId, period },
      // The enum order is CREDIT, DEBIT; UUIDv7 ids follow the order of creation.
      orderBy: [{ type: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    return transactions.map(toResponse);
  }

  async create(workspaceId: string, input: CreateTransactionInput): Promise<Transaction> {
    await this.ensureCategory(workspaceId, input.categoryId, input.type);
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
      await this.ensureCategory(workspaceId, categoryId, type);
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
        },
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

  async remove(workspaceId: string, transactionId: string): Promise<void> {
    if (!z.uuid().safeParse(transactionId).success) throw new NotFoundException();
    const { count } = await this.prisma
      .forWorkspace(workspaceId)
      .transaction.deleteMany({ where: { id: transactionId, workspaceId } });
    if (count === 0) throw new NotFoundException();
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, transactionId: string): Promise<TransactionRow> {
    if (!z.uuid().safeParse(transactionId).success) throw new NotFoundException();
    const transaction = await this.prisma
      .forWorkspace(workspaceId)
      .transaction.findFirst({ where: { id: transactionId, workspaceId } });
    if (!transaction) throw new NotFoundException();
    return transaction;
  }

  /**
   * The category must be of this workspace, of the transaction's type and not archived. The
   * composite foreign key (ADR 0029) would refuse the first two anyway; checking here gives a
   * clear message instead of a database error.
   */
  private async ensureCategory(workspaceId: string, categoryId: string, type: TransactionType) {
    const category = await this.prisma
      .forWorkspace(workspaceId)
      .category.findFirst({ where: { id: categoryId, workspaceId } });
    if (!category) throw invalidCategory('Categoria não encontrada neste espaço.');
    if (category.type !== type) {
      throw invalidCategory(
        type === 'CREDIT'
          ? 'Escolha uma categoria de crédito.'
          : 'Escolha uma categoria de débito.',
      );
    }
    if (category.archivedAt) {
      throw invalidCategory('Esta categoria está arquivada. Reative-a ou escolha outra.');
    }
  }
}
