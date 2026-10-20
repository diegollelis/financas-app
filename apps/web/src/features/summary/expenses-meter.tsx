import { formatBasisPoints, formatCents, type Summary } from '@financas/shared';
import { cn } from '@/lib/utils';

/**
 * The month's expenses against their goal (net income × Despesas %). Expenses are the debits
 * outside the saving destinations' categories (ADR 0047): putting money aside is not spending.
 * Labelled "Gastos", so it is not read as the debits of the balance card (ADR 0051 note). The
 * track is a light step of the fill's own color; over the goal, the fill turns red and the text
 * says so. Nothing without a goal (no net income or 0%): the card says how to set it.
 */
export function ExpensesMeter({ summary }: { summary: Summary }) {
  const goal = summary.destinations.find((destination) => destination.kind === 'EXPENSES');
  const goalCents = goal?.targetCents ?? 0;
  if (!goal || goalCents === 0) return null;
  const spent = summary.expenses.totalCents;
  const over = summary.expensesLeftCents < 0;

  return (
    <div className="grid gap-2">
      <dl className="grid gap-0.5">
        <dt className="text-muted-foreground text-sm">Gastos</dt>
        <dd className="tabular-nums">
          <span className="text-2xl font-semibold">{formatCents(spent)}</span>{' '}
          <span className="text-muted-foreground">de {formatCents(goalCents)}</span>
        </dd>
      </dl>
      <div
        role="meter"
        aria-label="Gastos em relação ao limite"
        aria-valuemin={0}
        aria-valuemax={goalCents}
        aria-valuenow={Math.min(spent, goalCents)}
        aria-valuetext={`${formatCents(spent)} de ${formatCents(goalCents)}`}
        className={cn('h-2.5 rounded-full', over ? 'bg-destructive/20' : 'bg-chart-1/20')}
      >
        <div
          className={cn('h-full rounded-full', over ? 'bg-destructive' : 'bg-chart-1')}
          style={{ width: `${Math.min(spent / goalCents, 1) * 100}%` }}
        />
      </div>
      <p className="text-sm tabular-nums">
        {over ? (
          <span className="text-destructive">
            Acima do limite em {formatCents(-summary.expensesLeftCents)}.
          </span>
        ) : (
          <span className="text-muted-foreground">
            Sobram {formatCents(summary.expensesLeftCents)} no limite.
          </span>
        )}{' '}
        <span className="text-muted-foreground">
          O limite é {formatBasisPoints(goal.basisPoints)} da renda líquida.
        </span>
      </p>
    </div>
  );
}
