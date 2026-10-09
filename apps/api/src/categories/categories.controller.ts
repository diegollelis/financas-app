import {
  categoryListResponseSchema,
  categorySchema,
  copyCategoriesInputSchema,
  copyCategoriesResultSchema,
  createCategoryInputSchema,
  updateCategoryInputSchema,
  type Category,
  type CopyCategoriesInput,
  type CopyCategoriesResult,
  type CreateCategoryInput,
  type UpdateCategoryInput,
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
import type { AuthSession } from '../auth/auth.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  CurrentMembership,
  RequireRole,
  WorkspaceScoped,
  type WorkspaceMembership,
} from '../workspaces/workspace-member.guard.js';
import { CategoriesService } from './categories.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** Categories of one workspace: every member reads them, EDITORs and OWNERs change them. */
@ApiTags('categories')
@Controller('workspaces/:workspaceId/categories')
@WorkspaceScoped()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOkResponse({
    description: 'All categories, archived too: credits first, then debits, by name.',
    schema: openApi(categoryListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Category[]> {
    return this.categories.list(membership.workspaceId);
  }

  @Post()
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(createCategoryInputSchema) })
  @ApiCreatedResponse({ description: 'Category created.', schema: openApi(categorySchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'CATEGORY_EXISTS: same name and type, ignoring case.' })
  create(
    @CurrentMembership() membership: WorkspaceMembership,
    @Body({ schema: createCategoryInputSchema }) input: CreateCategoryInput,
  ): Promise<Category> {
    return this.categories.create(membership.workspaceId, input);
  }

  @Post('copy')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(copyCategoriesInputSchema) })
  @ApiCreatedResponse({
    description:
      "Copied from another of the person's workspaces (ADR 0048): how many were created and skipped.",
    schema: openApi(copyCategoriesResultSchema),
  })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  copy(
    @CurrentMembership() membership: WorkspaceMembership,
    @CurrentUser() user: AuthSession['user'],
    @Body({ schema: copyCategoriesInputSchema }) input: CopyCategoriesInput,
  ): Promise<CopyCategoriesResult> {
    return this.categories.copy(membership.workspaceId, user.id, input);
  }

  @Patch(':categoryId')
  @RequireRole('EDITOR')
  @ApiBody({ schema: openApi(updateCategoryInputSchema) })
  @ApiOkResponse({ description: 'Renamed and/or (un)archived.', schema: openApi(categorySchema) })
  @ApiBadRequestResponse({ description: 'Invalid input (code INVALID_INPUT).' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  @ApiConflictResponse({ description: 'CATEGORY_EXISTS: same name and type, ignoring case.' })
  update(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('categoryId') categoryId: string,
    @Body({ schema: updateCategoryInputSchema }) input: UpdateCategoryInput,
  ): Promise<Category> {
    return this.categories.update(membership.workspaceId, categoryId, input);
  }

  @Delete(':categoryId')
  @RequireRole('EDITOR')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Category deleted.' })
  @ApiForbiddenResponse({ description: 'VIEWERs only read.' })
  remove(
    @CurrentMembership() membership: WorkspaceMembership,
    @Param('categoryId') categoryId: string,
  ): Promise<void> {
    return this.categories.remove(membership.workspaceId, categoryId);
  }
}
