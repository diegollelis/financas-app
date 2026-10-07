import {
  createInvitationInputSchema,
  invitationListResponseSchema,
  invitationSchema,
  type CreateInvitationInput,
  type InvitationResponse,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CurrentMembership,
  RequireRole,
  WorkspaceScoped,
  type WorkspaceMembership,
} from '../workspaces/workspace-member.guard.js';
import { InvitationsService } from './invitations.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Invitations of one workspace, managed by its OWNER (ADR 0027). */
@ApiTags('invitations')
@Controller('workspaces/:workspaceId/invitations')
@WorkspaceScoped()
@RequireRole('OWNER')
@ApiForbiddenResponse({ description: 'Only the OWNER manages invitations.' })
export class WorkspaceInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @ApiBody({ schema: openApi(createInvitationInputSchema) })
  @ApiCreatedResponse({
    description: 'Invitation sent by e-mail.',
    schema: openApi(invitationSchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiConflictResponse({
    description: 'PERSONAL_WORKSPACE, ALREADY_MEMBER or TOO_MANY_INVITATIONS.',
  })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: AuthSession['user'],
    @Body({ schema: createInvitationInputSchema }) input: CreateInvitationInput,
  ): Promise<InvitationResponse> {
    return this.invitations.create(membership, { id: user.id, name: user.name }, input);
  }

  @Get()
  @ApiOkResponse({
    description: 'The latest invitations, newest first, each with its status.',
    schema: openApi(invitationListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<InvitationResponse[]> {
    return this.invitations.list(membership.workspaceId);
  }

  @Delete(':invitationId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Invitation cancelled; its link stops working.' })
  revoke(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(membership.workspaceId, invitationId);
  }
}
