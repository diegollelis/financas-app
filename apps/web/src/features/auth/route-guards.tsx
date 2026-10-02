import { Navigate, Outlet, useLocation } from 'react-router';
import { useReturnTo, withReturnTo } from './return-to';
import { useMe } from './use-me';

function FullPageMessage({ children }: { children: string }) {
  return (
    <main className="text-muted-foreground flex min-h-svh items-center justify-center p-6 text-sm">
      {children}
    </main>
  );
}

/**
 * Layout route: renders its children only with a session. Otherwise sends to the sign-in page,
 * which brings the person back here afterwards (`?voltar=`).
 */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageMessage>Carregando…</FullPageMessage>;
  if (me.isError) {
    return (
      <FullPageMessage>Não foi possível falar com o servidor. Recarregue a página.</FullPageMessage>
    );
  }
  if (!me.data) {
    const here = location.pathname + location.search;
    return <Navigate to={withReturnTo('/entrar', here)} replace />;
  }
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

  if (me.isPending) return <FullPageMessage>Carregando…</FullPageMessage>;
  if (me.data) return <Navigate to={returnTo} replace />;
  return <Outlet />;
}
