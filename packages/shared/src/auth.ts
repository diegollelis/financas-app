import { z } from 'zod';

/** The signed-in user, as returned by `GET /me`. Never includes password or session data. */
export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
