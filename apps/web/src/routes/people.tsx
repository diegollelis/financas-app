import {
  createPersonInputSchema,
  formatCents,
  formatPeriod,
  hasRole,
  todayIso,
  transactionStatus,
  type Person,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ellipsis } from 'lucide-react';
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
import {
  useCreatePerson,
  useDeletePerson,
  usePeople,
  usePersonTransactions,
  useUpdatePerson,
} from '@/features/people/use-people';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const nameSchema = createPersonInputSchema.pick({ name: true });
type NameInput = z.infer<typeof nameSchema>;

const LIST_TITLE_ID = 'people-title';

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

/** "Te deve R$ 150,00", "Você deve R$ 400,00", both, or "Em dia": what is pending each way. */
function Balance({ person }: { person: Person }) {
  const { receivableCents, payableCents } = person;
  if (receivableCents === 0 && payableCents === 0) {
    return <span className="text-muted-foreground font-normal">Em dia</span>;
  }
  return (
    <span className="grid justify-items-end tabular-nums">
      {receivableCents > 0 && <span>Te deve {formatCents(receivableCents)}</span>}
      {payableCents > 0 && <span>Você deve {formatCents(payableCents)}</span>}
    </span>
  );
}

function AddPersonForm({ workspaceId }: { workspaceId: string }) {
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
        },
      },
    );

  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <FormField
        id="new-person"
        label="Nova pessoa"
        error={
          formState.errors.name?.message ??
          (create.isError ? apiErrorMessage(create.error) : undefined)
        }
      >
        <Input autoComplete="off" placeholder="Nome" {...register('name')} />
      </FormField>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Adicionando…' : 'Adicionar'}
      </Button>
    </form>
  );
}

/** A person's transactions of any month, read-only: settle and edit them in Lançamentos. */
function PersonHistory({
  workspaceId,
  person,
  onClose,
  returnFocusTo,
}: {
  workspaceId: string;
  person: Person | null;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const transactions = usePersonTransactions(workspaceId, person?.id ?? null);
  const today = todayIso();

  return (
    <ResponsiveDialog
      open={person !== null}
      onOpenChange={(open) => !open && onClose()}
      returnFocusTo={returnFocusTo}
      title={person ? `Lançamentos com ${person.name}` : 'Lançamentos'}
      description="De todos os meses, do mais recente ao mais antigo. Para efetivar ou mudar, use Lançamentos."
    >
      <QueryState queries={[transactions]} />
      {transactions.isSuccess &&
        (transactions.data.length === 0 ? (
          <p className="text-muted-foreground">Nenhum lançamento com esta pessoa ainda.</p>
        ) : (
          <ul className="divide-y">
            {transactions.data.map((transaction) => {
              const status = transactionStatus(transaction, today);
              return (
                <li key={transaction.id} className="flex items-start gap-3 py-3">
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="font-medium break-words">{transaction.description}</span>
                    <span className="text-muted-foreground text-sm first-letter:uppercase">
                      {formatPeriod(transaction.period)}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {transaction.type === 'CREDIT' ? 'A receber' : 'A pagar'}
                      </Badge>
                      {status === 'SETTLED' ? (
                        <Badge variant="success">
                          {transaction.type === 'CREDIT' ? 'Recebido' : 'Pago'}
                        </Badge>
                      ) : status === 'OVERDUE' ? (
                        <Badge variant="destructive">Vencido</Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCents(transaction.amountCents)}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
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

  return (
    // As a transaction row: who on the left, the amounts on the right with the menu below them.
    <li className="flex items-start gap-3 py-3">
      <span className="grid min-w-0 flex-1 justify-items-start">
        <span className="font-medium break-words">{person.name}</span>
        <button
          type="button"
          className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-sm text-left text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 md:min-h-0"
          aria-label={`Ver lançamentos com ${person.name}`}
          onClick={(event) => onOpenHistory(person, event.currentTarget)}
        >
          Ver lançamentos
        </button>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        <span className="font-semibold">
          <Balance person={person} />
        </span>
        {canEdit && (
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
 * contacts typed here, whether or not they use the app; nobody else is listed.
 */
export function PeoplePage() {
  const workspace = useCurrentWorkspace();
  const people = usePeople(workspace.id);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [history, setHistory] = useState<{ person: Person; trigger: HTMLElement } | null>(null);
  const active = people.data?.filter((person) => !person.archived) ?? [];
  const archived = people.data?.filter((person) => person.archived) ?? [];
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
        description="Quem te deve e a quem você deve. Os nomes valem só neste espaço, e a pessoa não precisa usar o app."
      />
      {canEdit && <AddPersonForm workspaceId={workspace.id} />}
      <QueryState queries={[people]} />
      {people.isSuccess && (
        <section aria-labelledby={LIST_TITLE_ID} className="grid gap-2">
          {/* Focusable from script: where focus goes after archiving or deleting someone. */}
          <h2 id={LIST_TITLE_ID} tabIndex={-1} className="font-medium outline-none">
            Pessoas
          </h2>
          {active.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-5">
              Ninguém ainda. Adicione uma pessoa aqui, ou use "A receber de" e "Dividir com alguém"
              ao lançar.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border px-4">{active.map(row)}</ul>
          )}
        </section>
      )}
      {archived.length > 0 && (
        <section aria-labelledby="people-archived" className="grid gap-2">
          <h2 id="people-archived" className="text-muted-foreground font-medium">
            Arquivadas
          </h2>
          <ul className="divide-y rounded-xl border px-4">{archived.map(row)}</ul>
        </section>
      )}
      <PersonHistory
        workspaceId={workspace.id}
        person={history?.person ?? null}
        onClose={() => setHistory(null)}
        returnFocusTo={history?.trigger ?? null}
      />
    </>
  );
}
