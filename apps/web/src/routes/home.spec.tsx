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
