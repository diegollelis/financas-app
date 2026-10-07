import {
  accountDeletionSchema,
  dataExportSchema,
  todayIso,
  type AccountDeletion,
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
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AccountDeletionService } from './account-deletion.service.js';
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
  ) {}

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
