import {
  createCategoryInputSchema,
  hasRole,
  normalizeName,
  type Category,
  type CreateCategoryInput,
  type TransactionType,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Ellipsis, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { CopyCategoriesDialog } from '@/features/categories/copy-categories-dialog';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/categories/use-categories';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
import { apiErrorMessage } from '@/lib/error-message';

/** Only the name is typed in the forms; the type comes from the section. */
const nameSchema = createCategoryInputSchema.pick({ name: true });
type NameInput = z.infer<typeof nameSchema>;

const sections: { type: TransactionType; title: string; singular: string }[] = [
  { type: 'CREDIT', title: 'Créditos', singular: 'crédito' },
  { type: 'DEBIT', title: 'Débitos', singular: 'débito' },
];

const sectionTitleId = (type: TransactionType) => `categories-${type}`;

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

const typeOptions = [
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT', label: 'Crédito' },
] as const;

/** Inside the dialog: mounted on each opening, so it starts empty and without errors. */
function NewCategoryForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const create = useCreateCategory(workspaceId);
  const { register, handleSubmit, formState, control } = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategoryInputSchema),
    // Debit: most categories are of spending.
    defaultValues: { name: '', type: 'DEBIT' },
  });
  const submit = (input: CreateCategoryInput) =>
    create.mutate(input, {
      onSuccess: () => {
        toast.success('Categoria adicionada');
        onDone();
      },
    });

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <SegmentedControl
            label="Tipo"
            options={typeOptions}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <FormField id="new-category-name" label="Nome" error={formState.errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      {create.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(create.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Adicionando…' : 'Adicionar'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Inside the rename dialog: mounted on each opening, so no error is left from the last one. */
function RenameForm({
  workspaceId,
  category,
  onDone,
}: {
  workspaceId: string;
  category: Category;
  onDone: () => void;
}) {
  const update = useUpdateCategory(workspaceId);
  const { register, handleSubmit, formState } = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: category.name },
  });
  const submit = ({ name }: NameInput) =>
    update.mutate(
      { id: category.id, name },
      {
        onSuccess: () => {
          toast.success('Categoria renomeada');
          onDone();
        },
      },
    );

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField
        id={`rename-${category.id}`}
        label={`Novo nome para ${category.name}`}
        error={formState.errors.name?.message}
      >
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      {update.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(update.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * One category and, for EDITORs, what can be done with it in a menu (ADR 0036). Deleting is
 * offered only once it is archived: two deliberate steps, and the natural path for a category
 * in use, which can only be archived. A saving destination's category is marked and has no
 * menu: it changes with its destination, in the budget (ADR 0047).
 */
function CategoryItem({
  workspaceId,
  category,
  canEdit,
}: {
  workspaceId: string;
  category: Category;
  canEdit: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const update = useUpdateCategory(workspaceId);
  const remove = useDeleteCategory(workspaceId);
  const { name } = category;
  const setArchived = (archived: boolean) =>
    void confirmWith(
      update.mutateAsync({ id: category.id, archived }),
      archived ? 'Categoria arquivada' : 'Categoria reativada',
    );
  const confirmDelete = () =>
    void confirmWith(remove.mutateAsync(category.id), 'Categoria excluída').then(() =>
      // The row is gone, and with it the button that had the focus: go to its section.
      document.getElementById(sectionTitleId(category.type))?.focus(),
    );

  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-1.5">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 break-words">
        {name}
        {category.destinationId && <Badge variant="secondary">Destino do orçamento</Badge>}
      </span>
      {canEdit && !category.destinationId && (
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
              {category.archived ? (
                <>
                  <DropdownMenuItem disabled={update.isPending} onSelect={() => setArchived(false)}>
                    Reativar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirmingDelete(true)}
                  >
                    Excluir
                  </DropdownMenuItem>
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
            title="Renomear categoria"
            description="Os lançamentos com esta categoria passam a mostrar o novo nome."
          >
            <RenameForm
              workspaceId={workspaceId}
              category={category}
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
                  A categoria deixa de existir neste espaço. Não é possível desfazer.
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

function CategoryList({
  workspaceId,
  categories,
  canEdit,
}: {
  workspaceId: string;
  categories: Category[];
  canEdit: boolean;
}) {
  return (
    <ul className="divide-y rounded-xl border px-4">
      {categories.map((category) => (
        <CategoryItem
          key={category.id}
          workspaceId={workspaceId}
          category={category}
          canEdit={canEdit}
        />
      ))}
    </ul>
  );
}

/** A name matches when it contains what was typed, ignoring case and accents. */
const matches = (category: Category, search: string) =>
  normalizeName(category.name).includes(normalizeName(search));

function CategorySection({
  workspaceId,
  type,
  title,
  singular,
  categories,
  search,
  canEdit,
}: (typeof sections)[number] & {
  workspaceId: string;
  categories: Category[];
  search: string;
  canEdit: boolean;
}) {
  const searching = normalizeName(search) !== '';
  const shown = searching ? categories.filter((category) => matches(category, search)) : categories;
  const active = shown.filter((category) => !category.archived);
  const archived = shown.filter((category) => category.archived);
  const titleId = sectionTitleId(type);
  const total = categories.length;
  const count = `${total} ${total === 1 ? 'categoria' : 'categorias'}`;

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        {/* Focusable from script: where focus goes after a delete. */}
        <h2 id={titleId} tabIndex={-1} className="font-medium outline-none">
          {title}
        </h2>
        <p className="text-muted-foreground text-sm tabular-nums">
          {searching ? `${shown.length} de ${count}` : count}
        </p>
      </div>
      {active.length === 0 ? (
        <p className="text-muted-foreground">
          {searching
            ? `Nenhuma categoria de ${singular} ativa com “${search.trim()}”.`
            : `Nenhuma categoria de ${singular} ativa.`}
        </p>
      ) : (
        <CategoryList workspaceId={workspaceId} categories={active} canEdit={canEdit} />
      )}
      {archived.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-muted-foreground font-medium">Arquivadas</h3>
          <p className="text-muted-foreground text-sm">
            Continuam nos lançamentos antigos, mas não aparecem para os novos.
          </p>
          <CategoryList workspaceId={workspaceId} categories={archived} canEdit={canEdit} />
        </div>
      )}
    </section>
  );
}

export function CategoriesPage() {
  const workspace = useCurrentWorkspace();
  const categories = useCategories(workspace.id);
  const workspaces = useWorkspaces();
  const canEdit = hasRole(workspace.role, 'EDITOR');
  // The person's other workspaces: copying needs one (ADR 0048).
  const sources = (workspaces.data ?? []).filter((other) => other.id !== workspace.id);
  const [copyOpen, setCopyOpen] = useState(false);
  const copyButton = useRef<HTMLButtonElement>(null);
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Classificam os lançamentos. Uma categoria em uso não é excluída, só arquivada. As de destino do orçamento mudam junto com o destino, no orçamento do Painel."
      >
        {/* At the top, so adding never needs scrolling past a long list. */}
        {canEdit && categories.isSuccess && (
          <div className="flex flex-wrap gap-2">
            <Button ref={newButton} onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              Nova categoria
            </Button>
            {sources.length > 0 && (
              <Button ref={copyButton} variant="outline" onClick={() => setCopyOpen(true)}>
                <Copy aria-hidden />
                Copiar de outro espaço
              </Button>
            )}
          </div>
        )}
        {categories.isSuccess && (
          <FormField id="category-search" label="Buscar categoria">
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
          title="Nova categoria"
          description="Débito para o que sai, crédito para o que entra."
        >
          <NewCategoryForm workspaceId={workspace.id} onDone={() => setCreating(false)} />
        </ResponsiveDialog>
      )}
      {canEdit && categories.isSuccess && sources.length > 0 && (
        <CopyCategoriesDialog
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          sources={sources}
          here={categories.data}
          open={copyOpen}
          onOpenChange={setCopyOpen}
          returnFocusTo={copyButton}
        />
      )}
      <QueryState queries={[categories]} />
      {categories.isSuccess &&
        sections.map((section) => (
          <CategorySection
            key={section.type}
            {...section}
            workspaceId={workspace.id}
            categories={categories.data.filter((category) => category.type === section.type)}
            search={search}
            canEdit={canEdit}
          />
        ))}
    </>
  );
}
