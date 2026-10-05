import { periodSchema } from '@financas/shared';
import {
  ArrowLeftRight,
  ChartPie,
  CircleUser,
  Ellipsis,
  LayoutDashboard,
  LayoutGrid,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams, useSearchParams } from 'react-router';
import { ListSkeleton, QueryState } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useSignOut } from '@/features/auth/use-auth-mutations';
import { useCurrentUser } from '@/features/auth/use-me';
import { cn } from '@/lib/utils';
import { CurrentWorkspaceContext } from './current-workspace';
import { useWorkspace } from './use-workspace';

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
          <SheetDescription className="sr-only">Outras seções e espaços</SheetDescription>
        </SheetHeader>
        <ul className="grid gap-1 px-4 pb-4">
          {[...more, { to: '/', label: 'Seus espaços', icon: LayoutGrid }].map((link) => (
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

function AccountMenu({ signOut }: { signOut: ReturnType<typeof useSignOut> }) {
  const user = useCurrentUser();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu da conta">
          <CircleUser aria-hidden className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid font-normal">
          <span className="text-foreground truncate font-medium">{user.name}</span>
          <span className="truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/">Seus espaços</Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={signOut.isPending} onSelect={() => signOut.mutate()}>
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const signOut = useSignOut();

  return (
    <div className="min-h-svh">
      <a
        href="#conteudo"
        className="bg-background focus-visible:ring-ring/50 sr-only z-50 rounded-lg px-3 py-2 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-3"
      >
        Pular para o conteúdo
      </a>
      <header className="bg-background/95 sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <img src="/favicon.svg" alt="" className="size-7 shrink-0" />
          <div className="min-w-0 flex-1">
            {workspace.isSuccess ? (
              <p className="truncate font-semibold">{workspace.data.name}</p>
            ) : (
              workspace.isPending && <Skeleton className="h-5 w-32" />
            )}
          </div>
          <AccountMenu signOut={signOut} />
        </div>
        {signOut.isError && (
          <p role="alert" className="text-destructive border-t px-4 py-2 sm:px-6">
            Não foi possível sair agora. Tente de novo.
          </p>
        )}
      </header>
      <div className="md:flex">
        {!workspace.isError && <SectionNav workspaceId={workspaceId} />}
        <main
          id="conteudo"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] text-base outline-none sm:px-6 md:pt-8 md:pb-12 md:text-sm"
        >
          <div className="grid max-w-3xl gap-6">
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
