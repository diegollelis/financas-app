import { z } from 'zod';

export const healthResponseSchema = z.object({
  /** `degraded`: the API is up but a dependency (the database) is not responding. */
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
