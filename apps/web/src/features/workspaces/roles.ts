import type { WorkspaceRole } from '@financas/shared';

// The same words as the invitation's choice: what the person can do, not a title (avaliação de Membros).
export const roleLabels: Record<WorkspaceRole, string> = {
  OWNER: 'Dono',
  EDITOR: 'Pode editar',
  VIEWER: 'Só visualizar',
};
