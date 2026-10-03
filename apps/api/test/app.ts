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

let nextIp = 1;

/**
 * A different fictitious client IP each time, from 198.51.100.0/24 (reserved for documentation,
 * never routable). The database is reset before each test, so reusing an address after 254 calls
 * only matters within a single test.
 */
function newIp() {
  return `198.51.100.${(nextIp++ % 254) + 1}`;
}

/**
 * The real app (same setupApp as main.ts) against the test database, with e-mail captured in
 * memory. `http()` sends the web app's Origin, as a browser would: Better Auth rejects requests
 * with cookies from untrusted origins (CSRF protection). Each `http()` is also a different client
 * IP, so the rate limit (ADR 0023) only kicks in when a test pins one with `http({ ip })`.
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

  const prisma = app.get(PrismaService);
  const http = ({ ip = newIp() }: { ip?: string } = {}) =>
    request
      .agent(app.getHttpServer())
      .set('Origin', testEnv.WEB_ORIGIN)
      // How our proxy tells the API the client IP (ADRs 0023 and 0033).
      .set('X-Client-IP', ip)
      .set('X-Proxy-Secret', testEnv.PROXY_SECRET);

  return {
    app,
    mailer,
    prisma,
    /** A cookie-keeping client: each call is a new "browser". */
    http,
    /** Signs up and returns a browser holding the new user's session, plus ids. */
    async signUp(user: { name: string; email: string; password: string }) {
      const browser = http();
      await browser.post('/api/auth/sign-up/email').send(user).expect(200);
      const { id: userId } = await prisma.user.findUniqueOrThrow({ where: { email: user.email } });
      const personal = await prisma.member.findFirstOrThrow({
        where: { userId, workspace: { isPersonal: true } },
      });
      return { browser, userId, personalWorkspaceId: personal.workspaceId };
    },
  };
}
