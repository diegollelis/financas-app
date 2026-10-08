import { formatPeriod, type Budget } from '@financas/shared';
import { toast } from 'sonner';
import { ListSkeleton, QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { BudgetForm } from './budget-form';
import { useBudget, useSaveBudget } from './use-budget';

/** Where the values in the form came from, and what saving does (ADR 0030). */
function budgetSourceText(budget: Budget) {
  const month = formatPeriod(budget.period);
  if (budget.source === 'SAVED') return `Orçamento próprio de ${month}.`;
  const origin =
    budget.source === 'INHERITED' && budget.inheritedFrom
      ? `Herdado de ${formatPeriod(budget.inheritedFrom)}.`
      : 'Percentuais padrão: nenhuma competência até aqui tem orçamento salvo.';
  return `${origin} Ao salvar, ${month} passa a ter o seu próprio orçamento.`;
}

function BudgetDialogBody({
  workspaceId,
  period,
  onDone,
}: {
  workspaceId: string;
  period: string;
  onDone: () => void;
}) {
  const budget = useBudget(workspaceId, period);
  const save = useSaveBudget(workspaceId, period);
  return (
    <>
      <QueryState queries={[budget]} skeleton={<ListSkeleton rows={6} />} />
      {budget.isSuccess && (
        <div className="grid gap-4">
          <p className="text-muted-foreground">{budgetSourceText(budget.data)}</p>
          <BudgetForm
            initial={budget.data}
            submitLabel={save.isPending ? 'Salvando…' : 'Salvar orçamento'}
            pending={save.isPending}
            error={save.error}
            onSubmit={(input) =>
              save.mutateAsync(input).then(() => {
                toast.success('Orçamento salvo');
                onDone();
              })
            }
            onCancel={onDone}
          />
        </div>
      )}
    </>
  );
}

/**
 * The budget of one competência, edited where its effect shows: on the dashboard (ADR 0046).
 * It used to be a page of its own; the dashboard already showed everything that page did but
 * the form. A sheet from the bottom on the phone, a dialog from md. Saving refreshes the
 * dashboard (useSaveBudget invalidates the summaries) and closes it.
 */
export function BudgetDialog({
  workspaceId,
  period,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  period: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened it, which gets the focus back on close. */
  returnFocusTo: HTMLElement | null;
}) {
  const month = formatPeriod(period);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Orçamento de ${month}`}
      description={`Vale para ${month} e para os meses seguintes que não tiverem orçamento próprio.`}
    >
      <BudgetDialogBody
        // Another competência starts fresh: its own values, no error left over.
        key={period}
        workspaceId={workspaceId}
        period={period}
        onDone={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}
