import { deletionBlockedMessage, type DeletionBlocker } from '@financas/shared';
import { Injectable } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { PrismaService } from '../prisma/prisma.service.js';

/** Not accepted and not expired: someone may still join with it. */
const pendingInvitation = () => ({ acceptedAt: null, expiresAt: { gt: new Date() } });

/**
 * Deleting an account (ADR 0041). Better Auth deletes the user (and, by cascade, its sessions,
 * logins and memberships); this decides whether it may, and deletes what it owns first.
 */
@Injectable()
export class AccountDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The workspaces the person owns with someone else in them, or invited to them: deleting the
   * account would take their data from those people, so the person resolves them first.
   */
  async blockers(userId: string): Promise<DeletionBlocker[]> {
    const owned = await this.prisma.member.findMany({
      where: { userId, role: 'OWNER' },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            _count: { select: { members: true, invitations: { where: pendingInvitation() } } },
          },
        },
      },
      orderBy: { workspace: { name: 'asc' } },
    });
    return owned
      .map(({ workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        otherMembers: workspace._count.members - 1,
        pendingInvitations: workspace._count.invitations,
      }))
      .filter((blocker) => blocker.otherMembers > 0 || blocker.pendingInvitations > 0);
  }

  /** Better Auth's error for a blocked deletion, with the workspaces to resolve. */
  async ensureDeletable(userId: string): Promise<void> {
    const blockers = await this.blockers(userId);
    if (blockers.length === 0) return;
    throw new APIError('CONFLICT', {
      code: 'OWNS_SHARED_WORKSPACES',
      message: deletionBlockedMessage(blockers.map((blocker) => blocker.name)),
    });
  }

  /**
   * Runs right before Better Auth deletes the user, after the e-mailed link was opened: checks
   * again (someone may have joined since the link was sent), then, in one transaction, deletes
   * the workspaces only this person was in (the personal one included, with all their data),
   * the pending invitations to their e-mail, and records on the invitations that let them into
   * other people's workspaces that they left.
   */
  async deleteOwnedData(user: { id: string; email: string }): Promise<void> {
    await this.ensureDeletable(user.id);
    const memberships = await this.prisma.member.findMany({
      where: { userId: user.id },
      select: { workspaceId: true, role: true },
    });
    const owned = memberships.filter((m) => m.role === 'OWNER').map((m) => m.workspaceId);
    const elsewhere = memberships.filter((m) => m.role !== 'OWNER').map((m) => m.workspaceId);
    const email = user.email.toLowerCase();
    await this.prisma.$transaction([
      this.prisma.workspace.deleteMany({ where: { id: { in: owned } } }),
      this.prisma.invitation.deleteMany({ where: { email, acceptedAt: null } }),
      this.prisma.invitation.updateMany({
        where: {
          workspaceId: { in: elsewhere },
          email,
          acceptedAt: { not: null },
          removedAt: null,
        },
        data: { removedAt: new Date(), leftOnOwn: true },
      }),
    ]);
  }
}
