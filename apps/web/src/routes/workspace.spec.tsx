import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi, personalWorkspace, signedInHome } from '@/test/mock-api';
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
  status: 'PENDING',
  expiresAt: '2026-10-09T12:00:00.000Z',
  acceptedAt: null,
  removedAt: null,
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
    expect(screen.getByText('Aguardando, vale até 09/10/2026')).toBeInTheDocument();
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

  it('shows what came of each invitation, with the action that fits it', async () => {
    mockHouse({
      [`GET /api/workspaces/${houseId}/invitations`]: {
        body: [
          pendingInvitation,
          {
            ...pendingInvitation,
            id: '01920000-0000-7000-8000-000000000005',
            email: 'pedro@example.com',
            status: 'EXPIRED',
            expiresAt: '2026-09-20T12:00:00.000Z',
          },
          {
            ...pendingInvitation,
            id: '01920000-0000-7000-8000-000000000006',
            email: 'joao@example.com',
            role: 'VIEWER',
            status: 'ACCEPTED',
            acceptedAt: '2026-09-15T12:00:00.000Z',
          },
          {
            ...pendingInvitation,
            id: '01920000-0000-7000-8000-000000000007',
            email: 'bia@example.com',
            status: 'REMOVED',
            acceptedAt: '2026-09-10T13:05:00.000Z',
            removedAt: '2026-09-30T21:40:00.000Z',
          },
          {
            ...pendingInvitation,
            id: '01920000-0000-7000-8000-000000000008',
            email: 'caio@example.com',
            status: 'LEFT',
            acceptedAt: '2026-09-11T10:00:00.000Z',
            removedAt: '2026-09-12T10:00:00.000Z',
          },
        ],
      },
    });
    renderApp(`/espacos/${houseId}`);

    const list = await screen.findByRole('region', { name: 'Convites' });
    expect(list).toHaveTextContent('Aguardando, vale até 09/10/2026');
    expect(list).toHaveTextContent('Expirou em 20/09/2026');
    // Dates and times in São Paulo (UTC-3).
    expect(list).toHaveTextContent('Aceito em 15/09/2026 às 09:00');
    expect(list).toHaveTextContent('Aceito em 10/09/2026 às 10:05');
    expect(list).toHaveTextContent('Removido em 30/09/2026 às 18:40');
    expect(list).toHaveTextContent('Saiu em 12/09/2026 às 07:00');
    expect(
      within(list).getByRole('button', { name: 'Cancelar convite de ana@example.com' }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole('button', { name: 'Apagar convite de pedro@example.com' }),
    ).toBeInTheDocument();
    for (const email of ['joao@example.com', 'bia@example.com', 'caio@example.com']) {
      expect(
        within(list).queryByRole('button', { name: new RegExp(email) }),
      ).not.toBeInTheDocument();
    }
  });

  it('lets the OWNER remove a member, after naming them', async () => {
    const joao = members[1]!;
    const fetchMock = mockHouse({
      [`DELETE /api/workspaces/${houseId}/members/${joao.userId}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}`);

    // The OWNER's own row has no button: the OWNER never leaves.
    expect(await screen.findByRole('button', { name: 'Remover João Exemplo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sair de/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover João Exemplo' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Remover João Exemplo do espaço?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Remover' }));

    expect(await screen.findByText('João Exemplo foi removido do espaço')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`/api/workspaces/${houseId}/members/${joao.userId}`, 'http://api.test'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('lets any other member leave, and goes back to their own workspaces', async () => {
    const viewer = { ...members[1]!, userId: fakeUser.id, name: fakeUser.name };
    const fetchMock = mockApi({
      ...signedInHome,
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } },
      [`GET /api/workspaces/${houseId}/members`]: {
        body: [{ ...members[0]!, userId: members[1]!.userId, name: 'Dona da Casa' }, viewer],
      },
      [`DELETE /api/workspaces/${houseId}/members/${fakeUser.id}`]: { status: 204, body: null },
      'GET /api/workspaces': { body: [personalWorkspace, { ...house, role: 'VIEWER' }] },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    expect(screen.queryByRole('button', { name: /^Remover/ })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Sair de Casa' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Sair de Casa?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Sair do espaço' }));

    expect(await screen.findByText('Você saiu de Casa')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/espacos/${personalWorkspace.id}/painel`),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`/api/workspaces/${houseId}/members/${fakeUser.id}`, 'http://api.test'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('lets the OWNER delete a shared workspace, after confirming', async () => {
    const fetchMock = mockHouse({
      ...signedInHome,
      // As loaded before the deletion, with Casa in it; and Casa is the last workspace opened.
      'GET /api/workspaces': { body: [personalWorkspace, house] },
      [`DELETE /api/workspaces/${houseId}`]: { status: 204, body: null },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir espaço' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir o espaço Casa?' });
    expect(confirm).toHaveTextContent('Não é possível desfazer.');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir espaço' }));

    expect(await screen.findByText('Espaço Casa excluído')).toBeInTheDocument();
    // Not back to Casa ("Espaço não encontrado"): to the personal workspace.
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/espacos/${personalWorkspace.id}/painel`),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`/api/workspaces/${houseId}`, 'http://api.test'),
      expect.objectContaining({ method: 'DELETE' }),
    );
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
    expect(screen.queryByRole('button', { name: 'Excluir espaço' })).not.toBeInTheDocument();
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
