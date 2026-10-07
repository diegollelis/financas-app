import { dataExportSchema, todayIso } from '@financas/shared';
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
import { DataExportService } from './data-export.service.js';

/** The signed-in person's own account (ADR 0041). */
@ApiTags('account')
@ApiCookieAuth()
@Controller('me')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(private readonly dataExport: DataExportService) {}

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
