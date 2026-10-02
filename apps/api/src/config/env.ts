import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Signs session cookies and tokens (ADR 0007). Never reuse it between environments.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public URL of this API; Better Auth builds callback and e-mail links from it.
  BETTER_AUTH_URL: z.url().default('http://localhost:3333'),
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
