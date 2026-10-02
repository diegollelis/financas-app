import { Navigate, Outlet } from 'react-router';
import { useMe } from './use-me';

function FullPageMessage({ children }: { children: string }) {
  return (
    <main className="text-muted-foreground flex min-h-svh items-center justify-center p-6 text-sm">
      {children}
    </main>
  );
}

/** Layout route: renders its children only with a session; otherwise sends to the sign-in page. */
export function RequireAuth() {
  const me = useMe();

  if (me.isPending) return <FullPageMessage>Carregando…</FullPageMessage>;
  if (me.isError) {
    return (
      <FullPageMessage>Não foi possível falar com o servidor. Recarregue a página.</FullPageMessage>
    );
  }
  if (!me.data) return <Navigate to="/entrar" replace />;
  // Pages read the user with useCurrentUser().
  return <Outlet context={me.data} />;
}

/** Layout route for sign-in and sign-up: whoever already has a session goes to the home page. */
export function GuestOnly() {
  const me = useMe();

  if (me.isPending) return <FullPageMessage>Carregando…</FullPageMessage>;
  if (me.data) return <Navigate to="/" replace />;
  return <Outlet />;
}
