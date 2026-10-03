import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { navigateAway } from '@/lib/browser';
import { mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

vi.mock('@/lib/browser', () => ({ navigateAway: vi.fn() }));

describe('Google sign-in', () => {
  it.each(['/entrar', '/cadastro'])('goes to Google from %s', async (path) => {
    const fetchMock = mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-in/social': {
        body: { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=x', redirect: true },
      },
    });
    renderApp(path);

    await userEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }));

    await vi.waitFor(() =>
      expect(navigateAway).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?state=x',
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/sign-in/social', 'http://api.test'),
      expect.objectContaining({
        body: JSON.stringify({
          provider: 'google',
          callbackURL: 'http://localhost:3000/',
          errorCallbackURL: 'http://localhost:3000/entrar',
        }),
      }),
    );
  });

  it('explains when Google sign-in is not configured on the API', async () => {
    mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-in/social': {
        status: 404,
        body: { code: 'PROVIDER_NOT_FOUND', message: 'Provider not found' },
      },
    });
    renderApp('/entrar');

    await userEvent.click(await screen.findByRole('button', { name: 'Continuar com Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O login com Google não está disponível no momento.',
    );
  });

  it('tells when the return from Google failed', async () => {
    mockApi({ 'GET /api/me': noSession });

    renderApp('/entrar?error=access_denied');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível entrar com o Google. Tente de novo.',
    );
  });
});
