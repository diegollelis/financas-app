import { TERMS_VERSION } from '@financas/shared';
import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { BrandLoader } from '@/components/brand-loader';
import { Button } from '@/components/ui/button';
import { AcceptTerms } from './accept-terms';
import { useReturnTo, withReturnTo } from './return-to';
import { useMe } from './use-me';

/**
 * Neutral on purpose: the API answers the same 401 whether the session expired, was ended on
 * another device or by a password change.
 */
export const SESSION_ENDED_NOTICE = 'Sua sessão terminou. Entre de novo para continuar.';

/** The session could not be checked: the server did not answer. Say so and offer to try again. */
function ConnectionError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div role="alert" className="grid justify-items-center gap-3 text-center">
        <p className="text-destructive">Não foi possível falar com o servidor.</p>
        <Button variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Tentando…' : 'Tentar de novo'}
        </Button>
      </div>
    </main>
  );
}

/**
 * Layout route: renders its children only with a session. Otherwise sends to the sign-in page,
 * which brings the person back here afterwards (`?voltar=`). With a session but without the
 * terms in force accepted (ADR 0041), asks for them first, staying on the same address.
 */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  // Whether this guard has let someone in: losing the user afterwards means the session ended
  // elsewhere (another device, expiry), and the sign-in page says so.
  const [hadUser, setHadUser] = useState(false);
  if (me.data && !hadUser) setHadUser(true);

  if (me.isPending) return <BrandLoader />;
  // A failed check with a user already loaded (e.g. back to the tab, offline) keeps the page.
  if (me.isError && me.data === undefined) {
    return <ConnectionError onRetry={() => void me.refetch()} retrying={me.isFetching} />;
  }
  if (!me.data) {
    const here = location.pathname + location.search;
    const state = hadUser ? { notice: SESSION_ENDED_NOTICE } : undefined;
    return <Navigate to={withReturnTo('/entrar', here)} state={state} replace />;
  }
  if (me.data.termsVersion !== TERMS_VERSION) return <AcceptTerms user={me.data} />;
  // Pages read the user with useCurrentUser().
  return <Outlet context={me.data} />;
}

/**
 * Layout route for sign-in and sign-up: whoever has a session goes on to `?voltar=` (or home).
 * This is also how the pages leave after signing in: the cached user changes and this redirects.
 */
export function GuestOnly() {
  const me = useMe();
  const returnTo = useReturnTo();

  if (me.isPending) return <BrandLoader />;
  if (me.data) return <Navigate to={returnTo} replace />;
  return <Outlet />;
}
