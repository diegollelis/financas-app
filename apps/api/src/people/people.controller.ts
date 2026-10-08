import {
  createPersonInputSchema,
  personListResponseSchema,
  personSchema,
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
import { PeopleService } from './people.service.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' }) as SchemaObject;

/** People of one workspace (ADR 0042): every member reads them, EDITORs and OWNERs change them. */
@ApiTags('people')
@Controller('workspaces/:workspaceId/people')
@WorkspaceScoped()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @ApiOkResponse({
    description: 'All people, archived too, by name, with what is pending each way.',
    schema: openApi(personListResponseSchema),
  })
  list(@CurrentMembership() membership: WorkspaceMembership): Promise<Person[]> {
    return this.people.list(membership.workspaceId);
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
