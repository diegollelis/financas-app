import {
  memberListResponseSchema,
  renameWorkspaceInputSchema,
  workspaceSchema,
  type MemberResponse,
  type RenameWorkspaceInput,
  type Workspace,
} from '@financas/shared';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentMembership,
  RequireRole,
  WorkspaceScoped,
  type WorkspaceMembership,
} from './workspace-member.guard.js';
import { WorkspacesService } from './workspaces.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** One workspace (ADR 0025). Every route here goes through WorkspaceMemberGuard. */
@ApiTags('workspaces')
@Controller('workspaces/:workspaceId')
@WorkspaceScoped()
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOkResponse({
    description: 'The workspace and your role in it.',
    schema: openApi(workspaceSchema),
  })
  get(@CurrentMembership() membership: WorkspaceMembership): Promise<Workspace> {
    return this.workspaces.get(membership.workspaceId, membership.role);
  }

  @Patch()
  @RequireRole('OWNER')
  @ApiBody({ schema: openApi(renameWorkspaceInputSchema) })
  @ApiOkResponse({ description: 'The renamed workspace.', schema: openApi(workspaceSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'Only the OWNER can rename.' })
  rename(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: renameWorkspaceInputSchema }) input: RenameWorkspaceInput,
  ): Promise<Workspace> {
    return this.workspaces.rename(membership.workspaceId, membership.role, input);
  }

  @Get('members')
  @ApiOkResponse({
    description: 'The members, owners first.',
    schema: openApi(memberListResponseSchema),
  })
  members(@CurrentMembership() membership: WorkspaceMembership): Promise<MemberResponse[]> {
    return this.workspaces.listMembers(membership.workspaceId);
  }
}
