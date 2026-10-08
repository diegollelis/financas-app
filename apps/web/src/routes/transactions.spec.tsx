import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
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
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET /api/workspaces/${houseId}/people`]: { body: [] },
    [`GET /api/workspaces/${houseId}/categories`]: {
      body: [salaryCategory, energyCategory, marketCategory],
    },
    [`GET ${base}`]: { body: [salary, light, shopping] },
    ...overrides,
  });
}

const section = (name: 'Créditos' | 'Débitos') => screen.findByRole('region', { name });

// People (ADR 0042).
const ana = {
  id: '01920000-0000-7000-8000-000000000301',
  name: 'Ana',
  memberUserId: null,
  archived: false,
  receivableCents: 0,
  payableCents: 0,
};
const peopleBase = `/api/workspaces/${houseId}/people`;

// Intl separates "R$" from the number with a non-breaking space.
function nbsp(text: string | null | undefined) {
  return text?.replaceAll(String.fromCharCode(0xa0), ' ');
}

/** The card of one transaction in a section, found by its description. */
function row(container: HTMLElement, description: string) {
  const item = within(container)
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(description));
  if (!item) throw new Error(`No transaction "${description}"`);
  return item;
}

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, init: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining(init),
    ),
  );
}

/** Radix Select: open it, then pick the option. */
async function chooseCategory(form: HTMLElement, name: string) {
  await userEvent.click(within(form).getByRole('combobox', { name: 'Categoria' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

async function openNewTransaction() {
  await userEvent.click(await screen.findByRole('button', { name: 'Novo lançamento' }));
  return screen.findByRole('dialog', { name: 'Novo lançamento' });
}

async function openActions(description: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Ações de ${description}` }));
  return screen.findByRole('menu');
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
    const lightItem = row(debits, 'Conta de luz');
    expect(within(lightItem).getByText('Energia')).toBeInTheDocument();
    expect(within(lightItem).getByText('Vence em 10/10/2026')).toBeInTheDocument();
    expect(lightItem).toHaveTextContent('R$ 159,90');
    expect(lightItem).toHaveTextContent('Vencido');
    expect(row(debits, 'Compras da semana')).toHaveTextContent('Pendente');
  });

  it('opens the competência of the address, and points to Novo lançamento when it is empty', async () => {
    const fetchMock = mockTransactions({ [`GET ${base}`]: { body: [] } });

    renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-11`);

    expect(await screen.findByText('Nenhum lançamento em novembro de 2026.')).toBeInTheDocument();
    await expectCall(fetchMock, `${base}?period=2026-11`, {});
    // Points to the page's main action instead of repeating it.
    expect(screen.getByText('Use Novo lançamento para adicionar o primeiro.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getAllByRole('button', { name: /lançamento/i }),
    ).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Novo lançamento' }));
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toHaveTextContent(
      'Competência de novembro de 2026 em Casa.',
    );
  });

  it('repeats it every month: creates a recurrence starting in this competência', async () => {
    const recurrenceId = '01920000-0000-7000-8000-000000000301';
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/recurrences`]: {
        status: 201,
        body: {
          id: recurrenceId,
          type: 'DEBIT',
          description: 'Internet',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 9_990,
          variableAmount: false,
          dueDay: 20,
          startPeriod: '2026-10',
          endPeriod: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    expect(within(form).getByRole('radio', { name: 'Não repetir' })).toBeChecked();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Internet');
    await chooseCategory(form, 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '99,90');
    await userEvent.type(within(form).getByLabelText('Vencimento (opcional)'), '2026-10-20');
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo mês' }));
    expect(within(form).getByText(/Um lançamento pendente em cada mês/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Internet',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 9_990,
        dueDay: 20,
        startPeriod: '2026-10',
        variableAmount: false,
      }),
    });
    expect(
      await screen.findByText('Lançamento adicionado, repetindo todo mês'),
    ).toBeInTheDocument();
  });

  it('marks a generated transaction and ends its recurrence from the menu', async () => {
    const recurrenceId = '01920000-0000-7000-8000-000000000301';
    const fetchMock = mockTransactions({
      [`GET ${base}`]: { body: [salary, { ...light, recurrenceId }, shopping] },
      [`DELETE /api/workspaces/${houseId}/recurrences/${recurrenceId}`]: {
        status: 204,
        body: null,
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Débitos');
    expect(row(debits, 'Conta de luz')).toHaveTextContent('Todo mês');
    expect(row(debits, 'Compras da semana')).not.toHaveTextContent('Todo mês');

    const menu = await openActions('Conta de luz');
    expect(within(menu).getByRole('menuitem', { name: 'Excluir só este mês' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Encerrar recorrência' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Encerrar a recorrência Conta de luz?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Encerrar recorrência' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences/${recurrenceId}`, {
      method: 'DELETE',
    });
    expect(await screen.findByText('Recorrência encerrada')).toBeInTheDocument();
  });

  it('repeats a bill whose amount changes, estimating it', async () => {
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/recurrences`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000302',
          type: 'DEBIT',
          description: 'Conta de luz',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 18_000,
          variableAmount: true,
          dueDay: null,
          startPeriod: '2026-10',
          endPeriod: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    // "Valor" only matters for a monthly one.
    expect(within(form).queryByRole('radiogroup', { name: 'Valor' })).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await chooseCategory(form, 'Energia');
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo mês' }));
    expect(within(form).getByRole('radio', { name: 'Fixo' })).toBeChecked();
    await userEvent.click(within(form).getByRole('radio', { name: 'Variável' }));
    await userEvent.type(within(form).getByLabelText('Valor estimado (R$)'), '180');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Conta de luz',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 18_000,
        dueDay: null,
        startPeriod: '2026-10',
        variableAmount: true,
      }),
    });
  });

  it('asks for the bill amount when settling an estimate; a fixed one settles in one tap', async () => {
    const estimate = {
      ...light,
      recurrenceId: '01920000-0000-7000-8000-000000000302',
      amountEstimated: true,
    };
    const fetchMock = mockTransactions({
      [`GET ${base}`]: { body: [estimate, shopping] },
      [`PATCH ${base}/${light.id}`]: {
        body: { ...estimate, amountCents: 17_250, settledAt: '2026-10-15', amountEstimated: false },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Débitos');
    expect(row(debits, 'Conta de luz')).toHaveTextContent('Estimado');
    expect(row(debits, 'Compras da semana')).not.toHaveTextContent('Estimado');

    await userEvent.click(screen.getByRole('button', { name: 'Efetivar Conta de luz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Efetivar Conta de luz' });
    const amount = within(dialog).getByLabelText('Valor da fatura (R$)');
    expect(amount).toHaveValue('159,90');
    await userEvent.clear(amount);
    await userEvent.type(amount, '172,50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Efetivar' }));

    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ amountCents: 17_250, settledAt: '2026-10-15' }),
    });
    expect(await screen.findByText('Lançamento efetivado')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('splits a purchase in installments, showing what will be created', async () => {
    const planId = '01920000-0000-7000-8000-000000000401';
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/installments`]: {
        status: 201,
        body: {
          id: planId,
          type: 'DEBIT',
          description: 'Geladeira',
          notes: null,
          categoryId: marketCategory.id,
          totalCents: 100_000,
          installments: 3,
          firstPeriod: '2026-10',
          dueDay: null,
          endedAt: null,
          settledCount: 0,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Geladeira');
    await chooseCategory(form, 'Mercado');
    await userEvent.click(within(form).getByRole('radio', { name: 'Parcelado' }));
    expect(within(form).getByRole('radio', { name: 'Total' })).toBeChecked();
    await userEvent.type(within(form).getByLabelText('Valor total (R$)'), '1.000');
    await userEvent.type(within(form).getByLabelText('Parcelas'), '3');
    expect(nbsp(within(form).getByText(/3 parcelas: 2 de/).textContent)).toBe(
      '3 parcelas: 2 de R$ 333,33 e a última de R$ 333,34, total R$ 1.000,00.',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/installments`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Geladeira',
        notes: null,
        categoryId: marketCategory.id,
        installments: 3,
        amountCents: 100_000,
        amountIs: 'TOTAL',
        firstPeriod: '2026-10',
        dueDay: null,
      }),
    });
    expect(await screen.findByText('Parcelamento adicionado: 3 parcelas')).toBeInTheDocument();
  });

  it('takes the amount of each installment, and checks the count', async () => {
    mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.click(within(form).getByRole('radio', { name: 'Parcelado' }));
    await userEvent.click(within(form).getByRole('radio', { name: 'Da parcela' }));
    await userEvent.type(within(form).getByLabelText('Valor da parcela (R$)'), '99,90');
    await userEvent.type(within(form).getByLabelText('Parcelas'), '10');
    expect(nbsp(within(form).getByText(/10 parcelas de/).textContent)).toBe(
      '10 parcelas de R$ 99,90, total R$ 999,00.',
    );

    await userEvent.clear(within(form).getByLabelText('Parcelas'));
    await userEvent.type(within(form).getByLabelText('Parcelas'), '1');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(await within(form).findByText('Use de 2 a 72 parcelas.')).toBeInTheDocument();
  });

  it('marks an installment and ends its plan from the menu', async () => {
    const planId = '01920000-0000-7000-8000-000000000401';
    const fetchMock = mockTransactions({
      [`GET ${base}`]: {
        body: [{ ...shopping, installment: { planId, number: 3, count: 10 } }],
      },
      [`DELETE /api/workspaces/${houseId}/installments/${planId}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Débitos');
    expect(row(debits, 'Compras da semana')).toHaveTextContent('Parcela 3/10');
    const menu = await openActions('Compras da semana');
    expect(
      within(menu).getByRole('menuitem', { name: 'Excluir só esta parcela' }),
    ).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Encerrar parcelamento' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Encerrar o parcelamento Compras da semana?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Encerrar parcelamento' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/installments/${planId}`, {
      method: 'DELETE',
    });
    expect(await screen.findByText('Parcelamento encerrado')).toBeInTheDocument();
  });

  it('says that editing a generated month changes only that month', async () => {
    mockTransactions({
      [`GET ${base}`]: {
        body: [{ ...light, recurrenceId: '01920000-0000-7000-8000-000000000301' }],
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const menu = await openActions('Conta de luz');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }));

    const form = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    expect(form).toHaveTextContent('esta mudança vale só para este mês');
    expect(within(form).queryByRole('radiogroup', { name: 'Repetir' })).not.toBeInTheDocument();
  });

  it('creates a transaction in the competência, closes the form and confirms', async () => {
    const fetchMock = mockTransactions({ [`POST ${base}`]: { status: 201, body: light } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await chooseCategory(form, 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '159,90');
    await userEvent.type(within(form).getByLabelText('Vencimento (opcional)'), '2026-10-10');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Conta de luz',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 15_990,
        dueDate: '2026-10-10',
        period: '2026-10',
        personId: null,
      }),
    });
    expect(await screen.findByText('Lançamento adicionado')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows why creating failed, and starts clean the next time', async () => {
    mockTransactions({
      [`POST ${base}`]: {
        status: 400,
        body: { code: 'INVALID_CATEGORY', message: 'Essa categoria não serve para débitos.' },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    let form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await chooseCategory(form, 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '159,90');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Essa categoria não serve para débitos.',
    );

    await userEvent.click(within(form).getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Novo lançamento' })).toHaveFocus(),
    );
    form = await openNewTransaction();
    expect(within(form).getByLabelText('Descrição')).toHaveValue('');
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers only the categories of the chosen type', async () => {
    mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    const options = async () => {
      await userEvent.click(within(form).getByRole('combobox', { name: 'Categoria' }));
      const names = (await screen.findAllByRole('option')).map((option) => option.textContent);
      await userEvent.keyboard('{Escape}');
      return names;
    };

    expect(within(form).getByRole('radio', { name: 'Débito' })).toBeChecked();
    expect(await options()).toEqual(['Energia', 'Mercado']);
    await userEvent.click(within(form).getByRole('radio', { name: 'Crédito' }));
    expect(await options()).toEqual(['Salário']);
  });

  it('checks the amount before calling the API', async () => {
    const fetchMock = mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await chooseCategory(form, 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '15,9,9');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    expect(await within(form).findByText('Use um valor como 1.234,56.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(base, 'http://api.test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('settles in one tap with today’s date, and undoes it from the menu', async () => {
    const fetchMock = mockTransactions({
      [`PATCH ${base}/${light.id}`]: { body: { ...light, settledAt: '2026-10-15' } },
      [`PATCH ${base}/${salary.id}`]: { body: { ...salary, settledAt: null } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Efetivar Conta de luz' }));
    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: '2026-10-15' }),
    });
    expect(await screen.findByText('Lançamento efetivado')).toBeInTheDocument();

    const menu = await openActions('Salário de outubro');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Desfazer efetivação' }));
    await expectCall(fetchMock, `${base}/${salary.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: null }),
    });
    expect(await screen.findByText('Efetivação desfeita')).toBeInTheDocument();
  });

  it('tells when a change fails', async () => {
    mockTransactions({ [`PATCH ${base}/${light.id}`]: { status: 500, body: {} } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Efetivar Conta de luz' }));

    expect(
      await screen.findByText('Não foi possível concluir agora. Tente de novo em instantes.'),
    ).toBeInTheDocument();
  });

  it('edits a transaction', async () => {
    const fetchMock = mockTransactions({
      [`PATCH ${base}/${light.id}`]: { body: { ...light, amountCents: 17_250 } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const menu = await openActions('Conta de luz');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    const form = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    const amount = within(form).getByLabelText('Valor (R$)');
    expect(amount).toHaveValue('159,90');
    expect(within(form).getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Energia');
    await userEvent.clear(amount);
    await userEvent.type(amount, '172,50');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Conta de luz',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 17_250,
        dueDate: '2026-10-10',
        personId: null,
      }),
    });
    expect(await screen.findByText('Lançamento salvo')).toBeInTheDocument();
  });

  it('asks for confirmation, naming the transaction, before deleting', async () => {
    const fetchMock = mockTransactions({
      [`DELETE ${base}/${shopping.id}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    let menu = await openActions('Compras da semana');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    let confirm = await screen.findByRole('alertdialog', { name: 'Excluir Compras da semana?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    // Back where it started, not lost on the page.
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ações de Compras da semana' })).toHaveFocus(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(`${base}/${shopping.id}`, 'http://api.test'),
      expect.anything(),
    );

    menu = await openActions('Compras da semana');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    confirm = await screen.findByRole('alertdialog', { name: 'Excluir Compras da semana?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await expectCall(fetchMock, `${base}/${shopping.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Lançamento excluído')).toBeInTheDocument();
  });

  it('splits a new debit with people, equally, the leftover staying in your share', async () => {
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`POST ${base}`]: { status: 201, body: shopping },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Jantar');
    await chooseCategory(form, 'Mercado');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '300,00');
    // One person or a split: a split has no "A pagar para".
    expect(within(form).getByLabelText('A pagar para (opcional)')).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    expect(within(form).queryByLabelText('A pagar para (opcional)')).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Pessoa 1'), 'Ana');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar pessoa' }));
    await userEvent.type(within(form).getByLabelText('Pessoa 2'), 'Bruno');
    await userEvent.click(within(form).getByRole('button', { name: 'Dividir igualmente' }));

    expect(within(form).getByText(/^Sua parte: R\$\s100,00/)).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Jantar',
        notes: null,
        categoryId: marketCategory.id,
        amountCents: 30_000,
        dueDate: null,
        period: '2026-10',
        split: [
          { personId: ana.id, amountCents: 10_000 },
          { newPersonName: 'Bruno', amountCents: 10_000 },
        ],
      }),
    });
    expect(
      await screen.findByText('Lançamento adicionado, dividido com 2 pessoas'),
    ).toBeInTheDocument();
  });

  it('checks the shares before calling the API', async () => {
    const fetchMock = mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Jantar');
    await chooseCategory(form, 'Mercado');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '100,00');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    await userEvent.click(within(form).getByRole('radio', { name: 'Em %' }));
    await userEvent.type(within(form).getByLabelText('Parte (%)'), '120');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    expect(await within(form).findByText('Informe o nome.')).toBeInTheDocument();
    expect(within(form).getByText('De 0 a 100%.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(base, 'http://api.test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('links a credit to a new person, created on save', async () => {
    const carlos = { ...ana, id: '01920000-0000-7000-8000-000000000302', name: 'Carlos' };
    const fetchMock = mockTransactions({
      [`POST ${peopleBase}`]: { status: 201, body: carlos },
      [`POST ${base}`]: { status: 201, body: salary },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.click(within(form).getByRole('radio', { name: 'Crédito' }));
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Empréstimo ao Carlos');
    await chooseCategory(form, 'Salário');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '200,00');
    await userEvent.type(within(form).getByLabelText('A receber de (opcional)'), 'Carlos');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, peopleBase, {
      method: 'POST',
      body: JSON.stringify({ name: 'Carlos' }),
    });
    await expectCall(fetchMock, base, {
      method: 'POST',
      body: expect.stringContaining(`"personId":"${carlos.id}"`) as string,
    });
  });

  it('shows who a transaction is with, and offers to delete a split with its shares', async () => {
    const dinner = transaction(4, {
      type: 'DEBIT',
      description: 'Jantar',
      categoryId: marketCategory.id,
      amountCents: 30_000,
    });
    const share = transaction(5, {
      type: 'CREDIT',
      description: 'Ana: parte de Jantar',
      categoryId: salaryCategory.id,
      amountCents: 15_000,
      personId: ana.id,
      splitOfId: dinner.id,
    });
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`GET ${base}`]: { body: [share, dinner] },
      [`DELETE ${base}/${dinner.id}`]: { status: 204, body: null },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(await section('Créditos')).toHaveTextContent('A receber de Ana');
    expect(await section('Débitos')).toHaveTextContent('Dividido com Ana');
    const menu = await openActions('Jantar');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir Jantar?' });
    expect(confirm).toHaveTextContent('Ele foi dividido com Ana');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir com as partes' }));

    await expectCall(fetchMock, `${base}/${dinner.id}?withShares=true`, { method: 'DELETE' });
    expect(await screen.findByText('Lançamento e partes excluídos')).toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockTransactions({
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } },
    });

    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(await section('Débitos')).toHaveTextContent('Conta de luz');
    // Only the competência picker, which navigates; nothing that edits.
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([expect.stringMatching(/^Escolher competência/)]);
  });

  it('is reached from the sections of the workspace', async () => {
    mockTransactions({ [`GET /api/workspaces/${houseId}/members`]: { body: [] } });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'Lançamentos' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/lancamentos`);
    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
  });
});
