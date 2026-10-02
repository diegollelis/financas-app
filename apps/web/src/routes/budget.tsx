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
import { Link, useParams } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetForm } from '@/features/budget/budget-form';
import { shareLabels } from '@/features/budget/share-labels';
import { useBudget, useSaveBudget } from '@/features/budget/use-budget';
import { usePeriod } from '@/features/periods/use-period';
import { useWorkspace } from '@/features/workspaces/use-workspace';
import { ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/error-message';

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

export function BudgetPage() {
  const { workspaceId = '' } = useParams();
  const period = usePeriod();
  const workspace = useWorkspace(workspaceId);
  const budget = useBudget(workspaceId, period);
  const save = useSaveBudget(workspaceId, period);
  const error = workspace.error ?? budget.error;
  const ready = workspace.isSuccess && budget.isSuccess;
  const canEdit = ready && hasRole(workspace.data.role, 'EDITOR');

  return (
    <main className="flex min-h-svh justify-center p-6">
      <Card className="w-full max-w-2xl self-start">
        <CardHeader>
          <Link
            to={`/espacos/${workspaceId}`}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← {workspace.data?.name ?? 'Espaço'}
          </Link>
          <CardTitle>
            <h1>Orçamento</h1>
          </CardTitle>
          <CardDescription>Competência: {formatPeriod(period)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm">
          {!ready && !error && <p className="text-muted-foreground">Carregando…</p>}
          {error &&
            (error instanceof ApiError && error.status === 404 ? (
              // Same answer for "does not exist" and "not yours" (ADR 0025).
              <p role="alert">Espaço não encontrado.</p>
            ) : (
              <p role="alert" className="text-destructive">
                {apiErrorMessage(error)}
              </p>
            ))}
          {ready && (
            <>
              <SourceNotice budget={budget.data} canEdit={canEdit} />
              {canEdit ? (
                <BudgetForm
                  // Another competência starts a fresh form with its own values.
                  key={period}
                  initial={budget.data}
                  submitLabel={save.isPending ? 'Salvando…' : `Salvar para ${formatPeriod(period)}`}
                  pending={save.isPending}
                  error={save.error}
                  saved={save.isSuccess}
                  onSubmit={(input) => save.mutateAsync(input)}
                />
              ) : (
                <BudgetSummary budget={budget.data} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
