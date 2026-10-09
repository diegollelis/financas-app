import {
  normalizeName,
  type Category,
  type CopyCategoriesResult,
  type TransactionType,
  type Workspace,
} from '@financas/shared';
import { useId, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/lib/error-message';
import { useCategories, useCopyCategories } from './use-categories';

/** The same category for the copy (ADR 0048): same type, same name ignoring case and accents. */
const sameKey = (category: Pick<Category, 'type' | 'name'>) =>
  `${category.type}:${normalizeName(category.name)}`;

const groups: { type: TransactionType; title: string }[] = [
  { type: 'CREDIT', title: 'Créditos' },
  { type: 'DEBIT', title: 'Débitos' },
];

const copiedMessage = ({ copied }: CopyCategoriesResult) =>
  copied === 0
    ? 'Nenhuma categoria copiada: todas já existiam aqui'
    : `${copied} ${copied === 1 ? 'categoria copiada' : 'categorias copiadas'}`;

/**
 * The source's new categories, each with a checkbox, all checked from the start. Those already
 * here are only named, folded away: often they are most of the list, and the new ones would be
 * lost among them.
 */
function SourcePicker({
  workspaceId,
  source,
  here,
  onDone,
  onCancel,
}: {
  workspaceId: string;
  source: Workspace;
  here: Category[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const categories = useCategories(source.id);
  const copy = useCopyCategories(workspaceId);
  const idPrefix = useId();
  // null: every new one, until the person changes something.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  if (!categories.isSuccess) {
    return (
      <QueryState
        queries={[categories]}
        skeleton={
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8" />
            ))}
          </div>
        }
      />
    );
  }

  const taken = new Set(here.map(sameKey));
  // Archived ones and a saving destination's are never copied (ADR 0048).
  const candidates = categories.data.filter(
    (category) => !category.archived && !category.destinationId,
  );
  const fresh = candidates.filter((category) => !taken.has(sameKey(category)));
  const existing = candidates.filter((category) => taken.has(sameKey(category)));
  const chosen = picked ?? new Set(fresh.map((category) => category.id));
  const allChosen = fresh.length > 0 && fresh.every((category) => chosen.has(category.id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  if (candidates.length === 0) {
    return <p>{source.name} não tem categorias ativas para copiar.</p>;
  }
  if (fresh.length === 0) {
    return <p>Todas as categorias de {source.name} já existem aqui.</p>;
  }
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        copy.mutate(
          { sourceWorkspaceId: source.id, categoryIds: [...chosen] },
          {
            onSuccess: (result) => {
              toast.success(copiedMessage(result));
              onDone();
            },
          },
        );
      }}
    >
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          setPicked(allChosen ? new Set() : new Set(fresh.map((category) => category.id)))
        }
      >
        {allChosen ? 'Desmarcar todas' : 'Marcar todas'}
      </Button>
      {groups.map(({ type, title }) => {
        const items = fresh.filter((category) => category.type === type);
        if (items.length === 0) return null;
        return (
          <fieldset key={type} className="grid gap-1">
            <legend className="mb-1 font-medium">{title}</legend>
            <ul className="grid">
              {items.map((category) => {
                const id = `${idPrefix}-${category.id}`;
                return (
                  <li key={category.id}>
                    {/* The whole row is the target: 44px on the phone (ADR 0036). */}
                    <label
                      htmlFor={id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 md:min-h-9"
                    >
                      <Checkbox
                        id={id}
                        checked={chosen.has(category.id)}
                        onCheckedChange={(checked) => toggle(category.id, checked === true)}
                      />
                      {category.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
      {existing.length > 0 && (
        <details className="rounded-xl border px-4 py-2">
          <summary className="cursor-pointer py-2 font-medium">
            Já existem aqui ({existing.length})
          </summary>
          <p className="text-muted-foreground pb-2">
            {existing.map((category) => category.name).join(', ')}.
          </p>
        </details>
      )}
      {copy.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(copy.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={chosen.size === 0 || copy.isPending}>
          {copy.isPending
            ? 'Copiando…'
            : `Copiar ${chosen.size} ${chosen.size === 1 ? 'categoria' : 'categorias'}`}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * "Copiar de outro espaço" (ADR 0048): the person picks one of their other workspaces and which
 * of its categories to create here. The API checks the membership and the rules again.
 */
export function CopyCategoriesDialog({
  workspaceId,
  workspaceName,
  sources,
  here,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  workspaceId: string;
  workspaceName: string;
  /** The person's other workspaces. */
  sources: Workspace[];
  /** This workspace's categories, archived too: a name already here is not copied. */
  here: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: RefObject<HTMLElement | null>;
}) {
  const [sourceId, setSourceId] = useState(sources.length === 1 ? sources[0]!.id : '');
  const source = sources.find((workspace) => workspace.id === sourceId);
  const selectId = useId();
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title="Copiar de outro espaço"
      description={`As categorias escolhidas são criadas em ${workspaceName} com o mesmo nome e tipo. As arquivadas e as de destinos do orçamento não são copiadas.`}
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor={selectId}>Copiar de</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger id={selectId} className="w-full">
              <SelectValue placeholder="Escolha um espaço" />
            </SelectTrigger>
            <SelectContent position="popper">
              {sources.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {source ? (
          <SourcePicker
            // Another source starts with its own new ones checked.
            key={source.id}
            workspaceId={workspaceId}
            source={source}
            here={here}
            onDone={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        )}
      </div>
    </ResponsiveDialog>
  );
}
