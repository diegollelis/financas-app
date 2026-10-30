import {
  createPersonInputSchema,
  personSettlementDraftSchema,
  personSettlementSchema,
  settlePersonInputSchema,
  type PersonSettlement,
  type PersonSettlementDraft,
  type SettlePersonInput,
  personListResponseSchema,
  personSchema,
  transactionListResponseSchema,
  type Transaction,
  updatePersonInputSchema,
  type CreatePersonInput,
  type Person,
  type UpdatePersonInput,
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
import type { AuthSession } from '../auth/auth.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CurrentMembership,
  RequireRole,
  WorkspaceScoped,
  type WorkspaceMembership,
} from '../workspaces/workspace-member.guard.js';
import { PeopleService } from './people.service.js';
import { SettlementsService } from './settlements.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** People of one workspace (ADR 0042): every member reads them, EDITORs and OWNERs change them. */
@ApiTags('people')
@Controller('workspaces/:workspaceId/people')
@WorkspaceScoped()
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly settlements: SettlementsService,
  ) {}

  @Get()
  @ApiOkResponse({
    description: 'All people, archived too, by name, with what is pending each way.',
    schema: openApi(personListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Person[]> {
    return this.people.list(membership.workspaceId);
  }

  @Get(':personId/transactions')
  @ApiOkResponse({
    description: "The person's transactions, of any competência, newest first (up to 200).",
    schema: openApi(transactionListResponseSchema),
  })
  @ApiNotFoundResponse({ description: 'Not a person of this workspace.' })
  transactions(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('personId') personId: string,
  ): Promise<Transaction[]> {
    return this.people.transactions(membership.workspaceId, personId);
  }

  @Get(':personId/settlement')
  @ApiOkResponse({
    description:
      'What may go into a settlement (ADR 0065): the pending debits and credits of the person, oldest first, and the category suggested for the reward.',
    schema: openApi(personSettlementDraftSchema),
  })
  @ApiNotFoundResponse({ description: 'Not a person of this workspace.' })
  settlementDraft(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('personId') personId: string,
  ): Promise<PersonSettlementDraft> {
    return this.settlements.draft(membership.workspaceId, personId);
  }

  @Post(':personId/settlements')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(settlePersonInputSchema) })
  @ApiCreatedResponse({
    description: 'Settled on that day, with the reward launched; what it settled, for undoing.',
    schema: openApi(personSettlementSchema),
  })
  @ApiBadRequestResponse({
    description:
      'INVALID_INPUT: a day in the future or a reward over the debits; INVALID_CATEGORY for the reward.',
  })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiNotFoundResponse({ description: 'Not a person of this workspace.' })
  @ApiConflictResponse({
    description:
      'SETTLEMENT_CHANGED: a transaction is not pending of this person; NOTHING_TO_PAY: no debit; PERIOD_CLOSED.',
  })
  settle(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: AuthSession['user'],
    @Param('personId') personId: string,
    @Body({ schema: settlePersonInputSchema }) input: SettlePersonInput,
  ): Promise<PersonSettlement> {
    return this.settlements.settle(membership.workspaceId, personId, user.id, input);
  }

  @Delete(':personId/settlements/:settlementId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Undone: what it still settles back to pending, the reward deleted.',
  })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiNotFoundResponse({ description: 'Not a settlement of this person.' })
  @ApiConflictResponse({ description: 'PERIOD_CLOSED: one of its months is closed.' })
  undoSettlement(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('personId') personId: string,
    @Param('settlementId') settlementId: string,
  ): Promise<void> {
    return this.settlements.undo(membership.workspaceId, personId, settlementId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createPersonInputSchema) })
  @ApiCreatedResponse({ description: 'Person created.', schema: openApi(personSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input, or not a member to link (INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'PERSON_EXISTS: same name, ignoring case.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createPersonInputSchema }) input: CreatePersonInput,
  ): Promise<Person> {
    return this.people.create(membership.workspaceId, input);
  }

  @Patch(':personId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updatePersonInputSchema) })
  @ApiOkResponse({ description: 'Person changed.', schema: openApi(personSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'PERSON_EXISTS: same name, ignoring case.' })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('personId') personId: string,
    @Body({ schema: updatePersonInputSchema }) input: UpdatePersonInput,
  ): Promise<Person> {
    return this.people.update(membership.workspaceId, personId, input);
  }

  @Delete(':personId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Person deleted.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'PERSON_IN_USE: has transactions; archive it instead.' })
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('personId') personId: string,
  ): Promise<void> {
    return this.people.remove(membership.workspaceId, personId);
  }
}
