import {
  DELETE_ACCOUNT_PATH,
  FORGOT_PASSWORD_PATH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  changeEmailInputSchema,
  changePasswordInputSchema,
  RESET_PASSWORD_PATH,
  resetPasswordInputSchema,
  safeReturnTo,
  SIGN_IN_PATH,
  signUpInputSchema,
  TERMS_VERSION,
  updateNameInputSchema,
} from '@financas/shared';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import * as Sentry from '@sentry/nestjs';
import type { z } from 'zod';
import { CLIENT_IP_HEADER } from '../common/client-ip.js';
import { redactPrismaError } from '../common/error-reporting.js';
import type { Env } from '../config/env.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Mailer, MailMessage } from '../mail/mailer.js';
import {
  changeEmailNoticeEmail,
  changeEmailVerificationEmail,
  deleteAccountEmail,
  existingAccountEmail,
  resetPasswordEmail,
  verificationEmail,
} from '../mail/templates.js';

/** Every Better Auth route lives under this prefix (sign-up, sign-in, sign-out, get-session...). */
export const AUTH_BASE_PATH = '/api/auth';

/** Nest injection token for the Better Auth instance. */
export const AUTH = Symbol('AUTH');

type AuthEnv = Pick<
  Env,
  | 'BETTER_AUTH_SECRET'
  | 'BETTER_AUTH_URL'
  | 'WEB_ORIGIN'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
>;

/**
 * Bodies checked with the shared schemas before Better Auth runs (ADR 0006): the API applies the
 * same rules as the web forms, with the same pt-BR messages, and an overlong name becomes a 400
 * instead of a database error.
 */
const bodySchemas: Record<string, z.ZodType<Record<string, unknown>>> = {
  '/sign-up/email': signUpInputSchema,
  '/reset-password': resetPasswordInputSchema,
  '/update-user': updateNameInputSchema,
  '/change-password': changePasswordInputSchema,
  '/change-email': changeEmailInputSchema,
};

/**
 * Routes whose body is only what the schema allows (ADR 0049), with what the server imposes on
 * top: "update-user" changes the name and nothing else, and changing the password always signs
 * the other devices out, whatever the request says.
 */
const strictBodies: Record<string, Record<string, unknown>> = {
  '/update-user': {},
  '/change-password': { revokeOtherSessions: true },
  '/change-email': {},
};

const logger = new Logger('Auth');

/**
 * Builds the Better Auth instance (ADRs 0007, 0020 and 0022). Users, sessions and accounts are
 * stored in our own database through Prisma; the session travels in an HttpOnly cookie.
 */
export function createAuth(
  prisma: PrismaClient,
  env: AuthEnv,
  mailer: Mailer,
  lifecycle: {
    /** Runs after a user is created, by any sign-up method (e-mail or Google): ADR 0024. */
    onUserCreated: (userId: string) => Promise<void>;
    /** Throws Better Auth's 409 while a workspace blocks deleting the account (ADR 0041). */
    ensureDeletable: (userId: string) => Promise<void>;
    /** Checks again and deletes what only this user owns, right before the user goes. */
    beforeUserDeleted: (user: { id: string; email: string }) => Promise<void>;
  },
) {
  /**
   * Sends without making the request wait. Besides being faster, the response time no longer
   * depends on whether the e-mail exists (a slow send would reveal it). Failures are logged
   * without the message, whose link carries a token (ADR 0012).
   */
  function deliver(kind: string, message: MailMessage): Promise<void> {
    mailer.send(message).catch((error: unknown) => {
      logger.error(`Could not send the ${kind} e-mail: ${(error as Error).message}`);
      Sentry.captureException(error);
    });
    return Promise.resolve();
  }

  /** Links in e-mails always lead back to the web app, whatever the request asked for. */
  function withCallback(url: string, path: string): string {
    const link = new URL(url);
    link.searchParams.set('callbackURL', new URL(path, env.WEB_ORIGIN).toString());
    return link.toString();
  }

  /**
   * The verification link goes back to the page the person was heading to (an invitation, ADR
   * 0027), sent as `callbackURL` by the sign-up or sign-in form. Only a path inside the web app:
   * anything else becomes the home page (open redirect).
   */
  function verificationLink(url: string): string {
    return withCallback(url, safeReturnTo(new URL(url).searchParams.get('callbackURL')));
  }

  /** A page of the web app, for links in e-mails. */
  const webPage = (path: string) => new URL(path, env.WEB_ORIGIN).toString();

  /**
   * Account pre-hijacking protection (ADR 0026). Anyone can still sign up with someone else's
   * e-mail and a password of their own: the account just stays unverified, so the password does
   * not sign in (ADR 0022). When the real
   * owner later signs in with Google, Better Auth links the accounts and marks the e-mail as
   * verified, and the intruder's password would keep working. So, when an external account is
   * linked to a user whose e-mail was never verified, that password and every open session go.
   */
  async function dropUnverifiedCredentials(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    if (!user || user.emailVerified) return;
    await prisma.$transaction([
      prisma.account.deleteMany({ where: { userId, providerId: 'credential' } }),
      prisma.session.deleteMany({ where: { userId } }),
    ]);
  }

  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    basePath: AUTH_BASE_PATH,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Requests that carry cookies are only accepted from these origins (CSRF protection).
    trustedOrigins: [env.WEB_ORIGIN],
    user: {
      // The terms of use accepted (ADR 0041). Never set from a request body (input: false): the
      // e-mail sign-up records them below, and POST /me/terms records the rest.
      additionalFields: {
        termsVersion: { type: 'string', required: false, input: false },
        termsAcceptedAt: { type: 'date', required: false, input: false, returned: false },
      },
      // Account deletion (ADR 0041), confirmed by an e-mailed link. The link opens a page of
      // the web app, which asks once more and sends the token back (POST /delete-user with
      // { token }): Better Auth's own GET callback would need a session in whatever browser
      // opened the e-mail, and would delete in a single tap.
      // Changing the e-mail (ADR 0049): the link goes to the new address, through
      // sendVerificationEmail below, and the e-mail changes only once it is opened. An address
      // that already has an account gets the same answer and no e-mail (it would reveal it).
      changeEmail: { enabled: true },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 60 * 60,
        sendDeleteAccountVerification: ({ user, token }) =>
          deliver(
            'account deletion',
            deleteAccountEmail(
              user.email,
              user.name,
              webPage(`${DELETE_ACCOUNT_PATH}?token=${encodeURIComponent(token)}`),
            ),
          ),
        beforeDelete: (user) => lifecycle.beforeUserDeleted(user),
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Signing in with a password needs a verified e-mail (ADR 0022). Signing up creates no
      // session, and a repeated e-mail gets the same answer as a new one (Better Auth hashes a
      // password anyway, so not even the timing tells them apart).
      requireEmailVerification: true,
      // The owner of that repeated e-mail hears it instead, with the way in.
      onExistingUserSignUp: ({ user }) =>
        deliver(
          'existing account',
          existingAccountEmail(user.email, user.name, {
            signIn: webPage(SIGN_IN_PATH),
            resetPassword: webPage(FORGOT_PASSWORD_PATH),
          }),
        ),
      resetPasswordTokenExpiresIn: 60 * 60,
      // Whoever had the old password (maybe an attacker) is signed out everywhere.
      revokeSessionsOnPasswordReset: true,
      // The reset link went to the e-mail, so whoever opened it owns it: verified, without a
      // second e-mail on the next sign-in. Any password set before (ADR 0026) is already gone.
      onPasswordReset: async ({ user }) => {
        if (!user.emailVerified) {
          await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
        }
      },
      sendResetPassword: ({ user, url }) =>
        deliver(
          'password reset',
          resetPasswordEmail(user.email, user.name, withCallback(url, RESET_PASSWORD_PATH)),
        ),
    },
    account: {
      accountLinking: {
        // Better Auth refuses by default to link Google to an account whose e-mail is not verified,
        // which locks the real owner out. We link (Google proves the e-mail is theirs) and remove
        // the old password and sessions in dropUnverifiedCredentials (ADR 0026).
        requireLocalEmailVerified: false,
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              // Lets someone with several Google accounts pick the right one.
              prompt: 'select_account',
            },
          }
        : {},
    emailVerification: {
      sendOnSignUp: true,
      // A sign-in with the right password but an unverified e-mail sends a new link: the way
      // back for whoever lost the first one.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        // A change of e-mail comes here with the new address as `user.email` (ADR 0049): it
        // gets its own message, and the address in use hears of it at once.
        const stored = await prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true },
        });
        if (stored && stored.email !== user.email) {
          await deliver(
            'e-mail change',
            changeEmailVerificationEmail(user.email, user.name, verificationLink(url)),
          );
          return deliver(
            'e-mail change notice',
            changeEmailNoticeEmail(
              stored.email,
              user.name,
              user.email,
              webPage(FORGOT_PASSWORD_PATH),
            ),
          );
        }
        return deliver(
          'verification',
          verificationEmail(user.email, user.name, verificationLink(url)),
        );
      },
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
        // Sends an e-mail too.
        '/delete-user': { window: 300, max: 3 },
        // Guessing the current password, as signing in (ADR 0049).
        '/change-password': { window: 300, max: 5 },
        // Sends two e-mails (ADR 0049).
        '/change-email': { window: 300, max: 3 },
      },
    },
    databaseHooks: {
      account: {
        create: {
          // Before the link is saved: Better Auth marks the e-mail as verified right after it.
          before: async (account) => {
            if (account.providerId !== 'credential')
              await dropUnverifiedCredentials(account.userId);
          },
        },
      },
      user: {
        create: {
          // The e-mail sign-up only gets here with acceptTerms checked (bodySchemas). A Google
          // sign-up has no checkbox: the web app asks on the first visit (ADR 0041).
          before: (user, context) =>
            Promise.resolve(
              context?.path === '/sign-up/email'
                ? { data: { ...user, termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() } }
                : undefined,
            ),
          // Runs after the user is committed. A failure must not fail the sign-up: the user can
          // already sign in, and listing workspaces creates the missing personal one.
          after: (user) =>
            lifecycle.onUserCreated(user.id).catch((error: unknown) => {
              redactPrismaError(error);
              logger.error(`Could not create the personal workspace: ${(error as Error).message}`);
              Sentry.captureException(error);
            }),
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(
        async (ctx): Promise<{ context: { body: unknown } } | undefined> => {
          // Asking to delete the account: no link goes out while a workspace blocks it, so the
          // person learns at once what to resolve (the deletion itself checks again).
          if (
            ctx.path === '/delete-user' &&
            !(ctx.body as { token?: unknown } | undefined)?.token
          ) {
            const session = await getSessionFromCtx(ctx);
            if (session) await lifecycle.ensureDeletable(session.user.id);
            return undefined;
          }
          const schema = bodySchemas[ctx.path];
          if (!schema) return undefined;
          const result = schema.safeParse(ctx.body);
          if (!result.success) {
            throw new APIError('BAD_REQUEST', {
              code: 'INVALID_INPUT',
              message: result.error.issues[0]?.message ?? 'Dados inválidos.',
            });
          }
          const imposed = strictBodies[ctx.path];
          if (imposed) {
            // Better Auth merges the body returned here into the request's: anything the schema
            // does not allow has to be removed from the request's own body.
            const body = ctx.body as Record<string, unknown>;
            for (const key of Object.keys(body)) if (!(key in result.data)) delete body[key];
            return { context: { body: { ...result.data, ...imposed } } };
          }
          // Continues with the parsed body (e.g. the name already trimmed). acceptTerms has done its
          // job here; Better Auth does not know it.
          const body = ctx.body as Record<string, unknown>;
          delete body.acceptTerms;
          const parsed: Record<string, unknown> = { ...result.data };
          delete parsed.acceptTerms;
          return { context: { body: { ...body, ...parsed } } };
        },
      ),
    },
    advanced: {
      // Set only by our proxy; trustProxiedClientIp drops it from anyone else (ADR 0033).
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      // false: Better Auth leaves the id to Prisma, which generates UUIDv7 (ADR 0017).
      database: { generateId: false },
    },
    // Better Auth answers its own routes, outside Nest's exception filter, and calls this for
    // every error, expected ones included (wrong password, no session). Only unexpected errors go
    // to Sentry (ADR 0034); the log keeps just the error's name, never a message that may hold data.
    onAPIError: {
      onError: (error) => {
        if (error instanceof APIError && error.status !== 'INTERNAL_SERVER_ERROR') return;
        redactPrismaError(error);
        logger.error(`Unexpected auth error: ${(error as Error).name}`);
        Sentry.captureException(error);
      },
    },
    // Better Auth logs some events at "info" with the e-mail in the message (a sign-up with an
    // existing e-mail, for one). Pinned at its default "warn", so an upgrade that changes the
    // default cannot start logging e-mails (ADR 0012).
    logger: { level: 'warn' },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
