import {
  PERSONAL_WORKSPACE_NAME,
  type CreateWorkspaceInput,
  type MemberResponse,
  type RenameWorkspaceInput,
  type Workspace,
  type WorkspaceRole,
} from '@financas/shared';
import { Injectable } from '@nestjs/common';
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

      await tx.workspace.create({
        data: {
          name: PERSONAL_WORKSPACE_NAME,
          isPersonal: true,
          members: { create: { userId, role: 'OWNER' } },
        },
      });
    });
  }

  /** The workspaces the user is a member of: the personal one first, then by name. */
  async listForUser(userId: string): Promise<Workspace[]> {
    const members = await this.findMemberships(userId);
    if (members.some((member) => member.workspace.isPersonal)) return members.map(toWorkspace);

    await this.ensurePersonalWorkspace(userId);
    return (await this.findMemberships(userId)).map(toWorkspace);
  }

  /** A shared workspace; whoever creates it becomes its OWNER. */
  async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
    const workspace = await this.prisma.workspace.create({
      data: { name: input.name, members: { create: { userId, role: 'OWNER' } } },
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

  private findMemberships(userId: string) {
    return this.prisma.member.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: [{ workspace: { isPersonal: 'desc' } }, { workspace: { name: 'asc' } }],
    });
  }
}
