import {
  createInstallmentPlanInputSchema,
  installmentPlanListResponseSchema,
  installmentPlanSchema,
  installmentsFromTransactionInputSchema,
  updateInstallmentPlanInputSchema,
  type CreateInstallmentPlanInput,
  type InstallmentPlan,
  type InstallmentsFromTransactionInput,
  type UpdateInstallmentPlanInput,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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

  @Post('from-transaction')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(installmentsFromTransactionInputSchema) })
  @ApiCreatedResponse({
    description: 'Created with the transaction as one of its installments ("Tornar parcelado").',
    schema: openApi(installmentPlanSchema),
  })
  @ApiBadRequestResponse({
    description: 'INVALID_INPUT, or an archived category, person or merchant.',
  })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiNotFoundResponse({ description: 'Not a transaction of this workspace.' })
  @ApiConflictResponse({
    description:
      'NOT_INSTALLABLE: already in a plan or a recurrence, a share, split, or settled given as the total.',
  })
  fromTransaction(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: installmentsFromTransactionInputSchema })
    input: InstallmentsFromTransactionInput,
  ): Promise<InstallmentPlan> {
    return this.installments.fromTransaction(membership.workspaceId, input);
  }

  @Patch(':planId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateInstallmentPlanInputSchema) })
  @ApiOkResponse({
    description:
      'Changed, with its pending installments; the amounts remake every installment (ADR 0038 note).',
    schema: openApi(installmentPlanSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT, INVALID_CATEGORY, INVALID_MERCHANT.' })
  @ApiConflictResponse({ description: 'PLAN_ENDED, PLAN_HAS_PAYMENTS or PLAN_IS_SPLIT.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('planId') planId: string,
    @Body({ schema: updateInstallmentPlanInputSchema }) input: UpdateInstallmentPlanInput,
  ): Promise<InstallmentPlan> {
    return this.installments.update(membership.workspaceId, planId, input);
  }

  @Delete(':planId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({
    description:
      'Ended: its pending installments from this month on removed. With none settled, deleted with every installment.',
  })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  end(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('planId') planId: string,
  ): Promise<void> {
    return this.installments.end(membership.workspaceId, planId);
  }
}
