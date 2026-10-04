import { scrubBreadcrumb, scrubReportedEvent } from '@financas/shared';
import { type ArgumentsHost, Catch } from '@nestjs/common';
import type { ErrorEvent, EventHint, NodeOptions } from '@sentry/nestjs';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

const REDACTED = 'Mensagem omitida: pode conter dados da consulta';

/** Prisma's error messages may repeat the query's arguments (descriptions, amounts, e-mails). */
function isPrismaError(name: string | undefined): boolean {
  return name?.startsWith('PrismaClient') ?? false;
}

function redactedMessage(error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? `${REDACTED} (${code})` : REDACTED;
}

/**
 * Replaces a Prisma error's message (and the copy at the top of its stack) with its error code,
 * e.g. P2002, which is enough to find the cause in Prisma's docs. Run before an error is logged
 * or reported (ADR 0012).
 */
export function redactPrismaError(error: unknown): void {
  if (!(error instanceof Error) || !isPrismaError(error.name)) return;
  const original = error.message;
  error.message = redactedMessage(error);
  error.stack = error.stack?.replace(original, error.message);
}

/**
 * beforeSend of the API's Sentry client: the shared scrubbing, plus Prisma messages redacted
 * again, for errors reported without going through redactPrismaError.
 */
export function scrubApiEvent(event: ErrorEvent, hint: EventHint): ErrorEvent {
  scrubReportedEvent(event);
  for (const exception of event.exception?.values ?? []) {
    if (isPrismaError(exception.type)) exception.value = redactedMessage(hint.originalException);
  }
  return event;
}

/**
 * Nest's last stop for errors (ADR 0034): Sentry's filter reports unexpected errors (not
 * HttpExceptions such as 400/404) and logs them as Nest would, after the Prisma message is gone,
 * so neither the log nor Sentry get the data of a query.
 */
@Catch()
export class AppExceptionFilter extends SentryGlobalFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    redactPrismaError(exception);
    return super.catch(exception, host);
  }
}

/** Sentry settings of the API (ADR 0034), used by instrument.ts and by the tests. */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: process.env.NODE_ENV,
    // Errors only: no performance tracing (tracesSampleRate omitted).
    // The SDK collects all of this by default; financial data must never leave (ADR 0012).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      // Local variables of the failing function could hold amounts and descriptions.
      stackFrameVariables: false,
    },
    beforeSend: scrubApiEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  } satisfies NodeOptions;
}
