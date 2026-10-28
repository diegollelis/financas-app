import {
  cardListResponseSchema,
  cardSchema,
  createCardInputSchema,
  updateCardInputSchema,
  type Card,
  type CreateCardInput,
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
