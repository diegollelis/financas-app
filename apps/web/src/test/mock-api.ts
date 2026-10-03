import { vi } from 'vitest';

type MockResponse = { status?: number; body: unknown; headers?: Record<string, string> };

/**
 * Replaces `fetch` with a fake API. Keys are "METHOD /path" (e.g. "POST /api/auth/sign-in/email").
 * An unexpected request fails the test, so no call goes unnoticed.
 */
export function mockApi(routes: Record<string, MockResponse>) {
  const fetchMock = vi.fn((input: URL | string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(input).pathname}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`Unexpected request: ${key}`));
    return Promise.resolve(
      Response.json(route.body, { status: route.status ?? 200, headers: route.headers }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Fictitious data (ADR 0019).
export const fakeUser = {
  id: '01920000-0000-7000-8000-000000000000',
  name: 'Maria Exemplo',
  email: 'maria@example.com',
  emailVerified: false,
};

export const noSession = { status: 401, body: { message: 'Unauthorized', statusCode: 401 } };
export const healthy = { body: { status: 'ok', database: 'up' } };

export const personalWorkspace = {
  id: '01920000-0000-7000-8000-000000000001',
  name: 'Pessoal',
  isPersonal: true,
  role: 'OWNER',
};

/** What every page behind RequireAuth loads on the home page: user, health and workspaces. */
export const signedInHome = {
  'GET /api/me': { body: fakeUser },
  'GET /api/health': healthy,
  'GET /api/workspaces': { body: [personalWorkspace] },
};
