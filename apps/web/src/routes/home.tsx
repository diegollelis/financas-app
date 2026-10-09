import type { Workspace } from '@financas/shared';
import { Navigate, useLocation } from 'react-router';
import { BrandLoader } from '@/components/brand-loader';
import { ListSkeleton, QueryState } from '@/components/query-state';
import { AppHeader } from '@/features/shell/app-header';
import { readLastWorkspace } from '@/features/workspaces/last-workspace';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';

/** The last workspace opened in this browser, if it is still one of the user's; else the personal. */
function pickWorkspace(workspaces: Workspace[]) {
  const last = readLastWorkspace();
  return (
    workspaces.find((workspace) => workspace.id === last) ??
    workspaces.find((workspace) => workspace.isPersonal) ??
    workspaces[0]
  );
}

/**
 * "/" is not a page: it opens a workspace's dashboard (ADR 0036). Workspaces are switched and
 * created in the workspace layout (ADR 0044), so every page keeps the sections nav. The query string goes along: the
 * e-mail confirmation link comes back here with `?error=`, which the notice reads.
 */
export function HomePage() {
  const workspaces = useWorkspaces();
  const { search } = useLocation();
  const target = workspaces.isSuccess ? pickWorkspace(workspaces.data) : undefined;

  if (target) return <Navigate to={`/espacos/${target.id}/painel${search}`} replace />;
  // A moment before the dashboard: the mark, not a skeleton shaped like another page.
  if (workspaces.isPending) return <BrandLoader />;
  return (
    <div className="min-h-svh">
      <AppHeader />
      <main
        id="conteudo"
        tabIndex={-1}
        className="px-4 pt-5 text-base outline-none sm:px-6 md:pt-8 md:text-sm"
      >
        <div className="grid max-w-3xl gap-6">
          <QueryState queries={[workspaces]} skeleton={<ListSkeleton />} />
          {/* Every account has a personal workspace (ADR 0024); this is only a safety net. */}
          {workspaces.isSuccess && <p role="alert">Nenhum espaço encontrado.</p>}
        </div>
      </main>
    </div>
  );
}
