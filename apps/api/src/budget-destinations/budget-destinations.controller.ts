import {
  budgetDestinationListResponseSchema,
  budgetDestinationSchema,
  createBudgetDestinationInputSchema,
  updateBudgetDestinationInputSchema,
  type BudgetDestination,
  type CreateBudgetDestinationInput,
  type UpdateBudgetDestinationInput,
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
import { BudgetDestinationsService } from './budget-destinations.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/**
 * Destinations of the budget (ADR 0047): every member reads them, EDITORs and OWNERs change the
 * saving ones. Despesas is fixed.
 */
@ApiTags('budget-destinations')
@Controller('workspaces/:workspaceId/budget-destinations')
@WorkspaceScoped()
export class BudgetDestinationsController {
  constructor(private readonly destinations: BudgetDestinationsService) {}

  @Get()
  @ApiOkResponse({
    description: 'All destinations, archived too, in the order they are shown.',
    schema: openApi(budgetDestinationListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<BudgetDestination[]> {
    return this.destinations.list(membership.workspaceId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createBudgetDestinationInputSchema) })
  @ApiCreatedResponse({
    description: 'Saving destination created, with its debit category of the same name.',
    schema: openApi(budgetDestinationSchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({
    description:
      'DESTINATION_EXISTS: same name, ignoring case. CATEGORY_EXISTS: a debit category already has it.',
  })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createBudgetDestinationInputSchema }) input: CreateBudgetDestinationInput,
  ): Promise<BudgetDestination> {
    return this.destinations.create(membership.workspaceId, input);
  }

  @Patch(':destinationId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateBudgetDestinationInputSchema) })
  @ApiOkResponse({
    description: 'Destination changed, and its category with it.',
    schema: openApi(budgetDestinationSchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiNotFoundResponse({ description: 'Not a destination of this workspace.' })
  @ApiConflictResponse({
    description: 'DESTINATION_FIXED (Despesas), DESTINATION_EXISTS or CATEGORY_EXISTS.',
  })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('destinationId') destinationId: string,
    @Body({ schema: updateBudgetDestinationInputSchema }) input: UpdateBudgetDestinationInput,
  ): Promise<BudgetDestination> {
    return this.destinations.update(membership.workspaceId, destinationId, input);
  }

  @Delete(':destinationId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Destination and its category deleted.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiNotFoundResponse({ description: 'Not a destination of this workspace.' })
  @ApiConflictResponse({
    description:
      'DESTINATION_FIXED (Despesas), or DESTINATION_IN_USE: its category is in use; archive it instead.',
  })
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('destinationId') destinationId: string,
  ): Promise<void> {
    return this.destinations.remove(membership.workspaceId, destinationId);
  }
}
