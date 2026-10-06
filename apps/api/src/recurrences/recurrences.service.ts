import {
  currentPeriod,
  dueDateIn,
  estimateAmount,
  shiftPeriod,
  type CreateRecurrenceInput,
  type Recurrence,
  type UpdateRecurrenceInput,
} from '@financas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { Prisma, type Recurrence as RecurrenceRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDate } from '../transactions/dates.js';

function toResponse(recurrence: RecurrenceRow): Recurrence {
  return {
    id: recurrence.id,
    type: recurrence.type,
    description: recurrence.description,
    notes: recurrence.notes,
    categoryId: recurrence.categoryId,
    amountCents: recurrence.amountCents,
    variableAmount: recurrence.variableAmount,
    dueDay: recurrence.dueDay,
    startPeriod: recurrence.startPeriod,
    endPeriod: recurrence.endPeriod,
  };
}

const dueDateFor = (period: string, dueDay: number | null) =>
  dueDay === null ? null : toDate(dueDateIn(period, dueDay));

/** P2002: the occurrence already exists (opened at the same time elsewhere). */
const isDuplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Recorrências of one workspace (ADR 0038). Same rules as the other resources: the workspaceId
 * comes from WorkspaceMemberGuard, every query filters by it and runs through forWorkspace (RLS).
 * Descriptions and amounts are personal data: never log them (ADR 0012).
 */
@Injectable()
export class RecurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active ones first, then by description. */
  async list(workspaceId: string): Promise<Recurrence[]> {
    const recurrences = await this.prisma.forWorkspace(workspaceId).recurrence.findMany({
      where: { workspaceId },
      orderBy: [{ endPeriod: { sort: 'desc', nulls: 'first' } }, { description: 'asc' }],
    });
    return recurrences.map(toResponse);
  }

  /** Creates it and its transaction in the first competência right away. */
  async create(workspaceId: string, input: CreateRecurrenceInput): Promise<Recurrence> {
    await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, input.type);
    const recurrence = await this.prisma.forWorkspace(workspaceId).recurrence.create({
      data: {
        workspaceId,
        type: input.type,
        description: input.description,
        notes: input.notes ?? null,
        categoryId: input.categoryId,
        amountCents: input.amountCents,
        variableAmount: input.variableAmount ?? false,
        dueDay: input.dueDay ?? null,
        startPeriod: input.startPeriod,
      },
    });
    await this.materialize(workspaceId, [input.startPeriod]);
    return toResponse(recurrence);
  }

  /**
   * Changes the recurrence and its pending transactions from this month on. Settled ones and
   * past months are history and stay as they are (ADR 0038).
   */
  async update(
    workspaceId: string,
    recurrenceId: string,
    input: UpdateRecurrenceInput,
  ): Promise<Recurrence> {
    const current = await this.find(workspaceId, recurrenceId);
    if (input.categoryId && input.categoryId !== current.categoryId) {
      await ensureUsableCategory(this.prisma, workspaceId, input.categoryId, current.type);
    }
    const db = this.prisma.forWorkspace(workspaceId);
    const recurrence = await db.recurrence.update({
      where: { id: recurrenceId, workspaceId },
      data: {
        description: input.description,
        notes: input.notes,
        categoryId: input.categoryId,
        amountCents: input.amountCents,
        variableAmount: input.variableAmount,
        dueDay: input.dueDay,
      },
    });

    const pending = await db.transaction.findMany({
      where: this.pendingFromThisMonth(workspaceId, recurrenceId),
      select: { id: true, period: true, amountEstimated: true },
    });
    for (const transaction of pending) {
      // A variable one whose real amount was already given keeps it: only estimates follow.
      const keepsAmount = recurrence.variableAmount && !transaction.amountEstimated;
      await db.transaction.update({
        where: { id: transaction.id, workspaceId },
        data: {
          description: input.description,
          notes: input.notes,
          categoryId: input.categoryId,
          amountCents: keepsAmount ? undefined : input.amountCents,
          // Turned fixed: what was an estimate becomes the amount.
          amountEstimated: input.variableAmount === false ? false : undefined,
          // Only when the day changed: each month has its own date.
          dueDate:
            input.dueDay === undefined ? undefined : dueDateFor(transaction.period, input.dueDay),
        },
      });
    }
    return toResponse(recurrence);
  }

  /**
   * Ends it: no new months, and its pending transactions from this month on are removed. One
   * that never reached this month is deleted outright; otherwise it ends last month and stays
   * as history.
   */
  async end(workspaceId: string, recurrenceId: string): Promise<void> {
    const recurrence = await this.find(workspaceId, recurrenceId);
    const thisMonth = currentPeriod();
    if (recurrence.endPeriod !== null && recurrence.endPeriod < thisMonth) return;
    const db = this.prisma.forWorkspace(workspaceId);
    await db.transaction.deleteMany({
      where: this.pendingFromThisMonth(workspaceId, recurrenceId),
    });
    if (recurrence.startPeriod >= thisMonth) {
      // Its transactions (settled ones too) stay; only the link to it goes with the occurrences.
      await db.recurrence.delete({ where: { id: recurrenceId, workspaceId } });
    } else {
      await db.recurrence.update({
        where: { id: recurrenceId, workspaceId },
        data: { endPeriod: shiftPeriod(thisMonth, -1) },
      });
    }
  }

  /**
   * Creates the pending transactions the active recurrences lack in these competências, with
   * the estimated amount (ADR 0038). Each one is created together with its occurrence in one
   * nested write; the occurrence is unique per (recurrence, period), so opening a month twice
   * at once creates it only once. A month whose transaction was deleted keeps its occurrence and
   * is not generated again.
   */
  async materialize(workspaceId: string, periods: string[]): Promise<void> {
    if (periods.length === 0) return;
    const sorted = [...periods].sort();
    const first = sorted[0] as string;
    const last = sorted.at(-1) as string;
    const db = this.prisma.forWorkspace(workspaceId);
    const recurrences = await db.recurrence.findMany({
      where: {
        workspaceId,
        startPeriod: { lte: last },
        OR: [{ endPeriod: null }, { endPeriod: { gte: first } }],
      },
      include: { occurrences: { where: { period: { in: periods } }, select: { period: true } } },
    });

    for (const recurrence of recurrences) {
      const done = new Set(recurrence.occurrences.map((occurrence) => occurrence.period));
      const missing = sorted.filter(
        (period) =>
          !done.has(period) &&
          period >= recurrence.startPeriod &&
          (recurrence.endPeriod === null || period <= recurrence.endPeriod),
      );
      if (missing.length === 0) continue;
      // A variable one starts each month from its settled history (ADR 0038).
      const settled = recurrence.variableAmount
        ? await db.transaction.findMany({
            where: {
              workspaceId,
              settledAt: { not: null },
              occurrence: { is: { recurrenceId: recurrence.id } },
            },
            orderBy: { period: 'desc' },
            select: { period: true, amountCents: true },
          })
        : [];
      for (const period of missing) {
        const amountCents = recurrence.variableAmount
          ? estimateAmount(
              // Only months before this one: an estimate never looks at its own future.
              settled.filter((row) => row.period < period).map((row) => row.amountCents),
              recurrence.amountCents,
            )
          : recurrence.amountCents;
        try {
          await db.transaction.create({
            data: {
              workspaceId,
              type: recurrence.type,
              description: recurrence.description,
              notes: recurrence.notes,
              categoryId: recurrence.categoryId,
              amountCents,
              amountEstimated: recurrence.variableAmount,
              period,
              dueDate: dueDateFor(period, recurrence.dueDay),
              occurrence: { create: { recurrenceId: recurrence.id, period, workspaceId } },
            },
          });
        } catch (error) {
          // Created by a request that opened the same month at the same time.
          if (!isDuplicate(error)) throw error;
        }
      }
    }
  }

  /** Not settled, of this month or later: what a change or an end may touch. */
  private pendingFromThisMonth(workspaceId: string, recurrenceId: string) {
    return {
      workspaceId,
      settledAt: null,
      period: { gte: currentPeriod() },
      occurrence: { is: { recurrenceId } },
    } satisfies Prisma.TransactionWhereInput;
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, recurrenceId: string) {
    if (!z.uuid().safeParse(recurrenceId).success) throw new NotFoundException();
    const recurrence = await this.prisma
      .forWorkspace(workspaceId)
      .recurrence.findFirst({ where: { id: recurrenceId, workspaceId } });
    if (!recurrence) throw new NotFoundException();
    return recurrence;
  }
}
