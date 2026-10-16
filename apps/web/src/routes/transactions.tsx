import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  hasRole,
  OVERDUE_LABEL,
  paymentMethodLabels,
  PENDING_LABEL,
  settleActionLabels,
  settledLabels,
  todayIso,
  transactionTypeLabels,
  transactionStatus,
  type Category,
  type Transaction,
  type TransactionType,
} from '@financas/shared';
import { Circle, CreditCard, Ellipsis, Plus, Repeat, Users } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { SegmentedControl } from '@/components/segmented-control';
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
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCategories, useCategoryHints } from '@/features/categories/use-categories';
import { useEndInstallmentPlan } from '@/features/installments/use-installments';
import { useEndRecurrence } from '@/features/recurrences/use-recurrences';
import { useMerchants } from '@/features/merchants/use-merchants';
import { RepeatDialog } from '@/features/recurrences/repeat-dialog';
import { usePeople } from '@/features/people/use-people';
import {
  matchesSearch,
  matchesStatus,
  statusFilterOptions,
  useStatusFilter,
} from '@/features/transactions/filters';
import { SettleWithAmount } from '@/features/transactions/settle-with-amount';
import { PeriodNav } from '@/features/periods/period-nav';
import { usePeriod } from '@/features/periods/use-period';
import { TransactionDialog } from '@/features/transactions/transaction-dialog';
import {
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from '@/features/transactions/use-transactions';
import { sortRows, useSort, type SortValue } from '@/features/view-mode/sort';
import { SortableHead } from '@/features/view-mode/sortable-head';
import { useShowsTable } from '@/features/view-mode/view-mode';
import { ViewModeToggle } from '@/features/view-mode/view-mode-toggle';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const sections = (['CREDIT', 'DEBIT'] as const).map((type) => ({
  type,
  title: transactionTypeLabels[type].plural,
  singular: transactionTypeLabels[type].lower,
}));

const sectionTitleId = (type: TransactionType) => `transactions-${type}`;

const showError = (error: unknown) => toast.error(apiErrorMessage(error));

/** Colors as in the spreadsheet: red while pending past the due date, green once settled. */
/**
 * "+ R$ 45,00" for money in, "− R$ 69,90" (a real minus sign) for money out: the sign always,
 * the color only on top of it (ADR 0036 note).
 */
function signedCents(type: Transaction['type'], cents: number) {
  return `${type === 'CREDIT' ? '+' : '−'} ${formatCents(cents)}`;
}

/**
 * Settled and overdue always show; pending only to whoever cannot act on it, since the
 * "○ Pagar / Receber" button already says it to an EDITOR (ADR 0036 note).
 */
function StatusBadge({
  transaction,
  today,
  canEdit,
}: {
  transaction: Transaction;
  today: string;
  canEdit: boolean;
}) {
  const status = transactionStatus(transaction, today);
  if (status === 'SETTLED') {
    // What happened, in its own word; the year only when it is not the competência's.
    const date = formatIsoDate(transaction.settledAt ?? '');
    const sameYear = transaction.settledAt?.slice(0, 4) === transaction.period.slice(0, 4);
    return (
      <Badge variant="success">
        {settledLabels[transaction.type]} em {sameYear ? date.slice(0, 5) : date}
      </Badge>
    );
  }
  if (status === 'OVERDUE') return <Badge variant="destructive">{OVERDUE_LABEL}</Badge>;
  return canEdit ? null : <Badge variant="outline">{PENDING_LABEL}</Badge>;
}

/**
 * What the month adds up to, whatever the search or the filter: what comes in, what goes out
 * and how it ends if everything is paid and received, the Painel's "Saldo previsto" (ADR 0036
 * note).
 */
function MonthTotals({ transactions }: { transactions: Transaction[] }) {
  const sum = (type: Transaction['type']) =>
    transactions
      .filter((transaction) => transaction.type === type)
      .reduce((total, transaction) => total + transaction.amountCents, 0);
  const credits = sum('CREDIT');
  const debits = sum('DEBIT');
  const balance = credits - debits;
  const items = [
    { label: 'Entradas', value: signedCents('CREDIT', credits), tone: 'text-credit-foreground' },
    { label: 'Saídas', value: signedCents('DEBIT', debits), tone: '' },
    {
      label: 'Saldo previsto',
      value: formatCents(balance),
      tone: balance < 0 ? 'text-destructive' : '',
    },
  ];
  return (
    // On the phone one line each, the label beside the amount, so a large amount never wraps;
    // three columns from sm.
    <dl
      aria-label="Resumo do mês"
      className="bg-card grid gap-1.5 rounded-xl border p-3 sm:grid-cols-3 sm:gap-3"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-baseline justify-between gap-3 sm:grid sm:justify-start sm:gap-0.5"
        >
          <dt className="text-muted-foreground text-sm">{item.label}</dt>
          <dd className={`font-semibold whitespace-nowrap tabular-nums ${item.tone}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
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
            O lançamento de {formatCents(transaction.amountCents)} sai deste mês. Não é possível
            desfazer.
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
                Excluir só este lançamento
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
          // From here the page does not know whether any installment is paid (ADR 0038 note).
          'As parcelas pendentes deste mês em diante saem; as já pagas e as anteriores ficam. Use para uma quitação antecipada. Se nenhuma parcela foi paga, o parcelamento sai com todas elas.',
        action: 'Encerrar parcelamento',
        done: 'Parcelamento encerrado',
      }
    : {
        title: `Encerrar a recorrência ${transaction.description}?`,
        description:
          'Deixa de repetir. Os lançamentos pendentes deste mês em diante saem; os anteriores e os já pagos ou recebidos ficam.',
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

/** What a transaction is part of and who it involves: the same badges in the list and the table. */
function LinkBadges({
  transaction,
  personName,
  sharedWith,
}: {
  transaction: Transaction;
  personName: string | null;
  sharedWith: string[];
}) {
  return (
    <>
      {transaction.recurrenceId && (
        <Badge variant="secondary">
          <Repeat aria-hidden />
          {transaction.recurrenceIntervalMonths === 12 ? 'Todo ano' : 'Todo mês'}
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
    </>
  );
}

type RowProps = {
  workspaceId: string;
  transaction: Transaction;
  category: Category | undefined;
  /** Where it was bought or who paid it (ADR 0053), when given. */
  merchantName: string | null;
  /** The person it is linked to (ADR 0042), when any. */
  personName: string | null;
  /** The people its shares are owed by, when it is a split debit. */
  sharedWith: string[];
  canEdit: boolean;
  today: string;
  onEdit: (transaction: Transaction, returnFocusTo: HTMLElement | null) => void;
};

/**
 * What an EDITOR can do with a transaction, for a row of the list or of the table: one inline
 * action (settle) and the rest in a menu, with the dialogs they open (ADR 0036).
 */
function useRowActions({
  workspaceId,
  transaction,
  sharedWith,
  today,
  onEdit,
}: Pick<RowProps, 'workspaceId' | 'transaction' | 'sharedWith' | 'today' | 'onEdit'>) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [askingAmount, setAskingAmount] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const settleRef = useRef<HTMLButtonElement>(null);
  const update = useUpdateTransaction(workspaceId);
  const { description } = transaction;
  // Still an estimate of a variable bill (ADR 0038): settling asks for the bill's amount.
  const estimated = transaction.amountEstimated && !transaction.settledAt;
  // Part of a recurrence or of an installment plan, which can be ended from here (ADR 0038).
  const inSeries = Boolean(transaction.recurrenceId ?? transaction.installment);
  // Launched once, not a split nor a share: it can become a recurrence ("Tornar recorrente").
  const repeatable = !inSeries && !transaction.splitOfId && sharedWith.length === 0;
  const labels = settleActionLabels[transaction.type];
  const settledToast =
    transaction.type === 'CREDIT' ? 'Marcado como recebido' : 'Marcado como pago';
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
          toast.success(settledToast);
        },
      },
    );

  // Settles today in one tap; an estimate first asks for the bill's amount.
  const settleNow = () => (estimated ? setAskingAmount(true) : settle(today, settledToast));

  return {
    estimated,
    settleRef,
    settleButton: {
      short: labels.short,
      // Starts with the visible text, so a voice command finds it (WCAG 2.5.3).
      ariaLabel: `${labels.short}: ${description}`,
      disabled: update.isPending,
      onClick: settleNow,
    },
    menu: (
      <>
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
          <DropdownMenuContent align="end" className="w-max">
            <DropdownMenuItem onSelect={() => onEdit(transaction, actionsRef.current)}>
              Editar
            </DropdownMenuItem>
            {!transaction.settledAt && (
              // Also in words here: the row's button is the short "Pagar" / "Receber".
              <DropdownMenuItem disabled={update.isPending} onSelect={settleNow}>
                {labels.settle}
              </DropdownMenuItem>
            )}
            {transaction.settledAt && (
              <DropdownMenuItem
                disabled={update.isPending}
                onSelect={() =>
                  settle(
                    null,
                    transaction.type === 'CREDIT'
                      ? 'Recebimento desmarcado'
                      : 'Pagamento desmarcado',
                  )
                }
              >
                {labels.unsettle}
              </DropdownMenuItem>
            )}
            {repeatable && (
              <DropdownMenuItem onSelect={() => setRepeating(true)}>
                Tornar recorrente
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
        {repeatable && (
          <RepeatDialog
            workspaceId={workspaceId}
            transaction={transaction}
            open={repeating}
            onOpenChange={setRepeating}
            returnFocusTo={actionsRef}
          />
        )}
        {inSeries && (
          <EndSeriesDialog
            workspaceId={workspaceId}
            transaction={transaction}
            open={confirmingEnd}
            onOpenChange={setConfirmingEnd}
            returnFocusTo={actionsRef}
          />
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
      </>
    ),
  };
}

/**
 * "Pagar" / "Receber" on the row, beside the menu (ADR 0036 note): an empty circle, as a to-do
 * not yet ticked; one tap, the same in the list and the table; named with the transaction for screen readers.
 */
function SettleButton({
  settleRef,
  short,
  ariaLabel,
  disabled,
  onClick,
}: {
  settleRef: RefObject<HTMLButtonElement | null>;
  short: string;
  ariaLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      ref={settleRef}
      // Outlined: plainly a button beside the status badges, without the brand color of the
      // page's main action.
      variant="outline"
      size="sm"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      <Circle aria-hidden />
      {short}
    </Button>
  );
}

/**
 * The amount with its sign, money in in green (ADR 0036 note), and "Estimado" under it while a
 * variable bill's month is an estimate.
 */
function Amount({ transaction, estimated }: { transaction: Transaction; estimated: boolean }) {
  return (
    <span className="grid justify-items-end">
      <span
        className={
          transaction.type === 'CREDIT'
            ? 'text-credit-foreground text-base font-semibold whitespace-nowrap tabular-nums'
            : 'text-base font-semibold whitespace-nowrap tabular-nums'
        }
      >
        {signedCents(transaction.type, transaction.amountCents)}
      </span>
      {/* In words, in text colors: an estimate is not a status of its own (ADR 0038). */}
      {estimated && <span className="text-muted-foreground text-xs">Estimado</span>}
    </span>
  );
}

/**
 * One transaction in the list: what it is, how much, its status and, for EDITORs, one inline
 * action ("Pagar" / "Receber") plus the rest in a menu (ADR 0036).
 */
function TransactionItem(props: RowProps) {
  const { transaction, category, merchantName, personName, sharedWith, canEdit, today } = props;
  const { estimated, settleRef, settleButton, menu } = useRowActions(props);

  return (
    <li className="flex items-start gap-3 py-3">
      <div className="grid min-w-0 flex-1 justify-items-start gap-1">
        <p className="font-medium break-words">{transaction.description}</p>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
          <span>{category?.name ?? 'Categoria'}</span>
          {merchantName && <span>{merchantName}</span>}
          {transaction.paymentMethod && (
            <span>{paymentMethodLabels[transaction.paymentMethod]}</span>
          )}
          {transaction.dueDate && <span>Vence em {formatIsoDate(transaction.dueDate)}</span>}
        </p>
        {transaction.notes && (
          <p className="text-muted-foreground text-sm break-words">{transaction.notes}</p>
        )}
        <span className="flex flex-wrap gap-1.5">
          <StatusBadge transaction={transaction} today={today} canEdit={canEdit} />
          <LinkBadges transaction={transaction} personName={personName} sharedWith={sharedWith} />
        </span>
      </div>
      <div className="grid shrink-0 justify-items-end gap-2">
        <Amount transaction={transaction} estimated={estimated} />
        {canEdit && (
          // The date can be fixed later by editing.
          // Stacked on the phone, so the description keeps its width; side by side from md.
          <div className="flex flex-col items-end gap-2 md:flex-row md:items-center md:gap-1">
            {!transaction.settledAt && <SettleButton settleRef={settleRef} {...settleButton} />}
            {menu}
          </div>
        )}
      </div>
    </li>
  );
}

/** One transaction as a table row, from xl ("Ver como: Tabela"): the same data and actions. */
function TransactionRow(props: RowProps) {
  const { transaction, category, merchantName, personName, sharedWith, canEdit, today } = props;
  const { estimated, settleRef, settleButton, menu } = useRowActions(props);

  return (
    <TableRow>
      <TableCell className="tabular-nums">
        {transaction.dueDate ? formatIsoDate(transaction.dueDate) : '—'}
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="grid justify-items-start gap-1">
          <span className="font-medium break-words">{transaction.description}</span>
          {transaction.notes && (
            <span className="text-muted-foreground break-words">{transaction.notes}</span>
          )}
          <span className="flex flex-wrap gap-1.5 empty:hidden">
            <LinkBadges transaction={transaction} personName={personName} sharedWith={sharedWith} />
          </span>
        </div>
      </TableCell>
      <TableCell className="whitespace-normal">{category?.name ?? 'Categoria'}</TableCell>
      <TableCell className="whitespace-normal">
        {/* Where and how (ADR 0054): the method under the merchant, in the same column. */}
        <span className="grid">
          {/* Always the merchant first, a dash without one, so the method is never read as one. */}
          <span>{merchantName ?? '—'}</span>
          {transaction.paymentMethod && (
            <span className="text-muted-foreground">
              {paymentMethodLabels[transaction.paymentMethod]}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        <StatusBadge transaction={transaction} today={today} canEdit={canEdit} />
      </TableCell>
      <TableCell className="text-right">
        <Amount transaction={transaction} estimated={estimated} />
      </TableCell>
      {canEdit && (
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            {!transaction.settledAt && <SettleButton settleRef={settleRef} {...settleButton} />}
            {menu}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

type SortKey = 'dueDate' | 'description' | 'category' | 'merchant' | 'amount';

/** A section's transactions as a table, sorted by the column clicked (by due date at first). */
function TransactionTable({
  rows,
  canEdit,
  categoryName,
  merchantName,
  renderRow,
}: {
  rows: Transaction[];
  canEdit: boolean;
  categoryName: (transaction: Transaction) => string | null;
  merchantName: (transaction: Transaction) => string | null;
  renderRow: (transaction: Transaction) => ReactNode;
}) {
  const sort = useSort<SortKey>('dueDate');
  const values: Record<SortKey, (transaction: Transaction) => SortValue> = {
    dueDate: (transaction) => transaction.dueDate,
    description: (transaction) => transaction.description,
    category: categoryName,
    merchant: merchantName,
    amount: (transaction) => transaction.amountCents,
  };
  const head = (key: SortKey, label: string, align?: 'right') => (
    <SortableHead
      label={label}
      active={sort.key === key}
      direction={sort.direction}
      onSort={() => sort.toggle(key)}
      align={align}
    />
  );
  return (
    <div className="rounded-xl border px-2">
      {/* Fixed widths: the tables of both sections line up, and the description takes the rest. */}
      <Table className="table-fixed">
        <colgroup>
          <col className="w-28" />
          <col />
          <col className="w-32" />
          <col className="w-36" />
          <col className="w-36" />
          {/* Room for the sign: "+ R$ 5.200,00" (ADR 0036 note). */}
          <col className="w-36" />
          {canEdit && <col className="w-32" />}
        </colgroup>
        <TableHeader>
          <TableRow>
            {head('dueDate', 'Vencimento')}
            {head('description', 'Descrição')}
            {head('category', 'Categoria')}
            {head('merchant', 'Estabelecimento / Meio')}
            <TableHead>Situação</TableHead>
            {head('amount', 'Valor', 'right')}
            {canEdit && (
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>{sortRows(rows, values[sort.key], sort.direction).map(renderRow)}</TableBody>
      </Table>
    </div>
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
  const merchants = useMerchants(workspaceId);
  // Only to fill a new transaction's category: the page does not wait for it (ADR 0053).
  const hints = useCategoryHints(workspaceId);
  const ready =
    categories.isSuccess && transactions.isSuccess && people.isSuccess && merchants.isSuccess;
  const merchantName = (merchantId: string | null) =>
    (merchantId && merchants.data?.find((item) => item.id === merchantId)?.name) || null;
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
  // Finding one in a long month: by status (in the address) and by what was typed.
  const [statusFilter, setStatusFilter] = useStatusFilter();
  const [search, setSearch] = useState('');
  // "Ver como: Tabela", from xl (ADR 0045 note); the list everywhere else.
  const asTable = useShowsTable('lancamentos');
  const categoryName = (transaction: Transaction) =>
    categories.data?.find((item) => item.id === transaction.categoryId)?.name ?? null;
  // One transaction, as a list item or a table row: the same data either way.
  const row = (transaction: Transaction, Row: typeof TransactionItem) => (
    <Row
      key={transaction.id}
      workspaceId={workspaceId}
      transaction={transaction}
      category={categories.data?.find((item) => item.id === transaction.categoryId)}
      merchantName={merchantName(transaction.merchantId)}
      personName={personName(transaction.personId)}
      // The shares of a split debit are credits of the same competência.
      sharedWith={(transactions.data ?? [])
        .filter((item) => item.splitOfId === transaction.id)
        .map((item) => personName(item.personId) ?? 'alguém')}
      canEdit={canEdit}
      today={today}
      onEdit={openForm}
    />
  );
  const filtering = statusFilter !== 'todos' || search.trim() !== '';
  const shown = (transaction: Transaction) =>
    matchesStatus(transaction, statusFilter, today) &&
    matchesSearch(
      search,
      transaction.description,
      categories.data?.find((item) => item.id === transaction.categoryId)?.name,
      personName(transaction.personId),
      merchantName(transaction.merchantId),
      transaction.paymentMethod && paymentMethodLabels[transaction.paymentMethod],
    );

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
              // The layout keeps room for it below the footer (data-fab).
              data-fab
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
        <ViewModeToggle page="lancamentos" />
        {ready && transactions.data.length > 0 && <MonthTotals transactions={transactions.data} />}
        {ready && transactions.data.length > 0 && (
          // The search on a row of its own at every width: beside the filter it was squeezed to a
          // sliver once the filter read "Pagos e recebidos" (ADR 0051).
          <div className="grid gap-3">
            <FormField id="transactions-search" label="Buscar lançamento">
              <Input
                type="search"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </FormField>
            <SegmentedControl
              label="Situação"
              options={statusFilterOptions}
              value={statusFilter}
              onChange={setStatusFilter}
              // Two rows of two up to lg: beside the sidebar of a tablet, "Pagos e recebidos" broke
              // into two lines in a row of four.
              className="grid-flow-row grid-cols-2 lg:grid-flow-col lg:grid-cols-none"
            />
          </div>
        )}
      </PageHeader>
      <QueryState queries={[categories, transactions, people, merchants]} />
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
            const all = transactions.data.filter((item) => item.type === type);
            const items = all.filter(shown);
            const total = items.reduce((sum, item) => sum + item.amountCents, 0);
            const titleId = sectionTitleId(type);
            return (
              <section key={type} aria-labelledby={titleId} className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  {/* Focusable from script: where focus goes after a delete. */}
                  <h2 id={titleId} tabIndex={-1} className="font-medium outline-none">
                    {title}
                  </h2>
                  <span className="text-muted-foreground flex flex-wrap justify-end gap-x-3 tabular-nums">
                    {filtering && (
                      <span>
                        {items.length} de {all.length}
                      </span>
                    )}
                    <span>Total: {signedCents(type, total)}</span>
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-muted-foreground">
                    {filtering
                      ? `Nenhuma ${singular} com esse filtro.`
                      : `Nenhuma ${singular} em ${formatPeriod(period)}.`}
                  </p>
                ) : asTable ? (
                  <TransactionTable
                    rows={items}
                    canEdit={canEdit}
                    categoryName={categoryName}
                    merchantName={(transaction) => merchantName(transaction.merchantId)}
                    renderRow={(transaction) => row(transaction, TransactionRow)}
                  />
                ) : (
                  <ul className="divide-y rounded-xl border px-4">
                    {items.map((transaction) => row(transaction, TransactionItem))}
                  </ul>
                )}
              </section>
            );
          })
        ))}
      {canEdit && ready && (
        <>
          <TransactionDialog
            key={form.openings}
            workspaceId={workspaceId}
            period={period}
            categories={categories.data}
            people={people.data}
            merchants={merchants.data}
            hints={hints.data}
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
