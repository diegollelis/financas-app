import {
  periodClosingStateSchema,
  periodSchema,
  reopenPeriodInputSchema,
  type PeriodClosingState,
  type ReopenPeriodInput,
} from '@financas/shared';
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthSession } from '../auth/auth.js';
import {
  CurrentMembership,
  RequireRole,
  WorkspaceScoped,
  type WorkspaceMembership,
} from '../workspaces/workspace-member.guard.js';
import { PeriodsService } from './periods.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Fechamento do mês (ADR 0063): close a competência, reopen it, see its history. */
@ApiTags('periods')
@Controller('workspaces/:workspaceId/periods/:period')
@WorkspaceScoped()
@ApiParam({ name: 'period', example: '2026-10', description: 'Competência (YYYY-MM).' })
@ApiBadRequestResponse({ description: 'Invalid period or input (code INVALID_INPUT).' })
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get('closing')
  @ApiOkResponse({
    description: 'The closing in force, every closing of it and, while open, what is pending.',
    schema: openApi(periodClosingStateSchema),
  })
  state(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('period', { schema: periodSchema }) period: string,
  ): Promise<PeriodClosingState> {
    return this.periods.state(membership.workspaceId, period);
  }

  @Post('close')
  @RequireRole('EDITOR')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Closed.', schema: openApi(periodClosingStateSchema) })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({
    description:
      'PERIOD_HAS_PENDING (with `pending`): something is still to pay or receive. PERIOD_ALREADY_CLOSED.',
  })
  close(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: AuthSession['user'],
    @Param('period', { schema: periodSchema }) period: string,
  ): Promise<PeriodClosingState> {
    return this.periods.close(membership.workspaceId, period, user.id);
  }

  @Post('reopen')
  @RequireRole('EDITOR')
  @HttpCode(200)
  @ApiBody({ schema: openApi(reopenPeriodInputSchema) })
  @ApiOkResponse({ description: 'Reopened.', schema: openApi(periodClosingStateSchema) })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'PERIOD_NOT_CLOSED.' })
  reopen(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: AuthSession['user'],
    @Param('period', { schema: periodSchema }) period: string,
    @Body({ schema: reopenPeriodInputSchema }) input: ReopenPeriodInput,
  ): Promise<PeriodClosingState> {
    return this.periods.reopen(membership.workspaceId, period, user.id, input.reason);
  }
}
