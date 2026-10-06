import type { InvitationPreview } from '@financas/shared';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { TextLink } from '@/components/text-link';
import { Button, buttonVariants } from '@/components/ui/button';
import { AuthCard } from '@/features/auth/auth-card';
import { withReturnTo } from '@/features/auth/return-to';
import { useSignOut } from '@/features/auth/use-auth-mutations';
import { useMe } from '@/features/auth/use-me';
import { useAcceptInvitation, useInvitationPreview } from '@/features/invitations/use-invitation';
import { apiErrorMessage } from '@/lib/error-message';

const homeLink = <TextLink to="/">Ir para o início</TextLink>;

function describe(invitation: InvitationPreview) {
  const access = invitation.role === 'EDITOR' ? 'ver e editar' : 'ver';
  const who = invitation.invitedByName ?? 'Alguém';
  return `${who} convidou você para ${access} as finanças do espaço "${invitation.workspaceName}".`;
}

/** The person is not signed in: sign in or sign up, then come back here (ADR 0027). */
function SignInFirst({ invitation }: { invitation: InvitationPreview }) {
  const location = useLocation();
  const here = location.pathname;
  return (
    <div className="grid gap-3 text-sm">
      <p>
        Para aceitar, entre ou crie sua conta com o e-mail <strong>{invitation.email}</strong>.
      </p>
      <Link to={withReturnTo('/entrar', here)} className={buttonVariants()}>
        Entrar
      </Link>
      <Link to={withReturnTo('/cadastro', here)} className={buttonVariants({ variant: 'outline' })}>
        Criar conta
      </Link>
    </div>
  );
}

/** Signed in with another account: a forwarded link, or the wrong account (ADR 0027). */
function WrongAccount({ invitation, email }: { invitation: InvitationPreview; email: string }) {
  const signOut = useSignOut();
  return (
    <div className="grid gap-3 text-sm">
      <p role="alert">
        Este convite foi enviado para <strong>{invitation.email}</strong>, mas você entrou como{' '}
        <strong>{email}</strong>. Saia e entre com o e-mail convidado.
      </p>
      <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
        Sair
      </Button>
    </div>
  );
}

function Accept({ token }: { token: string }) {
  const accept = useAcceptInvitation(token);
  const navigate = useNavigate();
  return (
    <div className="grid gap-3 text-sm">
      {accept.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(accept.error)}
        </p>
      )}
      <Button
        onClick={() =>
          accept.mutate(undefined, {
            onSuccess: (workspace) => void navigate(`/espacos/${workspace.id}`, { replace: true }),
          })
        }
        disabled={accept.isPending}
      >
        {accept.isPending ? 'Entrando no espaço…' : 'Aceitar convite'}
      </Button>
    </div>
  );
}

/**
 * Opened from the invitation e-mail (`/convites/:token`). Outside the route guards: it works
 * signed in or not, and shows the invitation before asking anything.
 */
export function InvitationPage() {
  const { token = '' } = useParams();
  const preview = useInvitationPreview(token);
  const me = useMe();

  if (preview.isPending || me.isPending) {
    return (
      <AuthCard title="Convite" footer={homeLink}>
        <p className="text-muted-foreground text-sm">Carregando…</p>
      </AuthCard>
    );
  }
  if (preview.isError || me.isError) {
    return (
      <AuthCard title="Convite" footer={homeLink}>
        <p role="alert" className="text-destructive text-sm">
          Não foi possível carregar o convite. Tente de novo em instantes.
        </p>
      </AuthCard>
    );
  }
  if (!preview.data) {
    return (
      <AuthCard title="Convite inválido" footer={homeLink}>
        <p role="alert" className="text-sm">
          Este convite não existe mais: ele pode ter vencido (vale 7 dias), já ter sido usado ou ter
          sido cancelado. Peça um novo a quem convidou você.
        </p>
      </AuthCard>
    );
  }

  const invitation = preview.data;
  const user = me.data;
  return (
    <AuthCard title="Convite" description={describe(invitation)} footer={homeLink}>
      {!user ? (
        <SignInFirst invitation={invitation} />
      ) : user.email.toLowerCase() !== invitation.email ? (
        <WrongAccount invitation={invitation} email={user.email} />
      ) : (
        <Accept token={token} />
      )}
    </AuthCard>
  );
}
