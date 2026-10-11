import { focusManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, noSession, personalWorkspace, signedInHome, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

/** How many times the session was checked. */
const meCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/api/me').length;

const page = '/espacos/01920000-0000-7000-8000-000000000002/painel';

describe('RequireAuth', () => {
  it('shows the CL loader while the session is checked', async () => {
    // The API is still waking up: /api/me has not answered yet.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderApp(page);

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando…');
  });

  it('offers to try again when the server does not answer', async () => {
    mockApi({ 'GET /api/me': { status: 500, body: { message: 'Internal Server Error' } } });
    const { router } = renderApp(page);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    );
    // It answers now: without a session, the way is the sign-in page.
    mockApi({ 'GET /api/me': { status: 401, body: { message: 'Unauthorized' } } });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
  });
});

describe('a session ended elsewhere', () => {
  const dashboard = `/espacos/${personalWorkspace.id}/painel`;
  // Changed during a test: the fake API reads it on every call.
  const signedIn = (): Parameters<typeof mockApi>[0] => ({
    ...signedInHome,
    'GET /api/me': { body: verifiedUser },
  });

  afterEach(() => focusManager.setFocused(undefined));

  async function expectSignInWithNotice(router: ReturnType<typeof renderApp>['router']) {
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sua sessão terminou. Entre de novo para continuar.',
    );
    // Back to the same page after signing in.
    expect(router.state.location.search).toBe(`?voltar=${encodeURIComponent(dashboard)}`);
  }

  it('leads to the sign-in page when a page gets a 401', async () => {
    const routes = signedIn();
    const summary = Object.keys(routes).find((key) => key.includes('/summary/'));
    if (!summary) throw new Error('no summary route');
    mockApi({ ...routes, [summary]: noSession });
    const { router } = renderApp(dashboard);

    await expectSignInWithNotice(router);
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('leads to the sign-in page when a change gets a 401', async () => {
    mockApi({
      'GET /api/me': { body: { ...verifiedUser, termsVersion: null } },
      'POST /api/me/terms': noSession,
    });
    const { router } = renderApp(dashboard);

    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar e continuar' }));

    await expectSignInWithNotice(router);
  });

  it('checks the session again when the person comes back to the tab', async () => {
    const routes = signedIn();
    mockApi(routes);
    const { router } = renderApp(dashboard);
    await screen.findByRole('heading', { name: /Painel/ });

    routes['GET /api/me'] = noSession;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await expectSignInWithNotice(router);
  });

  it('keeps the page when the check fails for another reason', async () => {
    const routes = signedIn();
    const fetchMock = mockApi(routes);
    renderApp(dashboard);
    const heading = await screen.findByRole('heading', { name: /Painel/ });

    routes['GET /api/me'] = { status: 500, body: {} };
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    // The second check of the session (the first was on arrival) failed.
    await vi.waitFor(() => expect(meCalls(fetchMock)).toBe(2));
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível falar com o servidor.')).not.toBeInTheDocument();
  });
});
