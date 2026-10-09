import {
  currentPeriod,
  summarizePeriod,
  TERMS_VERSION,
  todayIso,
  type Budget,
  type BudgetSource,
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

/** The default destinations of a workspace's budget (ADR 0047), with fictitious ids. */
export const testDestinations = [
  {
    destinationId: '01920000-0000-7000-8000-0000000000d1',
    name: 'Despesas',
    kind: 'EXPENSES' as const,
    categoryId: null,
  },
  {
    destinationId: '01920000-0000-7000-8000-0000000000d2',
    name: 'Investimentos',
    kind: 'SAVINGS' as const,
    categoryId: '01920000-0000-7000-8000-0000000000c2',
  },
  {
    destinationId: '01920000-0000-7000-8000-0000000000d3',
    name: 'Reserva de emergência',
    kind: 'SAVINGS' as const,
    categoryId: '01920000-0000-7000-8000-0000000000c3',
  },
  {
    destinationId: '01920000-0000-7000-8000-0000000000d4',
    name: 'Viagens',
    kind: 'SAVINGS' as const,
    categoryId: '01920000-0000-7000-8000-0000000000c4',
  },
];

/**
 * A budget with the default destinations: `basisPoints` in their order (Despesas of the net
 * income, then the saving ones of what is left). Nothing set: an empty one (`NONE`).
 */
export function testBudget({
  period,
  netIncomeCents = 0,
  source = 'NONE',
  inheritedFrom = null,
  basisPoints = [0, 0, 0, 0],
}: {
  period: string;
  netIncomeCents?: number;
  source?: BudgetSource;
  inheritedFrom?: string | null;
  basisPoints?: number[];
}): Budget {
  return {
    period,
    netIncomeCents,
    source,
    inheritedFrom,
    shares: testDestinations.map((destination, index) => ({
      ...destination,
      basisPoints: basisPoints[index] ?? 0,
    })),
  };
}

/** An empty month of the personal workspace, for the dashboard that "/" opens. */
const thisMonth = currentPeriod();
const emptyDashboard = summarizePeriod([], testBudget({ period: thisMonth }), todayIso());

/** The rest of a signed-in landing: the workspaces, and "/" opens the personal one's dashboard. */
export const landingRoutes = {
  'GET /api/workspaces': { body: [personalWorkspace] },
  [`GET /api/workspaces/${personalWorkspace.id}`]: { body: personalWorkspace },
  [`GET /api/workspaces/${personalWorkspace.id}/summary/${thisMonth}`]: { body: emptyDashboard },
};

/** What a signed-in person loads on arrival: the user, the workspaces and that dashboard. */
export const signedInHome = { 'GET /api/me': { body: fakeUser }, ...landingRoutes };
