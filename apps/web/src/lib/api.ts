import { z } from 'zod';
import { env } from './env';

export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable error code sent by the API, when there is one (e.g. Better Auth's). */
  readonly code?: string;
  /** The API's own message. Shown to the user only when it is known to be pt-BR. */
  readonly detail?: string;
  /** Seconds to wait before trying again, when the API rate-limited the request (429). */
  readonly retryAfter?: number;

  constructor(
    status: number,
    message: string,
    body?: { code?: string; message?: string },
    retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.detail = body?.message;
    this.retryAfter = retryAfter;
  }
}

const errorBodySchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

/** The ApiError of a failed response, with the API's code and message when it sent them. */
async function apiError(response: Response, method: string, path: string) {
  const errorBody = errorBodySchema.safeParse(await response.json().catch(() => null));
  return new ApiError(
    response.status,
    `${method} ${path} failed with status ${response.status}`,
    errorBody.data,
    Number(response.headers.get('X-Retry-After')) || undefined,
  );
}

/**
 * Calls the API and validates the response with the same Zod schema the API uses. If the API
 * breaks the contract, the error shows up here instead of deep inside a component.
 */
async function request<T extends z.ZodType>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
  if (!response.ok) throw await apiError(response, method, path);
  // 204 No Content (e.g. DELETE): there is no body to read.
  return schema.parse(response.status === 204 ? undefined : await response.json());
}

export function apiGet<T extends z.ZodType>(path: string, schema: T) {
  return request('GET', path, schema);
}

export function apiPost<T extends z.ZodType>(path: string, body: unknown, schema: T) {
  return request('POST', path, schema, body);
}

export function apiPut<T extends z.ZodType>(path: string, body: unknown, schema: T) {
  return request('PUT', path, schema, body);
}

export function apiPatch<T extends z.ZodType>(path: string, body: unknown, schema: T) {
  return request('PATCH', path, schema, body);
}

/** For routes that answer 204 No Content. */
export async function apiDelete(path: string): Promise<void> {
  await request('DELETE', path, z.undefined());
}

/**
 * A file the API sends as an attachment (the data export, ADR 0041): its content and the name
 * from Content-Disposition, or `fallbackName` when it has none.
 */
export async function apiDownload(
  path: string,
  fallbackName: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(new URL(path, env.VITE_API_URL), { credentials: 'include' });
  if (!response.ok) throw await apiError(response, 'GET', path);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  return { blob: await response.blob(), filename };
}
