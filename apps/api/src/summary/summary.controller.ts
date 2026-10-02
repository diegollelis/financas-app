import { periodSchema, summarySchema, type Summary } from '@financas/shared';
import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentMembership,
  WorkspaceScoped,
  type WorkspaceMembership,
} from '../workspaces/workspace-member.guard.js';
import { SummaryService } from './summary.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** The month's dashboard (ADR 0031). Read-only, so every member can see it. */
@ApiTags('summary')
@Controller('workspaces/:workspaceId/summary/:period')
@WorkspaceScoped()
export class SummaryController {
  constructor(private readonly summary: SummaryService) {}

  @Get()
  @ApiParam({ name: 'period', example: '2026-10', description: 'Competência (YYYY-MM).' })
  @ApiOkResponse({
    description: 'Indicators of the competência, planned and settled.',
    schema: openApi(summarySchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid period (code INVALID_INPUT).' })
  get(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('period', { schema: periodSchema }) period: string,
  ): Promise<Summary> {
    return this.summary.get(membership.workspaceId, period);
  }
}
