import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Signs session cookies and tokens (ADR 0007). Never reuse it between environments.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Public URL of this API; Better Auth builds callback and e-mail links from it.
    BETTER_AUTH_URL: z.url().default('http://localhost:3333'),
    // E-mail (ADR 0022): Mailpit (fake inbox in Docker) in development, Resend in production.
    MAIL_TRANSPORT: z.enum(['mailpit', 'resend']).default('mailpit'),
    MAILPIT_URL: z.url().default('http://localhost:8025'),
    RESEND_API_KEY: z.string().optional(),
    // Without our own domain, Resend only sends from its test address (ADR 0022).
    MAIL_FROM_EMAIL: z.email().default('onboarding@resend.dev'),
    MAIL_FROM_NAME: z.string().default('Finanças'),
    // Google sign-in (ADR 0026). Optional: without them, only e-mail and password.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Shared with the web app's proxy (ADR 0033): only a request carrying it may tell the client IP.
    // Optional outside production, where there is no proxy.
    PROXY_SECRET: z.string().min(32).optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.GOOGLE_CLIENT_ID !== !env.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET go together',
      });
    }
    if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Required by MAIL_TRANSPORT=resend',
      });
    }
    if (env.NODE_ENV === 'production' && env.MAIL_TRANSPORT !== 'resend') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'Production must send e-mail with resend',
      });
    }
    if (env.NODE_ENV === 'production' && !env.PROXY_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROXY_SECRET'],
        message: 'Production needs the proxy secret to know the client IP',
      });
    }
    // Better Auth only marks the session cookie Secure when its URL is https.
    if (env.NODE_ENV === 'production' && !env.BETTER_AUTH_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'Production must use https',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Used by ConfigModule at startup: the app refuses to boot with a missing or invalid variable,
 * instead of failing later in the middle of a request.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
