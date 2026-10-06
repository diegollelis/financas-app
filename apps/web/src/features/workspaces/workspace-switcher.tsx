import type { Workspace } from '@financas/shared';
import { ChevronDown, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateWorkspaceForm } from './create-workspace-form';
import { roleLabels } from './roles';
import { useWorkspaces } from './use-workspaces';

/**
 * The workspace name in the header is the way to switch workspace or create one (ADR 0036): every
 * page keeps the sections nav, and there is no separate "workspaces" page. Switching keeps the
 * section and the competência: /espacos/A/lancamentos?competencia=… → /espacos/B/lancamentos?….
 */
export function WorkspaceSwitcher({ current }: { current: Workspace }) {
  const workspaces = useWorkspaces();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const switchTo = (workspaceId: string) => {
    if (workspaceId === current.id) return;
    void navigate(pathname.replace(`/espacos/${current.id}`, `/espacos/${workspaceId}`) + search);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            aria-label={`Trocar de espaço (atual: ${current.name})`}
            className="-ml-2 max-w-full min-w-0 justify-start px-2 text-base font-semibold md:px-2 md:text-sm"
          >
            <span className="truncate">{current.name}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel>Seus espaços</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current.id} onValueChange={switchTo}>
            {(workspaces.data ?? [current]).map((workspace) => (
              <DropdownMenuRadioItem key={workspace.id} value={workspace.id}>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                <span className="text-muted-foreground text-sm">
                  {workspace.isPersonal ? 'Só seu' : roleLabels[workspace.role]}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {workspaces.isError && (
            <p className="text-destructive px-2 py-1.5 text-sm">
              Não foi possível carregar os outros espaços.
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus aria-hidden />
            Novo espaço compartilhado
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResponsiveDialog
        open={creating}
        onOpenChange={setCreating}
        returnFocusTo={triggerRef}
        title="Novo espaço compartilhado"
        description="Para dividir as finanças com outras pessoas. Depois de criar, convide-as em Membros."
      >
        <CreateWorkspaceForm
          onCreated={(workspace) => {
            setCreating(false);
            toast.success('Espaço criado');
            void navigate(`/espacos/${workspace.id}/painel`);
          }}
          onCancel={() => setCreating(false)}
        />
      </ResponsiveDialog>
    </>
  );
}
