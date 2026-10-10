import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { navigateAway } from '@/lib/browser';
import { fakeUser, mockApi, personalWorkspace, signedInHome } from '@/test/mock-api';
import { stubPrefersDark } from '@/test/match-media';
import { renderApp } from '@/test/render';

// jsdom cannot load another page: sign-out's full navigation is checked by its argument.
vi.mock('@/lib/browser', () => ({ navigateAway: vi.fn() }));

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'OWNER' };
const base = `/api/workspaces/${houseId}`;

function mockHouse(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  const routes: Record<string, { status?: number; body: unknown }> = {
    'GET /api/me': { body: fakeUser },
    'GET /api/workspaces': { body: [personalWorkspace, house] },
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

async function openSwitcher(current: string) {
  await userEvent.click(
    await screen.findByRole('button', { name: `Trocar de espaço: Espaço ${current}` }),
  );
  return screen.findByRole('menu');
}

describe('WorkspaceSwitcher', () => {
  it('lists the workspaces, the current one checked', async () => {
    mockHouse();
    renderApp(`/espacos/${houseId}/painel`);

    const menu = await openSwitcher('Casa');

    expect(await within(menu).findByRole('menuitemradio', { name: /Pessoal/ })).not.toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: /Casa/ })).toBeChecked();
    expect(within(menu).getByRole('menuitemradio', { name: /Pessoal/ })).toHaveTextContent(
      'Só seu',
    );
  });

  it('switches workspace keeping the section and the competência', async () => {
    mockHouse({
      [`GET /api/workspaces/${personalWorkspace.id}`]: { body: personalWorkspace },
      [`GET /api/workspaces/${personalWorkspace.id}/categories`]: { body: [] },
      [`GET /api/workspaces/${personalWorkspace.id}/transactions`]: { body: [] },
    });
    const { router } = renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-11`);

    const menu = await openSwitcher('Casa');
    await userEvent.click(await within(menu).findByRole('menuitemradio', { name: /Pessoal/ }));

    expect(router.state.location.pathname).toBe(`/espacos/${personalWorkspace.id}/lancamentos`);
    expect(router.state.location.search).toBe('?competencia=2026-11');
    expect(
      await screen.findByRole('button', { name: 'Trocar de espaço: Espaço Pessoal' }),
    ).toBeInTheDocument();
    // Remembered: "/" opens it next time.
    await vi.waitFor(() =>
      expect(window.localStorage.getItem('financas-ultimo-espaco')).toBe(personalWorkspace.id),
    );
  });

  it('creates a shared workspace and opens it', async () => {
    const created = {
      id: '01920000-0000-7000-8000-000000000009',
      name: 'Viagem',
      isPersonal: false,
      role: 'OWNER',
    };
    mockHouse({
      'POST /api/workspaces': { body: created },
      [`GET /api/workspaces/${created.id}`]: { body: created },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    const menu = await openSwitcher('Casa');
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Novo espaço compartilhado' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Novo espaço compartilhado' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar espaço' }));
    expect(await within(dialog).findByText('Dê um nome ao espaço.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Nome do espaço'), 'Viagem');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar espaço' }));

    expect(await screen.findByText('Espaço criado')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/espacos/${created.id}/painel`),
    );
    expect(
      await screen.findByRole('button', { name: 'Trocar de espaço: Espaço Viagem' }),
    ).toBeInTheDocument();
  });
});

describe('WorkspaceLayout', () => {
  it('shows the app, the workspace and the section of the page', async () => {
    mockHouse();

    renderApp(`/espacos/${houseId}/lancamentos`);

    // The product's mark in the header; the workspace leads the page (ADR 0044).
    expect(
      within(await screen.findByRole('banner')).getByRole('link', { name: 'Finanças' }),
    ).toHaveAttribute('href', '/');
    expect(
      await screen.findByRole('button', { name: 'Trocar de espaço: Espaço Casa' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('A marca é de uso reservado');
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

  it('puts everything in a full-height sidebar on the desktop, with no header', async () => {
    stubPrefersDark(false, { desktop: true });
    mockHouse();

    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(await screen.findByRole('link', { name: 'Finanças' })).toHaveAttribute('href', '/');
    expect(
      await screen.findByRole('button', { name: 'Trocar de espaço: Espaço Casa' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    // The account at the sidebar's foot, by name instead of an icon.
    await userEvent.click(screen.getByRole('button', { name: new RegExp(fakeUser.name) }));
    expect(await screen.findByRole('menuitem', { name: 'Minha conta' })).toBeInTheDocument();
  });

  it('keeps the competência when moving between the pages of a month', async () => {
    mockHouse();

    const { router } = renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-11`);

    await userEvent.click(within(await sectionsNav()).getByRole('link', { name: 'Painel' }));
    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/painel`);
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
    expect(
      within(sheet)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Recorrências', 'Pessoas', 'Importar', 'Categorias', 'Membros']);
    await userEvent.click(within(sheet).getByRole('link', { name: 'Categorias' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/categorias`);
    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('signs out from the account menu, loading the plain sign-in page', async () => {
    mockHouse({ 'POST /api/auth/sign-out': { body: { success: true } } });
    const { router } = renderApp(`/espacos/${houseId}/painel`);

    await userEvent.click(await screen.findByRole('button', { name: 'Menu da conta' }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent(fakeUser.email);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sair' }));

    // No ?voltar= to this workspace: whoever signs in next may be another account.
    await vi.waitFor(() => expect(navigateAway).toHaveBeenCalledWith('/entrar'));
    // Until that page loads, this one stays as it was, saying so: no sign-in page of its own
    // first (the flash before the new page).
    expect(within(menu).getByRole('menuitem', { name: 'Saindo…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/painel`);
    expect(screen.getByRole('heading', { name: 'Painel' })).toBeInTheDocument();
  });

  it('answers "not found" without the sections for a workspace that is not yours', async () => {
    mockHouse({ [`GET ${base}`]: { status: 404, body: { message: 'Not Found' } } });

    renderApp(`/espacos/${houseId}/painel`);

    const gone = await screen.findByRole('alertdialog', { name: 'Espaço não encontrado' });
    expect(gone).toHaveTextContent('Ele pode ter sido excluído, ou você não faz mais parte dele.');
    // The only way on: there is nothing to stay for.
    expect(within(gone).getByRole('button', { name: 'Ir para o meu espaço agora' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Espaço não encontrado' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Seções do espaço' })).not.toBeInTheDocument();
  });

  it('says it is leaving, and goes to the personal workspace on its own', async () => {
    // A page of Casa finds out first (the transactions answer 404), while Casa is still the last
    // workspace opened and in the list loaded before.
    window.localStorage.setItem('financas-ultimo-espaco', houseId);
    mockApi({
      ...signedInHome,
      'GET /api/workspaces': { body: [personalWorkspace, house] },
      [`GET ${base}`]: { body: house },
      [`GET ${base}/categories`]: { status: 404, body: { message: 'Not Found' } },
    });
    const { router } = renderApp(`/espacos/${houseId}/categorias`);

    expect(
      await screen.findByText(/Levando você para o seu espaço em 5 segundos/),
    ).toBeInTheDocument();
    await vi.waitFor(
      () => expect(router.state.location.pathname).toBe(`/espacos/${personalWorkspace.id}/painel`),
      { timeout: 7000 },
    );
  }, 10_000);

  it('leads someone removed from the workspace to their own, not back to it', async () => {
    // Casa was the last workspace opened, and is still in the list loaded before.
    window.localStorage.setItem('financas-ultimo-espaco', houseId);
    mockApi({
      ...signedInHome,
      'GET /api/workspaces': { body: [personalWorkspace, house] },
      [`GET ${base}`]: { status: 404, body: { message: 'Not Found' } },
    });
    const { router } = renderApp(`/espacos/${houseId}/painel`);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ir para o meu espaço agora' }),
    );

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/espacos/${personalWorkspace.id}/painel`),
    );
    await vi.waitFor(() =>
      expect(window.localStorage.getItem('financas-ultimo-espaco')).toBe(personalWorkspace.id),
    );
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
