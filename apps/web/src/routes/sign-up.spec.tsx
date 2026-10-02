import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeUser, healthy, mockApi, noSession, personalWorkspace } from '@/test/mock-api';
import { renderApp } from '@/test/render';

const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

async function fillAndSubmit({ name, email, password }: typeof maria) {
  await userEvent.type(await screen.findByLabelText('Nome'), name);
  await userEvent.type(screen.getByLabelText('E-mail'), email);
  await userEvent.type(screen.getByLabelText(/^Senha/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
}

describe('SignUpPage', () => {
  it('creates the account and goes to the home page', async () => {
    mockApi({
      'GET /me': noSession,
      'POST /api/auth/sign-up/email': { body: { token: 'fake', user: fakeUser } },
      'GET /health': healthy,
      'GET /workspaces': { body: [personalWorkspace] },
    });
    renderApp('/cadastro');

    await fillAndSubmit(maria);

    expect(await screen.findByRole('heading', { name: 'Olá, Maria Exemplo' })).toBeInTheDocument();
  });

  it('shows the password rule before calling the API', async () => {
    const fetchMock = mockApi({ 'GET /me': noSession });
    renderApp('/cadastro');

    await fillAndSubmit({ ...maria, password: '1234567' });

    expect(
      await screen.findByText('A senha precisa ter pelo menos 8 caracteres.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only GET /me
  });

  it('tells when the e-mail is already registered', async () => {
    mockApi({
      'GET /me': noSession,
      'POST /api/auth/sign-up/email': {
        status: 422,
        body: { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists.' },
      },
    });
    renderApp('/cadastro');

    await fillAndSubmit(maria);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma conta com este e-mail.',
    );
  });

  it('links to the sign-in page', async () => {
    mockApi({ 'GET /me': noSession });
    const { router } = renderApp('/cadastro');

    await userEvent.click(await screen.findByRole('link', { name: 'Entrar' }));

    expect(router.state.location.pathname).toBe('/entrar');
  });
});
