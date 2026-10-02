import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { toNodeHandler } from 'better-auth/node';
import { AUTH, AUTH_BASE_PATH, type Auth } from './auth/auth.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';

/**
 * HTTP setup shared by main.ts and the HTTP tests, so tests run the same pipeline as production.
 * The app must be created with `bodyParser: false`: Better Auth reads the raw request body, so
 * its handler is mounted before Nest's JSON parser. Order matters:
 * 1. CORS, so the auth routes answer preflight requests too;
 * 2. Better Auth on /api/auth/*;
 * 3. body parsers for the Nest routes.
 */
export function setupApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // The web app runs on another origin; credentials allow the session cookie (ADR 0007).
  // X-Retry-After: how long a rate-limited client must wait (ADR 0023); the browser only lets the
  // web app read response headers listed here.
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
    exposedHeaders: ['X-Retry-After'],
  });

  app
    .getHttpAdapter()
    .getInstance()
    .all(`${AUTH_BASE_PATH}/{*path}`, toNodeHandler(app.get<Auth>(AUTH)));

  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  app.useGlobalPipes(createValidationPipe());
}
