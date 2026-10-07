import {
  acceptTermsInputSchema,
  meResponseSchema,
  type AcceptTermsInput,
  type MeResponse,
} from '@financas/shared';
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthSession } from './auth.js';
import { CurrentUser } from './current-user.decorator.js';
import { SessionGuard } from './session.guard.js';

const openApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;

@ApiTags('auth')
@ApiCookieAuth()
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ description: 'The signed-in user.', schema: openApi(meResponseSchema) })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  me(@CurrentUser() user: AuthSession['user']): MeResponse {
    // parse() keeps only the contract's fields, so nothing else about the user leaks by accident.
    return meResponseSchema.parse(user);
  }

  /**
   * Records that the user accepted the terms in force (ADR 0041): the accounts created before
   * them, and those created with Google, which has no checkbox. Accepting again is harmless.
   */
  @Post('terms')
  @HttpCode(200)
  @ApiBody({ schema: openApi(acceptTermsInputSchema) })
  @ApiOkResponse({
    description: 'The user, with the terms accepted.',
    schema: openApi(meResponseSchema),
  })
  @ApiBadRequestResponse({ description: 'Not the version in force (code INVALID_INPUT).' })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  async acceptTerms(
    @CurrentUser() user: AuthSession['user'],
    @Body({ schema: acceptTermsInputSchema }) input: AcceptTermsInput,
  ): Promise<MeResponse> {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { termsVersion: input.version, termsAcceptedAt: new Date() },
    });
    return meResponseSchema.parse(updated);
  }
}
