import {
  cardFunctionLabels,
  hasRole,
  normalizeName,
  type Card,
  type UnlinkedCardTransactions,
} from '@financas/shared';
import { Ellipsis, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageActionButton } from '@/components/page-action-button';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SearchInput } from '@/components/search-input';
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
import { CardForm } from '@/features/cards/card-form';
import { bankLabel } from '@/features/cards/card-label';
import { LinkCardsDialog } from '@/features/cards/link-cards-dialog';
import { PayBillDialog } from '@/features/cards/pay-bill-dialog';
import {
  fetchUnlinked,
  useCards,
  useCreateCard,
  useDeleteCard,
  useUpdateCard,
} from '@/features/cards/use-cards';
import { TILE_LIST, TILE_ROW } from '@/features/view-mode/row-styles';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const LIST_TITLE_ID = 'cards-title';

/** "Nubank. Fecha no dia 27 e vence no dia 4.": the bank and, with Crédito, the bill's days. */
const cardLine = (card: Card) =>
  card.closingDay !== null && card.dueDay !== null
    ? `${bankLabel(card)}. Fecha no dia ${card.closingDay} e vence no dia ${card.dueDay}.`
    : `${bankLabel(card)}.`;

/** Toast after a change; mutateAsync, since archiving and deleting move or remove the row. */
function confirmWith(change: Promise<unknown>, message: string) {
  return change.then(
    () => toast.success(message),
    (error: unknown) => toast.error(apiErrorMessage(error)),
  );
}

function EditCardForm({
  workspaceId,
  card,
  onDone,
}: {
  workspaceId: string;
  card: Card;
  onDone: () => void;
}) {
  const update = useUpdateCard(workspaceId);
  return (
    <CardForm
      idPrefix={`edit-${card.id}`}
      initial={card}
      submitLabel={update.isPending ? 'Salvando…' : 'Salvar'}
      pending={update.isPending}
      error={update.error}
      onSubmit={(input) =>
        update.mutate(
          { id: card.id, ...input },
          {
            onSuccess: () => {
              toast.success('Cartão salvo');
              onDone();
            },
          },
        )
      }
      onCancel={onDone}
    />
  );
}

/**
 * One card and, for EDITORs, a menu (ADR 0036): only an archived one that nothing uses is
 * offered for deletion; one in use stays archived, on the transactions that name it.
 */
function CardItem({
  workspaceId,
  card,
  canEdit,
}: {
  workspaceId: string;
  card: Card;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [payingBill, setPayingBill] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const update = useUpdateCard(workspaceId);
  const remove = useDeleteCard(workspaceId);
  const setArchived = (archived: boolean) =>
    void confirmWith(
      update.mutateAsync({ id: card.id, archived }),
      archived ? 'Cartão arquivado' : 'Cartão reativado',
    );
  const confirmDelete = () =>
    void confirmWith(remove.mutateAsync(card.id), 'Cartão excluído').then(() =>
      // The row is gone, and with it the button that had the focus: go to the list's title.
      document.getElementById(LIST_TITLE_ID)?.focus(),
    );

  return (
    <li className={TILE_ROW}>
      <span className="grid min-w-0 gap-0.5 py-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-medium break-words">{card.name}</span>
          {card.functions.map((role) => (
            <Badge key={role} variant="secondary">
              {cardFunctionLabels[role]}
            </Badge>
          ))}
        </span>
        <span className="text-muted-foreground text-sm">{cardLine(card)}</span>
      </span>
      {canEdit && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={actionsRef}
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${card.name}`}
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {card.archived ? (
                <>
                  <DropdownMenuItem disabled={update.isPending} onSelect={() => setArchived(false)}>
                    Reativar
                  </DropdownMenuItem>
                  {!card.inUse && (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setConfirmingDelete(true)}
                    >
                      Excluir
                    </DropdownMenuItem>
                  )}
                </>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => setEditing(true)}>Editar</DropdownMenuItem>
                  {card.functions.includes('CREDIT') && (
                    <DropdownMenuItem onSelect={() => setPayingBill(true)}>
                      Pagar fatura
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled={update.isPending} onSelect={() => setArchived(true)}>
                    Arquivar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ResponsiveDialog
            open={editing}
            onOpenChange={setEditing}
            returnFocusTo={actionsRef}
            title="Editar cartão"
            description="Os lançamentos com este cartão passam a mostrar o novo nome."
          >
            <EditCardForm workspaceId={workspaceId} card={card} onDone={() => setEditing(false)} />
          </ResponsiveDialog>
          {payingBill && (
            <PayBillDialog
              workspaceId={workspaceId}
              cards={[card]}
              fixedCardId={card.id}
              open
              onOpenChange={setPayingBill}
              returnFocusTo={actionsRef}
            />
          )}
          <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                actionsRef.current?.focus();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {card.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  O cartão deixa de existir neste espaço. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={confirmDelete}>
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}

function CardList({
  workspaceId,
  cards,
  canEdit,
}: {
  workspaceId: string;
  cards: Card[];
  canEdit: boolean;
}) {
  return (
    <ul className={TILE_LIST}>
      {cards.map((card) => (
        <CardItem key={card.id} workspaceId={workspaceId} card={card} canEdit={canEdit} />
      ))}
    </ul>
  );
}

/** By its name or its bank, ignoring case and accents. */
const matches = (card: Card, search: string) =>
  [card.name, bankLabel(card)].some((text) => normalizeName(text).includes(normalizeName(search)));

export function CardsPage() {
  const workspace = useCurrentWorkspace();
  const cards = useCards(workspace.id);
  const create = useCreateCard(workspace.id);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  // The first card offers to take the transactions with no card (ADR 0062 note).
  const [offer, setOffer] = useState<{ card: Card; unlinked: UnlinkedCardTransactions } | null>(
    null,
  );
  const all = cards.data ?? [];
  const searching = normalizeName(search) !== '';
  const shown = searching ? all.filter((card) => matches(card, search)) : all;
  const active = shown.filter((card) => !card.archived);
  const archived = shown.filter((card) => card.archived);
  const activeCount = all.filter((card) => !card.archived).length;
  const count = `${activeCount} ${activeCount === 1 ? 'cartão' : 'cartões'}`;

  const added = async (card: Card, first: boolean) => {
    toast.success('Cartão adicionado');
    setCreating(false);
    if (!first) return;
    try {
      const unlinked = await fetchUnlinked(workspace.id);
      const offered = card.functions.some(
        (role) => unlinked[role === 'CREDIT' ? 'credit' : 'debit'] > 0,
      );
      if (offered) setOffer({ card, unlinked });
    } catch {
      // Only an offer: without the counts, the card is there all the same.
    }
  };

  return (
    <>
      <PageHeader
        title="Cartões"
        action={
          canEdit &&
          cards.isSuccess && (
            <PageActionButton ref={newButton} onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Novo cartão
            </PageActionButton>
          )
        }
        description="Os cartões de crédito e débito deste espaço. Num lançamento no Crédito ou no Débito, o cartão é obrigatório. Um cartão em uso não é excluído, só arquivado."
      >
        {cards.isSuccess && all.length > 0 && (
          <SearchInput
            id="card-search"
            label="Buscar cartão"
            placeholder="Nome ou banco"
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
          title="Novo cartão"
          description="Um cartão de crédito, de débito ou os dois, como o cartão múltiplo de um banco."
        >
          <CardForm
            idPrefix="new-card"
            submitLabel={create.isPending ? 'Adicionando…' : 'Adicionar cartão'}
            pending={create.isPending}
            error={create.error}
            onSubmit={(input) => {
              const first = all.length === 0;
              create.mutate(input, { onSuccess: (card) => void added(card, first) });
            }}
            onCancel={() => setCreating(false)}
          />
        </ResponsiveDialog>
      )}
      {offer && (
        <LinkCardsDialog
          workspaceId={workspace.id}
          card={offer.card}
          unlinked={offer.unlinked}
          open
          onOpenChange={(open) => !open && setOffer(null)}
        />
      )}
      <QueryState queries={[cards]} />
      {cards.isSuccess &&
        (all.length === 0 ? (
          // Says what is missing; the button is already on screen.
          <div className="grid gap-1 rounded-xl border border-dashed p-5">
            <p>Nenhum cartão ainda.</p>
            <p className="text-muted-foreground">
              Cadastre os seus cartões para escolher um nos lançamentos no Crédito e no Débito.
            </p>
          </div>
        ) : (
          <section aria-labelledby={LIST_TITLE_ID} className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              {/* Focusable from script: where focus goes after a delete. */}
              <h2 id={LIST_TITLE_ID} tabIndex={-1} className="font-medium outline-none">
                Ativos
              </h2>
              <p className="text-muted-foreground text-sm tabular-nums">
                {searching ? `${active.length} de ${count}` : count}
              </p>
            </div>
            {active.length === 0 ? (
              <p className="text-muted-foreground">
                {searching ? `Nenhum cartão ativo com “${search.trim()}”.` : 'Nenhum cartão ativo.'}
              </p>
            ) : (
              <CardList workspaceId={workspace.id} cards={active} canEdit={canEdit} />
            )}
            {archived.length > 0 && (
              <div className="grid gap-2">
                <h3 className="text-muted-foreground font-medium">Arquivados</h3>
                <p className="text-muted-foreground text-sm">
                  Continuam nos lançamentos antigos, mas não aparecem para os novos.
                </p>
                <CardList workspaceId={workspace.id} cards={archived} canEdit={canEdit} />
              </div>
            )}
          </section>
        ))}
    </>
  );
}
