import { formatPeriod } from '@financas/shared';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

/** The SQLSTATE the period lock trigger raises (migration period_closings, ADR 0063). */
export const PERIOD_CLOSED_SQLSTATE = 'FC001';

/** 409 for a write into a closed competência, from the services or from the trigger. */
export function periodClosed(period: string) {
  return new ConflictException({
    code: 'PERIOD_CLOSED',
    message: `O mês de ${formatPeriod(period)} está fechado: reabra o mês para mudar algo nele.`,
    period,
  });
}

type DriverError = {
  meta?: { driverAdapterError?: { cause?: { code?: unknown; detail?: unknown } } };
};

/**
 * The competência of the period lock trigger's error, or null for any other error. Prisma
 * wraps it with a different code per call (P2010 for a raw query, P2039 for a model one), so
 * only the driver's SQLSTATE tells it apart; the trigger puts the competência in DETAIL.
 */
export function closedPeriodOf(error: unknown): string | null {
  const cause = (error as DriverError | undefined)?.meta?.driverAdapterError?.cause;
  return cause?.code === PERIOD_CLOSED_SQLSTATE && typeof cause.detail === 'string'
    ? cause.detail
    : null;
}

type ClosingReader = { periodClosing: Pick<Prisma.TransactionClient['periodClosing'], 'findMany'> };

/** Which of these competências of the workspace are closed now. */
export async function closedPeriods(
  db: ClosingReader,
  workspaceId: string,
  periods: Iterable<string>,
): Promise<Set<string>> {
  const wanted = [...new Set(periods)];
  if (wanted.length === 0) return new Set();
  const closings = await db.periodClosing.findMany({
    where: { workspaceId, period: { in: wanted }, reopenedAt: null },
    select: { period: true },
  });
  return new Set(closings.map((closing) => closing.period));
}

/**
 * Refuses a write that reaches a closed competência, before anything is written (ADR 0063).
 * The trigger would refuse it too; this answers first and names the earliest month.
 */
export async function ensureOpenPeriods(
  db: ClosingReader,
  workspaceId: string,
  periods: Iterable<string>,
): Promise<void> {
  const closed = [...(await closedPeriods(db, workspaceId, periods))].sort();
  if (closed[0] !== undefined) throw periodClosed(closed[0]);
}
