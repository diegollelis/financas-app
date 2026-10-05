import {
  createInvitationInputSchema,
  type CreateInvitationInput,
  type Workspace,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { ListSkeleton, QueryState } from '@/components/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { roleLabels } from '@/features/workspaces/roles';
import {
  useCreateInvitation,
  useInvitations,
  useMembers,
  useRevokeInvitation,
} from '@/features/workspaces/use-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const dateFormat = new Intl.DateTimeFormat('pt-BR');

function Members({ workspaceId }: { workspaceId: string }) {
  const members = useMembers(workspaceId);

  return (
    <>
      <QueryState queries={[members]} skeleton={<ListSkeleton rows={2} />} />
      {members.isSuccess && (
        <ul aria-label="Membros do espaço" className="grid gap-1">
          {members.data.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                {member.name} <span className="text-muted-foreground">({member.email})</span>
              </span>
              <Badge variant="secondary">{roleLabels[member.role]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function InviteForm({ workspaceId }: { workspaceId: string }) {
  const createInvitation = useCreateInvitation(workspaceId);
  const { register, handleSubmit, formState, reset } = useForm<
    z.input<typeof createInvitationInputSchema>,
    unknown,
    CreateInvitationInput
  >({
    resolver: zodResolver(createInvitationInputSchema),
    defaultValues: { email: '', role: 'EDITOR' },
  });
  const submit = (input: CreateInvitationInput) =>
    createInvitation.mutate(input, { onSuccess: () => reset() });

  return (
    <form noValidate className="grid gap-3" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField id="invite-email" label="E-mail da pessoa" error={formState.errors.email?.message}>
        <Input type="email" autoComplete="off" {...register('email')} />
      </FormField>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm font-medium">Acesso</legend>
        <label className="flex items-center gap-2">
          <input type="radio" value="EDITOR" {...register('role')} /> Pode editar
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" value="VIEWER" {...register('role')} /> Só visualizar
        </label>
      </fieldset>
      {createInvitation.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(createInvitation.error)}
        </p>
      )}
      {createInvitation.isSuccess && (
        <p role="status">Convite enviado para {createInvitation.data.email}.</p>
      )}
      <Button type="submit" disabled={createInvitation.isPending}>
        {createInvitation.isPending ? 'Enviando…' : 'Enviar convite'}
      </Button>
    </form>
  );
}

function PendingInvitations({ workspaceId }: { workspaceId: string }) {
  const invitations = useInvitations(workspaceId, true);
  const revoke = useRevokeInvitation(workspaceId);

  if (!invitations.isSuccess || invitations.data.length === 0) return null;
  return (
    <section aria-labelledby="pending-title" className="grid gap-2">
      <h3 id="pending-title" className="font-medium">
        Convites pendentes
      </h3>
      <ul className="grid gap-1">
        {invitations.data.map((invitation) => (
          <li key={invitation.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              {invitation.email}{' '}
              <span className="text-muted-foreground">
                ({roleLabels[invitation.role]}, vale até{' '}
                {dateFormat.format(new Date(invitation.expiresAt))})
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Cancelar convite de ${invitation.email}`}
              onClick={() => revoke.mutate(invitation.id)}
              disabled={revoke.isPending}
            >
              Cancelar
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Who can be invited and how: the OWNER of a shared workspace (ADR 0027). */
function Sharing({ workspace }: { workspace: Workspace }) {
  if (workspace.isPersonal) {
    return (
      <p className="text-muted-foreground">
        Este é o seu espaço pessoal: só você tem acesso. Para dividir finanças com alguém, crie um
        espaço compartilhado em Seus espaços.
      </p>
    );
  }
  if (workspace.role !== 'OWNER') return null;
  return (
    <section aria-labelledby="invite-title" className="grid gap-3">
      <h2 id="invite-title" className="font-medium">
        Convidar alguém
      </h2>
      <InviteForm workspaceId={workspace.id} />
      <PendingInvitations workspaceId={workspace.id} />
    </section>
  );
}

export function WorkspacePage() {
  const workspace = useCurrentWorkspace();

  return (
    <>
      <PageHeader title="Membros" description={`Seu acesso: ${roleLabels[workspace.role]}`} />
      <Members workspaceId={workspace.id} />
      <Sharing workspace={workspace} />
    </>
  );
}
