import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { personalWorkspace, verifiedUser, mockApi } from '@/test/mock-api';
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

const section = (name: 'Entradas' | 'Saídas') => screen.findByRole('region', { name });

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

    const credits = await section('Entradas');
    expect(
      within(credits)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining('Consórcio'), expect.stringContaining('Salário')]);
    const debits = await section('Saídas');
    expect(within(debits).getByRole('heading', { name: 'Arquivadas' })).toBeInTheDocument();
    // Each category has its actions in a menu: active ones are renamed or archived...
    expect(await menuOf('Mercado')).toEqual([
      'Renomear',
      'Não contar como renda nem gasto',
      'Arquivar',
    ]);
    // ...archived ones are reactivated or deleted.
    expect(await menuOf('IPVA')).toEqual(['Reativar', 'Excluir']);
  });

  it('offers to delete a category never used right away, and never one in use', async () => {
    mockCategories({
      [`GET ${base}`]: {
        body: [
          { ...mercado, inUse: true },
          { ...consorcioDebit, inUse: false },
          { ...ipva, inUse: true },
        ],
      },
    });

    renderApp(`/espacos/${houseId}/categorias`);

    expect(await menuOf('Consórcio')).toEqual([
      'Renomear',
      'Não contar como renda nem gasto',
      'Arquivar',
      'Excluir',
    ]);
    expect(await menuOf('Mercado')).toEqual([
      'Renomear',
      'Não contar como renda nem gasto',
      'Arquivar',
    ]);
    // Archived but in use: the API would refuse, so it is not offered.
    expect(await menuOf('IPVA')).toEqual(['Reativar']);
  });

  it("marks a saving destination's category, which changes only with its destination", async () => {
    const investimentos = {
      ...category(6, 'Investimentos', 'DEBIT'),
      destinationId: '01920000-0000-7000-8000-0000000000d2',
    };
    mockCategories({ [`GET ${base}`]: { body: [...categories, investimentos] } });

    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Saídas');
    const row = within(debits)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith('Investimentos'));
    expect(row).toHaveTextContent('Meta');
    expect(
      screen.queryByRole('button', { name: 'Ações de Investimentos' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações de Mercado' })).toBeInTheDocument();
  });

  it('marks Reembolso and Repasse, which never change (ADR 0052 note)', async () => {
    const reembolso = { ...category(7, 'Reembolso', 'CREDIT'), splitRole: 'REIMBURSEMENT' };
    mockCategories({ [`GET ${base}`]: { body: [...categories, reembolso] } });

    renderApp(`/espacos/${houseId}/categorias`);

    const credits = await section('Entradas');
    const row = within(credits)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith('Reembolso'));
    expect(row).toHaveTextContent('Divisão');
    expect(screen.queryByRole('button', { name: 'Ações de Reembolso' })).not.toBeInTheDocument();
  });

  it('counts each section and finds a category by name, ignoring accents', async () => {
    mockCategories();
    renderApp(`/espacos/${houseId}/categorias`);

    const credits = await section('Entradas');
    const debits = await section('Saídas');
    expect(credits).toHaveTextContent('2 categorias');
    expect(debits).toHaveTextContent('3 categorias');

    await userEvent.type(screen.getByLabelText('Buscar categoria'), 'consorcio');
    expect(credits).toHaveTextContent('1 de 2 categorias');
    expect(within(credits).getAllByRole('listitem')).toHaveLength(1);
    expect(within(debits).getByText('Consórcio')).toBeInTheDocument();
    expect(within(debits).queryByText('Mercado')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Buscar categoria'));
    await userEvent.type(screen.getByLabelText('Buscar categoria'), 'sal');
    expect(debits).toHaveTextContent('Nenhuma categoria de saída ativa com “sal”.');
    expect(within(credits).getByText('Salário')).toBeInTheDocument();
  });

  it('adds a category from the top of the page, of the chosen type', async () => {
    const fetchMock = mockCategories({
      [`POST ${base}`]: { status: 201, body: category(6, 'Aluguel recebido', 'CREDIT') },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await userEvent.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' });
    // Debit first: most categories are of spending.
    expect(within(dialog).getByRole('radio', { name: 'Saída' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Entrada' }));
    await userEvent.type(within(dialog).getByLabelText('Nome'), ' Aluguel recebido ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({ name: 'Aluguel recebido', type: 'CREDIT' }),
    });
    expect(await screen.findByText('Categoria adicionada')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Nova categoria' })).toHaveFocus();
  });

  it('validates the name before calling the API', async () => {
    const fetchMock = mockCategories();
    renderApp(`/espacos/${houseId}/categorias`);

    await userEvent.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    expect(await within(dialog).findByText('Dê um nome à categoria.')).toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole('button', { name: 'Nova categoria' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova categoria' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'ipva');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
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

  it('marks a category "Nem renda nem gasto" after asking, and unmarks it (ADR 0056)', async () => {
    const loans = category(6, 'Empréstimo pessoal', 'DEBIT');
    const fetchMock = mockCategories({
      [`GET ${base}`]: { body: [...categories, loans] },
      [`PATCH ${base}/${loans.id}`]: { body: { ...loans, neutral: true } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await choose('Empréstimo pessoal', 'Não contar como renda nem gasto');
    // It changes every month's dashboard, so it says what changes before doing it.
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Não contar Empréstimo pessoal como gasto?',
    });
    expect(confirm).toHaveTextContent('do limite de gastos e dos gastos da Análise');
    expect(confirm).toHaveTextContent('inclusive os que já passaram');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Não contar' }));
    await expectCall(fetchMock, `${base}/${loans.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ neutral: true }),
    });
    expect(
      await screen.findByText('Empréstimo pessoal não conta mais como gasto'),
    ).toBeInTheDocument();
  });

  // Money lent and where it comes back, both marked (ADRs 0056, 0058).
  const lent = { ...category(7, 'Empréstimos feitos', 'DEBIT'), neutral: true };
  const back = { ...category(8, 'Empréstimos a receber', 'CREDIT'), neutral: true };

  it('chooses where a loan comes back, and shows it (ADR 0058)', async () => {
    const fetchMock = mockCategories({
      [`GET ${base}`]: { body: [...categories, lent, back] },
      [`PATCH ${base}/${lent.id}`]: { body: { ...lent, returnCategoryId: back.id } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    // Only a marked debit category chooses it.
    expect(await menuOf('Mercado')).not.toContain('Onde entra a volta');
    expect(await menuOf('Empréstimos a receber')).not.toContain('Onde entra a volta');
    await choose('Empréstimos feitos', 'Onde entra a volta');
    const dialog = await screen.findByRole('dialog', {
      name: 'Onde entra a volta: Empréstimos feitos',
    });
    expect(within(dialog).getByRole('radio', { name: /^Reembolso/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Empréstimos a receber/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/${lent.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ returnCategoryId: back.id }),
    });
    expect(
      await screen.findByText('A volta de Empréstimos feitos entra em Empréstimos a receber'),
    ).toBeInTheDocument();
  });

  it('shows where a loan comes back on its category', async () => {
    mockCategories({
      [`GET ${base}`]: { body: [...categories, { ...lent, returnCategoryId: back.id }, back] },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Saídas');
    expect(within(debits).getByText('A volta entra em Empréstimos a receber')).toBeInTheDocument();
  });

  it('offers to create the credit category when none is marked yet', async () => {
    const created = category(9, 'Empréstimos feitos', 'CREDIT');
    const fetchMock = mockCategories({
      [`GET ${base}`]: { body: [...categories, lent] },
      [`POST ${base}`]: { status: 201, body: created },
      [`PATCH ${base}/${created.id}`]: { body: { ...created, neutral: true } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await choose('Empréstimos feitos', 'Onde entra a volta');
    const dialog = await screen.findByRole('dialog', {
      name: 'Onde entra a volta: Empréstimos feitos',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Criar "Empréstimos feitos" de entrada' }),
    );

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({ name: 'Empréstimos feitos', type: 'CREDIT' }),
    });
    await expectCall(fetchMock, `${base}/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ neutral: true, archived: false }),
    });
  });

  it('shows the mark and offers to count the category again', async () => {
    const loans = { ...category(6, 'Empréstimo recebido', 'CREDIT'), neutral: true };
    const fetchMock = mockCategories({
      [`GET ${base}`]: { body: [...categories, loans] },
      [`PATCH ${base}/${loans.id}`]: { body: { ...loans, neutral: false } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    const credits = await section('Entradas');
    expect(within(credits).getByText('Nem renda nem gasto')).toBeInTheDocument();
    await choose('Empréstimo recebido', 'Contar como renda');
    await expectCall(fetchMock, `${base}/${loans.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ neutral: false }),
    });
    expect(
      await screen.findByText('Empréstimo recebido volta a contar como renda'),
    ).toBeInTheDocument();
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

  it('copies the chosen categories of another workspace, skipping those already here', async () => {
    const personalBase = `/api/workspaces/${personalWorkspace.id}/categories`;
    const pet = { ...category(11, 'Pet', 'DEBIT'), id: '01920000-0000-7000-8000-0000000002a1' };
    const fetchMock = mockCategories({
      'GET /api/workspaces': { body: [personalWorkspace, house] },
      [`GET ${personalBase}`]: {
        body: [
          { ...salario, id: '01920000-0000-7000-8000-0000000002a2' },
          { ...category(12, 'mercado', 'DEBIT'), id: '01920000-0000-7000-8000-0000000002a3' },
          pet,
          { ...category(13, 'Antiga', 'DEBIT', true), id: '01920000-0000-7000-8000-0000000002a4' },
          {
            ...category(14, 'Investimentos', 'DEBIT'),
            id: '01920000-0000-7000-8000-0000000002a5',
            destinationId: '01920000-0000-7000-8000-0000000000d2',
          },
        ],
      },
      [`POST ${base}/copy`]: { status: 201, body: { copied: 1, skipped: 0 } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar de outro espaço' }));

    const dialog = await screen.findByRole('dialog', { name: 'Copiar de outro espaço' });
    // The only other workspace is already chosen; its new categories start checked.
    expect(await within(dialog).findByRole('checkbox', { name: 'Pet' })).toBeChecked();
    // Already here, ignoring case: only named, folded away, never offered.
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(dialog).getByText('Já existem aqui (2)')).toBeInTheDocument();
    expect(within(dialog).getByText('Salário, mercado.')).toBeInTheDocument();
    // Archived ones and a saving destination's are never copied (ADR 0048).
    expect(within(dialog).queryByText('Antiga')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Investimentos')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copiar 1 categoria' }));

    await expectCall(fetchMock, `${base}/copy`, {
      method: 'POST',
      body: JSON.stringify({ sourceWorkspaceId: personalWorkspace.id, categoryIds: [pet.id] }),
    });
    expect(await screen.findByText('1 categoria copiada')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Copiar de outro espaço' })).toHaveFocus();
  });

  it('copies nothing until something is checked', async () => {
    mockCategories({
      'GET /api/workspaces': { body: [personalWorkspace, house] },
      [`GET /api/workspaces/${personalWorkspace.id}/categories`]: {
        body: [{ ...category(11, 'Pet', 'DEBIT'), id: '01920000-0000-7000-8000-0000000002a1' }],
      },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar de outro espaço' }));
    const dialog = await screen.findByRole('dialog', { name: 'Copiar de outro espaço' });
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Desmarcar todas' }));

    expect(within(dialog).getByRole('button', { name: 'Copiar 0 categorias' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar todas' }));
    expect(within(dialog).getByRole('button', { name: 'Copiar 1 categoria' })).toBeEnabled();
  });

  it('offers no copy to whoever has a single workspace', async () => {
    mockCategories({ 'GET /api/workspaces': { body: [house] } });

    renderApp(`/espacos/${houseId}/categorias`);

    await section('Saídas');
    expect(
      screen.queryByRole('button', { name: 'Copiar de outro espaço' }),
    ).not.toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockCategories({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });

    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Saídas');
    expect(within(debits).getByText('Mercado')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova categoria' })).not.toBeInTheDocument();
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
