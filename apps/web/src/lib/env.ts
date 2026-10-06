import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.url(),
  // Error reporting (ADR 0034). Optional, and empty means off: development reports nothing.
  VITE_SENTRY_DSN: z.union([z.url(), z.literal('')]).optional(),
  // The app's own address (ADR 0039). Only production sets it: any other address redirects there.
  VITE_CANONICAL_ORIGIN: z.union([z.url(), z.literal('')]).optional(),
});

/** Fails on page load if the build was made without the required variables. */
export const env = envSchema.parse(import.meta.env);
