import {
  createMerchantInputSchema,
  hasRole,
  normalizeName,
  type CreateMerchantInput,
  type Merchant,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ellipsis, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  useCreateMerchant,
  useDeleteMerchant,
  useMerchants,
  useUpdateMerchant,
} from '@/features/merchants/use-merchants';
import { TILE_LIST, TILE_ROW } from '@/features/view-mode/row-styles';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const LIST_TITLE_ID = 'merchants-title';

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
 * The name form, for a new merchant and for renaming one. Inside a dialog: mounted on each
 * opening, so it starts with the name given and without errors.
 */
function NameForm({
  id,
  label,
  initial,
  pending,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  id: string;
  label: string;
  initial: string;
  pending: boolean;
  error: unknown;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState } = useForm<CreateMerchantInput>({
    resolver: zodResolver(createMerchantInputSchema),
    defaultValues: { name: initial },
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => void handleSubmit(({ name }) => onSubmit(name))(event)}
    >
      <FormField id={id} label={label} error={formState.errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      {Boolean(error) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function NewMerchantForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const create = useCreateMerchant(workspaceId);
  return (
    <NameForm
      id="new-merchant-name"
      label="Nome"
      initial=""
      pending={create.isPending}
      error={create.error}
      submitLabel={create.isPending ? 'Adicionando…' : 'Adicionar'}
      onSubmit={(name) =>
        create.mutate(
          { name },
          {
            onSuccess: () => {
              toast.success('Estabelecimento adicionado');
              onDone();
            },
          },
        )
      }
      onCancel={onDone}
    />
  );
}

function RenameForm({
  workspaceId,
  merchant,
  onDone,
}: {
  workspaceId: string;
  merchant: Merchant;
  onDone: () => void;
}) {
  const update = useUpdateMerchant(workspaceId);
  return (
    <NameForm
      id={`rename-${merchant.id}`}
      label={`Novo nome para ${merchant.name}`}
      initial={merchant.name}
      pending={update.isPending}
      error={update.error}
      submitLabel={update.isPending ? 'Salvando…' : 'Salvar'}
      onSubmit={(name) =>
        update.mutate(
          { id: merchant.id, name },
          {
            onSuccess: () => {
              toast.success('Estabelecimento renomeado');
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
 * One merchant and, for EDITORs, what can be done with it in a menu (ADR 0036). Only an archived
 * one that nothing uses is offered for deletion (ADR 0053); one in use stays archived, on the
 * transactions that name it.
 */
function MerchantItem({
  workspaceId,
  merchant,
  canEdit,
}: {
  workspaceId: string;
  merchant: Merchant;
  canEdit: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const update = useUpdateMerchant(workspaceId);
  const remove = useDeleteMerchant(workspaceId);
  const { name } = merchant;
  const setArchived = (archived: boolean) =>
    void confirmWith(
      update.mutateAsync({ id: merchant.id, archived }),
      archived ? 'Estabelecimento arquivado' : 'Estabelecimento reativado',
    );
  const confirmDelete = () =>
    void confirmWith(remove.mutateAsync(merchant.id), 'Estabelecimento excluído').then(() =>
      // The row is gone, and with it the button that had the focus: go to the list's title.
      document.getElementById(LIST_TITLE_ID)?.focus(),
    );

  return (
    <li className={TILE_ROW}>
      <span className="min-w-0 break-words">{name}</span>
      {canEdit && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={actionsRef}
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${name}`}
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {merchant.archived ? (
                <>
                  <DropdownMenuItem disabled={update.isPending} onSelect={() => setArchived(false)}>
                    Reativar
                  </DropdownMenuItem>
                  {!merchant.inUse && (
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
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>Renomear</DropdownMenuItem>
                  <DropdownMenuItem disabled={update.isPending} onSelect={() => setArchived(true)}>
                    Arquivar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ResponsiveDialog
            open={renaming}
            onOpenChange={setRenaming}
            returnFocusTo={actionsRef}
            title="Renomear estabelecimento"
            description="Os lançamentos com este estabelecimento passam a mostrar o novo nome."
          >
            <RenameForm
              workspaceId={workspaceId}
              merchant={merchant}
              onDone={() => setRenaming(false)}
            />
          </ResponsiveDialog>
          <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                actionsRef.current?.focus();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  O estabelecimento deixa de existir neste espaço. Não é possível desfazer.
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

function MerchantList({
  workspaceId,
  merchants,
  canEdit,
}: {
  workspaceId: string;
  merchants: Merchant[];
  canEdit: boolean;
}) {
  return (
    <ul className={TILE_LIST}>
      {merchants.map((merchant) => (
        <MerchantItem
          key={merchant.id}
          workspaceId={workspaceId}
          merchant={merchant}
          canEdit={canEdit}
        />
      ))}
    </ul>
  );
}

/** A name matches when it contains what was typed, ignoring case and accents. */
const matches = (merchant: Merchant, search: string) =>
  normalizeName(merchant.name).includes(normalizeName(search));

export function MerchantsPage() {
  const workspace = useCurrentWorkspace();
  const merchants = useMerchants(workspace.id);
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const all = merchants.data ?? [];
  const searching = normalizeName(search) !== '';
  const shown = searching ? all.filter((merchant) => matches(merchant, search)) : all;
  const active = shown.filter((merchant) => !merchant.archived);
  const archived = shown.filter((merchant) => merchant.archived);
  // Beside "Ativos": the active ones only; the archived are listed apart.
  const activeCount = all.filter((merchant) => !merchant.archived).length;
  const count = `${activeCount} ${activeCount === 1 ? 'estabelecimento' : 'estabelecimentos'}`;

  return (
    <>
      <PageHeader
        title="Estabelecimentos"
        description="Onde você compra ou quem paga você. Escolha um no lançamento, em Mais opções. Um estabelecimento em uso não é excluído, só arquivado."
      >
        {/* At the top, so adding never needs scrolling past a long list. */}
        {canEdit && merchants.isSuccess && (
          <div className="flex flex-wrap gap-2">
            <Button ref={newButton} onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Novo estabelecimento
            </Button>
          </div>
        )}
        {merchants.isSuccess && all.length > 0 && (
          <FormField id="merchant-search" label="Buscar estabelecimento">
            <Input
              type="search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </FormField>
        )}
      </PageHeader>
      {canEdit && (
        <ResponsiveDialog
          open={creating}
          onOpenChange={setCreating}
          returnFocusTo={newButton}
          title="Novo estabelecimento"
          description="Uma loja, um serviço ou quem paga você, como Mercado Bom Preço ou Netflix."
        >
          <NewMerchantForm workspaceId={workspace.id} onDone={() => setCreating(false)} />
        </ResponsiveDialog>
      )}
      <QueryState queries={[merchants]} />
      {merchants.isSuccess &&
        (all.length === 0 ? (
          // Says what is missing and where it also comes from; the button is already on screen.
          <div className="grid gap-1 rounded-xl border border-dashed p-5">
            <p>Nenhum estabelecimento ainda.</p>
            <p className="text-muted-foreground">
              Eles também são criados no lançamento, em Mais opções, com “Adicionar”.
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
                {searching
                  ? `Nenhum estabelecimento ativo com “${search.trim()}”.`
                  : 'Nenhum estabelecimento ativo.'}
              </p>
            ) : (
              <MerchantList workspaceId={workspace.id} merchants={active} canEdit={canEdit} />
            )}
            {archived.length > 0 && (
              <div className="grid gap-2">
                <h3 className="text-muted-foreground font-medium">Arquivados</h3>
                <p className="text-muted-foreground text-sm">
                  Continuam nos lançamentos antigos, mas não aparecem para os novos.
                </p>
                <MerchantList workspaceId={workspace.id} merchants={archived} canEdit={canEdit} />
              </div>
            )}
          </section>
        ))}
    </>
  );
}
