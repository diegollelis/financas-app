import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

describe('ForgotPasswordPage', () => {
  it('is reachable from the sign-in page', async () => {
    mockApi({ 'GET /me': noSession });
    const { router } = renderApp('/entrar');

    await userEvent.click(await screen.findByRole('link', { name: 'Esqueci minha senha' }));

    expect(router.state.location.pathname).toBe('/esqueci-senha');
  });

  it('requests the link and gives the same answer for any e-mail', async () => {
    const fetchMock = mockApi({
      'GET /me': noSession,
      'POST /api/auth/request-password-reset': { body: { status: true, message: 'ok' } },
    });
    renderApp('/esqueci-senha');

    await userEvent.type(await screen.findByLabelText('E-mail'), 'maria@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Se houver uma conta com esse e-mail',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/request-password-reset', 'http://api.test'),
      expect.objectContaining({ body: JSON.stringify({ email: 'maria@example.com' }) }),
    );
  });
});
