import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { navigateAway, saveFile } from '@/lib/browser';
import { mockApi, personalWorkspace, signedInHome, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

vi.mock('@/lib/browser', () => ({ navigateAway: vi.fn(), saveFile: vi.fn() }));

const casaId = '01920000-0000-7000-8000-000000000002';

// Fictitious data (ADR 0019).
const exportFile = { format: 'financas-dados', version: 1 };

describe('AccountPage', () => {
  it('opens from the account menu and shows who is signed in', async () => {
    mockApi(signedInHome);
    const { router } = renderApp(`/espacos/${personalWorkspace.id}/painel`);

    await userEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Minha conta' }));

    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/conta');
    expect(screen.getByText(verifiedUser.email)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar aos espaços' })).toHaveAttribute('href', '/');
  });

  it('downloads the data export under the name the API gives it', async () => {
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/me/deletion': { body: { blockers: [] } },
      'GET /api/me/export': {
        body: exportFile,
        headers: { 'Content-Disposition': 'attachment; filename="financas-dados-2026-10-07.json"' },
      },
    });
    renderApp('/conta');

    await userEvent.click(await screen.findByRole('button', { name: 'Baixar meus dados' }));

    expect(await screen.findByText('Dados baixados')).toBeInTheDocument();
    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), 'financas-dados-2026-10-07.json');
    const [blob] = vi.mocked(saveFile).mock.calls[0]!;
    expect(JSON.parse(await blob.text())).toEqual(exportFile);
  });

  it('says so when the export fails, and saves nothing', async () => {
    vi.mocked(saveFile).mockClear();
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/me/deletion': { body: { blockers: [] } },
      'GET /api/me/export': { status: 500, body: { message: 'Internal server error' } },
    });
    renderApp('/conta');

    await userEvent.click(await screen.findByRole('button', { name: 'Baixar meus dados' }));

    expect(
      await screen.findByText('Não foi possível concluir agora. Tente de novo em instantes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar meus dados' })).toBeEnabled();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('lists the shared workspaces that block deleting the account', async () => {
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/me/deletion': {
        body: { blockers: [{ id: casaId, name: 'Casa', otherMembers: 2, pendingInvitations: 1 }] },
      },
    });
    renderApp('/conta');

    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Casa (2 outros membros e 1 convite pendente)');
    expect(within(note).getByRole('link', { name: 'Casa' })).toHaveAttribute(
      'href',
      `/espacos/${casaId}`,
    );
    expect(screen.getByRole('button', { name: 'Excluir minha conta' })).toBeDisabled();
  });

  it('says so when it cannot check, without the workspace "not found" notice', async () => {
    // As while the API is being deployed: the route does not exist yet.
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/me/deletion': { status: 404, body: { message: 'Not Found' } },
    });
    renderApp('/conta');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conferir agora se a conta pode ser excluída.',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir minha conta' })).toBeDisabled();
  });

  it('e-mails the confirmation link after asking once', async () => {
    const fetchMock = mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/me/deletion': { body: { blockers: [] } },
      'POST /api/auth/delete-user': { body: { success: true, message: 'Verification email sent' } },
    });
    renderApp('/conta');

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir sua conta?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      `Enviamos um link para ${verifiedUser.email}`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/delete-user', 'http://api.test'),
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });
});

describe('DeleteAccountPage', () => {
  it('deletes with the token from the link, after one more click', async () => {
    const fetchMock = mockApi({
      'GET /api/me': { body: verifiedUser },
      'POST /api/auth/delete-user': { body: { success: true, message: 'User deleted' } },
    });
    renderApp('/conta/excluir?token=token-de-teste');

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));

    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalledWith('/conta-excluida'));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/delete-user', 'http://api.test'),
      expect.objectContaining({ body: JSON.stringify({ token: 'token-de-teste' }) }),
    );
  });

  it('explains an expired or used link', async () => {
    vi.mocked(navigateAway).mockClear();
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'POST /api/auth/delete-user': {
        status: 404,
        body: { code: 'INVALID_TOKEN', message: 'Invalid token' },
      },
    });
    renderApp('/conta/excluir?token=token-vencido');

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este link é inválido ou expirou.');
    expect(navigateAway).not.toHaveBeenCalled();
  });

  it('goes back to the account page without a token', async () => {
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/me/deletion': { body: { blockers: [] } },
    });
    const { router } = renderApp('/conta/excluir');

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/conta'));
  });
});
