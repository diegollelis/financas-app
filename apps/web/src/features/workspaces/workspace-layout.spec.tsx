import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'OWNER' };
const base = `/api/workspaces/${houseId}`;

function mockHouse(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  const routes: Record<string, { status?: number; body: unknown }> = {
    'GET /api/me': { body: fakeUser },
    [`GET ${base}`]: { body: house },
    [`GET ${base}/members`]: { body: [] },
    [`GET ${base}/invitations`]: { body: [] },
    [`GET ${base}/categories`]: { body: [] },
    [`GET ${base}/transactions`]: { body: [] },
    ...overrides,
  };
  mockApi(routes);
  return routes;
}

const sectionsNav = () => screen.findByRole('navigation', { name: 'Seções do espaço' });

describe('WorkspaceLayout', () => {
  it('shows the workspace in the header and marks the section of the page', async () => {
    mockHouse();

    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(await within(await screen.findByRole('banner')).findByText('Casa')).toBeInTheDocument();
    const nav = await sectionsNav();
    expect(within(nav).getByRole('link', { name: 'Lançamentos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Painel' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo');
  });

  it('keeps the competência when moving between the pages of a month', async () => {
    mockHouse();

    const { router } = renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-11`);

    await userEvent.click(within(await sectionsNav()).getByRole('link', { name: 'Orçamento' }));
    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/orcamento`);
    expect(router.state.location.search).toBe('?competencia=2026-11');
    // Categories have no competência.
    expect(within(await sectionsNav()).getByRole('link', { name: 'Categorias' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}/categorias`,
    );
  });

  it('opens the other sections under "Mais" on the phone', async () => {
    mockHouse();
    const { router } = renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(within(await sectionsNav()).getByRole('button', { name: 'Mais' }));
    const sheet = await screen.findByRole('dialog', { name: 'Mais' });
    expect(within(sheet).getByRole('link', { name: 'Seus espaços' })).toHaveAttribute('href', '/');
    await userEvent.click(within(sheet).getByRole('link', { name: 'Categorias' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/categorias`);
    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('signs out from the account menu', async () => {
    mockHouse({ 'POST /api/auth/sign-out': { body: { success: true } } });
    renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent(fakeUser.email);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('answers "not found" without the sections for a workspace that is not yours', async () => {
    mockHouse({ [`GET ${base}`]: { status: 404, body: { message: 'Not Found' } } });

    renderApp(`/espacos/${houseId}/painel`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Espaço não encontrado.');
    expect(screen.getByRole('link', { name: 'Ver seus espaços' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('navigation', { name: 'Seções do espaço' })).not.toBeInTheDocument();
  });

  it('tries again after a failure', async () => {
    const routes = mockHouse({ [`GET ${base}`]: { status: 500, body: {} } });
    renderApp(`/espacos/${houseId}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir agora. Tente de novo em instantes.',
    );
    routes[`GET ${base}`] = { body: house };
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('heading', { name: 'Membros' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
