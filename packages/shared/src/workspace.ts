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
