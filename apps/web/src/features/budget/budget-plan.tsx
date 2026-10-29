import { formatBasisPoints, formatCents, FULL_BASIS_POINTS, type Summary } from '@financas/shared';
import type { ReactNode } from 'react';
import { InfoTip } from '@/components/info-tip';
import { cn } from '@/lib/utils';

/** How the net income is divided (ADR 0064): the limit, the goals and what neither gets. */
function planParts(summary: Summary) {
  const limit = summary.destinations.find((destination) => destination.kind === 'EXPENSES');
  const goals = summary.destinations.filter((destination) => destination.kind === 'SAVINGS');
  return {
    limit,
    goals,
    goalsBasisPoints: goals.reduce((sum, goal) => sum + goal.basisPoints, 0),
    free: summary.unallocated,
  };
}

/**
 * The net income as one bar of 100%: spending (`--chart-1`), the goals (`--chart-3`) and "Sem
 * meta" as the empty track, the colors of ADR 0032; the legend names each part with its share,
 * so the bar is never read by color alone.
 */
function PlanBar({ summary }: { summary: Summary }) {
  const { limit, goalsBasisPoints, free } = planParts(summary);
  const limitBasisPoints = limit?.basisPoints ?? 0;
  const width = (basisPoints: number) => `${(basisPoints / FULL_BASIS_POINTS) * 100}%`;
  const parts = [
    { label: 'Gastos', basisPoints: limitBasisPoints, swatch: 'bg-chart-1' },
    { label: 'Metas', basisPoints: goalsBasisPoints, swatch: 'bg-chart-3' },
    { label: 'Sem meta', basisPoints: free.basisPoints, swatch: 'bg-border' },
  ];
  return (
    <div className="grid gap-2">
      <div
        role="img"
        aria-label={`Divisão da renda líquida: ${parts
          .map((part) => `${part.label.toLowerCase()} ${formatBasisPoints(part.basisPoints)}`)
          .join(', ')}.`}
        className="bg-border flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {limitBasisPoints > 0 && (
          <div className="bg-chart-1 h-full" style={{ width: width(limitBasisPoints) }} />
        )}
        {goalsBasisPoints > 0 && (
          <div className="bg-chart-3 h-full" style={{ width: width(goalsBasisPoints) }} />
        )}
      </div>
      <ul aria-hidden className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((part) => (
          <li key={part.label} className="flex items-center gap-1.5 tabular-nums">
            <span className={cn('size-2.5 shrink-0 rounded-full', part.swatch)} />
            {part.label} {formatBasisPoints(part.basisPoints)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanLine({
  label,
  basisPoints,
  cents,
  total = false,
  children,
}: {
  label: string;
  basisPoints: number;
  cents: number;
  total?: boolean;
  children?: ReactNode;
}) {
  return (
    <li
      className={cn(
        // At 360px the name keeps most of the line: the share and the amount take only their width.
        'grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-2 border-t py-2 first:border-t-0 first:pt-0 last:pb-0 sm:gap-x-3',
        total && 'font-medium',
      )}
    >
      {/* The name and its "ⓘ" stay together on a line of their own when they must wrap. */}
      <span className="flex min-w-0 flex-wrap items-center break-words">
        <span className="min-w-0">{label}</span>
        {children}
      </span>
      <span
        className={cn(
          'min-w-10 text-right text-sm tabular-nums sm:min-w-12',
          total ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {formatBasisPoints(basisPoints)}
      </span>
      <span className="text-right font-semibold whitespace-nowrap tabular-nums sm:min-w-28">
        {formatCents(cents)}
      </span>
    </li>
  );
}

/**
 * The whole plan of the month (ADR 0064, option A of the preview): the bar of 100%, then one line
 * per share of the net income, its percentage and its amount, the limit first and "Sem meta"
 * last, down to the total. The progress of each stays in "Limite de gastos" and "Metas".
 */
export function BudgetPlan({ summary }: { summary: Summary }) {
  const { limit, goals, free } = planParts(summary);
  return (
    <div className="grid gap-4">
      <PlanBar summary={summary} />
      <ul aria-label="Divisão da renda líquida" className="grid">
        {limit && (
          <PlanLine
            label="Limite de gastos"
            basisPoints={limit.basisPoints}
            cents={limit.targetCents}
          />
        )}
        {goals.map((goal) => (
          <PlanLine
            key={goal.destinationId}
            label={goal.name}
            basisPoints={goal.basisPoints}
            cents={goal.targetCents}
          />
        ))}
        <PlanLine label="Sem meta" basisPoints={free.basisPoints} cents={free.targetCents}>
          {/* A share of the plan, never money in the account (ADR 0051). */}
          <InfoTip term="Sem meta">
            <p>
              Parte da renda líquida que nem o limite de gastos nem uma meta recebeu. É uma divisão
              do orçamento, não um saldo.
            </p>
          </InfoTip>
        </PlanLine>
        <PlanLine
          label="Total"
          basisPoints={FULL_BASIS_POINTS}
          cents={summary.budget.netIncomeCents}
          total
        />
      </ul>
    </div>
  );
}
