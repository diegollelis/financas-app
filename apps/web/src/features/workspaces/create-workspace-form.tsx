import {
  createWorkspaceInputSchema,
  type CreateWorkspaceInput,
  type Workspace,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/error-message';
import { useCreateWorkspace } from './use-workspace';

/** Inside the "Novo espaço compartilhado" dialog, mounted on each opening. */
export function CreateWorkspaceForm({
  onCreated,
  onCancel,
}: {
  onCreated: (workspace: Workspace) => void;
  onCancel: () => void;
}) {
  const createWorkspace = useCreateWorkspace();
  const { register, handleSubmit, formState } = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceInputSchema),
    defaultValues: { name: '' },
  });
  const submit = (input: CreateWorkspaceInput) =>
    createWorkspace.mutate(input, { onSuccess: onCreated });

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField id="workspace-name" label="Nome do espaço" error={formState.errors.name?.message}>
        <Input placeholder="Ex.: Casa" autoComplete="off" {...register('name')} />
      </FormField>
      {createWorkspace.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(createWorkspace.error)}
        </p>
      )}
      <div className="grid gap-2 sm:flex sm:flex-row-reverse sm:justify-start">
        <Button type="submit" disabled={createWorkspace.isPending}>
          {createWorkspace.isPending ? 'Criando…' : 'Criar espaço'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
