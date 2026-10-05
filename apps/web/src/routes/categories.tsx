import {
  createCategoryInputSchema,
  hasRole,
  type Category,
  type TransactionType,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/categories/use-categories';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';

/** Only the name is typed in the forms; the type comes from the section. */
const nameSchema = createCategoryInputSchema.pick({ name: true });
type NameInput = z.infer<typeof nameSchema>;

const sections: { type: TransactionType; title: string; singular: string }[] = [
  { type: 'CREDIT', title: 'Créditos', singular: 'crédito' },
  { type: 'DEBIT', title: 'Débitos', singular: 'débito' },
];

function AddCategoryForm({
  workspaceId,
  type,
  singular,
}: {
  workspaceId: string;
  type: TransactionType;
  singular: string;
}) {
  const create = useCreateCategory(workspaceId);
  const { register, handleSubmit, formState, reset } = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: '' },
  });
  const submit = ({ name }: NameInput) =>
    create.mutate({ name, type }, { onSuccess: () => reset() });

  return (
    <form noValidate className="grid gap-2" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField
        id={`new-category-${type}`}
        label={`Nova categoria de ${singular}`}
        error={formState.errors.name?.message}
      >
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      {create.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(create.error)}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={create.isPending}>
        {create.isPending ? 'Adicionando…' : 'Adicionar'}
      </Button>
    </form>
  );
}

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
    update.mutate({ id: category.id, name }, { onSuccess: onDone });

  return (
    <form noValidate className="grid gap-2" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField
        id={`rename-${category.id}`}
        label={`Novo nome para ${category.name}`}
        error={formState.errors.name?.message}
      >
        <Input autoComplete="off" autoFocus {...register('name')} />
      </FormField>
      {update.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(update.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          Salvar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * One category and what can be done with it. Deleting is offered only once it is archived: two
 * deliberate steps, and the natural path for a category in use, which can only be archived.
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
  const update = useUpdateCategory(workspaceId);
  const remove = useDeleteCategory(workspaceId);
  const error = update.error ?? remove.error;

  if (renaming) {
    return (
      <li>
        <RenameForm
          workspaceId={workspaceId}
          category={category}
          onDone={() => setRenaming(false)}
        />
      </li>
    );
  }
  return (
    <li className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0">{category.name}</span>
        {canEdit && (
          <span className="flex shrink-0 gap-1">
            {category.archived ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Reativar ${category.name}`}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: category.id, archived: false })}
                >
                  Reativar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Excluir ${category.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(category.id)}
                >
                  Excluir
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Renomear ${category.name}`}
                  onClick={() => setRenaming(true)}
                >
                  Renomear
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Arquivar ${category.name}`}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: category.id, archived: true })}
                >
                  Arquivar
                </Button>
              </>
            )}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(error)}
        </p>
      )}
    </li>
  );
}

function CategorySection({
  workspaceId,
  type,
  title,
  singular,
  categories,
  canEdit,
}: (typeof sections)[number] & {
  workspaceId: string;
  categories: Category[];
  canEdit: boolean;
}) {
  const active = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);
  const titleId = `categories-${type}`;

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <h2 id={titleId} className="font-medium">
        {title}
      </h2>
      {active.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma categoria ativa.</p>
      ) : (
        <ul className="grid gap-1">
          {active.map((category) => (
            <CategoryItem
              key={category.id}
              workspaceId={workspaceId}
              category={category}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
      {canEdit && <AddCategoryForm workspaceId={workspaceId} type={type} singular={singular} />}
      {archived.length > 0 && (
        <div className="grid gap-1">
          <h3 className="text-muted-foreground">Arquivadas</h3>
          <p className="text-muted-foreground text-xs">
            Continuam nos lançamentos antigos, mas não aparecem para os novos.
          </p>
          <ul className="text-muted-foreground grid gap-1">
            {archived.map((category) => (
              <CategoryItem
                key={category.id}
                workspaceId={workspaceId}
                category={category}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function CategoriesPage() {
  const workspace = useCurrentWorkspace();
  const categories = useCategories(workspace.id);

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Classificam os lançamentos. Uma categoria em uso não é excluída, só arquivada."
      />
      <QueryState queries={[categories]} />
      {categories.isSuccess &&
        sections.map((section) => (
          <CategorySection
            key={section.type}
            {...section}
            workspaceId={workspace.id}
            categories={categories.data.filter((category) => category.type === section.type)}
            canEdit={hasRole(workspace.role, 'EDITOR')}
          />
        ))}
    </>
  );
}
