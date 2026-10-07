import { z } from 'zod';
import { workspaceRoleSchema } from './workspace.ts';

/** Web page that receives the invitation link: `${INVITATION_PATH}/<token>` (ADR 0027). */
export const INVITATION_PATH = '/convites';

/** How long an invitation link works. */
export const INVITATION_TTL_DAYS = 7;

/** Pending invitations allowed per workspace, so invitations cannot be used to spam. */
export const MAX_PENDING_INVITATIONS = 20;

/** OWNER is never granted by invitation: only by promotion, later (ADR 0027). */
export const invitableRoleSchema = z.enum(['EDITOR', 'VIEWER']);

export const createInvitationInputSchema = z.object({
  email: z.email('Informe um e-mail válido.').transform((email) => email.toLowerCase()),
  role: invitableRoleSchema,
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;

/**
 * Waiting for an answer, accepted, or past its expiry without one; once accepted, the membership
 * may have ended: the OWNER removed the person (REMOVED) or they left on their own (LEFT).
 */
export const invitationStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REMOVED', 'LEFT']);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** An invitation, as listed to the workspace OWNER: what came of it, too. */
export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: workspaceRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  /** When the membership ended (REMOVED or LEFT). */
  removedAt: z.iso.datetime().nullable(),
});

export type InvitationResponse = z.infer<typeof invitationSchema>;

/** `GET /workspaces/:workspaceId/invitations`: the latest ones, newest first. */
export const invitationListResponseSchema = z.array(invitationSchema);

/** How many invitations the list shows: enough history without growing forever. */
export const INVITATION_LIST_LIMIT = 30;

/** `GET /invitations/:token`: what the invited person sees before accepting. */
export const invitationPreviewSchema = z.object({
  workspaceName: z.string(),
  invitedByName: z.string().nullable(),
  email: z.email(),
  role: workspaceRoleSchema,
  expiresAt: z.iso.datetime(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
