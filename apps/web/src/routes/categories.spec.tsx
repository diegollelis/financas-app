import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/categories`;

const category = (n: number, name: string, type: 'CREDIT' | 'DEBIT', archived = false) => ({
  id: `01920000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  name,
  type,
  archived,
});
const salario = category(1, 'Salário', 'CREDIT');
const consorcioCredit = category(2, 'Consórcio', 'CREDIT');
const mercado = category(3, 'Mercado', 'DEBIT');
const consorcioDebit = category(4, 'Consórcio', 'DEBIT');
const ipva = category(5, 'IPVA', 'DEBIT', true);
const categories = [consorcioCredit, salario, consorcioDebit, ipva, mercado];

function mockCategories(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET ${base}`]: { body: categories },
    ...overrides,
  });
}

const section = (name: 'Créditos' | 'Débitos') => screen.findByRole('region', { name });

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, init: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining(init),
    ),
  );
}

async function openActions(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Ações de ${name}` }));
  return screen.findByRole('menu');
}

/** The items of a category's menu, closing it afterwards. */
async function menuOf(name: string) {
  const menu = await openActions(name);
  const items = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
  await userEvent.keyboard('{Escape}');
  return items;
}

async function choose(name: string, action: string) {
  const menu = await openActions(name);
  await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
}

describe('CategoriesPage', () => {
  it('lists credits and debits apart, with the archived ones separated', async () => {
    mockCategories();

    renderApp(`/espacos/${houseId}/categorias`);

    const credits = await section('Créditos');
    expect(
      within(credits)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Consórcio'), expect.stringContaining('Salário')]);
    const debits = await section('Débitos');
    expect(within(debits).getByRole('heading', { name: 'Arquivadas' })).toBeInTheDocument();
    // Each category has its actions in a menu: active ones are renamed or archived...
    expect(await menuOf('Mercado')).toEqual(['Renomear', 'Arquivar']);
    // ...archived ones are reactivated or deleted.
    expect(await menuOf('IPVA')).toEqual(['Reativar', 'Excluir']);
  });

  it("marks a saving destination's category, which changes only with its destination", async () => {
    const investimentos = {
      ...category(6, 'Investimentos', 'DEBIT'),
      destinationId: '01920000-0000-7000-8000-0000000000d2',
    };
    mockCategories({ [`GET ${base}`]: { body: [...categories, investimentos] } });

    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    const row = within(debits)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith('Investimentos'));
    expect(row).toHaveTextContent('Destino do orçamento');
    expect(
      screen.queryByRole('button', { name: 'Ações de Investimentos' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações de Mercado' })).toBeInTheDocument();
  });

  it('adds a category to the right type', async () => {
    const fetchMock = mockCategories({
      [`POST ${base}`]: { status: 201, body: category(6, 'Pet', 'DEBIT') },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    await userEvent.type(within(debits).getByLabelText('Nova categoria de débito'), ' Pet ');
    await userEvent.click(within(debits).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({ name: 'Pet', type: 'DEBIT' }),
    });
    await vi.waitFor(() =>
      expect(within(debits).getByLabelText('Nova categoria de débito')).toHaveValue(''),
    );
  });

  it('validates the name before calling the API', async () => {
    const fetchMock = mockCategories();
    renderApp(`/espacos/${houseId}/categorias`);

    const credits = await section('Créditos');
    await userEvent.click(within(credits).getByRole('button', { name: 'Adicionar' }));

    expect(await within(credits).findByText('Dê um nome à categoria.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(base, 'http://api.test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows the API reason for a duplicate name', async () => {
    mockCategories({
      [`POST ${base}`]: {
        status: 409,
        body: {
          code: 'CATEGORY_EXISTS',
          message: 'Já existe uma categoria com esse nome. Se ela estiver arquivada, reative-a.',
        },
      },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    await userEvent.type(within(debits).getByLabelText('Nova categoria de débito'), 'ipva');
    await userEvent.click(within(debits).getByRole('button', { name: 'Adicionar' }));

    expect(await within(debits).findByRole('alert')).toHaveTextContent(
      'Já existe uma categoria com esse nome.',
    );
  });

  it('renames a category', async () => {
    const fetchMock = mockCategories({
      [`PATCH ${base}/${mercado.id}`]: { body: { ...mercado, name: 'Supermercado' } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await choose('Mercado', 'Renomear');
    const dialog = await screen.findByRole('dialog', { name: 'Renomear categoria' });
    const input = within(dialog).getByLabelText('Novo nome para Mercado');
    expect(input).toHaveValue('Mercado');
    await userEvent.clear(input);
    await userEvent.type(input, 'Supermercado');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/${mercado.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Supermercado' }),
    });
    expect(await screen.findByText('Categoria renomeada')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('archives an active category and reactivates an archived one', async () => {
    const fetchMock = mockCategories({
      [`PATCH ${base}/${mercado.id}`]: { body: { ...mercado, archived: true } },
      [`PATCH ${base}/${ipva.id}`]: { body: { ...ipva, archived: false } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await choose('Mercado', 'Arquivar');
    await expectCall(fetchMock, `${base}/${mercado.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    expect(await screen.findByText('Categoria arquivada')).toBeInTheDocument();

    await choose('IPVA', 'Reativar');
    await expectCall(fetchMock, `${base}/${ipva.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: false }),
    });
    expect(await screen.findByText('Categoria reativada')).toBeInTheDocument();
  });

  it('asks for confirmation, naming the category, before deleting an archived one', async () => {
    const fetchMock = mockCategories({
      [`DELETE ${base}/${ipva.id}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await choose('IPVA', 'Excluir');
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir IPVA?' });
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(`${base}/${ipva.id}`, 'http://api.test'),
      expect.anything(),
    );
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await expectCall(fetchMock, `${base}/${ipva.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Categoria excluída')).toBeInTheDocument();
  });

  it('tells why a category in use cannot be deleted', async () => {
    mockCategories({
      [`DELETE ${base}/${ipva.id}`]: {
        status: 409,
        body: {
          code: 'CATEGORY_IN_USE',
          message: 'Esta categoria tem lançamentos: arquive-a em vez de excluir.',
        },
      },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await choose('IPVA', 'Excluir');
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir IPVA?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText('Esta categoria tem lançamentos: arquive-a em vez de excluir.'),
    ).toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockCategories({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });

    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    expect(within(debits).getByText('Mercado')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nova categoria/)).not.toBeInTheDocument();
  });

  it('answers "not found" for a workspace that is not yours', async () => {
    mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { status: 404, body: { message: 'Not Found' } },
      [`GET ${base}`]: { status: 404, body: { message: 'Not Found' } },
    });

    renderApp(`/espacos/${houseId}/categorias`);

    expect(
      await screen.findByRole('alertdialog', { name: 'Espaço não encontrado' }),
    ).toBeInTheDocument();
  });

  it('is reached from the sections of the workspace', async () => {
    mockCategories({
      [`GET /api/workspaces/${houseId}/members`]: { body: [] },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'Categorias' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/categorias`);
    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
  });
});
