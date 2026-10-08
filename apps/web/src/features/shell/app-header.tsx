import { SIGN_IN_PATH } from '@financas/shared';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand-logo';
import { useSignOut } from '@/features/auth/use-auth-mutations';
import { cn } from '@/lib/utils';
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
 * The header of the signed-in pages (ADRs 0036, 0043): the brand, a title (the workspace name,
 * or the app name outside a workspace) and the account menu. The CL symbol on the phone, where
 * the full logo would take the whole width; the horizontal logo from md. With `sidebar`, the
 * logo sits in a column as wide as the sidebar below it, so both read as one panel. From lg the
 * header, the sidebar and the logo grow: the art's "FINANÇAS" is an eighth of its height, and
 * only at about 56px does it become legible.
 */
export function AppHeader({ title, sidebar = false }: { title: ReactNode; sidebar?: boolean }) {
  // To the plain sign-in page: no ?voltar= to this account's pages for whoever comes next.
  const signOut = useSignOut({ leaveTo: SIGN_IN_PATH });
  return (
    <header className="bg-sidebar/95 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:h-18">
        <BrandLogo variant="symbol" className="h-7 md:hidden" />
        <div
          className={cn(
            'hidden md:flex md:items-center',
            // Over the sidebar (w-56): from the header's left edge to the sidebar's border.
            sidebar && 'md:-ml-6 md:mr-3 md:w-56 md:self-stretch md:border-r md:px-4 lg:w-72',
          )}
        >
          <BrandLogo variant="horizontal" className="h-10 lg:h-14" />
        </div>
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
