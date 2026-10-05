import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/transactions`;

const salaryCategory = {
  id: '01920000-0000-7000-8000-000000000101',
  name: 'Salário',
  type: 'CREDIT',
  archived: false,
};
const energyCategory = {
  id: '01920000-0000-7000-8000-000000000102',
  name: 'Energia',
  type: 'DEBIT',
  archived: false,
};
const marketCategory = {
  id: '01920000-0000-7000-8000-000000000103',
  name: 'Mercado',
  type: 'DEBIT',
  archived: false,
};

const transaction = (n: number, fields: Record<string, unknown>) => ({
  id: `01920000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`,
  notes: null,
  period: '2026-10',
  dueDate: null,
  settledAt: null,
  ...fields,
});
const salary = transaction(1, {
  type: 'CREDIT',
  description: 'Salário de outubro',
  categoryId: salaryCategory.id,
  amountCents: 500_000,
  settledAt: '2026-10-05',
});
const light = transaction(2, {
  type: 'DEBIT',
  description: 'Conta de luz',
  categoryId: energyCategory.id,
  amountCents: 15_990,
  dueDate: '2026-10-10',
});
const shopping = transaction(3, {
  type: 'DEBIT',
  description: 'Compras da semana',
  categoryId: marketCategory.id,
  amountCents: 35_000,
});

function mockTransactions(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: fakeUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET /api/workspaces/${houseId}/categories`]: {
      body: [salaryCategory, energyCategory, marketCategory],
    },
    [`GET ${base}`]: { body: [salary, light, shopping] },
    ...overrides,
  });
}

const section = (name: 'Créditos' | 'Débitos') => screen.findByRole('region', { name });
const newTransaction = () => screen.findByRole('region', { name: 'Novo lançamento' });

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, init: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining(init),
    ),
  );
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    // Only Date is faked: "today" is Oct 15th, 2026 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows this month: credits and debits apart, totals and the status of each one', async () => {
    const fetchMock = mockTransactions();

    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
    await expectCall(fetchMock, `${base}?period=2026-10`, {});
    const credits = await section('Créditos');
    expect(credits).toHaveTextContent('Total: R$ 5.000,00');
    expect(within(credits).getByText('Efetivado em 05/10/2026')).toBeInTheDocument();
    const debits = await section('Débitos');
    expect(debits).toHaveTextContent('Total: R$ 509,90');
    const lightItem = within(debits).getByText('Conta de luz').closest('li');
    expect(lightItem).toHaveTextContent('Energia · vence 10/10/2026');
    expect(lightItem).toHaveTextContent('R$ 159,90');
    expect(lightItem).toHaveTextContent('Vencido');
    const shoppingItem = within(debits).getByText('Compras da semana').closest('li');
    expect(shoppingItem).toHaveTextContent('Pendente');
  });

  it('opens the competência of the address', async () => {
    const fetchMock = mockTransactions({ [`GET ${base}`]: { body: [] } });

    renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-11`);

    expect(await screen.findByText('novembro de 2026')).toBeInTheDocument();
    await expectCall(fetchMock, `${base}?period=2026-11`, {});
    expect(await section('Débitos')).toHaveTextContent('Nenhum lançamento.');
  });

  it('creates a transaction in the competência and clears the form', async () => {
    const fetchMock = mockTransactions({ [`POST ${base}`]: { status: 201, body: light } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await newTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await userEvent.selectOptions(within(form).getByLabelText('Categoria'), 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '159,90');
    await userEvent.type(within(form).getByLabelText('Vencimento (opcional)'), '2026-10-10');
    await userEvent.click(within(form).getByRole('button', { name: 'Lançar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Conta de luz',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 15_990,
        period: '2026-10',
        dueDate: '2026-10-10',
      }),
    });
    await vi.waitFor(() => expect(within(form).getByLabelText('Descrição')).toHaveValue(''));
  });

  it('offers only the categories of the chosen type', async () => {
    mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await newTransaction();
    const options = () =>
      within(within(form).getByLabelText('Categoria'))
        .getAllByRole('option')
        .map((option) => option.textContent);

    expect(options()).toEqual(['Escolha…', 'Energia', 'Mercado']);
    await userEvent.click(within(form).getByLabelText('Crédito'));
    expect(options()).toEqual(['Escolha…', 'Salário']);
  });

  it('checks the amount before calling the API', async () => {
    const fetchMock = mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await newTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await userEvent.selectOptions(within(form).getByLabelText('Categoria'), 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '15,9,9');
    await userEvent.click(within(form).getByRole('button', { name: 'Lançar' }));

    expect(await within(form).findByText('Use um valor como 1.234,56.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(base, 'http://api.test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('settles in one click with today’s date, and undoes it', async () => {
    const fetchMock = mockTransactions({
      [`PATCH ${base}/${light.id}`]: { body: { ...light, settledAt: '2026-10-15' } },
      [`PATCH ${base}/${salary.id}`]: { body: { ...salary, settledAt: null } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Efetivar Conta de luz' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Desfazer efetivação de Salário de outubro' }),
    );

    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: '2026-10-15' }),
    });
    await expectCall(fetchMock, `${base}/${salary.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: null }),
    });
  });

  it('edits a transaction', async () => {
    const fetchMock = mockTransactions({
      [`PATCH ${base}/${light.id}`]: { body: { ...light, amountCents: 17_250 } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Editar Conta de luz' }));
    const debits = await section('Débitos');
    const amount = within(debits).getByLabelText('Valor (R$)');
    expect(amount).toHaveValue('159,90');
    await userEvent.clear(amount);
    await userEvent.type(amount, '172,50');
    await userEvent.click(within(debits).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Conta de luz',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 17_250,
        dueDate: '2026-10-10',
      }),
    });
  });

  it('asks for confirmation before deleting', async () => {
    const fetchMock = mockTransactions({
      [`DELETE ${base}/${shopping.id}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Compras da semana' }));
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(`${base}/${shopping.id}`, 'http://api.test'),
      expect.anything(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await expectCall(fetchMock, `${base}/${shopping.id}`, { method: 'DELETE' });
  });

  it('is read-only for a VIEWER', async () => {
    mockTransactions({
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } },
    });

    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(await section('Débitos')).toHaveTextContent('Conta de luz');
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Novo lançamento' })).not.toBeInTheDocument();
  });

  it('is reached from the sections of the workspace', async () => {
    mockTransactions({ [`GET /api/workspaces/${houseId}/members`]: { body: [] } });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'Lançamentos' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/lancamentos`);
    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
  });
});
