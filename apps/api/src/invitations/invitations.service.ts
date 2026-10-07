import { createHash, randomBytes } from 'node:crypto';
import {
  INVITATION_LIST_LIMIT,
  INVITATION_PATH,
  INVITATION_TTL_DAYS,
  MAX_PENDING_INVITATIONS,
  type CreateInvitationInput,
  type InvitationPreview,
  type InvitationResponse,
  type InvitationStatus,
  type Workspace,
} from '@financas/shared';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { Invitation } from '../generated/prisma/client.js';
import { Mailer } from '../mail/mailer.js';
import { invitationEmail } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { WorkspaceMembership } from '../workspaces/workspace-member.guard.js';

/** Only this hash goes to the database: the token itself exists only in the e-mail link. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function status(invitation: Invitation, now: Date): InvitationStatus {
  if (invitation.removedAt) return invitation.leftOnOwn ? 'LEFT' : 'REMOVED';
  if (invitation.acceptedAt) return 'ACCEPTED';
  return invitation.expiresAt > now ? 'PENDING' : 'EXPIRED';
}

function toResponse(invitation: Invitation, now = new Date()): InvitationResponse {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: status(invitation, now),
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt && invitation.acceptedAt.toISOString(),
    removedAt: invitation.removedAt && invitation.removedAt.toISOString(),
  };
}

/** Not accepted and not expired. */
const pending = () => ({ acceptedAt: null, expiresAt: { gt: new Date() } });

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Invites someone to the workspace (OWNER only, checked by the guard) and e-mails the link.
   * Inviting the same e-mail again replaces the previous invitation, whose link stops working.
   */
  async create(
    membership: WorkspaceMembership,
    inviter: { id: string; name: string },
    input: CreateInvitationInput,
  ): Promise<InvitationResponse> {
    const { workspaceId } = membership;
    if (membership.isPersonal) {
      throw new ConflictException({
        code: 'PERSONAL_WORKSPACE',
        message: 'O espaço pessoal é só seu: para dividir finanças, crie outro espaço.',
      });
    }
    const alreadyMember = await this.prisma.member.findFirst({
      where: { workspaceId, user: { email: input.email } },
    });
    if (alreadyMember) {
      throw new ConflictException({
        code: 'ALREADY_MEMBER',
        message: 'Essa pessoa já é membro do espaço.',
      });
    }

    const token = randomBytes(32).toString('base64url');
    const { invitation, workspaceName } = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.deleteMany({
        where: { workspaceId, email: input.email, acceptedAt: null },
      });
      const pendingCount = await tx.invitation.count({ where: { workspaceId, ...pending() } });
      if (pendingCount >= MAX_PENDING_INVITATIONS) {
        throw new ConflictException({
          code: 'TOO_MANY_INVITATIONS',
          message: `Este espaço já tem ${MAX_PENDING_INVITATIONS} convites pendentes. Cancele algum antes de convidar mais.`,
        });
      }
      const created = await tx.invitation.create({
        data: {
          workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedById: inviter.id,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
        },
        include: { workspace: { select: { name: true } } },
      });
      return { invitation: created, workspaceName: created.workspace.name };
    });

    // Sent in the background, like the auth e-mails (ADR 0022). If it fails, the OWNER can
    // invite again. The log never carries the message: its link is the token.
    const url = new URL(
      `${INVITATION_PATH}/${token}`,
      this.config.get('WEB_ORIGIN', { infer: true }),
    );
    this.mailer
      .send(
        invitationEmail(input.email, {
          inviterName: inviter.name,
          workspaceName,
          canEdit: input.role === 'EDITOR',
          url: url.toString(),
        }),
      )
      .catch((error: unknown) => {
        this.logger.error(`Could not send the invitation e-mail: ${(error as Error).message}`);
      });

    return toResponse(invitation);
  }

  /** Pending invitations of the workspace, newest first. */
  /** The latest invitations with what came of them: pending, accepted or expired. */
  async list(workspaceId: string): Promise<InvitationResponse[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: INVITATION_LIST_LIMIT,
    });
    const now = new Date();
    return invitations.map((invitation) => toResponse(invitation, now));
  }

  /**
   * Cancels a pending invitation, or clears an expired one from the list; an accepted one stays,
   * as the record of how the member came in. Filtered by workspace too: an id from elsewhere is
   * a 404.
   */
  async revoke(workspaceId: string, invitationId: string): Promise<void> {
    if (!z.uuid().safeParse(invitationId).success) throw new NotFoundException();
    const { count } = await this.prisma.invitation.deleteMany({
      where: { id: invitationId, workspaceId, acceptedAt: null },
    });
    if (count === 0) throw new NotFoundException();
  }

  /** What the link shows before accepting. Unknown, used or expired links: 404. */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { tokenHash: hashToken(token), ...pending() },
      include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException();
    return {
      workspaceName: invitation.workspace.name,
      invitedByName: invitation.invitedBy?.name ?? null,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Joins the workspace. Only the person the invitation was sent to: the signed-in e-mail must
   * match, so a forwarded link is useless to anyone else. Opening the link proves the mailbox is
   * theirs, so the e-mail is also marked as verified.
   */
  async accept(token: string, user: { id: string; email: string }): Promise<Workspace> {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: { tokenHash: hashToken(token), ...pending() },
        include: { workspace: true },
      });
      if (!invitation) throw new NotFoundException();
      if (invitation.email !== user.email.toLowerCase()) {
        throw new ForbiddenException({
          code: 'EMAIL_MISMATCH',
          message: `Este convite foi enviado para ${invitation.email}. Entre com esse e-mail para aceitar.`,
        });
      }

      // Claims the invitation atomically: of two simultaneous accepts, only one gets count 1.
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException();

      const existing = await tx.member.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
      });
      // Someone who is already a member keeps their role (an OWNER is never downgraded).
      const member =
        existing ??
        (await tx.member.create({
          data: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role },
        }));
      await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });

      const { id, name, isPersonal } = invitation.workspace;
      return { id, name, isPersonal, role: member.role };
    });
  }
}
