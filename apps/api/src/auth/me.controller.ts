import { meResponseSchema, type MeResponse } from '@financas/shared';
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthSession } from './auth.js';
import { CurrentUser } from './current-user.decorator.js';
import { SessionGuard } from './session.guard.js';

@ApiTags('auth')
@ApiCookieAuth()
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  @ApiOkResponse({
    description: 'The signed-in user.',
    schema: z.toJSONSchema(meResponseSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  me(@CurrentUser() user: AuthSession['user']): MeResponse {
    // parse() keeps only the contract's fields, so nothing else about the user leaks by accident.
    return meResponseSchema.parse(user);
  }
}
