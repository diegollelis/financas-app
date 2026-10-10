import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { toNodeHandler } from 'better-auth/node';
import { json } from 'express';
import { AUTH, AUTH_BASE_PATH, type Auth } from './auth/auth.js';
import { trustProxiedClientIp } from './common/client-ip.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';

/** Prefix of every API route, Nest's and Better Auth's (`/api/auth`). */
const API_PREFIX = 'api';

/** The import route (ADR 0040), whose body is a whole spreadsheet's transactions. */
const IMPORTS_PATH = `/${API_PREFIX}/workspaces/:workspaceId/imports`;
const IMPORT_BODY_LIMIT = '4mb';

/**
 * HTTP setup shared by main.ts and the HTTP tests, so tests run the same pipeline as production.
 * The app must be created with `bodyParser: false`: Better Auth reads the raw request body, so
 * its handler is mounted before Nest's JSON parser. Order matters:
 * 1. CORS, so the auth routes answer preflight requests too;
 * 2. the trusted client IP, which Better Auth's rate limit reads (ADRs 0023 and 0033);
 * 3. Better Auth on /api/auth/*;
 * 4. body parsers for the Nest routes, which live under /api.
 */
export function setupApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Express announces itself in every answer (X-Powered-By): nothing a client needs, and a hint
  // to whoever looks for known flaws (note of 2026-10-10 in ADR 0041).
  app.disable('x-powered-by');

  // Locally the web app runs on another origin (in production the proxy puts both on one, ADR
  // 0033); credentials allow the session cookie (ADR 0007).
  // X-Retry-After: how long a rate-limited client must wait (ADR 0023); the browser only lets the
  // web app read response headers listed here.
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
    exposedHeaders: ['X-Retry-After'],
  });

  app.use(trustProxiedClientIp(config.get('PROXY_SECRET', { infer: true })));

  app
    .getHttpAdapter()
    .getInstance()
    .all(`${AUTH_BASE_PATH}/{*path}`, toNodeHandler(app.get<Auth>(AUTH)));

  // Every Nest route lives under /api too, like Better Auth's: in production the web app's proxy
  // forwards only /api/* to this API (ADR 0033), so local and production paths are the same.
  app.setGlobalPrefix(API_PREFIX);

  // A spreadsheet import (ADR 0040) carries up to 2,000 transactions, some 500 KB and at most
  // about 3 MB: a larger limit for that route only, mounted first (a parsed body is not parsed
  // again). Every other route keeps the default 100 KB.
  app
    .getHttpAdapter()
    .getInstance()
    .post(IMPORTS_PATH, json({ limit: IMPORT_BODY_LIMIT }));
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  app.useGlobalPipes(createValidationPipe());
}
