import type { WorkspaceRole } from '@financas/shared';
import { Badge } from '@/components/ui/badge';
import { useWorkspaces } from './use-workspaces';

const roleLabels: Record<WorkspaceRole, string> = {
  OWNER: 'Dono',
  EDITOR: 'Editor',
  VIEWER: 'Leitor',
};

export function WorkspaceList() {
  const workspaces = useWorkspaces();

  return (
    <section aria-labelledby="workspaces-title" className="grid gap-2">
      <h2 id="workspaces-title" className="font-medium">
        Seus espaços
      </h2>
      {workspaces.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {workspaces.isError && (
        <p className="text-destructive">Não foi possível carregar os espaços.</p>
      )}
      {workspaces.isSuccess && (
        <ul className="grid gap-1">
          {workspaces.data.map((workspace) => (
            <li key={workspace.id} className="flex items-center justify-between">
              <span>
                {workspace.name}
                {workspace.isPersonal && <span className="text-muted-foreground"> (só seu)</span>}
              </span>
              <Badge variant="secondary">{roleLabels[workspace.role]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
