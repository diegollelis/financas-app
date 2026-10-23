import {
  createPersonInputSchema,
  formatCents,
  formatPeriod,
  hasRole,
  normalizeName,
  partiallySettleable,
  settlePartLabels,
  formatIsoDate,
  todayIso,
  transactionStatus,
  type Person,
  type Transaction,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ellipsis, Plus } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
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
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/search-input';
import { PageActionButton } from '@/components/page-action-button';
import {
  useCreatePerson,
  useDeletePerson,
  usePeople,
  usePersonTransactions,
  useUpdatePerson,
} from '@/features/people/use-people';
import { useCurrentUser } from '@/features/auth/use-me';
import { signedCents } from '@/features/transactions/row-format';
import { StatusBadge } from '@/features/transactions/status-badge';
import { SettleButton } from '@/features/transactions/settle-button';
import { SettlePartDialog } from '@/features/transactions/settle-part-dialog';
import { useUpdateTransaction } from '@/features/transactions/use-transactions';
import { CARD_LIST, CARD_ROW } from '@/features/view-mode/row-styles';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const nameSchema = createPersonInputSchema.pick({ name: true });
type NameInput = z.infer<typeof nameSchema>;

const LIST_TITLE_ID = 'people-title';

type NumericField =
  | 'receivableCents'
  | 'payableCents'
  | 'overdueReceivableCents'
  | 'overduePayableCents'
  | 'futureInstallmentsReceivableCents'
  | 'futureInstallmentsPayableCents';

const owesNow = (person: Person) => person.receivableCents > 0 || person.payableCents > 0;

const hasFuture = (person: Person) =>
  person.futureInstallmentsReceivableCents > 0 || person.futureInstallmentsPayableCents > 0;

const hasPending = (person: Person) => owesNow(person) || hasFuture(person);

/** "R$ 30,00 vencido": the overdue part of a total, only when there is one. */
function Overdue({ cents }: { cents: number }) {
  if (cents === 0) return null;
  return <span className="text-destructive text-sm font-normal">{formatCents(cents)} vencido</span>;
}

/** "Mais R$ 200,00 em parcelas a receber": installments of later months (ADR 0042 note). */
function futureText(receivableCents: number, payableCents: number) {
  const parts = [
    receivableCents > 0 && `${formatCents(receivableCents)} em parcelas a receber`,
    payableCents > 0 && `${formatCents(payableCents)} em parcelas a pagar`,
  ].filter(Boolean);
  return parts.length > 0 ? `Mais ${parts.join(' e ')}` : null;
}

/**
 * Who owes or is owed now first, then who has only installments to come, then who is "Em dia";
 * each in the API's order (by name).
 */
const pendingFirst = (people: Person[]) => [
  ...people.filter(owesNow),
  ...people.filter((person) => !owesNow(person) && hasFuture(person)),
  ...people.filter((person) => !hasPending(person)),
];

/**
 * Toast after a change. mutateAsync, not mutate's callbacks: archiving, reactivating and deleting
 * move or remove the row, and callbacks of an unmounted component never run.
 */
function confirmWith(change: Promise<unknown>, message: string) {
  return change.then(
    () => toast.success(message),
    (error: unknown) => toast.error(apiErrorMessage(error)),
  );
}

/**
 * "Te deve R$ 150,00", "Você deve R$ 400,00", both, or "Em dia": what is pending up to this month
 * each way, with its overdue part, and the installments of later months on a line of their own.
 * Months of a recurrence ahead are not counted (ADR 0042 note).
 */
function Balance({ person }: { person: Person }) {
  return (
    <span className="grid justify-items-end text-right tabular-nums">
      {!owesNow(person) && <span className="text-muted-foreground font-normal">Em dia</span>}
      <Side
        label="Te deve"
        cents={person.receivableCents}
        overdueCents={person.overdueReceivableCents}
        futureCents={person.futureInstallmentsReceivableCents}
      />
      <Side
        label="Você deve"
        cents={person.payableCents}
        overdueCents={person.overduePayableCents}
        futureCents={person.futureInstallmentsPayableCents}
      />
    </span>
  );
}

/**
 * One way of a person's balance: "Te deve R$ 180,00", its overdue part and "Mais R$ 300,00 em
 * parcelas"; with nothing for now, only "Te deve R$ 300,00 em parcelas".
 */
function Side({
  label,
  cents,
  overdueCents,
  futureCents,
}: {
  label: string;
  cents: number;
  overdueCents: number;
  futureCents: number;
}) {
  const future = formatCents(futureCents);
  return (
    <>
      {cents > 0 && (
        <span>
          {label} {formatCents(cents)}
        </span>
      )}
      <Overdue cents={overdueCents} />
      {futureCents > 0 && (
        <span className="text-muted-foreground text-sm font-normal">
          {cents > 0 ? `Mais ${future} em parcelas` : `${label} ${future} em parcelas`}
        </span>
      )}
    </>
  );
}

/** "Nova pessoa", in its dialog (ADR 0036 note): a name, then back to the list. */
function NewPersonForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const create = useCreatePerson(workspaceId);
  const { register, handleSubmit, formState, reset } = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: '' },
  });
  const submit = ({ name }: NameInput) =>
    create.mutate(
      { name },
      {
        onSuccess: (person) => {
          reset();
          toast.success(`${person.name} adicionada`);
          onDone();
        },
      },
    );

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField
        id="new-person"
        label="Nome"
        error={
          formState.errors.name?.message ??
          (create.isError ? apiErrorMessage(create.error) : undefined)
        }
      >
        <Input autoComplete="off" placeholder="Nome" {...register('name')} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adicionando…' : 'Adicionar'}
        </Button>
      </div>
    </form>
  );
}

/** The person's transactions by competência, in the order they come (newest first). */
function byPeriod(transactions: Transaction[]) {
  const groups: { period: string; items: Transaction[] }[] = [];
  for (const transaction of transactions) {
    const last = groups.at(-1);
    if (last?.period === transaction.period) last.items.push(transaction);
    else groups.push({ period: transaction.period, items: [transaction] });
  }
  return groups;
}

/**
 * Every transaction with one person, of any month. A pending one can be marked as received or
 * paid right here: the same settling as "Marcar como pago" in Lançamentos, with today's date, where the
 * debt is seen; or only part of it, "Receber parte" (ADR 0057), when it comes back bit by bit.
 * An estimated amount still goes to Lançamentos, which asks for the real one.
 */
function PersonHistory({
  workspaceId,
  person,
  canEdit,
  onClose,
  returnFocusTo,
}: {
  workspaceId: string;
  person: Person | null;
  canEdit: boolean;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const transactions = usePersonTransactions(workspaceId, person?.id ?? null);
  const settle = useUpdateTransaction(workspaceId);
  // "Receber parte" (ADR 0057): the transaction, and where the focus goes back.
  const [part, setPart] = useState<{
    transaction: Transaction;
    returnFocusTo: HTMLElement;
  } | null>(null);
  const today = todayIso();
  const settleNow = (transaction: Transaction) =>
    settle.mutate(
      { id: transaction.id, settledAt: today },
      {
        onSuccess: () =>
          toast.success(
            transaction.type === 'CREDIT' ? 'Marcado como recebido' : 'Marcado como pago',
            {
              action: {
                label: 'Desfazer',
                onClick: () =>
                  settle.mutate(
                    { id: transaction.id, settledAt: null },
                    {
                      onSuccess: () =>
                        toast.success(
                          transaction.type === 'CREDIT'
                            ? 'Recebimento desmarcado'
                            : 'Pagamento desmarcado',
                        ),
                      onError: (error) => toast.error(apiErrorMessage(error)),
                    },
                  ),
              },
            },
          ),
        onError: (error) => toast.error(apiErrorMessage(error)),
      },
    );

  return (
    <ResponsiveDialog
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      returnFocusTo={returnFocusTo}
      title={person ? `Lançamentos com ${person.name}` : 'Lançamentos'}
      description="De todos os meses, do mais recente ao mais antigo. Para mudar um lançamento, use Lançamentos."
    >
      {/* Its own states, not QueryState's: a 404 here is a person gone, not the workspace. */}
      {transactions.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {transactions.isError && (
        <div role="alert" className="grid justify-items-start gap-2">
          <p className="text-destructive">
            Não foi possível carregar os lançamentos desta pessoa agora.
          </p>
          <Button
            variant="outline"
            onClick={() => void transactions.refetch()}
            disabled={transactions.isFetching}
          >
            {transactions.isFetching ? 'Tentando…' : 'Tentar de novo'}
          </Button>
        </div>
      )}
      {transactions.isSuccess &&
        (transactions.data.length === 0 ? (
          <p className="text-muted-foreground">Nenhum lançamento com esta pessoa ainda.</p>
        ) : (
          // As in Lançamentos (ADR 0036 notes): one card per transaction, the amount with its
          // sign, the status in the same words and the same settle button, here grouped by month
          // since every month shows.
          <div className="grid gap-4">
            {byPeriod(transactions.data).map(({ period, items }) => (
              <section key={period} aria-label={formatPeriod(period)} className="grid gap-2">
                <h3 className="font-medium first-letter:uppercase">{formatPeriod(period)}</h3>
                <ul className={CARD_LIST}>
                  {items.map((transaction) => {
                    const status = transactionStatus(transaction, today);
                    const settleable =
                      canEdit && status !== 'SETTLED' && !transaction.amountEstimated;
                    // A person's transaction is never split, so there are no shares to ask for.
                    const partable = settleable && partiallySettleable(transaction, false);
                    const settleButton = (
                      <SettleButton
                        type={transaction.type}
                        overdue={status === 'OVERDUE'}
                        description={transaction.description}
                        disabled={settle.isPending}
                        onClick={() => settleNow(transaction)}
                      />
                    );
                    return (
                      <li
                        key={transaction.id}
                        className={`${CARD_ROW} flex flex-wrap items-start gap-3`}
                      >
                        <div className="grid min-w-0 flex-1 gap-1">
                          <p className="font-medium break-words">{transaction.description}</p>
                          {transaction.dueDate && status !== 'SETTLED' && (
                            <p className="text-muted-foreground text-sm">
                              Vence em {formatIsoDate(transaction.dueDate)}
                            </p>
                          )}
                          <span className="flex flex-wrap gap-1.5">
                            <StatusBadge
                              transaction={transaction}
                              today={today}
                              canEdit={canEdit}
                            />
                          </span>
                          {canEdit && status !== 'SETTLED' && transaction.amountEstimated && (
                            <p className="text-muted-foreground text-sm">
                              Valor estimado: marque como pago em Lançamentos, informando o valor
                              real.
                            </p>
                          )}
                        </div>
                        <div className="grid shrink-0 justify-items-end gap-2">
                          <span
                            className={
                              transaction.type === 'CREDIT'
                                ? 'text-credit-foreground font-semibold whitespace-nowrap tabular-nums'
                                : 'font-semibold whitespace-nowrap tabular-nums'
                            }
                          >
                            {signedCents(transaction.type, transaction.amountCents)}
                          </span>
                          {settleable && !partable && settleButton}
                        </div>
                        {partable && (
                          // Two buttons get a line of their own: beside the amount they would
                          // squeeze the description on the phone.
                          <span className="flex basis-full justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) =>
                                setPart({ transaction, returnFocusTo: event.currentTarget })
                              }
                            >
                              {/* The visible words start the name, for voice control. */}
                              {settlePartLabels[transaction.type].action}
                              <span className="sr-only">: {transaction.description}</span>
                            </Button>
                            {settleButton}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        ))}
      {part && (
        <SettlePartDialog
          workspaceId={workspaceId}
          transaction={part.transaction}
          open
          onOpenChange={(open) => !open && setPart(null)}
          returnFocusTo={part.returnFocusTo}
        />
      )}
    </ResponsiveDialog>
  );
}

function RenameDialog({
  workspaceId,
  person,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  person: Person;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const update = useUpdatePerson(workspaceId);
  const { register, handleSubmit, formState } = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: person.name },
  });
  const submit = ({ name }: NameInput) =>
    update.mutate(
      { id: person.id, name },
      {
        onSuccess: () => {
          toast.success('Nome salvo');
          onOpenChange(false);
        },
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={`Renomear ${person.name}`}
      description="O novo nome vale para todos os lançamentos já ligados a esta pessoa."
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <FormField
          id={`rename-${person.id}`}
          label="Nome"
          error={
            formState.errors.name?.message ??
            (update.isError ? apiErrorMessage(update.error) : undefined)
          }
        >
          <Input autoComplete="off" {...register('name')} />
        </FormField>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}

function PersonRow({
  workspaceId,
  person,
  canEdit,
  onOpenHistory,
}: {
  workspaceId: string;
  person: Person;
  canEdit: boolean;
  onOpenHistory: (person: Person, trigger: HTMLElement) => void;
}) {
  const update = useUpdatePerson(workspaceId);
  const remove = useDeletePerson(workspaceId);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const toList = () => document.getElementById(LIST_TITLE_ID)?.focus();
  const user = useCurrentUser();
  // A member's person comes from their account and stays while they do (ADR 0042 note).
  const memberLabel = person.isMember
    ? person.memberUserId === user.id
      ? 'Você'
      : 'Membro'
    : null;

  return (
    // As a transaction row: who on the left, the amounts on the right; the menu below them on the
    // phone, where the width is short, and beside them, on the line of the name, from md.
    <li className={`${CARD_ROW} flex items-start gap-3`}>
      <span className="grid min-w-0 flex-1 justify-items-start">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium break-words">{person.name}</span>
          {memberLabel && <Badge variant="secondary">{memberLabel}</Badge>}
        </span>
        <button
          type="button"
          className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-sm text-left text-sm whitespace-nowrap underline-offset-4 outline-none hover:underline focus-visible:ring-3 md:min-h-0"
          aria-label={`Ver lançamentos com ${person.name}`}
          onClick={(event) => onOpenHistory(person, event.currentTarget)}
        >
          Ver lançamentos
        </button>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1 md:flex md:items-start">
        <span className="font-semibold md:pt-0.5">
          <Balance person={person} />
        </span>
        {canEdit && !person.isMember && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={actionsRef}
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ações de ${person.name}`}
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(true)}>Renomear</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void confirmWith(
                      update.mutateAsync({ id: person.id, archived: !person.archived }),
                      person.archived ? `${person.name} reativada` : `${person.name} arquivada`,
                    ).then(toList)
                  }
                >
                  {person.archived ? 'Reativar' : 'Arquivar'}
                </DropdownMenuItem>
                {person.archived && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmingDelete(true)}
                  >
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <RenameDialog
              key={renaming ? 'open' : 'closed'}
              workspaceId={workspaceId}
              person={person}
              open={renaming}
              onOpenChange={setRenaming}
              returnFocusTo={actionsRef}
            />
            <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {person.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Só dá para excluir quem não tem lançamentos. Quem tem fica arquivada, com o
                    histórico guardado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() =>
                      void confirmWith(
                        remove.mutateAsync(person.id),
                        `${person.name} excluída`,
                      ).then(toList)
                    }
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </span>
    </li>
  );
}

/**
 * Pessoas (ADR 0042): who owes you and whom you owe, in this workspace only. The names are
 * contacts typed here, whether or not they use the app, and, in a shared workspace, its members,
 * marked as such; nobody else is listed.
 */
export function PeoplePage() {
  const workspace = useCurrentWorkspace();
  const people = usePeople(workspace.id);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [history, setHistory] = useState<{ person: Person; trigger: HTMLElement } | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const everyone = people.data ?? [];
  const shown = everyone.filter((person) =>
    normalizeName(person.name).includes(normalizeName(search)),
  );
  const active = pendingFirst(shown.filter((person) => !person.archived));
  const archived = shown.filter((person) => person.archived);
  const total = (field: NumericField) => everyone.reduce((sum, person) => sum + person[field], 0);
  const receivable = total('receivableCents');
  const payable = total('payableCents');
  const overdue = (cents: number) => (cents > 0 ? ` (${formatCents(cents)} vencido)` : '');
  const future = futureText(
    total('futureInstallmentsReceivableCents'),
    total('futureInstallmentsPayableCents'),
  );
  const row = (person: Person) => (
    <PersonRow
      key={person.id}
      workspaceId={workspace.id}
      person={person}
      canEdit={canEdit}
      onOpenHistory={(item, trigger) => setHistory({ person: item, trigger })}
    />
  );

  return (
    <>
      <PageHeader
        title="Pessoas"
        description={
          workspace.isPersonal
            ? 'Quem te deve e a quem você deve. Os nomes valem só neste espaço, e a pessoa não precisa usar o app.'
            : 'Quem te deve e a quem você deve. Os membros do espaço já estão aqui; os outros nomes valem só neste espaço, e a pessoa não precisa usar o app.'
        }
        action={
          canEdit &&
          people.isSuccess && (
            <PageActionButton ref={newButton} onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nova pessoa
            </PageActionButton>
          )
        }
      >
        {/* At the top, as in Categorias and Estabelecimentos (ADR 0036 note). */}
        {people.isSuccess && everyone.length > 0 && (
          <SearchInput
            id="people-search"
            label="Buscar pessoa"
            placeholder="Buscar pessoa"
            value={search}
            onChange={setSearch}
          />
        )}
      </PageHeader>
      {canEdit && (
        <ResponsiveDialog
          open={creating}
          onOpenChange={setCreating}
          returnFocusTo={newButton}
          title="Nova pessoa"
          description="Alguém com quem você divide contas ou tem algo a receber ou a pagar. Não precisa usar o app."
        >
          <NewPersonForm workspaceId={workspace.id} onDone={() => setCreating(false)} />
        </ResponsiveDialog>
      )}
      <QueryState queries={[people]} />
      {people.isSuccess && (
        <section aria-labelledby={LIST_TITLE_ID} className="grid gap-2">
          {/* Focusable from script: where focus goes after archiving or deleting someone. */}
          <h2 id={LIST_TITLE_ID} tabIndex={-1} className="font-medium outline-none">
            Pessoas
          </h2>
          {everyone.length > 0 && (
            // Everyone at once: how much is to come in and to go out up to this month.
            <div className="grid gap-0.5 tabular-nums">
              <p>
                A receber: {formatCents(receivable)}
                {overdue(total('overdueReceivableCents'))}. A pagar: {formatCents(payable)}
                {overdue(total('overduePayableCents'))}.
              </p>
              {future && <p className="text-muted-foreground text-sm">{future}.</p>}
            </div>
          )}
          {active.length === 0 && search.trim() !== '' ? (
            <p className="text-muted-foreground">Nenhuma pessoa com “{search.trim()}”.</p>
          ) : active.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-5">
              Ninguém ainda. Use "Nova pessoa", ou "A receber de" e "Dividir com alguém" ao lançar.
            </p>
          ) : (
            <ul className={CARD_LIST}>{active.map(row)}</ul>
          )}
        </section>
      )}
      {archived.length > 0 && (
        <section aria-labelledby="people-archived" className="grid gap-2">
          <h2 id="people-archived" className="text-muted-foreground font-medium">
            Arquivadas
          </h2>
          <ul className={CARD_LIST}>{archived.map(row)}</ul>
        </section>
      )}
      <PersonHistory
        workspaceId={workspace.id}
        person={history?.person ?? null}
        canEdit={canEdit}
        onClose={() => setHistory(null)}
        returnFocusTo={history?.trigger ?? null}
      />
    </>
  );
}
