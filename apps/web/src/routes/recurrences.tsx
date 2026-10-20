import {
  currentPeriod,
  formatBasisPoints,
  formatCents,
  formatPeriod,
  hasRole,
  nextRecurrencePeriod,
  paymentMethodLabels,
  settledLabels,
  installmentsCreated,
  shiftPeriod,
  splitInstallments,
  transactionTypeLabels,
  type Category,
  type InstallmentPlan,
  type UpdateInstallmentPlanInput,
  type PaymentMethod,
  type Merchant,
  type Person,
  type Recurrence,
  type TransactionType,
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
import { useCurrentUser } from '@/features/auth/use-me';
import { useResolveCategory } from '@/features/categories/new-category';
import { useCategories } from '@/features/categories/use-categories';
import { withAdoptedNote } from '@/features/installments/adopted';
import { PlanForm } from '@/features/installments/plan-form';
import {
  useEndInstallmentPlan,
  useInstallmentPlans,
  useUpdateInstallmentPlan,
} from '@/features/installments/use-installments';
import { useMerchants, useResolveMerchant } from '@/features/merchants/use-merchants';
import { usePeople, useResolvePerson } from '@/features/people/use-people';
import { dueDayLabel, frequencyLabel, monthNameOf } from '@/features/recurrences/due';
import { RecurrenceForm } from '@/features/recurrences/recurrence-form';
import {
  useEndRecurrence,
  useRecurrences,
  useUpdateRecurrence,
} from '@/features/recurrences/use-recurrences';
import { sortRows, useSort, type SortValue } from '@/features/view-mode/sort';
import { SortableHead } from '@/features/view-mode/sortable-head';
import { useShowsTable } from '@/features/view-mode/view-mode';
import { CARD_LIST, CARD_ROW, STRIPED_ROW, TABLE_BOX } from '@/features/view-mode/row-styles';
import { ViewModeToggle } from '@/features/view-mode/view-mode-toggle';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';

const MONTHLY_TITLE_ID = 'recurrences-monthly';
const PLANS_TITLE_ID = 'recurrences-plans';

const typeLabel = { CREDIT: 'Entrada', DEBIT: 'Saída' } as const;

const showError = (error: unknown) => toast.error(apiErrorMessage(error));

/** "Desde outubro de 2026", or "A partir de" for one that has not started yet. */
function since(period: string) {
  return `${period > currentPeriod() ? 'A partir de' : 'Desde'} ${formatPeriod(period)}`;
}

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

/**
 * An ended one, from its first month to its last, so the start is not lost: "Janeiro a maio de
 * 2026", "Outubro de 2025 a março de 2026", or "Em maio de 2026" for a single month.
 */
function periodRange(start: string, end: string) {
  if (start === end) return `Em ${formatPeriod(end)}`;
  const from = start.slice(0, 4) === end.slice(0, 4) ? monthNameOf(start) : formatPeriod(start);
  return `${capitalized(from)} a ${formatPeriod(end)}`;
}

/** "Próximo: março de 2027": when a yearly one comes again (ADR 0038 note); null otherwise. */
function nextLine(recurrence: Recurrence) {
  if (recurrence.intervalMonths !== 12 || recurrence.endPeriod !== null) return null;
  const next = nextRecurrencePeriod(
    recurrence.startPeriod,
    recurrence.intervalMonths,
    currentPeriod(),
  );
  return `Próximo: ${formatPeriod(next)}`;
}

/** The competência of a plan's last installment. */
const lastPeriodOf = (plan: InstallmentPlan) =>
  shiftPeriod(plan.firstPeriod, installmentsCreated(plan) - 1);

/** Ended, or every installment already paid: history, no longer something to act on. */
const planIsOver = (plan: InstallmentPlan) =>
  plan.endedAt !== null || plan.settledCount >= installmentsCreated(plan);

/**
 * Installments paid, counting those before a plan created at 3/10 (ADR 0055): the bill had
 * already charged 1/10 and 2/10, so "2 de 10" before the first one here is paid.
 */
const paidCount = (plan: InstallmentPlan) => plan.firstNumber - 1 + plan.settledCount;

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

/** The amount, and what it means under it ("Varia todo mês", "total em 10 de R$ 99,90"). */
function SeriesAmount({ amount, note }: { amount: string; note: string | null }) {
  return (
    <span className="grid justify-items-end text-right">
      <span className="text-base font-semibold tabular-nums">{amount}</span>
      {note && <span className="text-muted-foreground text-xs">{note}</span>}
    </span>
  );
}

/**
 * A row: what it is on the left, the amount on the right, and the menu for EDITORs. On the phone
 * the details take the whole width under them, so they do not wrap word by word beside the
 * amount; from md they stay under the title.
 */
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
    <li className={`${CARD_ROW} grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1`}>
      <p className="font-medium break-words">{title}</p>
      <div className="flex items-start gap-2 md:row-span-2 md:gap-1">
        <SeriesAmount amount={amount} note={amountNote} />
        {menu}
      </div>
      <p className="text-muted-foreground col-span-2 flex flex-wrap gap-x-3 text-sm md:col-span-1">
        {meta
          .filter((part) => part !== null)
          .map((part) => (
            <span key={part}>{part}</span>
          ))}
      </p>
    </li>
  );
}

/** A column of a series table: its title, width, alignment and, when it sorts, by what. */
type Column<T> = {
  label: string;
  /** A Tailwind width (`w-32`); the one without takes what is left. */
  width?: string;
  align?: 'right';
  sort?: (row: T) => SortValue;
};

/**
 * Series as a table, from xl ("Ver como: Tabela", ADR 0045 note): fixed columns, so the table of
 * the active ones lines up with the past ones', sorted by the column clicked (by description at
 * first, as the list). The actions column only where rows have a menu.
 */
function SeriesTable<T>({
  rows,
  columns,
  actions,
  renderRow,
}: {
  rows: T[];
  columns: Column<T>[];
  actions: boolean;
  renderRow: (row: T) => ReactNode;
}) {
  const sort = useSort<string>('0');
  const sortBy = columns[Number(sort.key)]?.sort;
  const sorted = sortBy ? sortRows(rows, sortBy, sort.direction) : rows;
  return (
    <div className={TABLE_BOX}>
      <Table className="table-fixed">
        <colgroup>
          {columns.map((column) => (
            <col key={column.label} className={column.width} />
          ))}
          {actions && <col className="w-14" />}
        </colgroup>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) =>
              column.sort ? (
                <SortableHead
                  key={column.label}
                  label={column.label}
                  active={sort.key === String(index)}
                  direction={sort.direction}
                  onSort={() => sort.toggle(String(index))}
                  align={column.align}
                />
              ) : (
                <TableHead
                  key={column.label}
                  className={cn(column.align === 'right' && 'text-right')}
                >
                  {column.label}
                </TableHead>
              ),
            )}
            {actions && (
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>{sorted.map(renderRow)}</TableBody>
      </Table>
    </div>
  );
}

/** "Dia 10", or "Dia 10 do mês seguinte"; a dash without a due day. */
function dueCell(dueDay: number | null, dueMonthOffset: number) {
  if (dueDay === null) return '—';
  const label = dueDayLabel(dueDay, dueMonthOffset);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** A category cell of a series table, with how it is paid under it (ADR 0054). */
function CategoryAndMethod({
  category,
  method,
}: {
  category: string | undefined;
  method: PaymentMethod | null;
}) {
  return (
    <span className="grid">
      <span>{category ?? 'Categoria'}</span>
      {method && <span className="text-muted-foreground">{paymentMethodLabels[method]}</span>}
    </span>
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
  people,
  merchants,
  onDone,
}: {
  workspaceId: string;
  recurrence: Recurrence;
  categories: Category[];
  people: Person[];
  merchants: Merchant[];
  onDone: () => void;
}) {
  const user = useCurrentUser();
  const update = useUpdateRecurrence(workspaceId);
  const person = useResolvePerson(workspaceId, people);
  const merchant = useResolveMerchant(workspaceId, merchants);
  const category = useResolveCategory(workspaceId, categories);
  const save = async (
    changes: UpdateRecurrenceInput,
    personName: string | undefined,
    merchantName: string | undefined,
  ) => {
    if (changes.categoryId !== undefined) {
      // A category added in the form is created first (or an archived one comes back).
      try {
        changes.categoryId = await category.resolve(changes.categoryId, recurrence.type);
      } catch {
        return; // Shown by the form, from category.error.
      }
    }
    if (personName !== undefined) {
      // A new name becomes a person first (ADR 0042); '' unlinks.
      try {
        changes.personId = await person.resolve(personName);
      } catch {
        return; // Shown by the form, from person.error.
      }
    }
    if (merchantName !== undefined) {
      // A new name becomes a merchant first (ADR 0053); '' unlinks.
      try {
        changes.merchantId = await merchant.resolve(merchantName);
      } catch {
        return; // Shown by the form, from merchant.error.
      }
    }
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
      people={people}
      merchants={merchants}
      userId={user.id}
      pending={update.isPending || person.isPending || merchant.isPending || category.isPending}
      error={category.error ?? person.error ?? merchant.error ?? update.error}
      onSubmit={(changes, personName, merchantName) => void save(changes, personName, merchantName)}
      onCancel={onDone}
    />
  );
}

/** Inside the plan's edit dialog: mounted on each opening, so no error is left from the last one. */
function EditPlan({
  workspaceId,
  plan,
  categories,
  people,
  merchants,
  onDone,
}: {
  workspaceId: string;
  plan: InstallmentPlan;
  categories: Category[];
  people: Person[];
  merchants: Merchant[];
  onDone: () => void;
}) {
  const user = useCurrentUser();
  const update = useUpdateInstallmentPlan(workspaceId);
  const person = useResolvePerson(workspaceId, people);
  const merchant = useResolveMerchant(workspaceId, merchants);
  const category = useResolveCategory(workspaceId, categories);
  const save = async (
    changes: UpdateInstallmentPlanInput,
    personName: string | undefined,
    merchantName: string | undefined,
  ) => {
    if (changes.categoryId !== undefined) {
      try {
        changes.categoryId = await category.resolve(changes.categoryId, plan.type);
      } catch {
        return; // Shown by the form, from category.error.
      }
    }
    if (personName !== undefined) {
      try {
        changes.personId = await person.resolve(personName);
      } catch {
        return; // Shown by the form, from person.error.
      }
    }
    if (merchantName !== undefined) {
      // A new name becomes a merchant first (ADR 0053); '' unlinks.
      try {
        changes.merchantId = await merchant.resolve(merchantName);
      } catch {
        return; // Shown by the form, from merchant.error.
      }
    }
    if (Object.keys(changes).length === 0) return onDone();
    update.mutate(
      { id: plan.id, ...changes },
      {
        onSuccess: () => {
          toast.success('Parcelamento alterado');
          onDone();
        },
      },
    );
  };

  return (
    <PlanForm
      plan={plan}
      categories={categories}
      people={people}
      merchants={merchants}
      userId={user.id}
      pending={update.isPending || person.isPending || merchant.isPending || category.isPending}
      error={category.error ?? person.error ?? merchant.error ?? update.error}
      onSubmit={(changes, personName, merchantName) => void save(changes, personName, merchantName)}
      onCancel={onDone}
    />
  );
}

/** "A receber de Ana" / "A pagar para Ana" (ADR 0052); null without a person. */
function personLine(type: TransactionType, personId: string | null, people: Person[]) {
  const name = people.find((person) => person.id === personId)?.name;
  if (!name) return null;
  return `${type === 'CREDIT' ? 'A receber de' : 'A pagar para'} ${name}`;
}

/** "Dividido com Ana (50%) e Bruno (R$ 30,00)" (ADR 0052); null when not split. */
function splitLine(split: Recurrence['split'], people: Person[]) {
  if (split.length === 0) return null;
  const parts = split.map((share) => {
    const name = people.find((person) => person.id === share.personId)?.name ?? 'Pessoa';
    const value =
      share.basisPoints === null
        ? formatCents(share.amountCents ?? 0)
        : formatBasisPoints(share.basisPoints);
    return `${name} (${value})`;
  });
  return `Dividido com ${new Intl.ListFormat('pt-BR').format(parts)}`;
}

function RecurrenceItem({
  workspaceId,
  recurrence,
  categories,
  people,
  merchants,
  canEdit,
  asTable,
}: {
  workspaceId: string;
  recurrence: Recurrence;
  categories: Category[];
  people: Person[];
  merchants: Merchant[];
  canEdit: boolean;
  /** A table row ("Ver como: Tabela"), or a list row. */
  asTable: boolean;
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

  const who =
    personLine(recurrence.type, recurrence.personId, people) ?? splitLine(recurrence.split, people);
  const period = ended
    ? periodRange(recurrence.startPeriod, recurrence.endPeriod ?? recurrence.startPeriod)
    : since(recurrence.startPeriod);
  // A variable one: the amount typed is only the starting estimate (ADR 0038).
  const frequency = frequencyLabel(recurrence.intervalMonths, recurrence.startPeriod);
  const next = nextLine(recurrence);
  const amountNote = recurrence.variableAmount
    ? recurrence.intervalMonths === 12
      ? 'Varia todo ano'
      : 'Varia todo mês'
    : null;
  const menu = canEdit && !ended && (
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
        description="As mudanças valem para os lançamentos pendentes deste mês em diante. Os já pagos ou recebidos e os meses anteriores ficam como estão."
      >
        <EditRecurrence
          workspaceId={workspaceId}
          recurrence={recurrence}
          categories={categories}
          people={people}
          merchants={merchants}
          onDone={() => setEditing(false)}
        />
      </ResponsiveDialog>
      <EndDialog
        open={confirmingEnd}
        onOpenChange={setConfirmingEnd}
        returnFocusTo={actionsRef}
        title={`Encerrar a recorrência ${description}?`}
        description={withAdoptedNote(
          'Deixa de repetir. Os lançamentos pendentes deste mês em diante saem; os anteriores e os já pagos ou recebidos ficam.',
          recurrence.adoptedTransactionId,
        )}
        action="Encerrar recorrência"
        onConfirm={confirmEnd}
      />
    </>
  );

  if (asTable) {
    return (
      <TableRow className={STRIPED_ROW}>
        <TableCell className="font-medium break-words whitespace-normal">{description}</TableCell>
        <TableCell>{typeLabel[recurrence.type]}</TableCell>
        <TableCell className="whitespace-normal">
          <CategoryAndMethod category={category?.name} method={recurrence.paymentMethod} />
        </TableCell>
        <TableCell className="whitespace-normal">{who ?? '—'}</TableCell>
        <TableCell className="whitespace-normal">
          {/* How often, with the due day under it (ADR 0038 note). */}
          <span className="grid">
            <span>{frequency}</span>
            {recurrence.dueDay !== null && (
              <span className="text-muted-foreground">
                {dueCell(recurrence.dueDay, recurrence.dueMonthOffset)}
              </span>
            )}
          </span>
        </TableCell>
        <TableCell className="whitespace-normal">
          <span className="grid">
            <span>{period}</span>
            {next && <span className="text-muted-foreground">{next}</span>}
          </span>
        </TableCell>
        <TableCell>
          <SeriesAmount amount={formatCents(recurrence.amountCents)} note={amountNote} />
        </TableCell>
        {menu && (
          <TableCell>
            <div className="flex justify-end">{menu}</div>
          </TableCell>
        )}
      </TableRow>
    );
  }

  return (
    <SeriesRow
      title={description}
      meta={[
        typeLabel[recurrence.type],
        frequency,
        category?.name ?? 'Categoria',
        recurrence.paymentMethod && paymentMethodLabels[recurrence.paymentMethod],
        personLine(recurrence.type, recurrence.personId, people),
        splitLine(recurrence.split, people),
        recurrence.dueDay === null
          ? null
          : `Vence ${dueDayLabel(recurrence.dueDay, recurrence.dueMonthOffset)}`,
        period,
        next,
      ]}
      amount={formatCents(recurrence.amountCents)}
      amountNote={amountNote}
      menu={menu}
    />
  );
}

function PlanItem({
  workspaceId,
  plan,
  categories,
  people,
  merchants,
  canEdit,
  asTable,
}: {
  workspaceId: string;
  plan: InstallmentPlan;
  categories: Category[];
  people: Person[];
  merchants: Merchant[];
  canEdit: boolean;
  /** A table row ("Ver como: Tabela"), or a list row. */
  asTable: boolean;
}) {
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [editing, setEditing] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const end = useEndInstallmentPlan(workspaceId);
  const { description } = plan;
  const over = planIsOver(plan);
  // Nothing paid: no history to keep, so it is deleted rather than ended (ADR 0038 note).
  const nothingPaid = plan.settledCount === 0;
  const category = categories.find((item) => item.id === plan.categoryId);
  const created = installmentsCreated(plan);
  const parts = splitInstallments(plan.totalCents, created);
  const first = parts[0] ?? 0;
  const confirmEnd = () =>
    void end.mutateAsync(plan.id).then(() => {
      toast.success(nothingPaid ? 'Parcelamento excluído' : 'Parcelamento encerrado');
      document.getElementById(PLANS_TITLE_ID)?.focus();
    }, showError);

  const status =
    plan.endedAt !== null
      ? 'Encerrado'
      : plan.settledCount >= created
        ? settledLabels[plan.type]
        : remaining(plan);
  // The amount is the purchase's total: "total em 10 de R$ 99,90", or just how many when the
  // leftover cents make the last one differ.
  const amountNote =
    parts.at(-1) === first
      ? `total em ${created} de ${formatCents(first)}`
      : `total em ${created} parcelas`;
  // A plan created at 3/10 (ADR 0055) says which ones it has, beside what was paid.
  const which =
    plan.firstNumber > 1
      ? `Da ${plan.firstNumber}/${plan.installments} à ${plan.installments}/${plan.installments}`
      : null;
  const pendingText =
    plan.pendingCount === 1 ? '1 parcela pendente' : `${plan.pendingCount} parcelas pendentes`;
  // A running one, or an ended one with nothing paid (still to delete).
  const menu = canEdit && (!over || nothingPaid) && (
    <>
      <DropdownMenu>
        <ActionsButton name={description} ref={actionsRef} />
        <DropdownMenuContent align="end">
          {!over && <DropdownMenuItem onSelect={() => setEditing(true)}>Editar</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingEnd(true)}>
            {nothingPaid ? 'Excluir parcelamento' : 'Encerrar parcelamento'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!over && (
        <ResponsiveDialog
          open={editing}
          onOpenChange={setEditing}
          returnFocusTo={actionsRef}
          title={`Editar ${description}`}
          description="As mudanças valem para as parcelas pendentes. As já pagas ficam como estão."
        >
          <EditPlan
            workspaceId={workspaceId}
            plan={plan}
            categories={categories}
            people={people}
            merchants={merchants}
            onDone={() => setEditing(false)}
          />
        </ResponsiveDialog>
      )}
      <EndDialog
        open={confirmingEnd}
        onOpenChange={setConfirmingEnd}
        returnFocusTo={actionsRef}
        title={
          nothingPaid
            ? `Excluir o parcelamento ${description}?`
            : `Encerrar o parcelamento ${description}?`
        }
        description={withAdoptedNote(
          nothingPaid
            ? `Nenhuma parcela foi paga: o parcelamento sai com ${pendingText}, também as de meses anteriores. Não é possível desfazer.`
            : 'As parcelas pendentes deste mês em diante saem; as já pagas e as anteriores ficam. Use para uma quitação antecipada.',
          plan.adoptedTransactionId,
        )}
        action={nothingPaid ? 'Excluir parcelamento' : 'Encerrar parcelamento'}
        onConfirm={confirmEnd}
      />
    </>
  );

  if (asTable) {
    return (
      <TableRow className={STRIPED_ROW}>
        <TableCell className="font-medium break-words whitespace-normal">{description}</TableCell>
        <TableCell>{typeLabel[plan.type]}</TableCell>
        <TableCell className="whitespace-normal">
          <CategoryAndMethod category={category?.name} method={plan.paymentMethod} />
        </TableCell>
        <TableCell className="whitespace-normal">
          {personLine(plan.type, plan.personId, people) ?? '—'}
        </TableCell>
        <TableCell className="whitespace-normal tabular-nums">
          <span className="grid">
            <span>
              {paidCount(plan)} de {plan.installments}
            </span>
            {which && <span className="text-muted-foreground">{which}</span>}
          </span>
        </TableCell>
        <TableCell className="whitespace-normal">{status}</TableCell>
        <TableCell>
          <SeriesAmount amount={formatCents(plan.totalCents)} note={amountNote} />
        </TableCell>
        {canEdit && (
          <TableCell>
            <div className="flex justify-end">{menu}</div>
          </TableCell>
        )}
      </TableRow>
    );
  }

  return (
    <SeriesRow
      title={description}
      meta={[
        typeLabel[plan.type],
        category?.name ?? 'Categoria',
        plan.paymentMethod && paymentMethodLabels[plan.paymentMethod],
        personLine(plan.type, plan.personId, people),
        `${paidCount(plan)} de ${plan.installments} pagas`,
        which,
        status,
      ]}
      amount={formatCents(plan.totalCents)}
      amountNote={amountNote}
      menu={menu}
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
 * What the active recurrences add up to, by type: "Por mês: R$ 224,90 em saídas, dos quais
 * R$ 180,00 estimados." The variable ones are only an estimate, and it says so. The yearly ones
 * come apart, "Por ano: …", since they fall in one month only (ADR 0038 note).
 */
function recurrenceTotals(recurrences: Recurrence[]) {
  const lines = [
    total(
      recurrences.filter((item) => item.intervalMonths !== 12),
      'Por mês',
    ),
    total(
      recurrences.filter((item) => item.intervalMonths === 12),
      'Por ano',
    ),
  ].filter(Boolean);
  return lines.length === 0 ? null : lines.join(' ');
}

function total(recurrences: Recurrence[], label: string) {
  const sides = (['DEBIT', 'CREDIT'] as const).flatMap((type) => {
    const items = recurrences.filter((item) => item.type === type);
    if (items.length === 0) return [];
    const total = items.reduce((sum, item) => sum + item.amountCents, 0);
    const estimated = items
      .filter((item) => item.variableAmount)
      .reduce((sum, item) => sum + item.amountCents, 0);
    const noun = transactionTypeLabels[type].lowerPlural;
    const part =
      estimated === 0
        ? ''
        : estimated === total
          ? ', todos estimados'
          : `, dos quais ${formatCents(estimated)} estimados`;
    return [`${formatCents(total)} em ${noun}${part}`];
  });
  return sides.length === 0 ? null : `${label}: ${sides.join('; ')}.`;
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
  /** The active ones, as a list or a table; null when there is none. */
  active: ReactNode;
  pastTitle: string;
  /** The past ones, the same way; null when there is none. */
  past: ReactNode;
}) {
  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      {/* Focusable from script: where focus goes after ending one. */}
      <h2 id={titleId} tabIndex={-1} className="font-medium outline-none">
        {title}
      </h2>
      {summary && <p className="tabular-nums">{summary}</p>}
      {active ?? <p className="text-muted-foreground">{empty}</p>}
      {past && (
        <div className="grid gap-2">
          <h3 className="text-muted-foreground font-medium">{pastTitle}</h3>
          {past}
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
  const people = usePeople(workspace.id);
  const merchants = useMerchants(workspace.id);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const ready =
    recurrences.isSuccess &&
    plans.isSuccess &&
    categories.isSuccess &&
    people.isSuccess &&
    merchants.isSuccess;

  // "Ver como: Tabela", from xl (ADR 0045 note); the list everywhere else.
  const asTable = useShowsTable('recorrencias');
  const categoryName = (categoryId: string) =>
    categories.data?.find((item) => item.id === categoryId)?.name ?? null;
  const personName = (personId: string | null) =>
    (personId && people.data?.find((item) => item.id === personId)?.name) || null;

  const recurrenceItem = (recurrence: Recurrence) => (
    <RecurrenceItem
      key={recurrence.id}
      workspaceId={workspace.id}
      recurrence={recurrence}
      categories={categories.data ?? []}
      people={people.data ?? []}
      merchants={merchants.data ?? []}
      canEdit={canEdit}
      asTable={asTable}
    />
  );
  const planItem = (plan: InstallmentPlan) => (
    <PlanItem
      key={plan.id}
      workspaceId={workspace.id}
      plan={plan}
      categories={categories.data ?? []}
      people={people.data ?? []}
      merchants={merchants.data ?? []}
      canEdit={canEdit}
      asTable={asTable}
    />
  );
  const recurrenceColumns: Column<Recurrence>[] = [
    { label: 'Descrição', sort: (item) => item.description },
    { label: 'Tipo', width: 'w-20' },
    { label: 'Categoria', width: 'w-32', sort: (item) => categoryName(item.categoryId) },
    { label: 'Pessoa', width: 'w-40' },
    {
      label: 'Repete',
      width: 'w-40',
      // Monthly ones first, then by due day: the next month's day 1 comes after this month's 31.
      sort: (item) =>
        item.intervalMonths * 100 +
        (item.dueDay === null ? 99 : item.dueMonthOffset * 31 + item.dueDay),
    },
    { label: 'Período', width: 'w-36', sort: (item) => item.endPeriod ?? item.startPeriod },
    { label: 'Valor', width: 'w-32', align: 'right', sort: (item) => item.amountCents },
  ];
  const planColumns: Column<InstallmentPlan>[] = [
    { label: 'Descrição', sort: (item) => item.description },
    { label: 'Tipo', width: 'w-20' },
    { label: 'Categoria', width: 'w-32', sort: (item) => categoryName(item.categoryId) },
    { label: 'Pessoa', width: 'w-36', sort: (item) => personName(item.personId) },
    { label: 'Pagas', width: 'w-32', sort: (item) => paidCount(item) / item.installments },
    { label: 'Falta', width: 'w-48', sort: (item) => item.pendingCents },
    { label: 'Total', width: 'w-36', align: 'right', sort: (item) => item.totalCents },
  ];
  /** The rows as a table or a list; null when there is none, so the section says it is empty. */
  const show = <T,>(
    rows: T[],
    columns: Column<T>[],
    item: (row: T) => ReactNode,
    actions: boolean,
  ) =>
    rows.length === 0 ? null : asTable ? (
      <SeriesTable rows={rows} columns={columns} actions={actions} renderRow={item} />
    ) : (
      // One card per item, like Lançamentos (ADR 0036 note).
      <ul className={CARD_LIST}>{rows.map(item)}</ul>
    );

  return (
    <>
      <PageHeader
        title="Recorrências"
        description="O que se repete todo mês ou todo ano e as compras parceladas. Mudanças valem para os lançamentos pendentes deste mês em diante. O que já passou ou foi pago ou recebido não muda."
      >
        <ViewModeToggle page="recorrencias" />
      </PageHeader>
      <QueryState queries={[recurrences, plans, categories, people, merchants]} />
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
              title="Recorrentes"
              empty="Nenhuma recorrência ativa."
              summary={recurrenceTotals(recurrences.data.filter((item) => item.endPeriod === null))}
              active={show(
                recurrences.data.filter((item) => item.endPeriod === null),
                recurrenceColumns,
                recurrenceItem,
                canEdit,
              )}
              pastTitle="Encerradas"
              // History has nothing to act on: no actions column.
              past={show(
                recurrences.data.filter((item) => item.endPeriod !== null),
                recurrenceColumns,
                recurrenceItem,
                false,
              )}
            />
            <Section
              titleId={PLANS_TITLE_ID}
              title="Parcelamentos"
              empty="Nenhum parcelamento em andamento."
              active={show(
                plans.data.filter((plan) => !planIsOver(plan)),
                planColumns,
                planItem,
                canEdit,
              )}
              pastTitle="Encerrados e quitados"
              // An ended one with nothing paid can still be deleted: the actions column stays.
              past={show(plans.data.filter(planIsOver), planColumns, planItem, canEdit)}
            />
          </>
        ))}
    </>
  );
}
