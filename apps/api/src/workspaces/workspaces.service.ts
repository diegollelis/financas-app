import {
  PERSONAL_WORKSPACE_NAME,
  type CreateWorkspaceInput,
  type Workspace,
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

  private findMemberships(userId: string) {
    return this.prisma.member.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: [{ workspace: { isPersonal: 'desc' } }, { workspace: { name: 'asc' } }],
    });
  }
}
