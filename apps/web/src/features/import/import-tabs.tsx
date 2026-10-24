import { NavLink } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

const tabs = [
  { path: 'extrato', label: 'Extrato do banco' },
  { path: 'planilha', label: 'Planilha modelo' },
] as const;

/**
 * The top of both import pages (ADR 0060): one "Importar" in "Mais", two pages of its own, the
 * bank's statements and the app's spreadsheet, chosen here. They are links, each page has its
 * own address, and they look like the app's segmented control.
 */
export function ImportHeader({ workspaceId }: { workspaceId: string }) {
  return (
    <>
      <PageHeader
        title="Importar"
        description="Traga lançamentos do banco ou de uma planilha. O arquivo é lido no seu aparelho."
      />
      <nav
        aria-label="O que importar"
        className="bg-muted grid auto-cols-fr grid-flow-col gap-1 rounded-lg p-1 sm:justify-self-start"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/espacos/${workspaceId}/importar/${tab.path}`}
            className={({ isActive }) =>
              cn(
                'text-muted-foreground focus-visible:ring-ring/50 flex h-11 items-center justify-center rounded-md px-3 font-medium outline-none focus-visible:ring-3 md:h-8',
                isActive && 'bg-background text-foreground shadow-sm',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
