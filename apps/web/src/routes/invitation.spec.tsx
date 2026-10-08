import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const token = 'token-de-teste';
const houseId = '01920000-0000-7000-8000-000000000002';
const preview = {
  workspaceName: 'Casa',
  invitedByName: 'Maria Exemplo',
  email: 'joao@example.com',
  role: 'EDITOR',
  expiresAt: '2026-10-09T12:00:00.000Z',
};
const joao = { ...fakeUser, name: 'João Exemplo', email: 'joao@example.com' };

describe('InvitationPage', () => {
  it('explains the invitation and asks a visitor to sign in, coming back afterwards', async () => {
    mockApi({ 'GET /api/me': noSession, [`GET /api/invitations/${token}`]: { body: preview } });
    const { router } = renderApp(`/convites/${token}`);

    expect(
      await screen.findByText(
        'Maria Exemplo convidou você para ver e editar as finanças do espaço "Casa".',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Criar conta e aceitar' }));

    expect(router.state.location.pathname).toBe('/cadastro');
    // Back with ?aceitar=1: the click here already meant "accept".
    expect(router.state.location.search).toBe(
      `?voltar=${encodeURIComponent('/convites/token-de-teste?aceitar=1')}`,
    );
  });

  it('accepts on its own when coming back from signing in, and opens the workspace', async () => {
    const fetchMock = mockApi({
      'GET /api/me': { body: joao },
      [`GET /api/invitations/${token}`]: { body: preview },
      [`POST /api/invitations/${token}/accept`]: {
        body: { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' },
      },
      [`GET /api/workspaces/${houseId}`]: {
        body: { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' },
      },
      [`GET /api/workspaces/${houseId}/members`]: { body: [] },
    });
    const { router } = renderApp(`/convites/${token}?aceitar=1`);

    expect(await screen.findByRole('heading', { name: 'Membros' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/espacos/${houseId}`);
    const accepts = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith(`/api/invitations/${token}/accept`),
    );
    expect(accepts).toHaveLength(1);
  });

  it('never accepts on its own for another account', async () => {
    const fetchMock = mockApi({
      'GET /api/me': { body: { ...joao, email: 'outra@example.com' } },
      [`GET /api/invitations/${token}`]: { body: preview },
    });
    renderApp(`/convites/${token}?aceitar=1`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Saia e entre com o e-mail convidado.',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(`/api/invitations/${token}/accept`, 'http://api.test'),
      expect.anything(),
    );
  });

  it('asks a new account for the terms before joining', async () => {
    mockApi({
      'GET /api/me': { body: { ...joao, termsVersion: null } },
      [`GET /api/invitations/${token}`]: { body: preview },
    });
    renderApp(`/convites/${token}?aceitar=1`);

    expect(await screen.findByRole('button', { name: 'Aceitar e continuar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).not.toBeInTheDocument();
  });

  it('accepts and opens the workspace', async () => {
    const fetchMock = mockApi({
      'GET /api/me': { body: joao },
      [`GET /api/invitations/${token}`]: { body: preview },
      [`POST /api/invitations/${token}/accept`]: {
        body: { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' },
      },
      [`GET /api/workspaces/${houseId}`]: {
        body: { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' },
      },
      [`GET /api/workspaces/${houseId}/members`]: { body: [] },
    });
    const { router } = renderApp(`/convites/${token}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }));

    expect(await screen.findByRole('heading', { name: 'Membros' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Trocar de espaço (atual: Casa)' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/espacos/${houseId}`);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`/api/invitations/${token}/accept`, 'http://api.test'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('tells someone signed in with another e-mail to switch accounts', async () => {
    mockApi({
      'GET /api/me': { body: fakeUser },
      [`GET /api/invitations/${token}`]: { body: preview },
    });

    renderApp(`/convites/${token}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Este convite foi enviado para joao@example.com, mas você entrou como ${fakeUser.email}.`,
    );
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).not.toBeInTheDocument();
  });

  it('explains an invalid, used or expired link', async () => {
    mockApi({
      'GET /api/me': noSession,
      [`GET /api/invitations/${token}`]: { status: 404, body: { message: 'Not Found' } },
    });

    renderApp(`/convites/${token}`);

    expect(await screen.findByRole('heading', { name: 'Convite inválido' })).toBeInTheDocument();
  });
});

describe('coming back after signing in', () => {
  it('goes to ?voltar= once signed in', async () => {
    mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-in/email': { body: { token: 'fake', user: joao } },
      [`GET /api/invitations/${token}`]: { body: preview },
    });
    const { router } = renderApp(`/entrar?voltar=%2Fconvites%2F${token}`);

    await userEvent.type(await screen.findByLabelText('E-mail'), joao.email);
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-de-teste-123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('button', { name: 'Aceitar convite' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/convites/${token}`);
  });

  it('ignores a ?voltar= pointing to another site', async () => {
    mockApi({
      'GET /api/me': { body: fakeUser },
      'GET /api/workspaces': { body: [] },
    });

    const { router } = renderApp('/entrar?voltar=%2F%2Fsite-malicioso.com');

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('remembers the page a visitor was trying to open', async () => {
    mockApi({ 'GET /api/me': noSession });

    const { router } = renderApp(`/espacos/${houseId}`);

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
    expect(router.state.location.search).toBe(`?voltar=%2Fespacos%2F${houseId}`);
  });
});
