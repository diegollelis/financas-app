import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

async function fillAndSubmit(password: string, confirmPassword: string) {
  await userEvent.type(await screen.findByLabelText(/^Nova senha/), password);
  await userEvent.type(screen.getByLabelText('Repita a nova senha'), confirmPassword);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
}

describe('ResetPasswordPage', () => {
  it('saves the new password and sends to the sign-in page with a notice', async () => {
    const fetchMock = mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/reset-password': { body: { status: true } },
    });
    const { router } = renderApp('/redefinir-senha?token=token-de-teste');

    await fillAndSubmit('nova-senha-123', 'nova-senha-123');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha alterada. Entre com a nova senha.',
    );
    expect(router.state.location.pathname).toBe('/entrar');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/reset-password', 'http://api.test'),
      expect.objectContaining({
        body: JSON.stringify({ newPassword: 'nova-senha-123', token: 'token-de-teste' }),
      }),
    );
  });

  it('checks that both passwords match before calling the API', async () => {
    const fetchMock = mockApi({});
    renderApp('/redefinir-senha?token=token-de-teste');

    await fillAndSubmit('nova-senha-123', 'outra-senha-123');

    expect(await screen.findByText('As senhas não conferem.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains an expired token reported by the API', async () => {
    mockApi({
      'POST /api/auth/reset-password': {
        status: 400,
        body: { code: 'INVALID_TOKEN', message: 'Invalid token' },
      },
    });
    renderApp('/redefinir-senha?token=token-vencido');

    await fillAndSubmit('nova-senha-123', 'nova-senha-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este link é inválido ou expirou. Peça um novo.',
    );
  });

  it.each(['/redefinir-senha', '/redefinir-senha?error=INVALID_TOKEN'])(
    'shows an invalid link message at %s',
    async (path) => {
      mockApi({});
      renderApp(path);

      expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Pedir um novo link' })).toBeInTheDocument();
    },
  );
});
