import {
  ACCOUNT_PATH,
  createInvitationInputSchema,
  type CreateInvitationInput,
  type InvitationResponse,
  type MemberResponse,
  type Workspace,
} from '@financas/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
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
import { useCurrentUser } from '@/features/auth/use-me';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { NewWorkspaceDialog } from '@/features/workspaces/new-workspace-dialog';
import { roleDescriptions, roleLabels } from '@/features/workspaces/roles';
import {
  useCreateInvitation,
  useDeleteWorkspace,
  useForgetWorkspace,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
} from '@/features/workspaces/use-workspace';
import { apiErrorMessage } from '@/lib/error-message';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** "07/10/2026 às 14:32", in São Paulo time. */
function dateTime(iso: string) {
  const date = new Date(iso);
  return `${dateFormat.format(date)} às ${timeFormat.format(date)}`;
}

const accessOptions = [
  { value: 'EDITOR', label: 'Pode editar' },
  { value: 'VIEWER', label: 'Só visualizar' },
] as const;

/**
 * One member. The OWNER can remove anyone else; any other member can leave (ADR 0041). Both ask
 * first, naming the person or the workspace.
 */
function MemberRow({ workspace, member }: { workspace: Workspace; member: MemberResponse }) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const remove = useRemoveMember(workspace.id);
  const forget = useForgetWorkspace(workspace.id);
  const isMe = member.userId === me.id;
  const canRemove = member.role !== 'OWNER' && (workspace.role === 'OWNER' || isMe);

  // mutateAsync: the row leaves the list on success, and an unmounted component's mutate
  // callbacks never run.
  const confirm = () =>
    void remove.mutateAsync(member.userId).then(
      () => {
        if (isMe) {
          forget.beforeLeaving();
          void navigate('/', { replace: true });
          void forget.afterLeaving();
          toast.success(`Você saiu de ${workspace.name}`);
          return;
        }
        toast.success(`${member.name} foi removido do espaço`);
        document.getElementById('members-title')?.focus();
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span className="grid min-w-0 flex-1">
        <span className="font-medium break-words">
          {member.name}
          {isMe && <span className="text-muted-foreground font-normal"> (você)</span>}
        </span>
        <span className="text-muted-foreground text-sm break-all">{member.email}</span>
      </span>
      <Badge variant="secondary">{roleLabels[member.role]}</Badge>
      {canRemove && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={isMe ? `Sair de ${workspace.name}` : `Remover ${member.name}`}
              disabled={remove.isPending}
            >
              {isMe ? 'Sair' : 'Remover'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isMe ? `Sair de ${workspace.name}?` : `Remover ${member.name} do espaço?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isMe
                  ? 'Você deixa de ver os dados deste espaço. Para voltar, o dono precisa convidar você de novo.'
                  : `${member.name} deixa de ver e de mudar os dados de ${workspace.name}. Os lançamentos continuam no espaço, e você pode convidar de novo depois.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirm}>
                {isMe ? 'Sair do espaço' : 'Remover'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}

function Members({ workspace }: { workspace: Workspace }) {
  const members = useMembers(workspace.id);

  return (
    <>
      {/* Focusable from script: where focus goes after removing someone. */}
      <h2 id="members-title" tabIndex={-1} className="sr-only">
        Membros do espaço
      </h2>
      <QueryState queries={[members]} skeleton={<ListSkeleton rows={2} />} />
      {members.isSuccess && (
        <ul aria-labelledby="members-title" className="divide-y rounded-xl border px-4">
          {members.data.map((member) => (
            <MemberRow key={member.userId} workspace={workspace} member={member} />
          ))}
        </ul>
      )}
    </>
  );
}

/** The OWNER ends a shared workspace, with everything in it. Never the personal one. */
function DeleteWorkspace({ workspace }: { workspace: Workspace }) {
  const navigate = useNavigate();
  const deleteWorkspace = useDeleteWorkspace(workspace.id);
  const forget = useForgetWorkspace(workspace.id);
  const confirm = () =>
    void deleteWorkspace.mutateAsync().then(
      () => {
        forget.beforeLeaving();
        void navigate('/', { replace: true });
        void forget.afterLeaving();
        toast.success(`Espaço ${workspace.name} excluído`);
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  return (
    <section
      aria-labelledby="delete-workspace-title"
      className="border-destructive/40 mt-4 grid gap-3 rounded-xl border p-4"
    >
      <h2 id="delete-workspace-title" className="font-medium">
        Excluir espaço
      </h2>
      <p className="text-muted-foreground">
        Apaga o espaço e tudo o que há nele: lançamentos, categorias, orçamentos, recorrências e
        parcelamentos. Os membros perdem o acesso. Para guardar uma cópia, baixe seus dados em{' '}
        <Link to={ACCOUNT_PATH} className="text-primary underline">
          Minha conta
        </Link>{' '}
        antes.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            className="text-destructive justify-self-start"
            disabled={deleteWorkspace.isPending}
          >
            Excluir espaço
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o espaço {workspace.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados de {workspace.name} são apagados, e os membros perdem o acesso. Não é
              possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirm}>
              Excluir espaço
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
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
  const role = useWatch({ control, name: 'role' });
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
        {/* What the chosen access allows, in the app's real terms. */}
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {roleLabels[role]}: {roleDescriptions[role]} Só o dono convida, remove pessoas e exclui o
          espaço.
        </p>
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

/**
 * What came of an invitation, as badges: waiting (until when), expired, accepted (when) and,
 * once the membership ended, removed or left (when).
 */
function InvitationStatus({ invitation }: { invitation: InvitationResponse }) {
  const { status, acceptedAt, removedAt } = invitation;
  if (acceptedAt) {
    return (
      <>
        <Badge variant={status === 'ACCEPTED' ? 'success' : 'secondary'}>
          Aceito em {dateTime(acceptedAt)}
        </Badge>
        {removedAt && (
          <Badge variant="outline">
            {status === 'LEFT' ? 'Saiu' : 'Removido'} em {dateTime(removedAt)}
          </Badge>
        )}
      </>
    );
  }
  if (invitation.status === 'EXPIRED') {
    return (
      <Badge variant="warning">
        Expirou em {dateFormat.format(new Date(invitation.expiresAt))}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      Aguardando, vale até {dateFormat.format(new Date(invitation.expiresAt))}
    </Badge>
  );
}

/**
 * One invitation. A pending one can be cancelled (its link stops working) and an expired one
 * cleared from the list; both ask first (ADR 0036). An accepted one stays, as the record.
 */
function InvitationRow({
  workspaceId,
  invitation,
}: {
  workspaceId: string;
  invitation: InvitationResponse;
}) {
  const revoke = useRevokeInvitation(workspaceId);
  const pending = invitation.status === 'PENDING';
  // mutateAsync: the row leaves the list when this succeeds, and mutate's callbacks of an
  // unmounted component never run.
  const confirmRevoke = () =>
    void revoke.mutateAsync(invitation.id).then(
      () => {
        toast.success(pending ? 'Convite cancelado' : 'Convite apagado');
        // The row (and its button) is gone: go back to the section.
        document.getElementById('invite-title')?.focus();
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  return (
    <li className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="font-medium break-all">{invitation.email}</span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{roleLabels[invitation.role]}</span>
          <InvitationStatus invitation={invitation} />
        </span>
      </span>
      {(pending || invitation.status === 'EXPIRED') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${pending ? 'Cancelar' : 'Apagar'} convite de ${invitation.email}`}
              disabled={revoke.isPending}
            >
              {pending ? 'Cancelar' : 'Apagar'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending
                  ? `Cancelar o convite de ${invitation.email}?`
                  : `Apagar o convite expirado de ${invitation.email}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending
                  ? 'O link enviado por e-mail deixa de funcionar. Você pode convidar de novo depois.'
                  : 'Ele sai da lista. Para dar acesso a essa pessoa, envie um convite novo.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{pending ? 'Manter convite' : 'Manter'}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirmRevoke}>
                {pending ? 'Cancelar convite' : 'Apagar convite'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </li>
  );
}

function Invitations({ workspaceId }: { workspaceId: string }) {
  const invitations = useInvitations(workspaceId, true);

  if (!invitations.isSuccess || invitations.data.length === 0) return null;
  return (
    <section aria-labelledby="invitations-title" className="grid gap-2">
      <h3 id="invitations-title" className="font-medium">
        Convites
      </h3>
      <ul className="divide-y rounded-xl border px-4">
        {invitations.data.map((invitation) => (
          <InvitationRow key={invitation.id} workspaceId={workspaceId} invitation={invitation} />
        ))}
      </ul>
    </section>
  );
}

/** The personal workspace takes no invitations: sharing starts with a shared workspace. */
function PersonalSharing() {
  const [creating, setCreating] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <section className="grid justify-items-start gap-3 rounded-xl border p-4">
      <p className="text-muted-foreground">
        Este é o seu espaço pessoal: só você tem acesso. Para dividir as finanças com alguém, crie
        um espaço compartilhado e convide as pessoas para ele.
      </p>
      <Button ref={opener} variant="outline" onClick={() => setCreating(true)}>
        Criar espaço compartilhado
      </Button>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} returnFocusTo={opener} />
    </section>
  );
}

/** Who can be invited and how: the OWNER of a shared workspace (ADR 0027). */
function Sharing({ workspace }: { workspace: Workspace }) {
  if (workspace.isPersonal) return <PersonalSharing />;
  if (workspace.role !== 'OWNER') return null;
  return (
    <section aria-labelledby="invite-title" className="grid gap-3">
      {/* Focusable from script: where focus goes after cancelling an invitation. */}
      <h2 id="invite-title" tabIndex={-1} className="font-medium outline-none">
        Convidar alguém
      </h2>
      <InviteForm workspaceId={workspace.id} />
      <Invitations workspaceId={workspace.id} />
    </section>
  );
}

export function WorkspacePage() {
  const workspace = useCurrentWorkspace();

  return (
    <>
      <PageHeader title="Membros" description={`Seu acesso: ${roleLabels[workspace.role]}`} />
      <Members workspace={workspace} />
      <Sharing workspace={workspace} />
      {workspace.role === 'OWNER' && !workspace.isPersonal && (
        <DeleteWorkspace workspace={workspace} />
      )}
    </>
  );
}
