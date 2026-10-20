import {
  createMerchantAliasInputSchema,
  createMerchantInputSchema,
  merchantListResponseSchema,
  merchantSchema,
  updateMerchantInputSchema,
  type CreateMerchantAliasInput,
  type CreateMerchantInput,
  type Merchant,
  type UpdateMerchantInput,
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
import { MerchantsService } from './merchants.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/**
 * Merchants of one workspace (ADR 0053) and their aliases (ADR 0055): every member reads them,
 * EDITORs and OWNERs change them.
 */
@ApiTags('merchants')
@Controller('workspaces/:workspaceId/merchants')
@WorkspaceScoped()
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  @ApiOkResponse({
    description: 'All merchants, archived too, by name, saying whether each is used.',
    schema: openApi(merchantListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Merchant[]> {
    return this.merchants.list(membership.workspaceId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createMerchantInputSchema) })
  @ApiCreatedResponse({ description: 'Merchant created.', schema: openApi(merchantSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'MERCHANT_EXISTS: same name, ignoring case and accents.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createMerchantInputSchema }) input: CreateMerchantInput,
  ): Promise<Merchant> {
    return this.merchants.create(membership.workspaceId, input);
  }

  @Patch(':merchantId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateMerchantInputSchema) })
  @ApiOkResponse({ description: 'Merchant changed.', schema: openApi(merchantSchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'MERCHANT_EXISTS: same name, ignoring case and accents.' })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('merchantId') merchantId: string,
    @Body({ schema: updateMerchantInputSchema }) input: UpdateMerchantInput,
  ): Promise<Merchant> {
    return this.merchants.update(membership.workspaceId, merchantId, input);
  }

  @Post(':merchantId/aliases')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createMerchantAliasInputSchema) })
  @ApiCreatedResponse({
    description: 'Alias added (ADR 0055); answers the merchant with its aliases.',
    schema: openApi(merchantSchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({
    description: "MERCHANT_ALIAS_EXISTS: the same alias, cleaned, is already a merchant's.",
  })
  addAlias(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('merchantId') merchantId: string,
    @Body({ schema: createMerchantAliasInputSchema }) input: CreateMerchantAliasInput,
  ): Promise<Merchant> {
    return this.merchants.addAlias(membership.workspaceId, merchantId, input);
  }

  @Delete(':merchantId/aliases/:aliasId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Alias removed.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  removeAlias(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('merchantId') merchantId: string,
    @Param('aliasId') aliasId: string,
  ): Promise<void> {
    return this.merchants.removeAlias(membership.workspaceId, merchantId, aliasId);
  }

  @Delete(':merchantId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Merchant deleted.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'MERCHANT_IN_USE: used somewhere; archive it instead.' })
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('merchantId') merchantId: string,
  ): Promise<void> {
    return this.merchants.remove(membership.workspaceId, merchantId);
  }
}
