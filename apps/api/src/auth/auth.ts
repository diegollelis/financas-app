import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RESET_PASSWORD_PATH,
  resetPasswordInputSchema,
  signUpInputSchema,
} from '@financas/shared';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { z } from 'zod';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Mailer, MailMessage } from '../mail/mailer.js';
import { resetPasswordEmail, verificationEmail } from '../mail/templates.js';

/** Every Better Auth route lives under this prefix (sign-up, sign-in, sign-out, get-session...). */
export const AUTH_BASE_PATH = '/api/auth';

/** Nest injection token for the Better Auth instance. */
export const AUTH = Symbol('AUTH');

type AuthEnv = Pick<Env, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'WEB_ORIGIN'>;

/**
 * Bodies checked with the shared schemas before Better Auth runs (ADR 0006): the API applies the
 * same rules as the web forms, with the same pt-BR messages, and an overlong name becomes a 400
 * instead of a database error.
 */
const bodySchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  '/sign-up/email': signUpInputSchema,
  '/reset-password': resetPasswordInputSchema,
};

const logger = new Logger('Auth');

/**
 * Builds the Better Auth instance (ADRs 0007, 0020 and 0022). Users, sessions and accounts are
 * stored in our own database through Prisma; the session travels in an HttpOnly cookie.
 */
export function createAuth(prisma: PrismaClient, env: AuthEnv, mailer: Mailer) {
  /**
   * Sends without making the request wait. Besides being faster, the response time no longer
   * depends on whether the e-mail exists (a slow send would reveal it). Failures are logged
   * without the message, whose link carries a token (ADR 0012).
   */
  function deliver(kind: string, message: MailMessage): Promise<void> {
    mailer.send(message).catch((error: unknown) => {
      logger.error(`Could not send the ${kind} e-mail: ${(error as Error).message}`);
    });
    return Promise.resolve();
  }

  /** Links in e-mails always lead back to the web app, whatever the request asked for. */
  function withCallback(url: string, path: string): string {
    const link = new URL(url);
    link.searchParams.set('callbackURL', new URL(path, env.WEB_ORIGIN).toString());
    return link.toString();
  }

  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    basePath: AUTH_BASE_PATH,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Requests that carry cookies are only accepted from these origins (CSRF protection).
    trustedOrigins: [env.WEB_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Not yet: without our own domain, Resend only delivers to the account owner (ADR 0022).
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 60,
      // Whoever had the old password (maybe an attacker) is signed out everywhere.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) =>
        deliver(
          'password reset',
          resetPasswordEmail(user.email, user.name, withCallback(url, RESET_PASSWORD_PATH)),
        ),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: ({ user, url }) =>
        deliver('verification', verificationEmail(user.email, user.name, withCallback(url, '/'))),
    },
    // Brute force and e-mail flooding protection (ADR 0023): per client IP and route. A blocked
    // request gets 429 with an X-Retry-After header (seconds).
    rateLimit: {
      // Also in development and tests (Better Auth's default is production only), so the
      // behavior is the same everywhere and can be tested.
      enabled: true,
      storage: 'database',
      // Any other auth route.
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        // Routes that send e-mail: they must not become a way to flood someone's inbox.
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
        '/reset-password': { window: 300, max: 5 },
        '/reset-password/*': { window: 300, max: 5 },
      },
    },
    hooks: {
      before: createAuthMiddleware((ctx): Promise<{ context: { body: unknown } } | undefined> => {
        const schema = bodySchemas[ctx.path];
        if (!schema) return Promise.resolve(undefined);
        const result = schema.safeParse(ctx.body);
        if (!result.success) {
          throw new APIError('BAD_REQUEST', {
            code: 'INVALID_INPUT',
            message: result.error.issues[0]?.message ?? 'Dados inválidos.',
          });
        }
        // Continues with the parsed body (e.g. the name already trimmed).
        const body = ctx.body as Record<string, unknown>;
        return Promise.resolve({ context: { body: { ...body, ...result.data } } });
      }),
    },
    advanced: {
      // false: Better Auth leaves the id to Prisma, which generates UUIDv7 (ADR 0017).
      database: { generateId: false },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
