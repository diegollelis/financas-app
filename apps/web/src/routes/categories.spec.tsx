import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi } from '@/test/mock-api';
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
    'GET /api/me': { body: fakeUser },
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
    expect(within(debits).getByRole('button', { name: 'Reativar IPVA' })).toBeInTheDocument();
    expect(within(debits).getByRole('button', { name: 'Arquivar Mercado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Casa' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}`,
    );
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

    const debits = await section('Débitos');
    await userEvent.click(within(debits).getByRole('button', { name: 'Renomear Mercado' }));
    const input = within(debits).getByLabelText('Novo nome para Mercado');
    await userEvent.clear(input);
    await userEvent.type(input, 'Supermercado');
    await userEvent.click(within(debits).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/${mercado.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Supermercado' }),
    });
    await vi.waitFor(() =>
      expect(within(debits).queryByLabelText('Novo nome para Mercado')).not.toBeInTheDocument(),
    );
  });

  it('archives an active category and reactivates an archived one', async () => {
    const fetchMock = mockCategories({
      [`PATCH ${base}/${mercado.id}`]: { body: { ...mercado, archived: true } },
      [`PATCH ${base}/${ipva.id}`]: { body: { ...ipva, archived: false } },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    await userEvent.click(within(debits).getByRole('button', { name: 'Arquivar Mercado' }));
    await userEvent.click(within(debits).getByRole('button', { name: 'Reativar IPVA' }));

    await expectCall(fetchMock, `${base}/${mercado.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    await expectCall(fetchMock, `${base}/${ipva.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: false }),
    });
  });

  it('offers deleting only for archived categories', async () => {
    const fetchMock = mockCategories({
      [`DELETE ${base}/${ipva.id}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    expect(
      within(debits).queryByRole('button', { name: 'Excluir Mercado' }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(debits).getByRole('button', { name: 'Excluir IPVA' }));

    await expectCall(fetchMock, `${base}/${ipva.id}`, { method: 'DELETE' });
  });

  it('is read-only for a VIEWER', async () => {
    mockCategories({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });

    renderApp(`/espacos/${houseId}/categorias`);

    const debits = await section('Débitos');
    expect(within(debits).getByText('Mercado')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Nova categoria/)).not.toBeInTheDocument();
  });

  it('answers "not found" for a workspace that is not yours', async () => {
    mockApi({
      'GET /api/me': { body: fakeUser },
      [`GET /api/workspaces/${houseId}`]: { status: 404, body: { message: 'Not Found' } },
      [`GET ${base}`]: { status: 404, body: { message: 'Not Found' } },
    });

    renderApp(`/espacos/${houseId}/categorias`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Espaço não encontrado.');
  });

  it('is reached from the workspace page', async () => {
    mockCategories({
      [`GET /api/workspaces/${houseId}/members`]: { body: [] },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'Categorias →' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/categorias`);
    expect(await screen.findByRole('heading', { name: 'Categorias' })).toBeInTheDocument();
  });
});
