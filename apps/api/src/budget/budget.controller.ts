import {
  budgetInputSchema,
  budgetSchema,
  periodSchema,
  type Budget,
  type BudgetInput,
} from '@financas/shared';
import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiParam,
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
import { BudgetService } from './budget.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Budget configuration of one competência (ADR 0030). */
@ApiTags('budget')
@Controller('workspaces/:workspaceId/budget/:period')
@WorkspaceScoped()
@ApiParam({ name: 'period', example: '2026-10', description: 'Competência (YYYY-MM).' })
@ApiBadRequestResponse({ description: 'Invalid period or input (code INVALID_INPUT).' })
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get()
  @ApiOkResponse({
    description: 'Saved for this competência, inherited from an earlier one, or the defaults.',
    schema: openApi(budgetSchema),
  })
  get(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('period', { schema: periodSchema }) period: string,
  ): Promise<Budget> {
    return this.budget.get(membership.workspaceId, period);
  }

  /** PUT: the whole configuration of the competência, created or replaced. */
  @Put()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(budgetInputSchema) })
  @ApiOkResponse({ description: 'Saved for this competência.', schema: openApi(budgetSchema) })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  save(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('period', { schema: periodSchema }) period: string,
    @Body({ schema: budgetInputSchema }) input: BudgetInput,
  ): Promise<Budget> {
    return this.budget.save(membership.workspaceId, period, input);
  }
}
