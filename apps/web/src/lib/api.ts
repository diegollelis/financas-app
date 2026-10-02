import { z } from 'zod';
import { env } from './env';

export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable error code sent by the API, when there is one (e.g. Better Auth's). */
  readonly code?: string;
  /** The API's own message. Shown to the user only when it is known to be pt-BR. */
  readonly detail?: string;

  constructor(status: number, message: string, body?: { code?: string; message?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.detail = body?.message;
  }
}

const errorBodySchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

/**
 * Calls the API and validates the response with the same Zod schema the API uses. If the API
 * breaks the contract, the error shows up here instead of deep inside a component.
 */
async function request<T extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  schema: T,
  body?: unknown,
): Promise<z.infer<T>> {
  const response = await fetch(new URL(path, env.VITE_API_URL), {
    method,
    // Sends the session cookie on cross-origin requests (ADR 0007).
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = errorBodySchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      `${method} ${path} failed with status ${response.status}`,
      errorBody.data,
    );
  }
  return schema.parse(await response.json());
}

export function apiGet<T extends z.ZodType>(path: string, schema: T) {
  return request('GET', path, schema);
}

export function apiPost<T extends z.ZodType>(path: string, body: unknown, schema: T) {
  return request('POST', path, schema, body);
}
