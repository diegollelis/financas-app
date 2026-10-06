import {
  createInstallmentPlanInputSchema,
  installmentPlanListResponseSchema,
  installmentPlanSchema,
  type CreateInstallmentPlanInput,
  type InstallmentPlan,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
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
import { InstallmentsService } from './installments.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Parcelamentos of one workspace (ADR 0038): purchases or debts in monthly installments. */
@ApiTags('installments')
@Controller('workspaces/:workspaceId/installments')
@WorkspaceScoped()
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get()
  @ApiOkResponse({
    description: 'Running ones first, each with how many installments were settled.',
    schema: openApi(installmentPlanListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<InstallmentPlan[]> {
    return this.installments.list(membership.workspaceId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createInstallmentPlanInputSchema) })
  @ApiCreatedResponse({
    description: 'Created, with all its installments (one per competência).',
    schema: openApi(installmentPlanSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT or INVALID_CATEGORY.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createInstallmentPlanInputSchema }) input: CreateInstallmentPlanInput,
  ): Promise<InstallmentPlan> {
    return this.installments.create(membership.workspaceId, input);
  }

  @Delete(':planId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Ended: its pending installments from this month on removed.',
  })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  end(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('planId') planId: string,
  ): Promise<void> {
    return this.installments.end(membership.workspaceId, planId);
  }
}
