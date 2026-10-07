import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { saveFile } from '@/lib/browser';
import { mockApi, personalWorkspace, signedInHome, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

vi.mock('@/lib/browser', () => ({ navigateAway: vi.fn(), saveFile: vi.fn() }));

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
});
