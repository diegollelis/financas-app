import {
  budgetShareKeys,
  formatBasisPoints,
  formatCents,
  formatPeriod,
  FULL_BASIS_POINTS,
  hasRole,
  shareOfIncome,
  type Budget,
} from '@financas/shared';
import { PageHeader } from '@/components/page-header';
import { ListSkeleton, QueryState } from '@/components/query-state';
import { BudgetForm } from '@/features/budget/budget-form';
import { shareLabels } from '@/features/budget/share-labels';
import { useBudget, useSaveBudget } from '@/features/budget/use-budget';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';

/** Where the configuration shown came from (ADR 0030), and what saving it does. */
function SourceNotice({ budget, canEdit }: { budget: Budget; canEdit: boolean }) {
  const thisMonth = formatPeriod(budget.period);
  if (budget.source === 'SAVED') {
    return <p className="text-muted-foreground">Orçamento próprio de {thisMonth}.</p>;
  }
  const origin =
    budget.source === 'INHERITED' && budget.inheritedFrom
      ? `Herdado de ${formatPeriod(budget.inheritedFrom)}.`
      : 'Percentuais padrão: nenhuma competência até aqui tem orçamento salvo.';
  return (
    <p className="text-muted-foreground">
      {origin}
      {canEdit && ` Ao salvar, ${thisMonth} passa a ter o seu próprio orçamento.`}
    </p>
  );
}

/** For VIEWERs: the same numbers, read-only. */
function BudgetSummary({ budget }: { budget: Budget }) {
  const assigned = budgetShareKeys.reduce((sum, key) => sum + budget[key], 0);
  return (
    <dl className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 tabular-nums">
      <dt>Renda líquida</dt>
      <dd />
      <dd className="text-right">{formatCents(budget.netIncomeCents)}</dd>
      {budget.grossIncomeCents !== null && (
        <>
          <dt>Renda bruta</dt>
          <dd />
          <dd className="text-right">{formatCents(budget.grossIncomeCents)}</dd>
        </>
      )}
      {budgetShareKeys.map((key) => (
        <div key={key} className="contents">
          <dt>{shareLabels[key]}</dt>
          <dd className="text-right">{formatBasisPoints(budget[key])}</dd>
          <dd className="text-right">
            {formatCents(shareOfIncome(budget.netIncomeCents, budget[key]))}
          </dd>
        </div>
      ))}
      {assigned < FULL_BASIS_POINTS && (
        <>
          <dt className="text-muted-foreground">Sem destino</dt>
          <dd className="text-muted-foreground text-right">
            {formatBasisPoints(FULL_BASIS_POINTS - assigned)}
          </dd>
          <dd className="text-muted-foreground text-right">
            {formatCents(shareOfIncome(budget.netIncomeCents, FULL_BASIS_POINTS - assigned))}
          </dd>
        </>
      )}
    </dl>
  );
}

function BudgetEditor({ workspaceId, budget }: { workspaceId: string; budget: Budget }) {
  const save = useSaveBudget(workspaceId, budget.period);
  return (
    <BudgetForm
      initial={budget}
      submitLabel={save.isPending ? 'Salvando…' : `Salvar para ${formatPeriod(budget.period)}`}
      pending={save.isPending}
      error={save.error}
      saved={save.isSuccess}
      onSubmit={(input) => save.mutateAsync(input)}
    />
  );
}

export function BudgetPage() {
  const workspace = useCurrentWorkspace();
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const period = usePeriod();
  const budget = useBudget(workspace.id, period);

  return (
    <>
      <PageHeader title="Orçamento">
        <PeriodNav period={period} />
      </PageHeader>
      <QueryState queries={[budget]} skeleton={<ListSkeleton rows={6} />} />
      {budget.isSuccess && (
        <>
          <SourceNotice budget={budget.data} canEdit={canEdit} />
          {canEdit ? (
            <BudgetEditor
              // Another competência starts fresh: its own values, no "saved" or error left
              // over from the month seen before.
              key={period}
              workspaceId={workspace.id}
              budget={budget.data}
            />
          ) : (
            <BudgetSummary budget={budget.data} />
          )}
        </>
      )}
    </>
  );
}
