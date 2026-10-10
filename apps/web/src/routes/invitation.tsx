import { TERMS_VERSION, type InvitationPreview } from '@financas/shared';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { BrandLoader } from '@/components/brand-loader';
import { TextLink } from '@/components/text-link';
import { Button, buttonVariants } from '@/components/ui/button';
import { AcceptTerms } from '@/features/auth/accept-terms';
import { AuthCard } from '@/features/auth/auth-card';
import { withReturnTo } from '@/features/auth/return-to';
import { useSignOut } from '@/features/auth/use-auth-mutations';
import { useMe } from '@/features/auth/use-me';
import { useAcceptInvitation, useInvitationPreview } from '@/features/invitations/use-invitation';
import { roleDescriptions, roleLabels } from '@/features/workspaces/roles';
import { apiErrorMessage } from '@/lib/error-message';

const homeLink = <TextLink to="/">Ir para o início</TextLink>;

/**
 * On the way back from signing in or up: the person already chose to accept there, so the
 * invitation is accepted without a second click (only by the invited e-mail, as always).
 */
const ACCEPT_PARAM = 'aceitar';

function describe(invitation: InvitationPreview) {
  const who = invitation.invitedByName ?? 'Alguém';
  return `${who} convidou você para o espaço "${invitation.workspaceName}".`;
}

/**
 * Before choosing (avaliação das telas de entrada): the access, by the same name and words as
 * in Membros, and what a workspace is, for whoever has never had one shared.
 */
function WhatYouGet({ invitation }: { invitation: InvitationPreview }) {
  const description = roleDescriptions[invitation.role];
  return (
    <div className="grid gap-1 rounded-lg border p-3 text-sm">
      <p>
        <strong>Seu acesso: {roleLabels[invitation.role]}.</strong>{' '}
        {description.charAt(0).toUpperCase() + description.slice(1)}
      </p>
      <p className="text-muted-foreground">
        Um espaço reúne as finanças de uma pessoa, de uma casa ou de um grupo, com os seus
        lançamentos e orçamento. A sua conta e o seu espaço pessoal continuam só seus.
      </p>
    </div>
  );
}

/**
 * The person is not signed in: sign in or sign up, then come back here and the invitation is
 * accepted on arrival (ADR 0027).
 */
function SignInFirst({ invitation }: { invitation: InvitationPreview }) {
  const location = useLocation();
  const here = `${location.pathname}?${ACCEPT_PARAM}=1`;
  return (
    <div className="grid gap-3 text-sm">
      <p>
        Para aceitar, entre ou crie sua conta com o e-mail <strong>{invitation.email}</strong>.
      </p>
      <Link to={withReturnTo('/entrar', here)} className={buttonVariants()}>
        Entrar e aceitar
      </Link>
      <Link to={withReturnTo('/cadastro', here)} className={buttonVariants({ variant: 'outline' })}>
        Criar conta e aceitar
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

function Accept({ token, onArrival }: { token: string; onArrival: boolean }) {
  const accept = useAcceptInvitation(token);
  const navigate = useNavigate();
  const run = () =>
    accept.mutate(undefined, {
      onSuccess: (workspace) => void navigate(`/espacos/${workspace.id}`, { replace: true }),
    });
  // Once, even if React runs effects twice in development.
  const started = useRef(false);
  useEffect(() => {
    if (!onArrival || started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, [onArrival]);
  return (
    <div className="grid gap-3 text-sm">
      {accept.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(accept.error)}
        </p>
      )}
      <Button onClick={run} disabled={accept.isPending}>
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
  const [searchParams] = useSearchParams();

  if (preview.isPending || me.isPending) return <BrandLoader />;
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
  // A new Google account accepts the terms before joining, not after (ADR 0041).
  if (user && user.termsVersion !== TERMS_VERSION) return <AcceptTerms user={user} />;
  return (
    <AuthCard title="Convite" description={describe(invitation)} footer={homeLink}>
      <WhatYouGet invitation={invitation} />
      {!user ? (
        <SignInFirst invitation={invitation} />
      ) : user.email.toLowerCase() !== invitation.email ? (
        <WrongAccount invitation={invitation} email={user.email} />
      ) : (
        <Accept token={token} onArrival={searchParams.has(ACCEPT_PARAM)} />
      )}
    </AuthCard>
  );
}
