import { periodSchema } from '@financas/shared';
import {
  ArrowLeftRight,
  ChartColumn,
  ChartPie,
  Ellipsis,
  LayoutDashboard,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router';
import { ListSkeleton, QueryState } from '@/components/query-state';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/use-me';
import { VerifyEmailBanner } from '@/features/auth/verify-email-banner';
import { AppHeader, SkipLink } from '@/features/shell/app-header';
import { cn } from '@/lib/utils';
import { CurrentWorkspaceContext } from './current-workspace';
import { rememberLastWorkspace } from './last-workspace';
import { useWorkspace } from './use-workspace';
import { WorkspaceSwitcher } from './workspace-switcher';

type Section = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Pages of one competência: moving between them keeps `?competencia=`. */
  byPeriod?: boolean;
  /** Behind "Mais" in the phone's tab bar; in the sidebar from md. */
  more?: boolean;
};

const sections: Section[] = [
  { path: 'painel', label: 'Painel', icon: LayoutDashboard, byPeriod: true },
  { path: 'lancamentos', label: 'Lançamentos', icon: ArrowLeftRight, byPeriod: true },
  { path: 'orcamento', label: 'Orçamento', icon: ChartPie, byPeriod: true },
  { path: 'analise', label: 'Análise', icon: ChartColumn, more: true },
  { path: 'categorias', label: 'Categorias', icon: Tags, more: true },
  { path: '', label: 'Membros', icon: Users, more: true },
];

// One element, two layouts: a tab of the bottom bar on the phone, a row of the sidebar from md.
const navItemClassName =
  'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium outline-none focus-visible:ring-3 md:h-9 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm aria-[current=page]:text-primary md:aria-[current=page]:bg-primary/10';

function useSectionLinks(workspaceId: string) {
  const [searchParams] = useSearchParams();
  const period = periodSchema.safeParse(searchParams.get('competencia'));
  const search = period.success ? `?competencia=${period.data}` : '';
  const base = `/espacos/${workspaceId}`;
  return sections.map((section) => ({
    ...section,
    to: `${base}${section.path && `/${section.path}`}${section.byPeriod ? search : ''}`,
  }));
}

/** The rest of the sections on the phone, in a sheet that rises from the bottom. */
function MoreSheet({ links }: { links: ReturnType<typeof useSectionLinks> }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const more = links.filter((link) => link.more);
  const active = more.some((link) => link.to === pathname);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(navItemClassName, 'w-full md:hidden', active && 'text-primary')}
        >
          <Ellipsis aria-hidden className="size-5" />
          Mais
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Mais</SheetTitle>
          <SheetDescription className="sr-only">Outras seções do espaço</SheetDescription>
        </SheetHeader>
        <ul className="grid gap-1 px-4 pb-4">
          {more.map((link) => (
            <li key={link.to}>
              <SheetClose asChild>
                <NavLink
                  to={link.to}
                  end
                  className="hover:bg-muted aria-[current=page]:text-primary flex h-12 items-center gap-3 rounded-lg px-3 text-base font-medium"
                >
                  <link.icon aria-hidden className="size-5" />
                  {link.label}
                </NavLink>
              </SheetClose>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function SectionNav({ workspaceId }: { workspaceId: string }) {
  const links = useSectionLinks(workspaceId);
  return (
    <nav
      aria-label="Seções do espaço"
      className="bg-background fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:sticky md:top-14 md:h-[calc(100svh-3.5rem)] md:w-56 md:shrink-0 md:border-t-0 md:border-r md:p-3"
    >
      <ul className="grid grid-cols-4 md:flex md:flex-col md:gap-1">
        {links.map((link) => (
          <li key={link.path} className={cn(link.more && 'hidden md:block')}>
            <NavLink to={link.to} end className={navItemClassName}>
              <link.icon aria-hidden className="size-5 md:size-4" />
              {link.label}
            </NavLink>
          </li>
        ))}
        <li className="md:hidden">
          <MoreSheet links={links} />
        </li>
      </ul>
    </nav>
  );
}

/**
 * Layout route of every page of a workspace (ADR 0036): header, the sections as a bottom tab bar
 * on the phone and a sidebar from md, and the workspace loaded once for the pages under it.
 * While loading or failing, the layout shows the state; pages render only with the workspace.
 */
export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams();
  const user = useCurrentUser();
  const workspace = useWorkspace(workspaceId);
  const opened = workspace.isSuccess ? workspace.data.id : null;
  useEffect(() => {
    // Only a workspace that loaded: a 404 must not become where "/" goes next time.
    if (opened) rememberLastWorkspace(opened);
  }, [opened]);

  return (
    <div className="min-h-svh">
      <SkipLink />
      <AppHeader
        title={
          workspace.isSuccess ? (
            <WorkspaceSwitcher current={workspace.data} />
          ) : (
            workspace.isPending && <Skeleton className="h-5 w-32" />
          )
        }
      />
      <div className="md:flex">
        {!workspace.isError && <SectionNav workspaceId={workspaceId} />}
        <main
          id="conteudo"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] text-base outline-none sm:px-6 md:pt-8 md:pb-12 md:text-sm"
        >
          <div className="grid max-w-3xl gap-6">
            {/* On every page until confirmed; not blocking (ADR 0022). */}
            {!user.emailVerified && <VerifyEmailBanner email={user.email} />}
            {workspace.isSuccess ? (
              <CurrentWorkspaceContext value={workspace.data}>
                {/* Pages read the user with useCurrentUser(), as under RequireAuth. */}
                <Outlet context={user} />
              </CurrentWorkspaceContext>
            ) : (
              <QueryState queries={[workspace]} skeleton={<ListSkeleton />} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
