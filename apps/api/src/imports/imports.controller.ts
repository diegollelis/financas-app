import {
  createImportInputSchema,
  importListResponseSchema,
  importSchema,
  type CreateImportInput,
  type Import,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiQuery,
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
import { ImportsService } from './imports.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Spreadsheet imports of one workspace (ADR 0040): created at once, undone at once. */
@ApiTags('imports')
@Controller('workspaces/:workspaceId/imports')
@WorkspaceScoped()
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @ApiOkResponse({ description: 'Newest first.', schema: openApi(importListResponseSchema) })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Import[]> {
    return this.imports.list(membership.workspaceId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createImportInputSchema) })
  @ApiCreatedResponse({
    description: 'Imported: every transaction created, or none.',
    schema: openApi(importSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT or INVALID_CATEGORY.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: AuthSession['user'],
    @Body({ schema: createImportInputSchema }) input: CreateImportInput,
  ): Promise<Import> {
    return this.imports.create(membership.workspaceId, user.id, input);
  }

  @Delete(':importId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({
    description:
      'Undone: every transaction it brought deleted. With keepTransactions=true, only removed from ' +
      'the history: its transactions and plans stay (ADR 0060 note).',
  })
  @ApiQuery({ name: 'keepTransactions', required: false })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  undo(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('importId') importId: string,
    @Query('keepTransactions') keepTransactions?: string,
  ): Promise<void> {
    return keepTransactions === 'true'
      ? this.imports.forget(membership.workspaceId, importId)
      : this.imports.undo(membership.workspaceId, importId);
  }
}
