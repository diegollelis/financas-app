import { z } from 'zod';

/** Matches the `workspaces.name` column (varchar 100). */
export const WORKSPACE_NAME_MAX_LENGTH = 100;

/** Name given to the workspace every user gets on sign-up (ADR 0024). */
export const PERSONAL_WORKSPACE_NAME = 'Pessoal';

/**
 * What a member can do in a workspace (ADR 0008): OWNER manages members and the workspace,
 * EDITOR changes data, VIEWER only reads.
 */
export const workspaceRoleSchema = z.enum(['OWNER', 'EDITOR', 'VIEWER']);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const createWorkspaceInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Dê um nome ao espaço.')
    .max(WORKSPACE_NAME_MAX_LENGTH, `Use no máximo ${WORKSPACE_NAME_MAX_LENGTH} caracteres.`),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;

/** A workspace as seen by one member: `role` is that member's role in it. */
export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isPersonal: z.boolean(),
  role: workspaceRoleSchema,
});

export type Workspace = z.infer<typeof workspaceSchema>;

/** `GET /workspaces`: the signed-in user's workspaces, the personal one first. */
export const workspaceListResponseSchema = z.array(workspaceSchema);

/** Renaming uses the same rules as creating. */
export const renameWorkspaceInputSchema = createWorkspaceInputSchema;

export type RenameWorkspaceInput = CreateWorkspaceInput;

const roleRank: Record<WorkspaceRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

/** Whether `role` can do what `minimum` can: VIEWER < EDITOR < OWNER (ADR 0025). */
export function hasRole(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

/**
 * The name of each access, in the words of the invitation's choice: what the person can do, not
 * a title (avaliação de Membros). The web pages and the invitation e-mail use the same ones.
 */
export const roleLabels: Record<WorkspaceRole, string> = {
  OWNER: 'Dono',
  EDITOR: 'Pode editar',
  VIEWER: 'Só visualizar',
};

/** What each access allows, after its name: the invitation form, page and e-mail. */
export const roleDescriptions: Record<WorkspaceRole, string> = {
  OWNER: 'muda tudo, convida e remove pessoas e pode excluir o espaço.',
  EDITOR: 'lança, efetiva e muda lançamentos, categorias, orçamento, pessoas e importações.',
  VIEWER: 'vê tudo, sem mudar nada.',
};

/** A member of a workspace, as listed to the other members. */
export const memberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: workspaceRoleSchema,
});

export type MemberResponse = z.infer<typeof memberSchema>;

/** `GET /workspaces/:workspaceId/members`: owners first, then by name. */
export const memberListResponseSchema = z.array(memberSchema);
