import {
  currentPeriod,
  DEFAULT_BUDGET_SHARES,
  summarizePeriod,
  TERMS_VERSION,
  todayIso,
} from '@financas/shared';
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
    const response = { status: route.status ?? 200, headers: route.headers };
    // 204 No Content cannot carry a body: Response.json would throw.
    return Promise.resolve(
      response.status === 204 ? new Response(null, response) : Response.json(route.body, response),
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
  // Accepted the terms in force, so pages render without the acceptance screen (ADR 0041).
  termsVersion: TERMS_VERSION,
};

/**
 * The same person after confirming the e-mail: no confirmation notice on the workspace pages, for
 * tests about something else (the notice shows on every page until then).
 */
export const verifiedUser = { ...fakeUser, emailVerified: true };

export const noSession = { status: 401, body: { message: 'Unauthorized', statusCode: 401 } };

export const personalWorkspace = {
  id: '01920000-0000-7000-8000-000000000001',
  name: 'Pessoal',
  isPersonal: true,
  role: 'OWNER',
};

/** An empty month of the personal workspace, for the dashboard that "/" opens. */
const thisMonth = currentPeriod();
const emptyDashboard = summarizePeriod(
  [],
  {
    period: thisMonth,
    netIncomeCents: 0,
    grossIncomeCents: null,
    ...DEFAULT_BUDGET_SHARES,
    source: 'DEFAULT',
    inheritedFrom: null,
  },
  todayIso(),
);

/** The rest of a signed-in landing: the workspaces, and "/" opens the personal one's dashboard. */
export const landingRoutes = {
  'GET /api/workspaces': { body: [personalWorkspace] },
  [`GET /api/workspaces/${personalWorkspace.id}`]: { body: personalWorkspace },
  [`GET /api/workspaces/${personalWorkspace.id}/summary/${thisMonth}`]: { body: emptyDashboard },
};

/** What a signed-in person loads on arrival: the user, the workspaces and that dashboard. */
export const signedInHome = { 'GET /api/me': { body: fakeUser }, ...landingRoutes };
