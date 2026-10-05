import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi, personalWorkspace, signedInHome } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const house = {
  id: '01920000-0000-7000-8000-000000000002',
  name: 'Casa',
  isPersonal: false,
  role: 'EDITOR',
};

describe('HomePage', () => {
  it('greets the signed-in user in the same header as the other pages', async () => {
    mockApi(signedInHome);

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Maria Exemplo' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('Finanças')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu da conta' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo');
  });

  it('signs out from the account menu and goes back to the sign-in page', async () => {
    mockApi({ ...signedInHome, 'POST /api/auth/sign-out': { body: { success: true } } });
    const { router } = renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('switches to the dark theme and remembers it', async () => {
    mockApi(signedInHome);
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Sistema' })).toBeChecked();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Escuro' }));

    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem('financas-tema')).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Menu da conta' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Escuro' })).toBeChecked();
  });
});

describe('WorkspaceList', () => {
  it("lists the user's workspaces with the role, each one opening its dashboard", async () => {
    mockApi({ ...signedInHome, 'GET /api/workspaces': { body: [personalWorkspace, house] } });

    renderApp('/');

    const list = await screen.findByRole('list');
    const personal = within(list).getByRole('link', { name: /Pessoal/ });
    expect(personal).toHaveTextContent('Só seu');
    expect(personal).toHaveTextContent('Dono');
    expect(personal).toHaveAttribute('href', `/espacos/${personalWorkspace.id}/painel`);
    expect(within(list).getByRole('link', { name: /Casa/ })).toHaveTextContent('Editor');
  });

  it('tries again when the workspaces fail to load', async () => {
    const routes = { ...signedInHome, 'GET /api/workspaces': { status: 500, body: {} } };
    const fetchMock = mockApi(routes);
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/api/workspaces'),
      ).toHaveLength(2),
    );
  });
});

describe('VerifyEmailBanner', () => {
  it('asks to confirm the e-mail and resends the link', async () => {
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
      expect.objectContaining({ body: JSON.stringify({ email: fakeUser.email }) }),
    );
  });

  it('explains when the confirmation link failed', async () => {
    mockApi(signedInHome);

    renderApp('/?error=invalid_token');

    expect(await screen.findByText(/link de confirmação é inválido/)).toBeInTheDocument();
  });

  it('is hidden once the e-mail is confirmed', async () => {
    mockApi({ ...signedInHome, 'GET /api/me': { body: { ...fakeUser, emailVerified: true } } });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Maria Exemplo' })).toBeInTheDocument();
    expect(screen.queryByText(/Confirme seu e-mail/)).not.toBeInTheDocument();
  });
});
