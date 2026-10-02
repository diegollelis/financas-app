import { expect } from 'vitest';
import type { createTestApp } from './app.js';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** One route of a workspace resource, for the isolation test. */
export interface WorkspaceRoute {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: (workspaceId: string) => string;
  body?: object;
}

const outsider = {
  name: 'Pessoa de Fora',
  email: 'de-fora@example.com',
  password: 'senha-de-teste-999',
};

/**
 * The isolation test every workspace resource must have (ADR 0008): someone who is not a member
 * gets 404 on every route, exactly like a workspace that does not exist, so they cannot even tell
 * it is there. Returns the outsider's browser for further checks.
 */
export async function expectHiddenFromOutsiders(
  t: TestApp,
  workspaceId: string,
  routes: WorkspaceRoute[],
) {
  const { browser } = await t.signUp(outsider);
  for (const route of routes) {
    const path = route.path(workspaceId);
    const response = await browser[route.method](path).send(route.body);
    expect(response.status, `${route.method.toUpperCase()} ${path}`).toBe(404);
  }
  return browser;
}
