import {
  invitationPreviewSchema,
  workspaceSchema,
  type InvitationPreview,
  type Workspace,
} from '@financas/shared';
import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { InvitationsService } from './invitations.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

/** The invitation link from the e-mail (ADR 0027). The token is the secret. */
@ApiTags('invitations')
@Controller('invitations/:token')
@ApiNotFoundResponse({ description: 'Unknown, used, cancelled or expired invitation.' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Public: the page shows who invited and to which workspace, even before signing in. */
  @Get()
  @ApiOkResponse({ schema: openApi(invitationPreviewSchema) })
  preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitations.preview(token);
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  @ApiForbiddenResponse({ description: 'Signed in with another e-mail (EMAIL_MISMATCH).' })
  @ApiOkResponse({ description: 'The workspace just joined.', schema: openApi(workspaceSchema) })
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthSession['user'],
  ): Promise<Workspace> {
    return this.invitations.accept(token, user);
  }
}
