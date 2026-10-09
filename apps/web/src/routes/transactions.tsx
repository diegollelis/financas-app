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
import { CreditCard, Ellipsis, Plus, Repeat, Users } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
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
import { useEndInstallmentPlan } from '@/features/installments/use-installments';
import { useEndRecurrence } from '@/features/recurrences/use-recurrences';
import { usePeople } from '@/features/people/use-people';
import { SettleWithAmount } from '@/features/transactions/settle-with-amount';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import { TransactionDialog } from '@/features/transactions/transaction-dialog';
import {
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
  shares,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  transaction: Transaction;
  /** The shares split from this debit, in this competência: offered to go with it. */
  shares: { names: string[]; count: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row's actions button: opened from a menu item, the dialog has no trigger of its own. */
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const remove = useDeleteTransaction(workspaceId);
  // mutateAsync, not mutate's callbacks: those are skipped when the component unmounts, and
  // this row leaves the list exactly when the delete succeeds.
  const confirmDelete = (withShares: boolean) =>
    remove.mutateAsync({ id: transaction.id, withShares }).then(() => {
      toast.success(withShares ? 'Lançamento e partes excluídos' : 'Lançamento excluído');
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
            {transaction.recurrenceId &&
              ' A recorrência continua nos outros meses, e este mês não volta a ser gerado.'}
            {transaction.installment && ' As outras parcelas continuam.'}
            {shares.count > 0 &&
              ` Ele foi dividido com ${shares.names.join(', ')}: as partes a receber podem sair junto ou ficar.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {shares.count > 0 ? (
            <>
              <AlertDialogAction variant="outline" onClick={() => void confirmDelete(false)}>
                Excluir só o gasto
              </AlertDialogAction>
              <AlertDialogAction variant="destructive" onClick={() => void confirmDelete(true)}>
                Excluir com as partes
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete(false)}>
              Excluir
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Asks before ending the recurrence that generated this transaction (ADR 0038): its pending
 * transactions from this month on go, the earlier and settled ones stay.
 */
function EndSeriesDialog({
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
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const endRecurrence = useEndRecurrence(workspaceId);
  const endPlan = useEndInstallmentPlan(workspaceId);
  const plan = transaction.installment;
  const text = plan
    ? {
        title: `Encerrar o parcelamento ${transaction.description}?`,
        description:
          'As parcelas pendentes deste mês em diante saem; as já pagas e as anteriores ficam. Use para uma quitação antecipada.',
        action: 'Encerrar parcelamento',
        done: 'Parcelamento encerrado',
      }
    : {
        title: `Encerrar a recorrência ${transaction.description}?`,
        description:
          'Deixa de repetir. Os lançamentos pendentes deste mês em diante saem; os anteriores e os já efetivados ficam.',
        action: 'Encerrar recorrência',
        done: 'Recorrência encerrada',
      };
  // mutateAsync: this row may leave the list when its series ends.
  const confirmEnd = () =>
    (plan
      ? endPlan.mutateAsync(plan.planId)
      : endRecurrence.mutateAsync(transaction.recurrenceId ?? '')
    ).then(() => {
      toast.success(text.done);
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
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void confirmEnd()}>
            {text.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A badge that carries people's names, which have any length: it breaks into lines instead of
 * widening the row past a 360px screen.
 */
const WRAPPING_BADGE = 'h-auto max-w-full justify-start rounded-md text-left whitespace-normal';

/**
 * One transaction: what it is, how much, its status and, for EDITORs, one inline action
 * (settle) plus the rest in a menu (ADR 0036).
 */
function TransactionItem({
  workspaceId,
  transaction,
  category,
  personName,
  sharedWith,
  canEdit,
  today,
  onEdit,
}: {
  workspaceId: string;
  transaction: Transaction;
  category: Category | undefined;
  /** The person it is linked to (ADR 0042), when any. */
  personName: string | null;
  /** The people its shares are owed by, when it is a split debit. */
  sharedWith: string[];
  canEdit: boolean;
  today: string;
  onEdit: (transaction: Transaction, returnFocusTo: HTMLElement | null) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [askingAmount, setAskingAmount] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const settleRef = useRef<HTMLButtonElement>(null);
  const update = useUpdateTransaction(workspaceId);
  const { description } = transaction;
  // Still an estimate of a variable bill (ADR 0038): settling asks for the bill's amount.
  const estimated = transaction.amountEstimated && !transaction.settledAt;
  // Part of a recurrence or of an installment plan, which can be ended from here (ADR 0038).
  const inSeries = Boolean(transaction.recurrenceId ?? transaction.installment);
  const settle = (settledAt: string | null, message: string) =>
    update.mutate(
      { id: transaction.id, settledAt },
      { onSuccess: () => toast.success(message), onError: showError },
    );
  const settleWithAmount = (amountCents: number) =>
    update.mutate(
      { id: transaction.id, amountCents, settledAt: today },
      {
        onSuccess: () => {
          setAskingAmount(false);
          toast.success('Lançamento efetivado');
        },
      },
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
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge transaction={transaction} today={today} />
          {transaction.recurrenceId && (
            <Badge variant="secondary">
              <Repeat aria-hidden />
              Todo mês
            </Badge>
          )}
          {transaction.installment && (
            <Badge variant="secondary">
              <CreditCard aria-hidden />
              Parcela {transaction.installment.number}/{transaction.installment.count}
            </Badge>
          )}
          {personName && (
            <Badge variant="secondary" className={WRAPPING_BADGE}>
              {transaction.type === 'CREDIT' ? 'A receber de' : 'A pagar para'} {personName}
            </Badge>
          )}
          {sharedWith.length > 0 && (
            <Badge variant="secondary" className={WRAPPING_BADGE}>
              <Users aria-hidden />
              Dividido com {sharedWith.join(', ')}
            </Badge>
          )}
        </span>
      </div>
      <div className="grid shrink-0 justify-items-end gap-2">
        <span className="grid justify-items-end">
          <span className="text-base font-semibold tabular-nums">
            {formatCents(transaction.amountCents)}
          </span>
          {/* In words, in text colors: an estimate is not a status of its own (ADR 0038). */}
          {estimated && <span className="text-muted-foreground text-xs">Estimado</span>}
        </span>
        {canEdit && (
          <div className="flex items-center gap-2 md:gap-1">
            {!transaction.settledAt && (
              // One tap: settled today; an estimate first asks for the bill's amount. The date
              // can be fixed later by editing.
              <Button
                ref={settleRef}
                variant="secondary"
                size="sm"
                aria-label={`Efetivar ${description}`}
                disabled={update.isPending}
                onClick={() =>
                  estimated ? setAskingAmount(true) : settle(today, 'Lançamento efetivado')
                }
              >
                Efetivar
              </Button>
            )}
            {estimated && (
              <SettleWithAmount
                transaction={transaction}
                open={askingAmount}
                onOpenChange={setAskingAmount}
                returnFocusTo={settleRef}
                pending={update.isPending}
                error={update.error}
                onSettle={settleWithAmount}
              />
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
                {inSeries && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingEnd(true)}>
                    {transaction.installment ? 'Encerrar parcelamento' : 'Encerrar recorrência'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  {transaction.installment
                    ? 'Excluir só esta parcela'
                    : transaction.recurrenceId
                      ? 'Excluir só este mês'
                      : 'Excluir'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DeleteDialog
              workspaceId={workspaceId}
              transaction={transaction}
              shares={{ names: sharedWith, count: sharedWith.length }}
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              returnFocusTo={actionsRef}
            />
            {inSeries && (
              <EndSeriesDialog
                workspaceId={workspaceId}
                transaction={transaction}
                open={confirmingEnd}
                onOpenChange={setConfirmingEnd}
                returnFocusTo={actionsRef}
              />
            )}
          </div>
        )}
      </div>
    </li>
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
  const people = usePeople(workspaceId);
  const ready = categories.isSuccess && transactions.isSuccess && people.isSuccess;
  const personName = (personId: string | null) =>
    (personId && people.data?.find((item) => item.id === personId)?.name) || null;
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
      <QueryState queries={[categories, transactions, people]} />
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
                        personName={personName(transaction.personId)}
                        // The shares of a split debit are credits of the same competência.
                        sharedWith={transactions.data
                          .filter((item) => item.splitOfId === transaction.id)
                          .map((item) => personName(item.personId) ?? 'alguém')}
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
            people={people.data}
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
