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

/** A pending invitation, as listed to the workspace OWNER. */
export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: workspaceRoleSchema,
  expiresAt: z.iso.datetime(),
});

export type InvitationResponse = z.infer<typeof invitationSchema>;

export const invitationListResponseSchema = z.array(invitationSchema);

/** `GET /invitations/:token`: what the invited person sees before accepting. */
export const invitationPreviewSchema = z.object({
  workspaceName: z.string(),
  invitedByName: z.string().nullable(),
  email: z.email(),
  role: workspaceRoleSchema,
  expiresAt: z.iso.datetime(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
