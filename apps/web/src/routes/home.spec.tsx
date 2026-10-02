import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeUser, healthy, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

describe('HomePage', () => {
  it('greets the signed-in user and shows Online when the API and the database are up', async () => {
    const fetchMock = mockApi({ 'GET /me': { body: fakeUser }, 'GET /health': healthy });

    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Maria Exemplo' })).toBeInTheDocument();
    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/health', 'http://api.test'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('warns when the database is down', async () => {
    mockApi({
      'GET /me': { body: fakeUser },
      'GET /health': { body: { status: 'degraded', database: 'down' } },
    });

    renderApp('/');

    expect(await screen.findByText('Sem banco de dados')).toBeInTheDocument();
  });

  it('shows unavailable when the health check breaks the contract', async () => {
    mockApi({ 'GET /me': { body: fakeUser }, 'GET /health': { body: { status: 'up' } } });

    renderApp('/');

    expect(await screen.findByText('Indisponível')).toBeInTheDocument();
  });

  it('signs out and goes back to the sign-in page', async () => {
    mockApi({
      'GET /me': { body: fakeUser },
      'GET /health': healthy,
      'POST /api/auth/sign-out': { body: { success: true } },
    });
    const { router } = renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });
});

describe('VerifyEmailBanner', () => {
  it('asks to confirm the e-mail and resends the link', async () => {
    const fetchMock = mockApi({
      'GET /me': { body: fakeUser },
      'GET /health': healthy,
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
    mockApi({ 'GET /me': { body: fakeUser }, 'GET /health': healthy });

    renderApp('/?error=invalid_token');

    expect(await screen.findByText(/link de confirmação é inválido/)).toBeInTheDocument();
  });

  it('is hidden once the e-mail is confirmed', async () => {
    mockApi({ 'GET /me': { body: { ...fakeUser, emailVerified: true } }, 'GET /health': healthy });
    renderApp('/');

    expect(await screen.findByText('Online')).toBeInTheDocument();
    expect(screen.queryByText(/Confirme seu e-mail/)).not.toBeInTheDocument();
  });
});
