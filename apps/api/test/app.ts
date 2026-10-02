import type { Server } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Mailer } from '../src/mail/mailer.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { setupApp } from '../src/setup-app.js';
import { FakeMailer } from './fake-mailer.js';
import { testEnv } from './test-env.js';

/**
 * The real app (same setupApp as main.ts) against the test database, with e-mail captured in
 * memory. `http()` sends the web app's Origin, as a browser would: Better Auth rejects requests
 * with cookies from untrusted origins (CSRF protection).
 */
export async function createTestApp() {
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication<Server>>({
    bodyParser: false,
    logger: false,
  });
  setupApp(app);
  await app.init();

  return {
    app,
    mailer,
    prisma: app.get(PrismaService),
    /** A cookie-keeping client: each call is a new "browser". */
    http: () => request.agent(app.getHttpServer()).set('Origin', testEnv.WEB_ORIGIN),
  };
}
