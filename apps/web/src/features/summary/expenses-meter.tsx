import { formatBasisPoints, formatCents, type Summary } from '@financas/shared';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The month's debits against the expenses goal (net income × expenses %). The track is a light
 * step of the fill's own color; over the goal, the fill turns red and the text says so.
 */
export function ExpensesMeter({
  summary,
  budgetLink,
  canEdit,
}: {
  summary: Summary;
  /** The budget of the same competência, where the net income is set. */
  budgetLink: string;
  /** EDITORs and OWNERs set it; a VIEWER can only look. */
  canEdit: boolean;
}) {
  const goal = summary.shares.find((share) => share.key === 'expensesBp');
  const goalCents = goal?.targetCents ?? 0;
  if (!goal || goalCents === 0) {
    // An empty state with its action (ADR 0036), not just a sentence.
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-4">
        <p className="text-muted-foreground">
          {canEdit
            ? 'Defina a renda líquida no orçamento para acompanhar a meta de despesas.'
            : 'A meta de despesas aparece quando a renda líquida for definida no orçamento.'}
        </p>
        <Button asChild variant={canEdit ? 'default' : 'outline'}>
          <Link to={budgetLink}>{canEdit ? 'Definir renda' : 'Ver orçamento'}</Link>
        </Button>
      </div>
    );
  }
  const spent = summary.debits.totalCents;
  const over = summary.expensesLeftCents < 0;

  return (
    <div className="grid gap-2">
      <div
        role="meter"
        aria-label="Despesas em relação à meta"
        aria-valuemin={0}
        aria-valuemax={goalCents}
        aria-valuenow={Math.min(spent, goalCents)}
        aria-valuetext={`${formatCents(spent)} de ${formatCents(goalCents)}`}
        className={cn('h-3 rounded-r', over ? 'bg-destructive/20' : 'bg-chart-1/20')}
      >
        <div
          className={cn('h-full rounded-r', over ? 'bg-destructive' : 'bg-chart-1')}
          style={{ width: `${Math.min(spent / goalCents, 1) * 100}%` }}
        />
      </div>
      <p className="tabular-nums">
        {formatCents(spent)} de {formatCents(goalCents)}{' '}
        <span className="text-muted-foreground">
          (meta de {formatBasisPoints(goal.basisPoints)} da renda)
        </span>
      </p>
      {over ? (
        <p className="text-destructive">
          Acima da meta em {formatCents(-summary.expensesLeftCents)}.
        </p>
      ) : (
        <p className="text-muted-foreground">Folga de {formatCents(summary.expensesLeftCents)}.</p>
      )}
    </div>
  );
}
