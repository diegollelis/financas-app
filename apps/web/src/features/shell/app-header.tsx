import type { ReactNode } from 'react';
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

/**
 * The header of the signed-in pages (ADR 0036): the app icon, a title (the workspace name, or
 * the app name outside a workspace) and the account menu.
 */
export function AppHeader({ title }: { title: ReactNode }) {
  const signOut = useSignOut();
  return (
    <header className="bg-background/95 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <img src="/favicon.svg" alt="" className="size-7 shrink-0" />
        <div className="min-w-0 flex-1">{title}</div>
        <AccountMenu signOut={signOut} />
      </div>
      {signOut.isError && (
        <p role="alert" className="text-destructive border-t px-4 py-2 sm:px-6">
          Não foi possível sair agora. Tente de novo.
        </p>
      )}
    </header>
  );
}
