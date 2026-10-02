import {
  createWorkspaceInputSchema,
  workspaceListResponseSchema,
  workspaceSchema,
  type CreateWorkspaceInput,
  type Workspace,
} from '@financas/shared';
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { WorkspacesService } from './workspaces.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

@ApiTags('workspaces')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
@Controller('workspaces')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOkResponse({
    description: "The signed-in user's workspaces, the personal one first.",
    schema: openApi(workspaceListResponseSchema),
  })
  list(@CurrentUser() user: AuthSession['user']): Promise<Workspace[]> {
    return this.workspaces.listForUser(user.id);
  }

  @Post()
  @ApiBody({ schema: openApi(createWorkspaceInputSchema) })
  @ApiCreatedResponse({
    description: 'The new workspace; the caller is its OWNER.',
    schema: openApi(workspaceSchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  create(
    @CurrentUser() user: AuthSession['user'],
    // Validated by the global StandardSchemaValidationPipe with the shared schema (ADR 0006).
    @Body({ schema: createWorkspaceInputSchema }) input: CreateWorkspaceInput,
  ): Promise<Workspace> {
    return this.workspaces.create(user.id, input);
  }
}
