import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, signUpInputSchema } from '@financas/shared';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/** Every Better Auth route lives under this prefix (sign-up, sign-in, sign-out, get-session...). */
export const AUTH_BASE_PATH = '/api/auth';

/** Nest injection token for the Better Auth instance. */
export const AUTH = Symbol('AUTH');

type AuthEnv = Pick<Env, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'WEB_ORIGIN'>;

/**
 * Builds the Better Auth instance (ADRs 0007 and 0020). Users, sessions and accounts are stored
 * in our own database through Prisma; the session travels in an HttpOnly cookie.
 */
export function createAuth(prisma: PrismaClient, env: AuthEnv) {
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
    },
    hooks: {
      // The shared schema is the source of truth (ADR 0006): sign-up goes through the same rules
      // as the web form, and an overlong name becomes a 400 instead of a database error.
      before: createAuthMiddleware((ctx): Promise<{ context: { body: unknown } } | undefined> => {
        if (ctx.path !== '/sign-up/email') return Promise.resolve(undefined);
        const result = signUpInputSchema.safeParse(ctx.body);
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
