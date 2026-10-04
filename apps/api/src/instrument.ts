import * as Sentry from '@sentry/nestjs';
import { sentryOptions } from './common/error-reporting.js';

// Error reporting (ADR 0034). In production the container loads this file before the app
// (`node --import ./dist/instrument.js`): in ESM, that is the only way for Sentry to see the HTTP
// server and attach the route to each error. main.ts imports it too, for `pnpm dev`.
// Without SENTRY_DSN (development, tests) nothing starts and every Sentry call is a no-op.
// ConfigModule has not validated the environment yet, so this file reads process.env itself.
const dsn = process.env.SENTRY_DSN;
if (dsn) Sentry.init(sentryOptions(dsn));
