import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi, personalWorkspace } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'OWNER' };
const members = [
  { userId: fakeUser.id, name: fakeUser.name, email: fakeUser.email, role: 'OWNER' },
  {
    userId: '01920000-0000-7000-8000-000000000003',
    name: 'João Exemplo',
    email: 'joao@example.com',
    role: 'VIEWER',
  },
];
const pendingInvitation = {
  id: '01920000-0000-7000-8000-000000000004',
  email: 'ana@example.com',
  role: 'EDITOR',
  expiresAt: '2026-10-09T12:00:00.000Z',
};

function mockHouse(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: fakeUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET /api/workspaces/${houseId}/members`]: { body: members },
    [`GET /api/workspaces/${houseId}/invitations`]: { body: [pendingInvitation] },
    ...overrides,
  });
}

describe('WorkspacePage', () => {
  it('shows the workspace, its members and the pending invitations to the OWNER', async () => {
    mockHouse();

    renderApp(`/espacos/${houseId}`);

    expect(await screen.findByRole('heading', { name: 'Membros' })).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('Casa')).toBeInTheDocument();
    expect(screen.getByText('Seu acesso: Dono')).toBeInTheDocument();
    const memberList = await screen.findByRole('list', { name: 'Membros do espaço' });
    expect(within(memberList).getByText('João Exemplo')).toBeInTheDocument();
    expect(within(memberList).getByText('joao@example.com')).toBeInTheDocument();
    expect(memberList).toHaveTextContent('Leitor');
    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Editor, vale até 09\/10\/2026/)).toBeInTheDocument();
  });

  it('invites someone with the chosen access', async () => {
    const fetchMock = mockHouse({
      [`POST /api/workspaces/${houseId}/invitations`]: {
        body: { ...pendingInvitation, email: 'pedro@example.com', role: 'VIEWER' },
      },
    });
    renderApp(`/espacos/${houseId}`);

    await userEvent.type(await screen.findByLabelText('E-mail da pessoa'), 'Pedro@Example.com');
    const access = screen.getByRole('radiogroup', { name: 'Acesso' });
    expect(within(access).getByRole('radio', { name: 'Pode editar' })).toBeChecked();
    await userEvent.click(within(access).getByRole('radio', { name: 'Só visualizar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));

    expect(await screen.findByText('Convite enviado para pedro@example.com')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText('E-mail da pessoa')).toHaveValue(''));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`/api/workspaces/${houseId}/invitations`, 'http://api.test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'pedro@example.com', role: 'VIEWER' }),
      }),
    );
  });

  it('shows the API reason when an invitation is refused', async () => {
    mockHouse({
      [`POST /api/workspaces/${houseId}/invitations`]: {
        status: 409,
        body: { code: 'ALREADY_MEMBER', message: 'Essa pessoa já é membro do espaço.' },
      },
    });
    renderApp(`/espacos/${houseId}`);

    await userEvent.type(await screen.findByLabelText('E-mail da pessoa'), 'joao@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Essa pessoa já é membro do espaço.',
    );
  });

  it('cancels a pending invitation', async () => {
    const fetchMock = mockHouse({
      [`DELETE /api/workspaces/${houseId}/invitations/${pendingInvitation.id}`]: {
        status: 204,
        body: null,
      },
    });
    renderApp(`/espacos/${houseId}`);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancelar convite de ana@example.com' }),
    );
    // Asks first: the link in the e-mail stops working.
    let confirm = await screen.findByRole('alertdialog', {
      name: 'Cancelar o convite de ana@example.com?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Manter convite' }));
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'DELETE' }),
    );
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Cancelar convite de ana@example.com' }),
      ).toHaveFocus(),
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Cancelar convite de ana@example.com' }),
    );
    confirm = await screen.findByRole('alertdialog', {
      name: 'Cancelar o convite de ana@example.com?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar convite' }));
    expect(await screen.findByText('Convite cancelado')).toBeInTheDocument();

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(
          `/api/workspaces/${houseId}/invitations/${pendingInvitation.id}`,
          'http://api.test',
        ),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('does not offer invitations to members who are not the OWNER', async () => {
    mockHouse({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'EDITOR' } } });

    renderApp(`/espacos/${houseId}`);

    expect(await screen.findByText('Seu acesso: Editor')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Convidar alguém' })).not.toBeInTheDocument();
  });

  it('explains that the personal workspace is not shared', async () => {
    mockApi({
      'GET /api/me': { body: fakeUser },
      [`GET /api/workspaces/${personalWorkspace.id}`]: { body: personalWorkspace },
      [`GET /api/workspaces/${personalWorkspace.id}/members`]: { body: [members[0]] },
    });

    renderApp(`/espacos/${personalWorkspace.id}`);

    expect(await screen.findByText(/Este é o seu espaço pessoal/)).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail da pessoa')).not.toBeInTheDocument();
  });

  it('answers "not found" for a workspace that is not yours', async () => {
    mockApi({
      'GET /api/me': { body: fakeUser },
      [`GET /api/workspaces/${houseId}`]: { status: 404, body: { message: 'Not Found' } },
    });

    renderApp(`/espacos/${houseId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Espaço não encontrado.');
  });
});
