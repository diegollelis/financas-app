import {
  createRecurrenceInputSchema,
  recurrenceListResponseSchema,
  recurrenceSchema,
  updateRecurrenceInputSchema,
  type CreateRecurrenceInput,
  type Recurrence,
  type UpdateRecurrenceInput,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
} from '../workspaces/workspace-member.guard.js';
import { RecurrencesService } from './recurrences.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Recorrências of one workspace (ADR 0038): transactions that repeat every month. */
@ApiTags('recurrences')
@Controller('workspaces/:workspaceId/recurrences')
@WorkspaceScoped()
export class RecurrencesController {
  constructor(private readonly recurrences: RecurrencesService) {}

  @Get()
  @ApiOkResponse({
    description: 'Active ones first, then by description.',
    schema: openApi(recurrenceListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Recurrence[]> {
    return this.recurrences.list(membership.workspaceId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createRecurrenceInputSchema) })
  @ApiCreatedResponse({
    description: 'Created, with its transaction in the first competência.',
    schema: openApi(recurrenceSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT or INVALID_CATEGORY.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createRecurrenceInputSchema }) input: CreateRecurrenceInput,
  ): Promise<Recurrence> {
    return this.recurrences.create(membership.workspaceId, input);
  }

  @Patch(':recurrenceId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateRecurrenceInputSchema) })
  @ApiOkResponse({
    description: 'Changed, and its pending transactions from this month on.',
    schema: openApi(recurrenceSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT or INVALID_CATEGORY.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('recurrenceId') recurrenceId: string,
    @Body({ schema: updateRecurrenceInputSchema }) input: UpdateRecurrenceInput,
  ): Promise<Recurrence> {
    return this.recurrences.update(membership.workspaceId, recurrenceId, input);
  }

  @Delete(':recurrenceId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Ended: no new months, and its pending transactions from this month on removed.',
  })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  end(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('recurrenceId') recurrenceId: string,
  ): Promise<void> {
    return this.recurrences.end(membership.workspaceId, recurrenceId);
  }
}
