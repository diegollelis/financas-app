import { hasRole, type WorkspaceRole } from '@financas/shared';
import {
  applyDecorators,
  createParamDecorator,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCookieAuth, ApiNotFoundResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/session.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The caller's membership in the workspace of the route, attached by WorkspaceMemberGuard. */
export interface WorkspaceMembership {
  workspaceId: string;
  role: WorkspaceRole;
  isPersonal: boolean;
}

export interface WorkspaceRequest extends AuthenticatedRequest {
  membership: WorkspaceMembership;
}

const MIN_ROLE = 'workspace:min-role';

/** The lowest role allowed on a route (VIEWER < EDITOR < OWNER). Without it: any member. */
export const RequireRole = (role: WorkspaceRole) => SetMetadata(MIN_ROLE, role);

/**
 * Guards routes under `/workspaces/:workspaceId` (ADRs 0008 and 0025), the equivalent of xFilial()
 * in Protheus: nothing in a workspace is reached without going through here.
 * - not a member, or an id that is not even a UUID: 404, so outsiders cannot tell whether the
 *   workspace exists;
 * - a member below the required role: 403 (they already know it exists).
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const workspaceId = request.params.workspaceId;
    if (typeof workspaceId !== 'string' || !z.uuid().safeParse(workspaceId).success) {
      throw new NotFoundException();
    }

    const member = await this.prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: request.auth.user.id } },
      include: { workspace: { select: { isPersonal: true } } },
    });
    if (!member) throw new NotFoundException();

    const minimum = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(MIN_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (minimum && !hasRole(member.role, minimum)) throw new ForbiddenException();

    request.membership = {
      workspaceId,
      role: member.role,
      isPersonal: member.workspace.isPersonal,
    };
    return true;
  }
}

/**
 * Everything a route under `/workspaces/:workspaceId` needs: a session first (401), then
 * membership (404) and role (403). Use on the controller of every workspace resource.
 */
export const WorkspaceScoped = () =>
  applyDecorators(
    UseGuards(SessionGuard, WorkspaceMemberGuard),
    ApiCookieAuth(),
    ApiUnauthorizedResponse({ description: 'No valid session cookie.' }),
    ApiNotFoundResponse({ description: 'Not a member of this workspace, or it does not exist.' }),
  );

/** The caller's membership in the route's workspace. Only valid under `@WorkspaceScoped()`. */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<WorkspaceRequest>().membership,
);
