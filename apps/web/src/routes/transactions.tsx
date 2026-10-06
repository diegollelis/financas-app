import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  hasRole,
  todayIso,
  transactionStatus,
  type Category,
  type Transaction,
  type TransactionType,
} from '@financas/shared';
import { Ellipsis, Plus } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCategories } from '@/features/categories/use-categories';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import {
  TransactionForm,
  type TransactionFormValues,
} from '@/features/transactions/transaction-form';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from '@/features/transactions/use-transactions';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const sections: { type: TransactionType; title: string; singular: string }[] = [
  { type: 'CREDIT', title: 'Créditos', singular: 'crédito' },
  { type: 'DEBIT', title: 'Débitos', singular: 'débito' },
];

const sectionTitleId = (type: TransactionType) => `transactions-${type}`;

const showError = (error: unknown) => toast.error(apiErrorMessage(error));

/** Colors as in the spreadsheet: red while pending past the due date, green once settled. */
function StatusBadge({ transaction, today }: { transaction: Transaction; today: string }) {
  const status = transactionStatus(transaction, today);
  if (status === 'SETTLED') {
    return (
      <Badge variant="success">Efetivado em {formatIsoDate(transaction.settledAt ?? '')}</Badge>
    );
  }
  if (status === 'OVERDUE') return <Badge variant="destructive">Vencido</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

/** Asks before deleting, naming the transaction (ADR 0036). */
function DeleteDialog({
  workspaceId,
  transaction,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row's actions button: opened from a menu item, the dialog has no trigger of its own. */
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const remove = useDeleteTransaction(workspaceId);
  // mutateAsync, not mutate's callbacks: those are skipped when the component unmounts, and
  // this row leaves the list exactly when the delete succeeds.
  const confirmDelete = () =>
    remove.mutateAsync(transaction.id).then(() => {
      toast.success('Lançamento excluído');
      // The row is gone, and with it the button that had the focus: go to its section.
      document.getElementById(sectionTitleId(transaction.type))?.focus();
    }, showError);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {transaction.description}?</AlertDialogTitle>
          <AlertDialogDescription>
            O lançamento de {formatCents(transaction.amountCents)} sai desta competência. Não é
            possível desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One transaction: what it is, how much, its status and, for EDITORs, one inline action
 * (settle) plus the rest in a menu (ADR 0036).
 */
function TransactionItem({
  workspaceId,
  transaction,
  category,
  canEdit,
  today,
  onEdit,
}: {
  workspaceId: string;
  transaction: Transaction;
  category: Category | undefined;
  canEdit: boolean;
  today: string;
  onEdit: (transaction: Transaction, returnFocusTo: HTMLElement | null) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const update = useUpdateTransaction(workspaceId);
  const { description } = transaction;
  const settle = (settledAt: string | null, message: string) =>
    update.mutate(
      { id: transaction.id, settledAt },
      { onSuccess: () => toast.success(message), onError: showError },
    );

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="grid min-w-0 flex-1 justify-items-start gap-1">
        <p className="font-medium break-words">{description}</p>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
          <span>{category?.name ?? 'Categoria'}</span>
          {transaction.dueDate && <span>Vence em {formatIsoDate(transaction.dueDate)}</span>}
        </p>
        {transaction.notes && (
          <p className="text-muted-foreground text-sm break-words">{transaction.notes}</p>
        )}
        <StatusBadge transaction={transaction} today={today} />
      </div>
      <div className="grid shrink-0 justify-items-end gap-2">
        <span className="text-base font-semibold tabular-nums">
          {formatCents(transaction.amountCents)}
        </span>
        {canEdit && (
          <div className="flex items-center gap-2 md:gap-1">
            {!transaction.settledAt && (
              // One tap: settled today. The date can be fixed later by editing.
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Efetivar ${description}`}
                disabled={update.isPending}
                onClick={() => settle(today, 'Lançamento efetivado')}
              >
                Efetivar
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={actionsRef}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ações de ${description}`}
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(transaction, actionsRef.current)}>
                  Editar
                </DropdownMenuItem>
                {transaction.settledAt && (
                  <DropdownMenuItem
                    disabled={update.isPending}
                    onSelect={() => settle(null, 'Efetivação desfeita')}
                  >
                    Desfazer efetivação
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteDialog
              workspaceId={workspaceId}
              transaction={transaction}
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              returnFocusTo={actionsRef}
            />
          </div>
        )}
      </div>
    </li>
  );
}

/** Create or edit, in a sheet on the phone and a dialog from md. */
function TransactionDialog({
  workspaceId,
  period,
  categories,
  editing,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  period: string;
  categories: Category[];
  /** The transaction being edited; null to create one. */
  editing: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opened the form, to get the focus back on close. */
  returnFocusTo: HTMLElement | null;
}) {
  const create = useCreateTransaction(workspaceId);
  const update = useUpdateTransaction(workspaceId);
  const mutation = editing ? update : create;
  const done = (message: string) => () => {
    toast.success(message);
    onOpenChange(false);
  };
  const submit = (values: TransactionFormValues) => {
    const fields = {
      type: values.type,
      description: values.description,
      notes: values.notes ?? null,
      categoryId: values.categoryId,
      amountCents: values.amount,
      dueDate: values.dueDate,
    };
    if (editing) {
      update.mutate({ id: editing.id, ...fields }, { onSuccess: done('Lançamento salvo') });
    } else {
      create.mutate({ ...fields, period }, { onSuccess: done('Lançamento adicionado') });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={editing ? 'Editar lançamento' : 'Novo lançamento'}
      description={`Competência de ${formatPeriod(editing?.period ?? period)}.`}
    >
      <TransactionForm
        // A new form each time: empty for a new one, the values of the one being edited.
        key={editing?.id ?? 'new'}
        idPrefix={editing?.id ?? 'new'}
        categories={categories}
        initial={editing ?? undefined}
        submitLabel={
          editing
            ? update.isPending
              ? 'Salvando…'
              : 'Salvar'
            : create.isPending
              ? 'Adicionando…'
              : 'Adicionar'
        }
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={submit}
        onCancel={() => onOpenChange(false)}
      />
    </ResponsiveDialog>
  );
}

export function TransactionsPage() {
  const workspace = useCurrentWorkspace();
  const workspaceId = workspace.id;
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const period = usePeriod();
  const today = todayIso();
  const categories = useCategories(workspaceId);
  const transactions = useTransactions(workspaceId, period);
  const ready = categories.isSuccess && transactions.isSuccess;
  const [form, setForm] = useState({
    open: false,
    editing: null as Transaction | null,
    returnFocusTo: null as HTMLElement | null,
    // A new key per opening remounts the dialog: no error or pending state left over.
    openings: 0,
  });
  const openForm = (editing: Transaction | null, returnFocusTo: HTMLElement | null) =>
    setForm((current) => ({ open: true, editing, returnFocusTo, openings: current.openings + 1 }));

  return (
    <>
      <PageHeader
        title="Lançamentos"
        action={
          canEdit &&
          ready && (
            // Fixed above the tab bar on the phone, within reach of the thumb; in the header
            // from md (ADR 0036).
            <Button
              onClick={(event) => openForm(null, event.currentTarget)}
              className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 shadow-lg md:static md:shadow-none"
            >
              <Plus aria-hidden />
              Novo lançamento
            </Button>
          )
        }
      >
        <PeriodNav period={period} />
      </PageHeader>
      <QueryState queries={[categories, transactions]} />
      {ready &&
        (transactions.data.length === 0 ? (
          // Says what is missing and points to the page's main action, already on screen; it
          // does not repeat the button (ADR 0036).
          <div className="grid gap-1 rounded-xl border border-dashed p-5">
            <p>Nenhum lançamento em {formatPeriod(period)}.</p>
            {canEdit && (
              <p className="text-muted-foreground">
                Use Novo lançamento para adicionar o primeiro.
              </p>
            )}
          </div>
        ) : (
          sections.map(({ type, title, singular }) => {
            const items = transactions.data.filter((item) => item.type === type);
            const total = items.reduce((sum, item) => sum + item.amountCents, 0);
            const titleId = sectionTitleId(type);
            return (
              <section key={type} aria-labelledby={titleId} className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  {/* Focusable from script: where focus goes after a delete. */}
                  <h2 id={titleId} tabIndex={-1} className="font-medium outline-none">
                    {title}
                  </h2>
                  <span className="text-muted-foreground tabular-nums">
                    Total: {formatCents(total)}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-muted-foreground">
                    Nenhum {singular} em {formatPeriod(period)}.
                  </p>
                ) : (
                  <ul className="divide-y rounded-xl border px-4">
                    {items.map((transaction) => (
                      <TransactionItem
                        key={transaction.id}
                        workspaceId={workspaceId}
                        transaction={transaction}
                        category={categories.data.find(
                          (item) => item.id === transaction.categoryId,
                        )}
                        canEdit={canEdit}
                        today={today}
                        onEdit={openForm}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        ))}
      {canEdit && ready && (
        <>
          {/* Room at the end, so the fixed button never covers the last row on the phone. */}
          <div aria-hidden className="h-12 md:hidden" />
          <TransactionDialog
            key={form.openings}
            workspaceId={workspaceId}
            period={period}
            categories={categories.data}
            editing={form.editing}
            open={form.open}
            onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
            returnFocusTo={form.returnFocusTo}
          />
        </>
      )}
    </>
  );
}
