import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.url(),
});

/** Fails on page load if the build was made without the required variables. */
export const env = envSchema.parse(import.meta.env);
