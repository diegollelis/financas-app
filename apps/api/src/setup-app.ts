import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { toNodeHandler } from 'better-auth/node';
import { AUTH, AUTH_BASE_PATH, type Auth } from './auth/auth.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';

/** Prefix of every API route, Nest's and Better Auth's (`/api/auth`). */
const API_PREFIX = 'api';

/**
 * HTTP setup shared by main.ts and the HTTP tests, so tests run the same pipeline as production.
 * The app must be created with `bodyParser: false`: Better Auth reads the raw request body, so
 * its handler is mounted before Nest's JSON parser. Order matters:
 * 1. CORS, so the auth routes answer preflight requests too;
 * 2. Better Auth on /api/auth/*;
 * 3. body parsers for the Nest routes, which live under /api.
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

  // Every Nest route lives under /api too, like Better Auth's: in production the web app's proxy
  // forwards only /api/* to this API (ADR 0033), so local and production paths are the same.
  app.setGlobalPrefix(API_PREFIX);

  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  app.useGlobalPipes(createValidationPipe());
}
