import {
  cardListResponseSchema,
  cardSchema,
  createCardInputSchema,
  linkCardInputSchema,
  linkCardResponseSchema,
  unlinkedCardTransactionsSchema,
  updateCardInputSchema,
  type Card,
  type CreateCardInput,
  type LinkCardInput,
  type LinkCardResponse,
  type UnlinkedCardTransactions,
  type UpdateCardInput,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
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
import { CardsService } from './cards.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Cards of one workspace (ADR 0062): every member reads them, EDITORs and OWNERs change them. */
@ApiTags('cards')
@Controller('workspaces/:workspaceId/cards')
@WorkspaceScoped()
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  @ApiOkResponse({
    description: 'All cards, archived too, by name, saying whether each is used.',
    schema: openApi(cardListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Card[]> {
    return this.cards.list(membership.workspaceId);
  }

  @Get('unlinked')
  @ApiOkResponse({
    description:
      'Transactions with no card in the Crédito (still to pay) and Débito methods, which the first card offers to take (ADR 0062 note).',
    schema: openApi(unlinkedCardTransactionsSchema),
  })
  unlinked(
    @CurrentMembership() membership: WorkspaceMembership,
  ): Promise<UnlinkedCardTransactions> {
    return this.cards.unlinked(membership.workspaceId);
  }

  @Post(':cardId/link')
  @RequireRole('EDITOR')
  @HttpCode(200)
  @ApiBody({ schema: openApi(linkCardInputSchema) })
  @ApiOkResponse({
    description:
      'The card given to those transactions, and to the running recurrences and plans of those methods with no card.',
    schema: openApi(linkCardResponseSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_CARD: archived, or without a function chosen.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  link(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('cardId') cardId: string,
    @Body({ schema: linkCardInputSchema }) input: LinkCardInput,
  ): Promise<LinkCardResponse> {
    return this.cards.link(membership.workspaceId, cardId, input);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createCardInputSchema) })
  @ApiCreatedResponse({ description: 'Card created.', schema: openApi(cardSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'CARD_EXISTS: same name, ignoring case and accents.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createCardInputSchema }) input: CreateCardInput,
  ): Promise<Card> {
    return this.cards.create(membership.workspaceId, input);
  }

  @Patch(':cardId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateCardInputSchema) })
  @ApiOkResponse({ description: 'Card changed.', schema: openApi(cardSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({
    description:
      'CARD_EXISTS: same name. CARD_FUNCTION_IN_USE: a function taken away is used by something.',
  })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('cardId') cardId: string,
    @Body({ schema: updateCardInputSchema }) input: UpdateCardInput,
  ): Promise<Card> {
    return this.cards.update(membership.workspaceId, cardId, input);
  }

  @Delete(':cardId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Card deleted.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'CARD_IN_USE: used somewhere; archive it instead.' })
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('cardId') cardId: string,
  ): Promise<void> {
    return this.cards.remove(membership.workspaceId, cardId);
  }
}
