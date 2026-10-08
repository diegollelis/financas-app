import { SIGN_IN_PATH } from '@financas/shared';
import type { ReactNode } from 'react';
import { AppBrand } from '@/components/brand-logo';
import { useSignOut } from '@/features/auth/use-auth-mutations';
import { AccountMenu } from './account-menu';

/** "Pular para o conteúdo": hidden until focused with Tab; jumps to `<main id="conteudo">`. */
export function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="bg-background focus-visible:ring-ring/50 sr-only z-50 rounded-lg px-3 py-2 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-3"
    >
      Pular para o conteúdo
    </a>
  );
}

function SignOutError({ signOut }: { signOut: ReturnType<typeof useSignOut> }) {
  if (!signOut.isError) return null;
  return (
    <p role="alert" className="text-destructive border-t px-4 py-2 sm:px-6">
      Não foi possível sair agora. Tente de novo.
    </p>
  );
}

/**
 * The header of the signed-in pages (ADRs 0036, 0044): the app's mark and the account menu. It
 * tops every page on the phone, and on the desktop only the pages outside a workspace: a
 * workspace has its full-height sidebar instead. On the phone, `workspace` (the switcher) sits
 * after the mark, past a divider: always in sight while the page scrolls, since lançamentos in
 * the wrong workspace are the costly mistake.
 */
export function AppHeader({ workspace }: { workspace?: ReactNode }) {
  // To the plain sign-in page: no ?voltar= to this account's pages for whoever comes next.
  const signOut = useSignOut({ leaveTo: SIGN_IN_PATH });
  return (
    <header className="bg-sidebar/95 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <AppBrand className="shrink-0" />
        {workspace && <div aria-hidden className="bg-border h-7 w-px shrink-0" />}
        <div className="min-w-0 flex-1">{workspace}</div>
        <AccountMenu signOut={signOut} />
      </div>
      <SignOutError signOut={signOut} />
    </header>
  );
}

/** The account at the foot of the desktop sidebar (ADR 0044). */
export function SidebarAccount() {
  const signOut = useSignOut({ leaveTo: SIGN_IN_PATH });
  return (
    <div className="border-t">
      <div className="p-3">
        <AccountMenu signOut={signOut} variant="sidebar" />
      </div>
      <SignOutError signOut={signOut} />
    </div>
  );
}
