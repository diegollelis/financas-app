import { TERMS_VERSION } from '@financas/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, personalWorkspace, signedInHome, verifiedUser } from '@/test/mock-api';
import { navigateAway } from '@/lib/browser';
import { renderApp } from '@/test/render';

vi.mock('@/lib/browser', () => ({ navigateAway: vi.fn() }));

// Fictitious data (ADR 0019).
const page = `/espacos/${personalWorkspace.id}/painel`;
const neverAccepted = { ...verifiedUser, termsVersion: null };

describe('terms acceptance (ADR 0041)', () => {
  it('asks for the terms before any page, and goes on after accepting', async () => {
    const fetchMock = mockApi({
      ...signedInHome,
      'GET /api/me': { body: neverAccepted },
      'POST /api/me/terms': { body: verifiedUser },
    });
    const { router } = renderApp(page);

    expect(await screen.findByRole('heading', { name: 'Termos de uso' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Painel' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));

    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(page);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/me/terms', 'http://api.test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ version: TERMS_VERSION }),
      }),
    );
  });

  it('says the terms changed to whoever accepted an older version', async () => {
    mockApi({
      ...signedInHome,
      'GET /api/me': { body: { ...verifiedUser, termsVersion: '1999-01-01' } },
    });
    renderApp(page);

    expect(
      await screen.findByRole('heading', { name: 'Os termos de uso mudaram' }),
    ).toBeInTheDocument();
  });

  it('links to the terms, and lets the person leave without accepting', async () => {
    const fetchMock = mockApi({
      ...signedInHome,
      'GET /api/me': { body: neverAccepted },
      'POST /api/auth/sign-out': { body: { success: true } },
    });
    renderApp(page);

    const [termsLink] = await screen.findAllByRole('link', { name: 'Termos de uso' });
    expect(termsLink).toHaveAttribute('href', '/termos');
    await userEvent.click(screen.getByRole('button', { name: 'Sair sem aceitar' }));

    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalledWith('/entrar'));
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL('/api/me/terms', 'http://api.test'),
      expect.anything(),
    );
  });
});
