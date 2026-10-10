import {
  accountDeletionSchema,
  accountSecuritySchema,
  dataExportSchema,
  todayIso,
  type AccountDeletion,
  type AccountSecurity,
} from '@financas/shared';
import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  type SchemaObject,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthSession } from '../auth/auth.js';
import { CurrentSession, CurrentUser } from '../auth/current-user.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountSecurityService } from './account-security.service.js';
import { DataExportService } from './data-export.service.js';

/** The signed-in person's own account (ADR 0041). */
@ApiTags('account')
@ApiCookieAuth()
@Controller('me')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(
    private readonly dataExport: DataExportService,
    private readonly accountDeletion: AccountDeletionService,
    private readonly accountSecurity: AccountSecurityService,
  ) {}

  /**
   * How the account is protected (ADR 0049): whether it has a password, and the devices it is
   * signed in on, without tokens or IPs. Changing the name or the password, and signing the
   * other devices out, go through Better Auth (/api/auth/update-user, /change-password and
   * /revoke-other-sessions).
   */
  @Get('security')
  @ApiOkResponse({
    description: 'Whether the account has a password, and its open sessions.',
    schema: z.toJSONSchema(accountSecuritySchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  security(
    @CurrentUser() user: AuthSession['user'],
    @CurrentSession() session: AuthSession['session'],
  ): Promise<AccountSecurity> {
    return this.accountSecurity.describe(user.id, session.id);
  }

  /**
   * What deleting the account would need resolved first (ADR 0041): the workspaces the person
   * owns with others in them or invited. The deletion itself goes through Better Auth
   * (POST /api/auth/delete-user), which checks the same.
   */
  @Get('deletion')
  @ApiOkResponse({
    description: 'The workspaces that block the deletion; empty when nothing does.',
    schema: z.toJSONSchema(accountDeletionSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  async deletion(@CurrentUser() user: AuthSession['user']): Promise<AccountDeletion> {
    return { blockers: await this.accountDeletion.blockers(user.id) };
  }

  /**
   * Everything the app keeps about the person, as a JSON file to download (LGPD, art. 18). Not
   * cached anywhere on the way, and never logged (ADR 0012).
   */
  @Get('export')
  @ApiOkResponse({
    description: 'The data export, as an attachment.',
    schema: z.toJSONSchema(dataExportSchema, { target: 'openapi-3.0' }) as SchemaObject,
  })
  @ApiUnauthorizedResponse({ description: 'No valid session cookie.' })
  async export(@CurrentUser() user: AuthSession['user'], @Res() response: Response) {
    const data = await this.dataExport.exportFor(user.id);
    response
      .status(200)
      .type('application/json')
      .set({
        'Content-Disposition': `attachment; filename="financas-dados-${todayIso()}.json"`,
        'Cache-Control': 'no-store',
      })
      // Indented: the person may open it in a text editor.
      .send(JSON.stringify(data, null, 2));
  }
}
