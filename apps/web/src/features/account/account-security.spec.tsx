import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Managing the account in "Minha conta" (ADR 0049). Fictitious data (ADR 0019).
const thisDevice = {
  id: 'sessao-1',
  browser: 'Chrome',
  os: 'Windows',
  createdAt: '2026-10-01T12:00:00.000Z',
  lastActiveAt: '2026-10-10T13:30:00.000Z',
  current: true,
};
const phone = {
  ...thisDevice,
  id: 'sessao-2',
  browser: 'Safari',
  os: 'iOS',
  lastActiveAt: '2026-10-08T22:15:00.000Z',
  current: false,
};

function mockAccount(
  security: { hasPassword: boolean; sessions: object[] },
  overrides: Record<string, { status?: number; body: unknown }> = {},
) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    'GET /api/me/deletion': { body: { blockers: [] } },
    'GET /api/me/security': { body: security },
    ...overrides,
  });
}

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, body: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    ),
  );
}

describe('Managing the account', () => {
  it('changes the name', async () => {
    const fetchMock = mockAccount(
      { hasPassword: true, sessions: [thisDevice] },
      { 'POST /api/auth/update-user': { body: { status: true } } },
    );
    renderApp('/conta');

    await userEvent.click(await screen.findByRole('button', { name: 'Alterar nome' }));
    const dialog = await screen.findByRole('dialog', { name: 'Alterar nome' });
    const name = within(dialog).getByLabelText('Nome');
    expect(name).toHaveValue(verifiedUser.name);
    await userEvent.clear(name);
    await userEvent.type(name, 'Maria Souza');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, '/api/auth/update-user', { name: 'Maria Souza' });
    expect(await screen.findByText('Nome alterado')).toBeInTheDocument();
  });

  it('changes the password, saying the other devices sign out', async () => {
    const fetchMock = mockAccount(
      { hasPassword: true, sessions: [thisDevice, phone] },
      { 'POST /api/auth/change-password': { body: { token: null } } },
    );
    renderApp('/conta');

    await userEvent.click(await screen.findByRole('button', { name: 'Trocar senha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Trocar senha' });
    expect(dialog).toHaveTextContent('Os outros aparelhos conectados à sua conta saem');
    await userEvent.type(within(dialog).getByLabelText('Senha atual'), 'senha-de-teste-123');
    await userEvent.type(within(dialog).getByLabelText('Nova senha'), 'nova-senha-456');
    await userEvent.type(within(dialog).getByLabelText('Repita a nova senha'), 'nova-senha-456');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Trocar senha' }));

    await expectCall(fetchMock, '/api/auth/change-password', {
      currentPassword: 'senha-de-teste-123',
      newPassword: 'nova-senha-456',
    });
    expect(
      await screen.findByText('Senha trocada. Os outros aparelhos foram desconectados.'),
    ).toBeInTheDocument();
  });

  it('says so when the current password is wrong', async () => {
    mockAccount(
      { hasPassword: true, sessions: [thisDevice] },
      {
        'POST /api/auth/change-password': {
          status: 400,
          body: { code: 'INVALID_PASSWORD', message: 'Invalid password' },
        },
      },
    );
    renderApp('/conta');

    await userEvent.click(await screen.findByRole('button', { name: 'Trocar senha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Trocar senha' });
    await userEvent.type(within(dialog).getByLabelText('Senha atual'), 'errada-000');
    await userEvent.type(within(dialog).getByLabelText('Nova senha'), 'nova-senha-456');
    await userEvent.type(within(dialog).getByLabelText('Repita a nova senha'), 'nova-senha-456');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Trocar senha' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A senha atual não confere.',
    );
  });

  it('offers to create a password to an account made with Google, by e-mail', async () => {
    const fetchMock = mockAccount(
      { hasPassword: false, sessions: [thisDevice] },
      { 'POST /api/auth/request-password-reset': { body: { status: true } } },
    );
    renderApp('/conta');

    expect(await screen.findByText(/^Sem senha: você entra com o Google/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trocar senha' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha' }));

    await expectCall(fetchMock, '/api/auth/request-password-reset', {
      email: verifiedUser.email,
    });
    expect(
      await screen.findByText(`Enviamos um link para criar a senha em ${verifiedUser.email}.`),
    ).toBeInTheDocument();
  });

  it('shows this device and the most recent ones, the rest on request', async () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...phone,
      id: `sessao-${index + 10}`,
    }));
    mockAccount({ hasPassword: true, sessions: [thisDevice, ...many] });
    renderApp('/conta');

    const devices = await screen.findByRole('region', { name: 'Aparelhos conectados' });
    expect(within(devices).getAllByRole('listitem')).toHaveLength(5);
    await userEvent.click(
      within(devices).getByRole('button', { name: 'Ver todos os 8 aparelhos' }),
    );
    expect(within(devices).getAllByRole('listitem')).toHaveLength(8);
  });

  it('lists the devices and signs the others out, after asking', async () => {
    const fetchMock = mockAccount(
      { hasPassword: true, sessions: [thisDevice, phone] },
      { 'POST /api/auth/revoke-other-sessions': { body: { status: true } } },
    );
    renderApp('/conta');

    const devices = await screen.findByRole('region', { name: 'Aparelhos conectados' });
    const rows = within(devices).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Chrome no Windows');
    expect(rows[0]).toHaveTextContent('Este aparelho');
    expect(rows[1]).toHaveTextContent('Safari no iOS');
    // São Paulo time: 22:15 UTC is 19:15 there.
    expect(rows[1]).toHaveTextContent('Último acesso em 08/10/2026, 19:15');
    await userEvent.click(
      within(devices).getByRole('button', { name: 'Sair dos outros aparelhos' }),
    );
    const confirm = await screen.findByRole('alertdialog', { name: 'Sair dos outros aparelhos?' });
    await userEvent.click(
      within(confirm).getByRole('button', { name: 'Sair dos outros aparelhos' }),
    );

    await expectCall(fetchMock, '/api/auth/revoke-other-sessions', {});
    expect(await screen.findByText('Os outros aparelhos foram desconectados')).toBeInTheDocument();
  });
});
