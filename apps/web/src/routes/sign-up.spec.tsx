import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeUser, mockApi, noSession } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

const termsBox = () => screen.getByRole('checkbox', { name: /^Li e aceito os Termos de uso/ });

async function fillAndSubmit({ name, email, password }: typeof maria, { acceptTerms = true } = {}) {
  await userEvent.type(await screen.findByLabelText('Nome'), name);
  await userEvent.type(screen.getByLabelText('E-mail'), email);
  await userEvent.type(screen.getByLabelText(/^Senha/), password);
  if (acceptTerms) await userEvent.click(termsBox());
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
}

describe('SignUpPage', () => {
  it('creates the account and asks to confirm the e-mail before entering', async () => {
    const fetchMock = mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-up/email': { body: { token: null, user: fakeUser } },
    });
    const { router } = renderApp('/cadastro');

    await fillAndSubmit(maria);

    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(
      'Enviamos um link de confirmação para maria@example.com.',
    );
    // No session yet: still on the sign-up page.
    expect(router.state.location.pathname).toBe('/cadastro');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/sign-up/email', 'http://api.test'),
      expect.objectContaining({
        body: JSON.stringify({ ...maria, acceptTerms: true, callbackURL: '/' }),
      }),
    );
  });

  it('brings the person back to the invitation through the e-mailed link', async () => {
    const fetchMock = mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-up/email': { body: { token: null, user: fakeUser } },
    });
    renderApp('/cadastro?voltar=%2Fconvites%2Fabc');

    await fillAndSubmit(maria);

    await screen.findByRole('heading', { name: 'Confira seu e-mail' });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/sign-up/email', 'http://api.test'),
      expect.objectContaining({
        body: JSON.stringify({ ...maria, acceptTerms: true, callbackURL: '/convites/abc' }),
      }),
    );
  });

  it('resends the link, or goes back to fix the e-mail', async () => {
    const fetchMock = mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-up/email': { body: { token: null, user: fakeUser } },
      'POST /api/auth/send-verification-email': { body: { status: true } },
    });
    renderApp('/cadastro');
    await fillAndSubmit(maria);

    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar e-mail' }));

    expect(await screen.findByText('Enviamos um novo link.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/api/auth/send-verification-email', 'http://api.test'),
      expect.objectContaining({
        body: JSON.stringify({ email: maria.email, callbackURL: '/' }),
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Usar outro e-mail' }));

    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue(maria.email);
  });

  it('shows the password rule before calling the API', async () => {
    const fetchMock = mockApi({ 'GET /api/me': noSession });
    renderApp('/cadastro');

    await fillAndSubmit({ ...maria, password: '1234567' });

    expect(
      await screen.findByText('A senha precisa ter pelo menos 8 caracteres.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /api/me
  });

  it('asks to accept the terms before calling the API', async () => {
    const fetchMock = mockApi({ 'GET /api/me': noSession });
    renderApp('/cadastro');

    await fillAndSubmit(maria, { acceptTerms: false });

    expect(
      await screen.findByText(
        'Aceite os Termos de uso e a Política de privacidade para criar a conta.',
      ),
    ).toBeInTheDocument();
    expect(termsBox()).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /api/me
  });

  it('links to the terms of use from the checkbox', async () => {
    mockApi({ 'GET /api/me': noSession });
    const { router } = renderApp('/cadastro');

    // The first one is in the checkbox text; the page footer has another.
    const [inCheckbox] = await screen.findAllByRole('link', { name: 'Termos de uso' });
    await userEvent.click(inCheckbox!);

    expect(router.state.location.pathname).toBe('/termos');
  });

  it('keeps the form and explains when the API refuses (too many attempts)', async () => {
    mockApi({
      'GET /api/me': noSession,
      'POST /api/auth/sign-up/email': {
        status: 429,
        headers: { 'X-Retry-After': '40' },
        body: { message: 'Too many requests' },
      },
    });
    renderApp('/cadastro');

    await fillAndSubmit(maria);

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas.');
    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('links to the sign-in page', async () => {
    mockApi({ 'GET /api/me': noSession });
    const { router } = renderApp('/cadastro');

    await userEvent.click(await screen.findByRole('link', { name: 'Entrar' }));

    expect(router.state.location.pathname).toBe('/entrar');
  });
});
