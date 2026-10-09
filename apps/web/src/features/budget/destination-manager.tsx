import { budgetDestinationNameSchema, type BudgetDestination } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import {
  useBudgetDestinations,
  useCreateBudgetDestination,
  useUpdateBudgetDestination,
} from './use-budget-destinations';

const nameSchema = z.object({ name: budgetDestinationNameSchema });
type NameInput = z.infer<typeof nameSchema>;

/** A name typed and sent: for a new destination, or a new name for one. */
function NameForm({
  id,
  label,
  initial = '',
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  id: string;
  label: string;
  initial?: string;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  /** Resolves once saved, to clear the field. */
  onSubmit: (name: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const { register, handleSubmit, formState, reset } = useForm<NameInput>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: initial },
  });
  const submit = ({ name }: NameInput) =>
    onSubmit(name).then(
      () => reset({ name: '' }),
      () => undefined, // Shown through `error`.
    );
  return (
    <form
      noValidate
      className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => {
        // It sits next to the budget form in the same dialog: keep the submit to itself.
        event.stopPropagation();
        void handleSubmit(submit)(event);
      }}
    >
      <FormField id={id} label={label} error={formState.errors.name?.message}>
        <Input autoComplete="off" {...register('name')} />
      </FormField>
      <div className="flex gap-2 sm:mt-[1.375rem]">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="outline" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-destructive sm:col-span-2">
          {apiErrorMessage(error)}
        </p>
      )}
    </form>
  );
}

function DestinationRow({
  workspaceId,
  destination,
}: {
  workspaceId: string;
  destination: BudgetDestination;
}) {
  const update = useUpdateBudgetDestination(workspaceId);
  const [renaming, setRenaming] = useState(false);
  const { name } = destination;
  const setArchived = (archived: boolean) =>
    update.mutate(
      { id: destination.id, archived },
      {
        onSuccess: () => toast.success(archived ? 'Destino arquivado' : 'Destino reativado'),
        onError: (error) => toast.error(apiErrorMessage(error)),
      },
    );

  if (renaming) {
    return (
      <li className="py-2">
        <NameForm
          id={`rename-destination-${destination.id}`}
          label={`Novo nome para ${name}`}
          initial={name}
          submitLabel={update.isPending ? 'Salvando…' : 'Salvar'}
          pending={update.isPending}
          error={update.error}
          onSubmit={(newName) =>
            update.mutateAsync({ id: destination.id, name: newName }).then(() => {
              toast.success('Destino renomeado');
              setRenaming(false);
            })
          }
          onCancel={() => setRenaming(false)}
        />
      </li>
    );
  }
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-1">
      <span className="min-w-0 break-words">
        {name}
        {destination.archived && <span className="text-muted-foreground"> (arquivado)</span>}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${name}`}>
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {destination.archived ? (
            <DropdownMenuItem disabled={update.isPending} onSelect={() => setArchived(false)}>
              Reativar
            </DropdownMenuItem>
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
    </li>
  );
}

/**
 * The saving destinations of the workspace (ADR 0047), managed inside the budget dialog: a new
 * one comes with its debit category of the same name; renaming and archiving change the
 * category too. Despesas is fixed and not listed. Any change reloads the budget, whose form
 * then starts again from the saved values.
 */
export function DestinationManager({ workspaceId }: { workspaceId: string }) {
  const destinations = useBudgetDestinations(workspaceId);
  const create = useCreateBudgetDestination(workspaceId);
  const saving = destinations.data?.filter((destination) => destination.kind === 'SAVINGS') ?? [];

  return (
    <details className="group rounded-xl border px-4 py-2">
      <summary className="cursor-pointer py-2 font-medium">Gerenciar destinos de guardar</summary>
      <div className="grid gap-3 pb-2">
        <p className="text-muted-foreground text-sm">
          Cada destino tem uma categoria de débito com o mesmo nome: um lançamento nela é uma
          aplicação no destino.
        </p>
        {saving.length > 0 && (
          <ul className="divide-y">
            {saving.map((destination) => (
              <DestinationRow
                key={destination.id}
                workspaceId={workspaceId}
                destination={destination}
              />
            ))}
          </ul>
        )}
        <NameForm
          id="new-destination"
          label="Novo destino"
          submitLabel={create.isPending ? 'Adicionando…' : 'Adicionar'}
          pending={create.isPending}
          error={create.error}
          onSubmit={(name) =>
            create.mutateAsync({ name }).then(() => toast.success('Destino adicionado'))
          }
        />
      </div>
    </details>
  );
}
