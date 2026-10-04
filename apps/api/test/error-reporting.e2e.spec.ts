import type { Server } from 'node:http';
import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { sentryOptions } from '../src/common/error-reporting.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';

// Error reporting (ADR 0034) through the real app: the global filter, the SDK and the scrubbing.
// Events are captured right before they would leave for Sentry. All data here is fictitious.

// Kept away from the code that fails: Sentry attaches a few source lines around each frame, and
// in the app those lines never hold user data.
const description = ['Aluguel', 'Exemplo'].join(' ');
const sessionCookie = 'better-auth.session_token=' + ['segredo', 'de', 'teste'].join('-');

/** The event as it would leave: the SDK drops its internal metadata when sending (envelope.js). */
function asSent(event: ErrorEvent): string {
  return JSON.stringify({ ...event, sdkProcessingMetadata: undefined });
}

@Controller('test-errors')
class FailingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('unexpected')
  unexpected() {
    throw new Error('Falha inesperada de teste');
  }

  @Get('not-found')
  notFound() {
    throw new NotFoundException();
  }

  /** A real Prisma error, whose message repeats the arguments of the query. */
  @Get('prisma')
  async prismaError() {
    await this.prisma.user.create({
      data: { name: description, email: 12345 as unknown as string },
    });
  }
}

describe('error reporting', () => {
  let app: NestExpressApplication<Server>;
  const sent: ErrorEvent[] = [];

  beforeAll(async () => {
    const options = sentryOptions('https://public@sentry.example.com/1');
    Sentry.init({
      ...options,
      // What would be sent is kept here instead (null: nothing leaves the test).
      beforeSend: (event, hint) => {
        sent.push(options.beforeSend(event, hint));
        return null;
      },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FailingController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication<Server>>({
      bodyParser: false,
      logger: false,
    });
    setupApp(app);
    await app.init();
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await Sentry.close();
  });

  async function call(path: string, status: number) {
    await request(app.getHttpServer())
      .get(`/api/test-errors/${path}`)
      .set('Cookie', sessionCookie)
      .expect(status);
    await Sentry.flush(2000);
  }

  it('reports an unexpected error, and the client still gets a plain 500', async () => {
    await call('unexpected', 500);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.exception?.values?.[0]?.value).toBe('Falha inesperada de teste');
    expect(asSent(sent[0]!)).not.toContain('segredo');
  });

  it('does not report expected HTTP errors', async () => {
    await call('not-found', 404);

    expect(sent).toHaveLength(0);
  });

  it('reports a Prisma error without the data of the query', async () => {
    await call('prisma', 500);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.exception?.values?.[0]?.type).toMatch(/^PrismaClient/);
    expect(asSent(sent[0]!)).not.toContain('Aluguel');
  });
});
