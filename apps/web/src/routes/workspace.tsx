import {
  createInvitationInputSchema,
  type CreateInvitationInput,
  type Workspace,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { roleLabels } from '@/features/workspaces/roles';
import {
  useCreateInvitation,
  useInvitations,
  useMembers,
  useRevokeInvitation,
  useWorkspace,
} from '@/features/workspaces/use-workspace';
import { ApiError } from '@/lib/api';
import { apiErrorMessage } from '@/lib/error-message';

const dateFormat = new Intl.DateTimeFormat('pt-BR');

function Members({ workspaceId }: { workspaceId: string }) {
  const members = useMembers(workspaceId);

  return (
    <section aria-labelledby="members-title" className="grid gap-2">
      <h2 id="members-title" className="font-medium">
        Membros
      </h2>
      {members.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {members.isError && <p className="text-destructive">{apiErrorMessage(members.error)}</p>}
      {members.isSuccess && (
        <ul className="grid gap-1">
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
    </section>
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
        espaço compartilhado na página inicial.
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
  const { workspaceId = '' } = useParams();
  const workspace = useWorkspace(workspaceId);

  return (
    <main className="flex min-h-svh justify-center p-6">
      <Card className="w-full max-w-lg self-start">
        <CardHeader>
          <Link to="/" className="text-muted-foreground text-sm hover:underline">
            ← Início
          </Link>
          {workspace.isSuccess && (
            <>
              <CardTitle>
                <h1>{workspace.data.name}</h1>
              </CardTitle>
              <CardDescription>Seu acesso: {roleLabels[workspace.data.role]}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="grid gap-6 text-sm">
          {workspace.isPending && <p className="text-muted-foreground">Carregando…</p>}
          {workspace.isError &&
            (workspace.error instanceof ApiError && workspace.error.status === 404 ? (
              // Same answer for "does not exist" and "not yours" (ADR 0025).
              <p role="alert">Espaço não encontrado.</p>
            ) : (
              <p role="alert" className="text-destructive">
                {apiErrorMessage(workspace.error)}
              </p>
            ))}
          {workspace.isSuccess && (
            <>
              <nav aria-label="Cadastros do espaço" className="flex gap-4">
                <Link
                  to={`/espacos/${workspaceId}/lancamentos`}
                  className="font-medium hover:underline"
                >
                  Lançamentos →
                </Link>
                <Link
                  to={`/espacos/${workspaceId}/orcamento`}
                  className="font-medium hover:underline"
                >
                  Orçamento →
                </Link>
                <Link
                  to={`/espacos/${workspaceId}/categorias`}
                  className="font-medium hover:underline"
                >
                  Categorias →
                </Link>
              </nav>
              <Members workspaceId={workspaceId} />
              <Sharing workspace={workspace.data} />
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
