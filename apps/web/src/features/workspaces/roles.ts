import type { WorkspaceRole } from '@financas/shared';

// The same words as the invitation's choice: what the person can do, not a title (avaliação de Membros).
export const roleLabels: Record<WorkspaceRole, string> = {
  OWNER: 'Dono',
  EDITOR: 'Pode editar',
  VIEWER: 'Só visualizar',
};

/** What each access allows, after its name: the invitation form and the invitation page. */
export const roleDescriptions: Record<WorkspaceRole, string> = {
  OWNER: 'muda tudo, convida e remove pessoas e pode excluir o espaço.',
  EDITOR: 'lança, efetiva e muda lançamentos, categorias, orçamento, pessoas e importações.',
  VIEWER: 'vê tudo, sem mudar nada.',
};
