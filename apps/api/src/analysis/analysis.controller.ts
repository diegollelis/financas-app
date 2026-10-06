import {
  analysisQuerySchema,
  analysisSchema,
  type Analysis,
  type AnalysisQuery,
} from '@financas/shared';
import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  CurrentMembership,
  WorkspaceScoped,
  type WorkspaceMembership,
} from '../workspaces/workspace-member.guard.js';
import { AnalysisService } from './analysis.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Sums of a range of competências (ADR 0037). Read-only, so every member can see it. */
@ApiTags('analysis')
@Controller('workspaces/:workspaceId/analysis')
@WorkspaceScoped()
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get()
  @ApiQuery({ name: 'from', example: '2026-05', description: 'First competência (YYYY-MM).' })
  @ApiQuery({ name: 'to', example: '2026-10', description: 'Last competência, up to 24 months.' })
  @ApiOkResponse({
    description: 'Planned and settled sums by competência, type and category.',
    schema: openApi(analysisSchema),
  })
  @ApiBadRequestResponse({
    description: 'Invalid range: reversed or over 24 competências (code INVALID_INPUT).',
  })
  get(
    @CurrentMembership() membership: WorkspaceMembership,
    @Query({ schema: analysisQuerySchema }) query: AnalysisQuery,
  ): Promise<Analysis> {
    return this.analysis.get(membership.workspaceId, query);
  }
}
