import {
  createInvitationInputSchema,
  type CreateInvitationInput,
  type InvitationResponse,
  type Workspace,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { ListSkeleton, QueryState } from '@/components/query-state';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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

const accessOptions = [
  { value: 'EDITOR', label: 'Pode editar' },
  { value: 'VIEWER', label: 'Só visualizar' },
] as const;

function Members({ workspaceId }: { workspaceId: string }) {
  const members = useMembers(workspaceId);

  return (
    <>
      <QueryState queries={[members]} skeleton={<ListSkeleton rows={2} />} />
      {members.isSuccess && (
        <ul aria-label="Membros do espaço" className="divide-y rounded-xl border px-4">
          {members.data.map((member) => (
            <li key={member.userId} className="flex min-h-14 items-center gap-3 py-2">
              <span className="grid min-w-0 flex-1">
                <span className="font-medium break-words">{member.name}</span>
                <span className="text-muted-foreground text-sm break-all">{member.email}</span>
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
  const { register, handleSubmit, formState, reset, control } = useForm<
    z.input<typeof createInvitationInputSchema>,
    unknown,
    CreateInvitationInput
  >({
    resolver: zodResolver(createInvitationInputSchema),
    defaultValues: { email: '', role: 'EDITOR' },
  });
  const submit = (input: CreateInvitationInput) =>
    createInvitation.mutate(input, {
      onSuccess: (invitation) => {
        reset();
        toast.success(`Convite enviado para ${invitation.email}`);
      },
    });

  return (
    <form noValidate className="grid gap-4" onSubmit={(event) => void handleSubmit(submit)(event)}>
      <FormField id="invite-email" label="E-mail da pessoa" error={formState.errors.email?.message}>
        <Input type="email" autoComplete="off" {...register('email')} />
      </FormField>
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Acesso
        </p>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <SegmentedControl
              label="Acesso"
              options={accessOptions}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      {createInvitation.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(createInvitation.error)}
        </p>
      )}
      <Button type="submit" className="sm:justify-self-start" disabled={createInvitation.isPending}>
        {createInvitation.isPending ? 'Enviando…' : 'Enviar convite'}
      </Button>
    </form>
  );
}

/** One pending invitation; cancelling it asks first, since the link stops working (ADR 0036). */
function PendingInvitation({
  workspaceId,
  invitation,
}: {
  workspaceId: string;
  invitation: InvitationResponse;
}) {
  const revoke = useRevokeInvitation(workspaceId);
  // mutateAsync: the row leaves the list when the cancel succeeds, and mutate's callbacks of an
  // unmounted component never run.
  const confirmRevoke = () =>
    void revoke.mutateAsync(invitation.id).then(
      () => {
        toast.success('Convite cancelado');
        // The row (and its button) is gone: go back to the section.
        document.getElementById('invite-title')?.focus();
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span className="grid min-w-0 flex-1">
        <span className="font-medium break-all">{invitation.email}</span>
        <span className="text-muted-foreground text-sm">
          {roleLabels[invitation.role]}, vale até{' '}
          {dateFormat.format(new Date(invitation.expiresAt))}
        </span>
      </span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Cancelar convite de ${invitation.email}`}
            disabled={revoke.isPending}
          >
            Cancelar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o convite de {invitation.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              O link enviado por e-mail deixa de funcionar. Você pode convidar de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter convite</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmRevoke}>
              Cancelar convite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function PendingInvitations({ workspaceId }: { workspaceId: string }) {
  const invitations = useInvitations(workspaceId, true);

  if (!invitations.isSuccess || invitations.data.length === 0) return null;
  return (
    <section aria-labelledby="pending-title" className="grid gap-2">
      <h3 id="pending-title" className="font-medium">
        Convites pendentes
      </h3>
      <ul className="divide-y rounded-xl border px-4">
        {invitations.data.map((invitation) => (
          <PendingInvitation
            key={invitation.id}
            workspaceId={workspaceId}
            invitation={invitation}
          />
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
      {/* Focusable from script: where focus goes after cancelling an invitation. */}
      <h2 id="invite-title" tabIndex={-1} className="font-medium outline-none">
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
