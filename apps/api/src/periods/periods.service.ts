import {
  undatedPayable,
  undatedReceivable,
  type PeriodClosing,
  type PeriodClosingState,
  type PeriodPending,
} from '@financas/shared';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { RecurrencesService } from '../recurrences/recurrences.service.js';
import { toIsoDate } from '../transactions/dates.js';

const withNames = {
  closedBy: { select: { name: true } },
  reopenedBy: { select: { name: true } },
} satisfies Prisma.PeriodClosingInclude;

type ClosingRow = Prisma.PeriodClosingGetPayload<{ include: typeof withNames }>;

function toClosing(row: ClosingRow): PeriodClosing {
  return {
    id: row.id,
    period: row.period,
    closedAt: row.closedAt.toISOString(),
    closedBy: row.closedBy?.name ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    reopenedBy: row.reopenedBy?.name ?? null,
    reopenReason: row.reopenReason,
  };
}

const alreadyClosed = () =>
  new ConflictException({ code: 'PERIOD_ALREADY_CLOSED', message: 'Este mês já está fechado.' });

const notClosed = () =>
  new ConflictException({ code: 'PERIOD_NOT_CLOSED', message: 'Este mês não está fechado.' });

/**
 * Closing and reopening a competência (ADR 0063). Closing asks for nothing pending but a loan
 * with no due date, and saves an inherited budget as the month's own, so a later change to an
 * earlier budget does not reach it. Both lock the workspace row first (as ADR 0024 does with the
 * user's), so two closings of the same month at once wait for each other and only one row stays
 * open. The lock itself lives in the trigger and in `ensureOpenPeriods`.
 */
@Injectable()
export class PeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrences: RecurrencesService,
  ) {}

  async state(workspaceId: string, period: string): Promise<PeriodClosingState> {
    const db = this.prisma.forWorkspace(workspaceId);
    const closings = await db.periodClosing.findMany({
      where: { workspaceId, period },
      include: withNames,
      orderBy: { closedAt: 'desc' },
    });
    const open = closings.find((closing) => closing.reopenedAt === null);
    if (!open) await this.recurrences.materialize(workspaceId, [period]);
    return {
      period,
      closing: open ? toClosing(open) : null,
      history: closings.map(toClosing),
      pending: open
        ? []
        : await this.prisma.$transaction(async (tx) => {
            await setWorkspaceContext(tx, workspaceId);
            return this.pending(tx, workspaceId, period);
          }),
    };
  }

  async close(workspaceId: string, period: string, userId: string): Promise<PeriodClosingState> {
    // A recurrence month not generated yet is pending too, as opening the month would show.
    await this.recurrences.materialize(workspaceId, [period]);
    await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
      const open = await tx.periodClosing.findFirst({
        where: { workspaceId, period, reopenedAt: null },
      });
      if (open) throw alreadyClosed();
      const pending = await this.pending(tx, workspaceId, period);
      if (pending.length > 0) {
        throw new ConflictException({
          code: 'PERIOD_HAS_PENDING',
          message:
            pending.length === 1
              ? 'Ainda há 1 lançamento pendente neste mês: pague ou receba antes de fechar.'
              : `Ainda há ${pending.length} lançamentos pendentes neste mês: pague ou receba antes de fechar.`,
          pending,
        });
      }
      await this.keepInheritedBudget(tx, workspaceId, period);
      await tx.periodClosing.create({ data: { workspaceId, period, closedById: userId } });
    });
    return this.state(workspaceId, period);
  }

  async reopen(
    workspaceId: string,
    period: string,
    userId: string,
    reason: string,
  ): Promise<PeriodClosingState> {
    await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      await tx.$queryRaw`SELECT id FROM workspaces WHERE id = ${workspaceId}::uuid FOR UPDATE`;
      const { count } = await tx.periodClosing.updateMany({
        where: { workspaceId, period, reopenedAt: null },
        data: { reopenedAt: new Date(), reopenedById: userId, reopenReason: reason },
      });
      if (count === 0) throw notClosed();
    });
    return this.state(workspaceId, period);
  }

  /**
   * The month's pending transactions, but a loan with no due date (ADRs 0057, 0063). The
   * state generates the recurrence months first, as opening the month does; closing does it
   * before its transaction.
   */
  private async pending(
    db: Pick<Prisma.TransactionClient, 'category' | 'transaction'>,
    workspaceId: string,
    period: string,
  ): Promise<PeriodPending[]> {
    const [neutral, transactions] = await Promise.all([
      db.category.findMany({ where: { workspaceId, neutral: true }, select: { id: true } }),
      db.transaction.findMany({
        where: { workspaceId, period, settledAt: null },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      }),
    ]);
    const neutralIds = new Set(neutral.map((category) => category.id));
    const loan = (transaction: (typeof transactions)[number]) => {
      const row = {
        type: transaction.type,
        categoryId: transaction.categoryId,
        dueDate: transaction.dueDate && toIsoDate(transaction.dueDate),
        settledAt: null,
      };
      return undatedReceivable(row, neutralIds) || undatedPayable(row, neutralIds);
    };
    return transactions
      .filter((transaction) => !loan(transaction))
      .map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        description: transaction.description,
        amountCents: transaction.amountCents,
        dueDate: transaction.dueDate && toIsoDate(transaction.dueDate),
      }));
  }

  /** An inherited budget becomes the month's own, shares and all (ADR 0030). */
  private async keepInheritedBudget(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    period: string,
  ): Promise<void> {
    const config = await tx.budgetConfig.findFirst({
      where: { workspaceId, period: { lte: period } },
      orderBy: { period: 'desc' },
      include: { shares: true },
    });
    if (!config || config.period === period) return;
    await tx.budgetConfig.create({
      data: {
        workspaceId,
        period,
        netIncomeCents: config.netIncomeCents,
        shares: {
          create: config.shares.map((share) => ({
            workspaceId,
            destinationId: share.destinationId,
            basisPoints: share.basisPoints,
          })),
        },
      },
    });
  }
}
