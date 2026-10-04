import { scrubBreadcrumb, scrubReportedEvent } from '@financas/shared';
import * as Sentry from '@sentry/react';
import type { RootOptions } from 'react-dom/client';
import { env } from './env';

/**
 * Starts error reporting (ADR 0034) when the build has a DSN; without one (development, tests),
 * it does nothing. Errors only: no performance tracing and no Session Replay, which would record
 * the screen, amounts included (ADR 0012).
 */
export function initErrorReporting() {
  if (!env.VITE_SENTRY_DSN) return;
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // The SDK collects all of this by default; financial data must never leave.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    beforeSend: (event) => scrubReportedEvent(event),
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

/**
 * React 19 reports render errors through these root callbacks. Without a DSN, React keeps its
 * defaults (the errors go to the console).
 */
export function errorReportingRootOptions(): RootOptions {
  if (!env.VITE_SENTRY_DSN) return {};
  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
}
