import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeUser, healthy, mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText('E-mail'), email);
  if (password) await userEvent.type(screen.getByLabelText('Senha'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('SignInPage', () => {
  it('sends visitors without a session to the sign-in page', async () => {
    mockApi({ 'GET /me': noSession });

    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('signs in and goes to the home page', async () => {
    const fetchMock = mockApi({
      'GET /me': noSession,
      'POST /api/auth/sign-in/email': { body: { token: 'fake', user: fakeUser } },
      'GET /health': healthy,
    });
    renderApp('/entrar');

    await fillAndSubmit('maria@example.com', 'senha-de-teste-123');

    expect(await screen.findByRole('heading', { name: 'Olá, Maria Exemplo' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/sign-in/email', 'http://api.test'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'maria@example.com', password: 'senha-de-teste-123' }),
      }),
    );
  });

  it('shows a message when the e-mail or password is wrong', async () => {
    mockApi({
      'GET /me': noSession,
      'POST /api/auth/sign-in/email': {
        status: 401,
        body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      },
    });
    renderApp('/entrar');

    await fillAndSubmit('maria@example.com', 'senha-errada');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
  });

  it('validates the form before calling the API', async () => {
    const fetchMock = mockApi({ 'GET /me': noSession });
    renderApp('/entrar');

    await fillAndSubmit('maria', '');

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /me
  });

  it('sends visitors who already have a session to the home page', async () => {
    mockApi({ 'GET /me': { body: fakeUser }, 'GET /health': healthy });

    const { router } = renderApp('/entrar');

    expect(await screen.findByRole('heading', { name: 'Olá, Maria Exemplo' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('SignInPage when rate-limited', () => {
  it('tells how long to wait, read from the X-Retry-After header', async () => {
    mockApi({
      'GET /me': noSession,
      'POST /api/auth/sign-in/email': {
        status: 429,
        body: { message: 'Too many requests. Please try again later.' },
        headers: { 'X-Retry-After': '45' },
      },
    });
    renderApp('/entrar');

    await fillAndSubmit('maria@example.com', 'senha-de-teste-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Tente de novo em 45 segundos.',
    );
  });
});
