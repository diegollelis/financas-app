import {
  currentPeriod,
  formatCents,
  formatPeriod,
  hasRole,
  shiftPeriod,
  splitInstallments,
  type Category,
  type InstallmentPlan,
  type Recurrence,
  type UpdateRecurrenceInput,
} from '@financas/shared';
import { Ellipsis } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { TextLink } from '@/components/text-link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCategories } from '@/features/categories/use-categories';
import {
  useEndInstallmentPlan,
  useInstallmentPlans,
} from '@/features/installments/use-installments';
import { RecurrenceForm } from '@/features/recurrences/recurrence-form';
import {
  useEndRecurrence,
  useRecurrences,
  useUpdateRecurrence,
} from '@/features/recurrences/use-recurrences';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const MONTHLY_TITLE_ID = 'recurrences-monthly';
const PLANS_TITLE_ID = 'recurrences-plans';

const typeLabel = { CREDIT: 'Crédito', DEBIT: 'Débito' } as const;

const showError = (error: unknown) => toast.error(apiErrorMessage(error));

/** "Desde outubro de 2026", or "A partir de" for one that has not started yet. */
function since(period: string) {
  return `${period > currentPeriod() ? 'A partir de' : 'Desde'} ${formatPeriod(period)}`;
}

/** The competência of a plan's last installment. */
const lastPeriodOf = (plan: InstallmentPlan) =>
  shiftPeriod(plan.firstPeriod, plan.installments - 1);

/** Ended, or every installment already paid: history, no longer something to act on. */
const planIsOver = (plan: InstallmentPlan) =>
  plan.endedAt !== null || plan.settledCount >= plan.installments;

/** The confirmation before ending a series (ADR 0038): what goes and what stays. */
function EndDialog({
  open,
  onOpenChange,
  returnFocusTo,
  title,
  description,
  action,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A row: what it is on the left, the amount on the right, and the menu for EDITORs. */
function SeriesRow({
  title,
  meta,
  amount,
  amountNote,
  menu,
}: {
  title: string;
  meta: (string | null)[];
  amount: string;
  amountNote: string | null;
  menu: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-medium break-words">{title}</p>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
          {meta
            .filter((part) => part !== null)
            .map((part) => (
              <span key={part}>{part}</span>
            ))}
        </p>
      </div>
      <div className="flex shrink-0 items-start gap-2 md:gap-1">
        <span className="grid justify-items-end">
          <span className="text-base font-semibold tabular-nums">{amount}</span>
          {amountNote && <span className="text-muted-foreground text-xs">{amountNote}</span>}
        </span>
        {menu}
      </div>
    </li>
  );
}

function ActionsButton({ name, ref }: { name: string; ref: RefObject<HTMLButtonElement | null> }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button ref={ref} variant="ghost" size="icon-sm" aria-label={`Ações de ${name}`}>
        <Ellipsis aria-hidden />
      </Button>
    </DropdownMenuTrigger>
  );
}

/** Inside the edit dialog: mounted on each opening, so no error is left from the last one. */
function EditRecurrence({
  workspaceId,
  recurrence,
  categories,
  onDone,
}: {
  workspaceId: string;
  recurrence: Recurrence;
  categories: Category[];
  onDone: () => void;
}) {
  const update = useUpdateRecurrence(workspaceId);
  const save = (changes: UpdateRecurrenceInput) => {
    // Nothing changed: nothing to send, and the pending months stay as they are.
    if (Object.keys(changes).length === 0) return onDone();
    update.mutate(
      { id: recurrence.id, ...changes },
      {
        onSuccess: () => {
          toast.success('Recorrência alterada');
          onDone();
        },
      },
    );
  };

  return (
    <RecurrenceForm
      recurrence={recurrence}
      categories={categories}
      pending={update.isPending}
      error={update.error}
      onSubmit={save}
      onCancel={onDone}
    />
  );
}

function RecurrenceItem({
  workspaceId,
  recurrence,
  categories,
  canEdit,
}: {
  workspaceId: string;
  recurrence: Recurrence;
  categories: Category[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const end = useEndRecurrence(workspaceId);
  const { description } = recurrence;
  const ended = recurrence.endPeriod !== null;
  const category = categories.find((item) => item.id === recurrence.categoryId);
  // mutateAsync: once ended, the row moves to "Encerradas" and this one unmounts.
  const confirmEnd = () =>
    void end.mutateAsync(recurrence.id).then(() => {
      toast.success('Recorrência encerrada');
      document.getElementById(MONTHLY_TITLE_ID)?.focus();
    }, showError);

  return (
    <SeriesRow
      title={description}
      meta={[
        typeLabel[recurrence.type],
        category?.name ?? 'Categoria',
        recurrence.dueDay === null ? null : `Vence dia ${recurrence.dueDay}`,
        ended ? `Até ${formatPeriod(recurrence.endPeriod ?? '')}` : since(recurrence.startPeriod),
      ]}
      amount={formatCents(recurrence.amountCents)}
      // A variable one: the amount typed is only the starting estimate (ADR 0038).
      amountNote={recurrence.variableAmount ? 'Varia todo mês' : null}
      menu={
        canEdit &&
        !ended && (
          <>
            <DropdownMenu>
              <ActionsButton name={description} ref={actionsRef} />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>Editar</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingEnd(true)}>
                  Encerrar recorrência
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ResponsiveDialog
              open={editing}
              onOpenChange={setEditing}
              returnFocusTo={actionsRef}
              title={`Editar ${description}`}
              description="As mudanças valem para os lançamentos pendentes deste mês em diante. Os efetivados e os meses anteriores ficam como estão."
            >
              <EditRecurrence
                workspaceId={workspaceId}
                recurrence={recurrence}
                categories={categories}
                onDone={() => setEditing(false)}
              />
            </ResponsiveDialog>
            <EndDialog
              open={confirmingEnd}
              onOpenChange={setConfirmingEnd}
              returnFocusTo={actionsRef}
              title={`Encerrar a recorrência ${description}?`}
              description="Deixa de repetir. Os lançamentos pendentes deste mês em diante saem; os anteriores e os já efetivados ficam."
              action="Encerrar recorrência"
              onConfirm={confirmEnd}
            />
          </>
        )
      }
    />
  );
}

function PlanItem({
  workspaceId,
  plan,
  categories,
  canEdit,
}: {
  workspaceId: string;
  plan: InstallmentPlan;
  categories: Category[];
  canEdit: boolean;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const end = useEndInstallmentPlan(workspaceId);
  const { description } = plan;
  const over = planIsOver(plan);
  const category = categories.find((item) => item.id === plan.categoryId);
  const parts = splitInstallments(plan.totalCents, plan.installments);
  const first = parts[0] ?? 0;
  const confirmEnd = () =>
    void end.mutateAsync(plan.id).then(() => {
      toast.success('Parcelamento encerrado');
      document.getElementById(PLANS_TITLE_ID)?.focus();
    }, showError);

  return (
    <SeriesRow
      title={description}
      meta={[
        typeLabel[plan.type],
        category?.name ?? 'Categoria',
        `${plan.settledCount} de ${plan.installments} pagas`,
        plan.endedAt !== null
          ? 'Encerrado'
          : plan.settledCount >= plan.installments
            ? 'Quitado'
            : remaining(plan),
      ]}
      amount={formatCents(plan.totalCents)}
      // The amount is the purchase's total: "total em 10 de R$ 99,90", or just how many when the
      // leftover cents make the last one differ.
      amountNote={
        parts.at(-1) === first
          ? `total em ${plan.installments} de ${formatCents(first)}`
          : `total em ${plan.installments} parcelas`
      }
      menu={
        canEdit &&
        !over && (
          <>
            <DropdownMenu>
              <ActionsButton name={description} ref={actionsRef} />
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingEnd(true)}>
                  Encerrar parcelamento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <EndDialog
              open={confirmingEnd}
              onOpenChange={setConfirmingEnd}
              returnFocusTo={actionsRef}
              title={`Encerrar o parcelamento ${description}?`}
              description="As parcelas pendentes deste mês em diante saem; as já pagas e as anteriores ficam. Use para uma quitação antecipada."
              action="Encerrar parcelamento"
              onConfirm={confirmEnd}
            />
          </>
        )
      }
    />
  );
}

/** "Faltam 2 parcelas: R$ 666,67, até dezembro de 2026": what is still to pay. */
function remaining(plan: InstallmentPlan) {
  if (plan.pendingCount === 0 || plan.lastPendingPeriod === null) {
    return `Última em ${formatPeriod(lastPeriodOf(plan))}`;
  }
  const count =
    plan.pendingCount === 1 ? 'Falta 1 parcela' : `Faltam ${plan.pendingCount} parcelas`;
  return `${count}: ${formatCents(plan.pendingCents)}, até ${formatPeriod(plan.lastPendingPeriod)}`;
}

/**
 * What the active recurrences add up to each month, by type: "Por mês: R$ 224,90 em débitos, dos
 * quais R$ 180,00 estimados." The variable ones are only an estimate, and it says so.
 */
function monthlyTotal(recurrences: Recurrence[]) {
  const sides = (['DEBIT', 'CREDIT'] as const).flatMap((type) => {
    const items = recurrences.filter((item) => item.type === type);
    if (items.length === 0) return [];
    const total = items.reduce((sum, item) => sum + item.amountCents, 0);
    const estimated = items
      .filter((item) => item.variableAmount)
      .reduce((sum, item) => sum + item.amountCents, 0);
    const noun = type === 'DEBIT' ? 'débitos' : 'créditos';
    const part =
      estimated === 0
        ? ''
        : estimated === total
          ? ', todos estimados'
          : `, dos quais ${formatCents(estimated)} estimados`;
    return [`${formatCents(total)} em ${noun}${part}`];
  });
  return sides.length === 0 ? null : `Por mês: ${sides.join('; ')}.`;
}

function Section({
  titleId,
  title,
  empty,
  active,
  pastTitle,
  past,
  summary,
}: {
  titleId: string;
  title: string;
  empty: string;
  /** A line under the title, e.g. what the active ones add up to. */
  summary?: string | null;
  active: ReactNode[];
  pastTitle: string;
  past: ReactNode[];
}) {
  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      {/* Focusable from script: where focus goes after ending one. */}
      <h2 id={titleId} tabIndex={-1} className="font-medium outline-none">
        {title}
      </h2>
      {summary && <p className="tabular-nums">{summary}</p>}
      {active.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-xl border px-4">{active}</ul>
      )}
      {past.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-muted-foreground font-medium">{pastTitle}</h3>
          <ul className="divide-y rounded-xl border px-4">{past}</ul>
        </div>
      )}
    </section>
  );
}

export function RecurrencesPage() {
  const workspace = useCurrentWorkspace();
  const recurrences = useRecurrences(workspace.id);
  const plans = useInstallmentPlans(workspace.id);
  const categories = useCategories(workspace.id);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const ready = recurrences.isSuccess && plans.isSuccess && categories.isSuccess;

  const recurrenceItem = (recurrence: Recurrence) => (
    <RecurrenceItem
      key={recurrence.id}
      workspaceId={workspace.id}
      recurrence={recurrence}
      categories={categories.data ?? []}
      canEdit={canEdit}
    />
  );
  const planItem = (plan: InstallmentPlan) => (
    <PlanItem
      key={plan.id}
      workspaceId={workspace.id}
      plan={plan}
      categories={categories.data ?? []}
      canEdit={canEdit}
    />
  );

  return (
    <>
      <PageHeader
        title="Recorrências"
        description="O que se repete todo mês e as compras parceladas. Mudanças valem para os lançamentos pendentes deste mês em diante. O que já passou ou foi efetivado não muda."
      />
      <QueryState queries={[recurrences, plans, categories]} />
      {ready &&
        (recurrences.data.length === 0 && plans.data.length === 0 ? (
          <p className="text-muted-foreground">
            Nenhuma recorrência nem parcelamento. Para criar um, use "Repetir" no novo lançamento,
            em <TextLink to={`/espacos/${workspace.id}/lancamentos`}>Lançamentos</TextLink>.
          </p>
        ) : (
          <>
            <Section
              titleId={MONTHLY_TITLE_ID}
              title="Todo mês"
              empty="Nenhuma recorrência ativa."
              summary={monthlyTotal(recurrences.data.filter((item) => item.endPeriod === null))}
              active={recurrences.data
                .filter((item) => item.endPeriod === null)
                .map(recurrenceItem)}
              pastTitle="Encerradas"
              past={recurrences.data.filter((item) => item.endPeriod !== null).map(recurrenceItem)}
            />
            <Section
              titleId={PLANS_TITLE_ID}
              title="Parcelamentos"
              empty="Nenhum parcelamento em andamento."
              active={plans.data.filter((plan) => !planIsOver(plan)).map(planItem)}
              pastTitle="Encerrados e quitados"
              past={plans.data.filter(planIsOver).map(planItem)}
            />
          </>
        ))}
    </>
  );
}
