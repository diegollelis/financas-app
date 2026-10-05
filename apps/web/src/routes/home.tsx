import { PageHeader } from '@/components/page-header';
import { useCurrentUser } from '@/features/auth/use-me';
import { VerifyEmailBanner } from '@/features/auth/verify-email-banner';
import { AppHeader, SkipLink } from '@/features/shell/app-header';
import { WorkspaceList } from '@/features/workspaces/workspace-list';

/**
 * Where a signed-in person picks a workspace. Same header and margins as the workspace pages
 * (ADR 0036), without the sections: no workspace is chosen yet.
 */
export function HomePage() {
  const user = useCurrentUser();

  return (
    <div className="min-h-svh">
      <SkipLink />
      <AppHeader title={<p className="truncate font-semibold">Finanças</p>} />
      <main
        id="conteudo"
        tabIndex={-1}
        className="px-4 pt-5 pb-12 text-base outline-none sm:px-6 md:pt-8 md:text-sm"
      >
        <div className="mx-auto grid max-w-3xl gap-6">
          <PageHeader title={`Olá, ${user.name}`} description="Escolha um espaço para ver o mês." />
          {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
          <WorkspaceList />
        </div>
      </main>
    </div>
  );
}
