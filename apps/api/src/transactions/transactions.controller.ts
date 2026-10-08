import {
  createTransactionInputSchema,
  transactionListQuerySchema,
  transactionListResponseSchema,
  transactionSchema,
  updateTransactionInputSchema,
  type CreateTransactionInput,
  type Transaction,
  type TransactionListQuery,
  type UpdateTransactionInput,
} from '@financas/shared';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiQuery,
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
import { TransactionsService } from './transactions.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Transactions (lançamentos) of one workspace, one competência at a time. */
@ApiTags('transactions')
@Controller('workspaces/:workspaceId/transactions')
@WorkspaceScoped()
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiQuery({ name: 'period', example: '2026-10', description: 'Competência (YYYY-MM).' })
  @ApiOkResponse({
    description: 'The competência: credits first, then debits, by due date.',
    schema: openApi(transactionListResponseSchema),
  })
  @ApiBadRequestResponse({ description: 'Missing or invalid period (code INVALID_INPUT).' })
  list(
    @CurrentMembership() membership: WorkspaceMembership,
    @Query({ schema: transactionListQuerySchema }) query: TransactionListQuery,
  ): Promise<Transaction[]> {
    return this.transactions.list(membership.workspaceId, query.period);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createTransactionInputSchema) })
  @ApiCreatedResponse({ description: 'Transaction created.', schema: openApi(transactionSchema) })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT or INVALID_CATEGORY.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createTransactionInputSchema }) input: CreateTransactionInput,
  ): Promise<Transaction> {
    return this.transactions.create(membership.workspaceId, input);
  }

  @Patch(':transactionId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateTransactionInputSchema) })
  @ApiOkResponse({
    description: 'Changed. Settle with { settledAt: "YYYY-MM-DD" }, undo with { settledAt: null }.',
    schema: openApi(transactionSchema),
  })
  @ApiBadRequestResponse({ description: 'INVALID_INPUT or INVALID_CATEGORY.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('transactionId') transactionId: string,
    @Body({ schema: updateTransactionInputSchema }) input: UpdateTransactionInput,
  ): Promise<Transaction> {
    return this.transactions.update(membership.workspaceId, transactionId, input);
  }

  @Delete(':transactionId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Transaction deleted.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiQuery({
    name: 'withShares',
    required: false,
    description: 'true: also deletes the shares split from this debit (ADR 0042).',
  })
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('transactionId') transactionId: string,
    @Query('withShares') withShares?: string,
  ): Promise<void> {
    return this.transactions.remove(membership.workspaceId, transactionId, withShares === 'true');
  }
}
