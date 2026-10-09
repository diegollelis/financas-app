import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const page = '/espacos/01920000-0000-7000-8000-000000000002/painel';

describe('RequireAuth', () => {
  it('shows the CL loader while the session is checked', async () => {
    // The API is still waking up: /api/me has not answered yet.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderApp(page);

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando…');
  });

  it('offers to try again when the server does not answer', async () => {
    mockApi({ 'GET /api/me': { status: 500, body: { message: 'Internal Server Error' } } });
    const { router } = renderApp(page);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor.',
    );
    // It answers now: without a session, the way is the sign-in page.
    mockApi({ 'GET /api/me': { status: 401, body: { message: 'Unauthorized' } } });
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
  });
});
