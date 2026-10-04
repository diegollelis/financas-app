import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.url(),
  // Error reporting (ADR 0034). Optional, and empty means off: development reports nothing.
  VITE_SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
});

/** Fails on page load if the build was made without the required variables. */
export const env = envSchema.parse(import.meta.env);
