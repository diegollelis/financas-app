import { createWorkspaceInputSchema, type CreateWorkspaceInput } from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { FormField } from '@/components/form-field';
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

  return (
    <form noValidate className="grid gap-2" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField
        id="workspace-name"
        label="Novo espaço compartilhado"
        error={formState.errors.name?.message}
      >
        <Input placeholder="Ex.: Casa" {...register('name')} />
      </FormField>
      {createWorkspace.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(createWorkspace.error)}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={createWorkspace.isPending}>
        Criar espaço
      </Button>
    </form>
  );
}

export function WorkspaceList() {
  const workspaces = useWorkspaces();

  return (
    <section aria-labelledby="workspaces-title" className="grid gap-3">
      <h2 id="workspaces-title" className="font-medium">
        Seus espaços
      </h2>
      {workspaces.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {workspaces.isError && (
        <p className="text-destructive">Não foi possível carregar os espaços.</p>
      )}
      {workspaces.isSuccess && (
        <ul className="grid gap-1">
          {workspaces.data.map((workspace) => (
            <li key={workspace.id} className="flex items-center justify-between">
              <Link
                to={`/espacos/${workspace.id}/painel`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {workspace.name}
                {workspace.isPersonal && <span className="text-muted-foreground"> (só seu)</span>}
              </Link>
              <Badge variant="secondary">{roleLabels[workspace.role]}</Badge>
            </li>
          ))}
        </ul>
      )}
      <CreateWorkspaceForm />
    </section>
  );
}
