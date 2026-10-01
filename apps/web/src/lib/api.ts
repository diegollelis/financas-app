import type { z } from 'zod';
import { env } from './env';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * GET against the API, validating the response with the same Zod schema the API uses.
 * If the API breaks the contract, the error shows up here instead of deep inside a component.
 */
export async function apiGet<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const response = await fetch(new URL(path, env.VITE_API_URL), {
    // Sends the session cookie on cross-origin requests (ADR 0007).
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `GET ${path} failed with status ${response.status}`);
  }
  return schema.parse(await response.json());
}
