import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi, personalWorkspace, signedInHome } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const house = {
  id: '01920000-0000-7000-8000-000000000002',
  name: 'Casa',
  isPersonal: false,
  role: 'EDITOR',
};
const painel = (id: string) => `/espacos/${id}/painel`;

describe('"/"', () => {
  it('opens the dashboard of the personal workspace, with the sections nav', async () => {
    mockApi(signedInHome);

    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(painel(personalWorkspace.id));
    expect(screen.getByRole('navigation', { name: 'Seções do espaço' })).toBeInTheDocument();
  });

  it('opens the workspace last used in this browser', async () => {
    window.localStorage.setItem('financas-ultimo-espaco', house.id);
    mockApi({
      ...signedInHome,
      'GET /api/workspaces': { body: [personalWorkspace, house] },
      [`GET /api/workspaces/${house.id}`]: { body: house },
    });

    const { router } = renderApp('/');

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(painel(house.id)));
  });

  it('ignores a last workspace that is no longer one of the user’s', async () => {
    window.localStorage.setItem('financas-ultimo-espaco', house.id);
    mockApi(signedInHome);

    const { router } = renderApp('/');

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(painel(personalWorkspace.id)),
    );
  });

  it('keeps the query string, which the e-mail confirmation link uses', async () => {
    mockApi(signedInHome);

    const { router } = renderApp('/?error=invalid_token');

    await vi.waitFor(() => expect(router.state.location.search).toBe('?error=invalid_token'));
    expect(await screen.findByText(/link de confirmação é inválido/)).toBeInTheDocument();
  });

  it('tries again when the workspaces fail to load', async () => {
    const routes = { ...signedInHome, 'GET /api/workspaces': { status: 500, body: {} } };
    mockApi(routes);
    const { router } = renderApp('/');

    await screen.findByRole('button', { name: 'Tentar de novo' });
    routes['GET /api/workspaces'] = { status: 200, body: [personalWorkspace] };
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(painel(personalWorkspace.id)),
    );
  });
});

describe('VerifyEmailBanner', () => {
  it('asks to confirm the e-mail on the workspace pages and resends the link', async () => {
    const fetchMock = mockApi({
      ...signedInHome,
      'POST /api/auth/send-verification-email': { body: { status: true } },
    });
    renderApp('/');

    expect(await screen.findByText(/Confirme seu e-mail/)).toHaveTextContent(fakeUser.email);
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail' }));

    expect(await screen.findByText(/Enviamos um novo link/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/send-verification-email', 'http://api.test'),
      expect.objectContaining({
        body: JSON.stringify({ email: fakeUser.email, callbackURL: '/' }),
      }),
    );
  });

  it('is hidden once the e-mail is confirmed', async () => {
    mockApi({ ...signedInHome, 'GET /api/me': { body: { ...fakeUser, emailVerified: true } } });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(screen.queryByText(/Confirme seu e-mail/)).not.toBeInTheDocument();
  });
});
