import {
  PERSONAL_WORKSPACE_NAME,
  type CreateWorkspaceInput,
  type MemberResponse,
  type RenameWorkspaceInput,
  type Workspace,
  type WorkspaceRole,
} from '@financas/shared';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { createDefaultDestinations } from '../budget-destinations/default-destinations.js';
import { createDefaultCategories } from '../categories/default-categories.js';
import type { Member, Workspace as WorkspaceRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A membership as the API returns it: the workspace plus the member's role in it. */
function toWorkspace(member: Member & { workspace: WorkspaceRow }): Workspace {
  const { id, name, isPersonal } = member.workspace;
  return { id, name, isPersonal, role: member.role };
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gives the user a personal workspace if they have none (ADR 0024). Idempotent: called right
   * after sign-up and again when listing, in case the first call failed. The row lock makes
   * concurrent calls for the same user wait for each other, so only one workspace is created.
   */
  async ensurePersonalWorkspace(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const personal = await tx.member.findFirst({
        where: { userId, workspace: { isPersonal: true } },
      });
      if (personal) return;

      const workspace = await tx.workspace.create({
        data: {
          name: PERSONAL_WORKSPACE_NAME,
          isPersonal: true,
          members: { create: { userId, role: 'OWNER' } },
        },
      });
      await createDefaultCategories(tx, workspace.id);
      await createDefaultDestinations(tx, workspace.id);
    });
  }

  /** The workspaces the user is a member of: the personal one first, then by name. */
  async listForUser(userId: string): Promise<Workspace[]> {
    const members = await this.findMemberships(userId);
    if (members.some((member) => member.workspace.isPersonal)) return members.map(toWorkspace);

    await this.ensurePersonalWorkspace(userId);
    return (await this.findMemberships(userId)).map(toWorkspace);
  }

  /** A shared workspace, with the default categories; whoever creates it becomes its OWNER. */
  async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: { name: input.name, members: { create: { userId, role: 'OWNER' } } },
      });
      await createDefaultCategories(tx, created.id);
      await createDefaultDestinations(tx, created.id);
      return created;
    });
    return { id: workspace.id, name: workspace.name, isPersonal: false, role: 'OWNER' };
  }

  // The methods below receive a workspace already checked by WorkspaceMemberGuard, and every
  // query filters by that workspaceId (ADR 0008): never one without the other.

  async get(workspaceId: string, role: WorkspaceRole): Promise<Workspace> {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    return { id: workspace.id, name: workspace.name, isPersonal: workspace.isPersonal, role };
  }

  async rename(
    workspaceId: string,
    role: WorkspaceRole,
    input: RenameWorkspaceInput,
  ): Promise<Workspace> {
    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: input.name },
    });
    return { id: workspace.id, name: workspace.name, isPersonal: workspace.isPersonal, role };
  }

  /** Owners first (the enum order: OWNER, EDITOR, VIEWER), then by name. */
  async listMembers(workspaceId: string): Promise<MemberResponse[]> {
    const members = await this.prisma.member.findMany({
      where: { workspaceId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
    });
    return members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
    }));
  }

  /**
   * Takes someone out of the workspace: the OWNER removes anyone else, and any other member can
   * leave on their own. The OWNER never leaves (each workspace has exactly one, ADR 0027): to end
   * a shared workspace, it is deleted. Their transactions stay: they belong to the workspace.
   */
  async removeMember(
    workspaceId: string,
    actor: { userId: string; role: WorkspaceRole },
    userId: string,
  ): Promise<void> {
    if (actor.role !== 'OWNER' && userId !== actor.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Só o dono do espaço remove outras pessoas.',
      });
    }
    if (!z.uuid().safeParse(userId).success) throw new NotFoundException();
    const member = await this.prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { user: { select: { email: true } } },
    });
    if (!member) throw new NotFoundException();
    if (member.role === 'OWNER') {
      throw new ConflictException({
        code: 'OWNER_STAYS',
        message: 'O dono não sai do espaço. Para encerrá-lo, exclua o espaço.',
      });
    }
    // The invitation that let them in shows when and how they went (ADR 0027).
    await this.prisma.$transaction([
      this.prisma.member.delete({ where: { id: member.id } }),
      this.prisma.invitation.updateMany({
        where: {
          workspaceId,
          email: member.user.email.toLowerCase(),
          acceptedAt: { not: null },
          removedAt: null,
        },
        data: { removedAt: new Date(), leftOnOwn: userId === actor.userId },
      }),
    ]);
  }

  /**
   * Deletes a shared workspace with everything in it (members, invitations and all the business
   * tables, by cascade). The personal one stays for as long as the account (ADR 0024).
   */
  async delete(workspaceId: string, isPersonal: boolean): Promise<void> {
    if (isPersonal) {
      throw new ConflictException({
        code: 'PERSONAL_WORKSPACE',
        message: 'O espaço pessoal não pode ser excluído: ele existe enquanto a conta existir.',
      });
    }
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  private findMemberships(userId: string) {
    return this.prisma.member.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: [{ workspace: { isPersonal: 'desc' } }, { workspace: { name: 'asc' } }],
    });
  }
}
