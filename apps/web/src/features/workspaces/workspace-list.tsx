import { createWorkspaceInputSchema, type CreateWorkspaceInput } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { FormField } from '@/components/form-field';
import { ListSkeleton, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import { roleLabels } from './roles';
import { useCreateWorkspace } from './use-workspace';
import { useWorkspaces } from './use-workspaces';

function CreateWorkspaceForm() {
  const createWorkspace = useCreateWorkspace();
  const { register, handleSubmit, formState, reset } = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceInputSchema),
    defaultValues: { name: '' },
  });
  const submit = (input: CreateWorkspaceInput) =>
    createWorkspace.mutate(input, { onSuccess: () => reset() });

  // One column on the phone; field and button side by side from sm.
  return (
    <form
      noValidate
      className="grid gap-2 pt-2 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => void handleSubmit(submit)(event)}
    >
      <FormField
        id="workspace-name"
        label="Novo espaço compartilhado"
        error={formState.errors.name?.message}
      >
        <Input placeholder="Ex.: Casa" {...register('name')} />
      </FormField>
      <Button
        type="submit"
        variant="outline"
        // Lines up with the input: the label above it is 14px tall plus the 8px gap.
        className="sm:mt-[1.375rem]"
        disabled={createWorkspace.isPending}
      >
        Criar espaço
      </Button>
      {createWorkspace.isError && (
        <p role="alert" className="text-destructive sm:col-span-2">
          {apiErrorMessage(createWorkspace.error)}
        </p>
      )}
    </form>
  );
}

export function WorkspaceList() {
  const workspaces = useWorkspaces();

  return (
    <section aria-labelledby="workspaces-title" className="grid gap-4">
      <h2 id="workspaces-title" className="font-medium">
        Seus espaços
      </h2>
      <QueryState queries={[workspaces]} skeleton={<ListSkeleton rows={2} />} />
      {workspaces.isSuccess && (
        <ul className="grid gap-2">
          {workspaces.data.map((workspace) => (
            <li key={workspace.id}>
              {/* The whole row is the link: a large target, straight to the month (ADR 0036). */}
              <Link
                to={`/espacos/${workspace.id}/painel`}
                className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-14 items-center gap-3 rounded-lg border px-4 py-2 outline-none focus-visible:ring-3"
              >
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{workspace.name}</span>
                  {workspace.isPersonal && (
                    <span className="text-muted-foreground text-sm">Só seu</span>
                  )}
                </span>
                <Badge variant="secondary">{roleLabels[workspace.role]}</Badge>
                <ChevronRight aria-hidden className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateWorkspaceForm />
    </section>
  );
}
