import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { stubPrefersDark } from '@/test/match-media';
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
    [`GET /api/workspaces/${houseId}/merchants`]: { body: [] },
    [`GET /api/workspaces/${houseId}/categories`]: {
      body: [salaryCategory, energyCategory, marketCategory],
    },
    [`GET /api/workspaces/${houseId}/categories/hints`]: {
      body: { merchants: [], descriptions: [] },
    },
    [`GET ${base}`]: { body: [salary, light, shopping] },
    ...overrides,
  });
}

const section = (name: 'Entradas' | 'Saídas') => screen.findByRole('region', { name });

// People (ADR 0042).
const ana = {
  id: '01920000-0000-7000-8000-000000000301',
  name: 'Ana',
  memberUserId: null,
  isMember: false,
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

/** The person picker (ADR 0052): open it, then pick someone listed or add the name typed. */
async function pickPerson(form: HTMLElement, label: string, name: string, { add = false } = {}) {
  await userEvent.click(within(form).getByRole('combobox', { name: label }));
  if (add) {
    await userEvent.type(await screen.findByPlaceholderText('Buscar ou adicionar pessoa'), name);
    await userEvent.click(await screen.findByRole('option', { name: `Adicionar “${name}”` }));
  } else {
    await userEvent.click(await screen.findByRole('option', { name }));
  }
}

/**
 * "Com quem?" (ADR 0052): open it, pick people listed and add new names, all at once, then
 * close it with "Pronto" (the sheet of the phone, as in jsdom).
 */
async function pickPeople(form: HTMLElement, listed: string[], added: string[] = []) {
  await userEvent.click(within(form).getByRole('combobox', { name: 'Com quem?' }));
  for (const name of listed) {
    await userEvent.click(await screen.findByRole('option', { name }));
  }
  for (const name of added) {
    await userEvent.type(await screen.findByPlaceholderText('Buscar ou adicionar pessoa'), name);
    await userEvent.click(await screen.findByRole('option', { name: `Adicionar “${name}”` }));
  }
  await userEvent.click(screen.getByRole('button', { name: 'Pronto' }));
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
    const credits = await section('Entradas');
    expect(credits).toHaveTextContent('Total: + R$ 5.000,00');
    expect(within(credits).getByText('Recebido em 05/10')).toBeInTheDocument();
    const debits = await section('Saídas');
    expect(debits).toHaveTextContent('Total: − R$ 509,90');
    const lightItem = row(debits, 'Conta de luz');
    expect(within(lightItem).getByText('Energia')).toBeInTheDocument();
    expect(within(lightItem).getByText('Vence em 10/10/2026')).toBeInTheDocument();
    // The sign says money in or out; the green is only on top of it (ADR 0036 note).
    expect(lightItem).toHaveTextContent('− R$ 159,90');
    expect(lightItem).toHaveTextContent('Vencido');
    expect(within(credits).getByText('+ R$ 5.000,00')).toHaveClass('text-credit-foreground');
    // Pending is what "○ Pagar" already says: no badge for whoever can pay it.
    expect(row(debits, 'Compras da semana')).not.toHaveTextContent('Pendente');
  });

  it('sums up the month at the top, whatever the filter (ADR 0036 note)', async () => {
    mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-10&situacao=vencidos`);

    const totals = await screen.findByLabelText('Resumo do mês');
    expect(totals).toHaveTextContent('Entradas+ R$ 5.000,00');
    expect(totals).toHaveTextContent('Saídas− R$ 509,90');
    expect(totals).toHaveTextContent('Saldo previstoR$ 4.490,10');
  });

  it('finds a transaction by status or by what is typed; the status stays in the address', async () => {
    mockTransactions();
    // As the dashboard's overdue notice opens it.
    const { router } = renderApp(
      `/espacos/${houseId}/lancamentos?competencia=2026-10&situacao=vencidos`,
    );

    const debits = await section('Saídas');
    expect(screen.getByRole('radio', { name: 'Vencidos' })).toBeChecked();
    expect(row(debits, 'Conta de luz')).toBeInTheDocument();
    expect(within(debits).queryByText('Compras da semana')).not.toBeInTheDocument();
    // How many are shown, and the total of those.
    expect(debits).toHaveTextContent('1 de 2');
    expect(debits).toHaveTextContent('Total: − R$ 159,90');
    expect(await section('Entradas')).toHaveTextContent('Nenhuma entrada com esse filtro.');

    await userEvent.click(screen.getByRole('radio', { name: 'Todos' }));
    expect(router.state.location.search).toBe('?competencia=2026-10');
    // By the category, without accents mattering.
    await userEvent.type(screen.getByLabelText('Buscar lançamento'), 'MERCADO');
    expect(row(debits, 'Compras da semana')).toBeInTheDocument();
    expect(within(debits).queryByText('Conta de luz')).not.toBeInTheDocument();

    // Another month keeps the status filter.
    await userEvent.clear(screen.getByLabelText('Buscar lançamento'));
    await userEvent.click(screen.getByRole('radio', { name: 'Pendentes' }));
    await userEvent.click(screen.getByRole('link', { name: 'Próximo mês: novembro de 2026' }));
    expect(router.state.location.search).toBe('?competencia=2026-11&situacao=pendentes');
  });

  it('says "Pago" or "Recebido", with the year only when it is not the competência\'s', async () => {
    const paid = { ...light, settledAt: '2026-10-08' };
    const lateDecember = transaction(6, {
      type: 'DEBIT',
      description: 'Presentes de Natal',
      categoryId: marketCategory.id,
      amountCents: 40_000,
      period: '2026-12',
      settledAt: '2027-01-04',
    });
    mockTransactions({ [`GET ${base}`]: { body: [salary, paid, lateDecember] } });

    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Saídas');
    expect(row(debits, 'Conta de luz')).toHaveTextContent('Pago em 08/10');
    expect(row(debits, 'Presentes de Natal')).toHaveTextContent('Pago em 04/01/2027');
    expect(row(await section('Entradas'), 'Salário de outubro')).toHaveTextContent(
      'Recebido em 05/10',
    );
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
      'Mês de novembro de 2026 em Casa.',
    );
  });

  it('repeats it every month: creates a recurrence starting in this competência', async () => {
    const recurrenceId = '01920000-0000-7000-8000-000000000301';
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
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
          dueMonthOffset: 0,
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
    // Who it is paid to, copied to every month (ADR 0052).
    await pickPerson(form, 'A pagar para (opcional)', 'Ana');
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
        dueMonthOffset: 0,
        startPeriod: '2026-10',
        variableAmount: false,
        personId: ana.id,
      }),
    });
    expect(
      await screen.findByText('Lançamento adicionado, repetindo todo mês'),
    ).toBeInTheDocument();
  });

  it('repeats a transaction every year, in the month it is launched (ADR 0038 note)', async () => {
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/recurrences`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000307',
          type: 'DEBIT',
          description: 'IPVA',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 120_000,
          variableAmount: false,
          dueDay: 20,
          dueMonthOffset: 0,
          intervalMonths: 12,
          startPeriod: '2026-10',
          endPeriod: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'IPVA');
    await chooseCategory(form, 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '1.200,00');
    await userEvent.type(within(form).getByLabelText('Vencimento (opcional)'), '2026-10-20');
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo ano' }));
    expect(
      within(form).getByText(/Um lançamento pendente todo ano em outubro, a partir deste/),
    ).toBeInTheDocument();
    expect(within(form).getByText('Cada ano vence no dia 20.')).toBeInTheDocument();
    expect(
      within(form).getByText('O mesmo valor todo ano, como uma anuidade.'),
    ).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'IPVA',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 120_000,
        dueDay: 20,
        dueMonthOffset: 0,
        startPeriod: '2026-10',
        intervalMonths: 12,
        variableAmount: false,
        personId: null,
      }),
    });
    expect(
      await screen.findByText('Lançamento adicionado, repetindo todo ano'),
    ).toBeInTheDocument();
  });

  it('makes a transaction recurrent every year, from its menu', async () => {
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/recurrences/from-transaction`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000308',
          type: 'DEBIT',
          description: 'Conta de luz',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 15_990,
          variableAmount: false,
          dueDay: 10,
          dueMonthOffset: 0,
          intervalMonths: 12,
          startPeriod: '2026-10',
          endPeriod: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const menu = await openActions('Conta de luz');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Tornar recorrente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tornar Conta de luz recorrente' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Todo ano' }));
    expect(dialog).toHaveTextContent(
      'Todo ano em outubro, a partir de outubro de 2026, vencendo no dia 10. Este lançamento vira o primeiro ano',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tornar recorrente' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences/from-transaction`, {
      method: 'POST',
      body: JSON.stringify({ transactionId: light.id, variableAmount: false, intervalMonths: 12 }),
    });
    expect(await screen.findByText('Agora se repete todo ano')).toBeInTheDocument();
  });

  it('repeats a bill due in the next month, and refuses a due date further away', async () => {
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/recurrences`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000306',
          type: 'DEBIT',
          description: 'Conta de luz',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 15_990,
          variableAmount: false,
          dueDay: 10,
          dueMonthOffset: 1,
          startPeriod: '2026-10',
          endPeriod: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await chooseCategory(form, 'Energia');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '159,90');
    const dueDate = within(form).getByLabelText('Vencimento (opcional)');
    await userEvent.type(dueDate, '2026-12-10');
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo mês' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(
      await within(form).findByText(
        'Numa recorrência ou num parcelamento, o vencimento fica no mês do lançamento ou no seguinte.',
      ),
    ).toBeInTheDocument();

    await userEvent.clear(dueDate);
    await userEvent.type(dueDate, '2026-11-10');
    expect(within(form).getByText('Cada mês vence no dia 10 do mês seguinte.')).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Conta de luz',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 15_990,
        dueDay: 10,
        dueMonthOffset: 1,
        startPeriod: '2026-10',
        variableAmount: false,
        personId: null,
      }),
    });
  });

  it('makes a transaction launched once recurrent, from its menu', async () => {
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/recurrences/from-transaction`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000305',
          type: 'DEBIT',
          description: 'Conta de luz',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 15_990,
          variableAmount: true,
          dueDay: 10,
          dueMonthOffset: 0,
          startPeriod: '2026-10',
          endPeriod: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const menu = await openActions('Conta de luz');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Tornar recorrente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tornar Conta de luz recorrente' });
    expect(dialog).toHaveTextContent(
      'Todo mês a partir de outubro de 2026, vencendo no dia 10. Este lançamento vira o primeiro mês',
    );
    expect(within(dialog).getByRole('radio', { name: 'Fixo' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Variável' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tornar recorrente' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences/from-transaction`, {
      method: 'POST',
      body: JSON.stringify({ transactionId: light.id, variableAmount: true }),
    });
    expect(await screen.findByText('Agora se repete todo mês')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers "Tornar recorrente" only for a transaction launched once, not split', async () => {
    const jantar = transaction(4, {
      type: 'DEBIT',
      description: 'Jantar',
      categoryId: marketCategory.id,
      amountCents: 12_000,
    });
    const share = transaction(5, {
      type: 'CREDIT',
      description: 'Ana: parte de Jantar',
      categoryId: salaryCategory.id,
      amountCents: 6_000,
      splitOfId: jantar.id,
    });
    mockTransactions({
      [`GET ${base}`]: {
        body: [
          share,
          { ...light, recurrenceId: '01920000-0000-7000-8000-000000000301' },
          {
            ...shopping,
            installment: { planId: '01920000-0000-7000-8000-000000000401', number: 2, count: 3 },
          },
          jantar,
        ],
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    for (const description of [
      'Conta de luz',
      'Compras da semana',
      'Jantar',
      'Ana: parte de Jantar',
    ]) {
      const menu = await openActions(description);
      expect(
        within(menu).queryByRole('menuitem', { name: 'Tornar recorrente' }),
      ).not.toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
    }
  });

  it('marks a transaction of a yearly recurrence as "Todo ano"', async () => {
    const recurrenceId = '01920000-0000-7000-8000-000000000309';
    mockTransactions({
      [`GET ${base}`]: {
        body: [salary, { ...light, recurrenceId, recurrenceIntervalMonths: 12 }, shopping],
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Saídas');
    expect(row(debits, 'Conta de luz')).toHaveTextContent('Todo ano');
    expect(row(debits, 'Conta de luz')).not.toHaveTextContent('Todo mês');
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

    const debits = await section('Saídas');
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
          dueMonthOffset: 0,
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
        dueMonthOffset: 0,
        startPeriod: '2026-10',
        variableAmount: true,
        personId: null,
      }),
    });
  });

  it('splits a variable monthly bill in percentages, which follow each month', async () => {
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`POST /api/workspaces/${houseId}/recurrences`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000303',
          type: 'DEBIT',
          description: 'Conta de luz',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 18_000,
          variableAmount: true,
          dueDay: null,
          dueMonthOffset: 0,
          startPeriod: '2026-10',
          endPeriod: null,
          split: [{ personId: ana.id, amountCents: null, basisPoints: 5_000 }],
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de luz');
    await chooseCategory(form, 'Energia');
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo mês' }));
    await userEvent.click(within(form).getByRole('radio', { name: 'Variável' }));
    await userEvent.type(within(form).getByLabelText('Valor estimado (R$)'), '180');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    await pickPeople(form, ['Ana']);
    // Reais would not follow the amount: only percentages, half each to start.
    expect(within(form).queryByRole('radiogroup', { name: 'Partes' })).not.toBeInTheDocument();
    expect(
      within(form).getByText('Partes em %, porque o valor varia todo mês.'),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText('Parte de Ana (%)')).toHaveValue('50,00');
    expect(nbsp(within(form).getByText(/^Sua parte/).textContent)).toBe(
      'Sua parte: R$ 90,00 do valor estimado. Cada pessoa vira um valor a receber em cada mês, na categoria Reembolso. As partes acompanham o valor real de cada mês.',
    );
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
        dueMonthOffset: 0,
        startPeriod: '2026-10',
        variableAmount: true,
        personId: null,
        split: [{ personId: ana.id, basisPoints: 5_000 }],
      }),
    });
    expect(
      await screen.findByText('Lançamento adicionado, repetindo todo mês, dividido com 1 pessoa'),
    ).toBeInTheDocument();
  });

  it('splits a fixed monthly one in reais, with a new person', async () => {
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`POST /api/workspaces/${houseId}/recurrences`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000304',
          type: 'DEBIT',
          description: 'Internet',
          notes: null,
          categoryId: energyCategory.id,
          amountCents: 12_000,
          variableAmount: false,
          dueDay: null,
          dueMonthOffset: 0,
          startPeriod: '2026-10',
          endPeriod: null,
          split: [],
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Internet');
    await chooseCategory(form, 'Energia');
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo mês' }));
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '120');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    await pickPeople(form, ['Ana'], ['Bruno']);
    expect(within(form).getByRole('radio', { name: 'Em reais' })).toBeChecked();
    expect(nbsp(within(form).getByText(/^Sua parte/).textContent)).toBe(
      'Sua parte: R$ 40,00 por mês. Cada pessoa vira um valor a receber em cada mês, na categoria Reembolso.',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Internet',
        notes: null,
        categoryId: energyCategory.id,
        amountCents: 12_000,
        dueDay: null,
        dueMonthOffset: 0,
        startPeriod: '2026-10',
        variableAmount: false,
        personId: null,
        split: [
          { personId: ana.id, amountCents: 4_000 },
          { newPersonName: 'Bruno', amountCents: 4_000 },
        ],
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

    const debits = await section('Saídas');
    expect(row(debits, 'Conta de luz')).toHaveTextContent('Estimado');
    expect(row(debits, 'Compras da semana')).not.toHaveTextContent('Estimado');

    await userEvent.click(screen.getByRole('button', { name: 'Pagar: Conta de luz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar como pago: Conta de luz' });
    const amount = within(dialog).getByLabelText('Valor da fatura (R$)');
    expect(amount).toHaveValue('159,90');
    await userEvent.clear(amount);
    await userEvent.type(amount, '172,50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Marcar como pago' }));

    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ amountCents: 17_250, settledAt: '2026-10-15' }),
    });
    expect(await screen.findByText('Marcado como pago')).toBeInTheDocument();
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
          dueMonthOffset: 0,
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
        dueMonthOffset: 0,
        personId: null,
      }),
    });
    expect(await screen.findByText('Parcelamento adicionado: 3 parcelas')).toBeInTheDocument();
  });

  it('splits an installment plan too, showing each share per installment', async () => {
    const planId = '01920000-0000-7000-8000-000000000402';
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`POST /api/workspaces/${houseId}/installments`]: {
        status: 201,
        body: {
          id: planId,
          type: 'DEBIT',
          description: 'TV',
          notes: null,
          categoryId: marketCategory.id,
          totalCents: 100_000,
          installments: 3,
          firstPeriod: '2026-10',
          dueDay: null,
          dueMonthOffset: 0,
          endedAt: null,
          settledCount: 0,
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'TV');
    await chooseCategory(form, 'Mercado');
    await userEvent.click(within(form).getByRole('radio', { name: 'Parcelado' }));
    await userEvent.type(within(form).getByLabelText('Valor total (R$)'), '1.000');
    await userEvent.type(within(form).getByLabelText('Parcelas'), '3');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    // Half of the total each: Ana's R$ 500,00 in 3, the leftover cent on the last.
    await pickPeople(form, ['Ana']);
    expect(nbsp(within(form).getByText(/^Sua parte/).textContent)).toBe(
      'Sua parte: R$ 500,00 do total. Por parcela: Ana R$ 166,66, a última com os centavos que sobram. Cada pessoa vira um valor a receber em cada parcela, na categoria Reembolso.',
    );
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/installments`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'TV',
        notes: null,
        categoryId: marketCategory.id,
        installments: 3,
        amountCents: 100_000,
        amountIs: 'TOTAL',
        firstPeriod: '2026-10',
        dueDay: null,
        dueMonthOffset: 0,
        personId: null,
        split: [{ personId: ana.id, amountCents: 50_000 }],
      }),
    });
    expect(
      await screen.findByText('Parcelamento adicionado: 3 parcelas, dividido com 1 pessoa'),
    ).toBeInTheDocument();
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

    const debits = await section('Saídas');
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
        occurredOn: '2026-10-15',
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

    expect(within(form).getByRole('radio', { name: 'Saída' })).toBeChecked();
    expect(await options()).toEqual(['Energia', 'Mercado']);
    await userEvent.click(within(form).getByRole('radio', { name: 'Entrada' }));
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

  it('shows an "Aporte em …" pending, then paid as the API returns it after settling', async () => {
    const investmentsCategory = {
      id: '01920000-0000-7000-8000-000000000104',
      name: 'Investimentos',
      type: 'DEBIT',
      archived: false,
    };
    const pending = transaction(9, {
      type: 'DEBIT',
      description: 'Aporte em Investimentos',
      categoryId: investmentsCategory.id,
      amountCents: 60_743,
    });
    const paid = { ...pending, settledAt: '2026-10-15' };
    // The list is what the API answers: pending until the PATCH reaches it, paid after. The badge
    // must come from that new answer, not from the click.
    let settled = false;
    const fetchMock = mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { body: house },
      [`GET /api/workspaces/${houseId}/people`]: { body: [] },
      [`GET /api/workspaces/${houseId}/merchants`]: { body: [] },
      [`GET /api/workspaces/${houseId}/categories`]: { body: [investmentsCategory] },
      get [`GET ${base}`]() {
        return { body: [settled ? paid : pending] };
      },
      get [`PATCH ${base}/${pending.id}`]() {
        settled = true;
        return { body: paid };
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Saídas');
    const item = () =>
      within(debits)
        .getAllByRole('listitem')
        .find((li) => li.textContent?.startsWith('Aporte em Investimentos'))!;
    await within(debits).findByText('Aporte em Investimentos');
    expect(
      within(item()).getByRole('button', { name: 'Pagar: Aporte em Investimentos' }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(debits).getByRole('button', { name: 'Pagar: Aporte em Investimentos' }),
    );
    // Today's date, the one the app sends (it can be changed later by editing).
    await expectCall(fetchMock, `${base}/${pending.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: '2026-10-15' }),
    });
    await vi.waitFor(() => expect(item()).toHaveTextContent('Pago em 15/10'));
    expect(item()).not.toHaveTextContent('Pendente');
    expect(
      within(debits).queryByRole('button', { name: /^Marcar como pago/ }),
    ).not.toBeInTheDocument();
    // The list was asked again: the badge is the API's answer.
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) => new URL(url).pathname === base && (init?.method ?? 'GET') === 'GET',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('settles in one tap with today’s date, and undoes it from the menu', async () => {
    const fetchMock = mockTransactions({
      [`PATCH ${base}/${light.id}`]: { body: { ...light, settledAt: '2026-10-15' } },
      [`PATCH ${base}/${salary.id}`]: { body: { ...salary, settledAt: null } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    // The row says it short; the menu says it in full (ADR 0036 note).
    const settle = await screen.findByRole('button', { name: 'Pagar: Conta de luz' });
    expect(settle).toHaveTextContent('Pagar');
    const pendingMenu = await openActions('Compras da semana');
    expect(
      within(pendingMenu).getByRole('menuitem', { name: 'Marcar como pago' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(settle);
    await expectCall(fetchMock, `${base}/${light.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: '2026-10-15' }),
    });
    expect(await screen.findByText('Marcado como pago')).toBeInTheDocument();

    const menu = await openActions('Salário de outubro');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Desmarcar recebimento' }));
    await expectCall(fetchMock, `${base}/${salary.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ settledAt: null }),
    });
    expect(await screen.findByText('Recebimento desmarcado')).toBeInTheDocument();
  });

  it('tells when a change fails', async () => {
    mockTransactions({ [`PATCH ${base}/${light.id}`]: { status: 500, body: {} } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Pagar: Conta de luz' }));

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
        occurredOn: null,
        personId: null,
        merchantId: null,
        paymentMethod: null,
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
    // Ana from the list and Bruno, new, at once; the shares start equal, you included.
    await pickPeople(form, ['Ana'], ['Bruno']);
    expect(within(form).getByLabelText('Parte de Ana (R$)')).toHaveValue('100,00');
    expect(within(form).getByLabelText('Parte de Bruno (R$)')).toHaveValue('100,00');

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
        occurredOn: '2026-10-15',
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

  it('picks a person like a category: members apart, never you, and a new name added', async () => {
    const joao = {
      ...ana,
      id: '01920000-0000-7000-8000-000000000302',
      name: 'João Exemplo',
      memberUserId: '01920000-0000-7000-8000-000000000099',
      isMember: true,
    };
    const me = {
      ...ana,
      id: '01920000-0000-7000-8000-000000000303',
      name: verifiedUser.name,
      memberUserId: verifiedUser.id,
      isMember: true,
    };
    mockTransactions({ [`GET ${peopleBase}`]: { body: [ana, joao, me] } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    const field = within(form).getByRole('combobox', { name: 'A pagar para (opcional)' });
    expect(field).toHaveTextContent('Ninguém');
    await userEvent.click(field);

    expect(screen.getByRole('group', { name: 'Membros' })).toHaveTextContent('João Exemplo');
    expect(screen.getByRole('group', { name: 'Pessoas' })).toHaveTextContent('Ana');
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'João Exemplo',
      'Ana',
    ]);
    // The search ignores accents; a name that is listed is not offered to be added again.
    const search = screen.getByPlaceholderText('Buscar ou adicionar pessoa');
    await userEvent.type(search, 'joao exemplo');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'João Exemplo',
    ]);
    await userEvent.clear(search);
    await userEvent.type(search, 'Bia');
    await userEvent.click(screen.getByRole('option', { name: 'Adicionar “Bia”' }));
    expect(field).toHaveTextContent('Bia');

    // An optional field can be emptied again.
    await userEvent.click(field);
    await userEvent.click(await screen.findByRole('option', { name: 'Ninguém' }));
    expect(field).toHaveTextContent('Ninguém');
  });

  it('splits a credit too: each share becomes a value to pay, in Repasse', async () => {
    const fetchMock = mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`POST ${base}`]: { status: 201, body: salary },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.click(within(form).getByRole('radio', { name: 'Entrada' }));
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Aluguel recebido');
    await chooseCategory(form, 'Salário');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '1.000,00');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    await pickPeople(form, ['Ana']);
    // Half each, you and Ana.
    expect(within(form).getByLabelText('Parte de Ana (R$)')).toHaveValue('500,00');

    expect(
      within(form).getByText(/Cada pessoa vira um valor a pagar, na categoria Repasse/),
    ).toBeInTheDocument();
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CREDIT',
        description: 'Aluguel recebido',
        notes: null,
        categoryId: salaryCategory.id,
        amountCents: 100_000,
        dueDate: null,
        occurredOn: '2026-10-15',
        period: '2026-10',
        split: [{ personId: ana.id, amountCents: 50_000 }],
      }),
    });
  });

  it('checks the shares before calling the API', async () => {
    const fetchMock = mockTransactions({ [`GET ${peopleBase}`]: { body: [ana] } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Jantar');
    await chooseCategory(form, 'Mercado');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '100,00');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    // Nobody picked yet.
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));
    expect(await within(form).findByText('Escolha com quem dividir.')).toBeInTheDocument();

    await pickPeople(form, ['Ana']);
    await userEvent.click(within(form).getByRole('radio', { name: 'Em %' }));
    const share = within(form).getByLabelText('Parte de Ana (%)');
    await userEvent.clear(share);
    await userEvent.type(share, '120');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    expect(await within(form).findByText('De 0 a 100%.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(base, 'http://api.test'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps the shares equal until one is typed, and takes someone out', async () => {
    mockTransactions({ [`GET ${peopleBase}`]: { body: [ana] } });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '90,00');
    await userEvent.click(within(form).getByRole('checkbox', { name: 'Dividir com alguém' }));
    await pickPeople(form, ['Ana'], ['Bia']);
    expect(within(form).getByLabelText('Parte de Ana (R$)')).toHaveValue('30,00');

    // The amount changes: still equal.
    const amount = within(form).getByLabelText('Valor (R$)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '120,00');
    expect(within(form).getByLabelText('Parte de Ana (R$)')).toHaveValue('40,00');

    // A share typed by hand stays, and taking Bia out keeps it.
    const anaShare = within(form).getByLabelText('Parte de Ana (R$)');
    await userEvent.clear(anaShare);
    await userEvent.type(anaShare, '10,00');
    await userEvent.click(within(form).getByRole('button', { name: 'Tirar Bia da divisão' }));
    expect(within(form).queryByLabelText('Parte de Bia (R$)')).not.toBeInTheDocument();
    expect(within(form).getByLabelText('Parte de Ana (R$)')).toHaveValue('10,00');
    expect(within(form).getByRole('combobox', { name: 'Com quem?' })).toHaveTextContent('1 pessoa');

    // Back to equal shares on request.
    await userEvent.click(within(form).getByRole('button', { name: 'Dividir igualmente' }));
    expect(within(form).getByLabelText('Parte de Ana (R$)')).toHaveValue('60,00');
  });

  it('links a credit to a new person, created on save', async () => {
    const carlos = { ...ana, id: '01920000-0000-7000-8000-000000000302', name: 'Carlos' };
    const fetchMock = mockTransactions({
      [`POST ${peopleBase}`]: { status: 201, body: carlos },
      [`POST ${base}`]: { status: 201, body: salary },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.click(within(form).getByRole('radio', { name: 'Entrada' }));
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Empréstimo ao Carlos');
    await chooseCategory(form, 'Salário');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '200,00');
    await pickPerson(form, 'A receber de (opcional)', 'Carlos', { add: true });
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

    expect(await section('Entradas')).toHaveTextContent('A receber de Ana');
    expect(await section('Saídas')).toHaveTextContent('Dividido com Ana');
    const menu = await openActions('Jantar');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir Jantar?' });
    expect(confirm).toHaveTextContent('Ele foi dividido com Ana');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir com as partes' }));

    await expectCall(fetchMock, `${base}/${dinner.id}?withShares=true`, { method: 'DELETE' });
    expect(await screen.findByText('Lançamento e partes excluídos')).toBeInTheDocument();
  });

  it('keeps notes, the person and the split in "Mais opções", open when they are in use', async () => {
    const share = transaction(5, {
      type: 'CREDIT',
      description: 'Ana: parte de Jantar',
      categoryId: salaryCategory.id,
      amountCents: 15_000,
      personId: ana.id,
    });
    mockTransactions({
      [`GET ${peopleBase}`]: { body: [ana] },
      [`GET ${base}`]: { body: [share, light] },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    // A new one: the common path, with the rest folded and named.
    await userEvent.click(await screen.findByRole('button', { name: 'Novo lançamento' }));
    let form = await screen.findByRole('dialog', { name: 'Novo lançamento' });
    const more = () => within(form).getByText(/^Mais opções/);
    expect(more()).toHaveTextContent('Mais opções (observações, estabelecimento, pessoa, dividir)');
    expect(more().closest('details')).not.toHaveAttribute('open');
    await userEvent.click(within(form).getByRole('button', { name: 'Cancelar' }));

    // Editing one linked to a person: open, so nothing seems lost.
    const menu = await openActions('Ana: parte de Jantar');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    form = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    expect(more().closest('details')).toHaveAttribute('open');
    expect(
      within(form).getByRole('combobox', { name: 'A receber de (opcional)' }),
    ).toHaveTextContent('Ana');
  });

  it('fills an empty payment method from the history, never one the person picked (ADR 0054)', async () => {
    mockTransactions({
      [`GET /api/workspaces/${houseId}/categories/hints`]: {
        body: {
          merchants: [],
          descriptions: [],
          paymentMethods: {
            merchants: [],
            descriptions: [
              { description: 'conta de luz', type: 'DEBIT', paymentMethod: 'AUTO_DEBIT' },
            ],
          },
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.click(within(form).getByText(/^Mais opções/));
    const method = () =>
      within(form).getByRole('combobox', { name: 'Meio de pagamento (opcional)' });
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de Luz');
    expect(method()).toHaveTextContent('Débito automático');
    expect(within(form).getByText('Sugerido pelo histórico.')).toBeInTheDocument();

    // Picked by hand: it stays, and the note goes.
    await userEvent.click(method());
    await userEvent.click(await screen.findByRole('option', { name: 'Pix' }));
    expect(method()).toHaveTextContent('Pix');
    expect(within(form).queryByText('Sugerido pelo histórico.')).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Descrição'), ' ');
    expect(method()).toHaveTextContent('Pix');
  });

  it('fills an empty category from the history, never one the person picked (ADR 0053)', async () => {
    mockTransactions({
      [`GET /api/workspaces/${houseId}/categories/hints`]: {
        body: {
          merchants: [],
          descriptions: [
            { description: 'conta de luz', type: 'DEBIT', categoryId: energyCategory.id },
          ],
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    const category = () => within(form).getByRole('combobox', { name: 'Categoria' });
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Conta de Luz');
    expect(category()).toHaveTextContent('Energia');
    expect(within(form).getByText('Sugerida pelo histórico.')).toBeInTheDocument();
    // An entrada: the history of saídas says nothing.
    await userEvent.click(within(form).getByRole('radio', { name: 'Entrada' }));
    expect(category()).toHaveTextContent('Escolha…');
    await userEvent.click(within(form).getByRole('radio', { name: 'Saída' }));
    expect(category()).toHaveTextContent('Energia');

    // Picked by hand: it stays, and the note goes.
    await chooseCategory(form, 'Mercado');
    await userEvent.type(within(form).getByLabelText('Descrição'), ' ');
    expect(category()).toHaveTextContent('Mercado');
    expect(within(form).queryByText('Sugerida pelo histórico.')).not.toBeInTheDocument();
  });

  it("suggests the merchant's category, even after the description's", async () => {
    const bomPreco = {
      id: '01920000-0000-7000-8000-000000000601',
      name: 'Mercado Bom Preço',
      archived: false,
      inUse: true,
    };
    mockTransactions({
      [`GET /api/workspaces/${houseId}/merchants`]: { body: [bomPreco] },
      [`GET /api/workspaces/${houseId}/categories/hints`]: {
        body: {
          merchants: [{ merchantId: bomPreco.id, type: 'DEBIT', categoryId: marketCategory.id }],
          descriptions: [{ description: 'compras', type: 'DEBIT', categoryId: energyCategory.id }],
        },
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Compras');
    expect(within(form).getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Energia');
    await userEvent.click(within(form).getByText(/^Mais opções/));
    await userEvent.click(
      within(form).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Mercado Bom Preço' }));

    expect(within(form).getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Mercado');
    expect(within(form).getByText('Sugerida pelo histórico.')).toBeInTheDocument();
  });

  it('adds a category from the form, creating it only on save', async () => {
    const farmacia = {
      id: '01920000-0000-7000-8000-000000000105',
      name: 'Farmácia',
      type: 'DEBIT',
      archived: false,
    };
    const fetchMock = mockTransactions({
      [`POST /api/workspaces/${houseId}/categories`]: { status: 201, body: farmacia },
      [`POST ${base}`]: { status: 201, body: { ...shopping, categoryId: farmacia.id } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Remédios');
    await userEvent.click(within(form).getByRole('combobox', { name: 'Categoria' }));
    const search = await screen.findByPlaceholderText('Buscar ou adicionar categoria');
    // A name already there, whatever the accents: nothing to add.
    await userEvent.type(search, 'mercádo');
    expect(screen.queryByRole('option', { name: /^Adicionar/ })).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'Farmácia');
    await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “Farmácia”' }));
    expect(within(form).getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Farmácia');
    // Nothing is created before the transaction is saved.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '42');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Farmácia', type: 'DEBIT' }),
    });
    await expectCall(fetchMock, base, {
      method: 'POST',
      body: expect.stringContaining(`"categoryId":"${farmacia.id}"`) as unknown,
    });
  });

  it('brings back an archived category of the name added, instead of creating another', async () => {
    const archived = {
      id: '01920000-0000-7000-8000-000000000106',
      name: 'Farmácia',
      type: 'DEBIT',
      archived: true,
    };
    const fetchMock = mockTransactions({
      [`GET /api/workspaces/${houseId}/categories`]: {
        body: [salaryCategory, energyCategory, marketCategory, archived],
      },
      [`PATCH /api/workspaces/${houseId}/categories/${archived.id}`]: {
        body: { ...archived, archived: false },
      },
      [`POST ${base}`]: { status: 201, body: { ...shopping, categoryId: archived.id } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Remédios');
    await userEvent.click(within(form).getByRole('combobox', { name: 'Categoria' }));
    await userEvent.type(
      await screen.findByPlaceholderText('Buscar ou adicionar categoria'),
      'farmacia',
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “farmacia”' }));
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '42');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/categories/${archived.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: false }),
    });
    await expectCall(fetchMock, base, {
      method: 'POST',
      body: expect.stringContaining(`"categoryId":"${archived.id}"`) as unknown,
    });
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).endsWith('/categories') && init?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('names a new merchant on a new transaction, creating it first', async () => {
    const mercado = {
      id: '01920000-0000-7000-8000-000000000601',
      name: 'Mercado A',
      archived: false,
      inUse: false,
    };
    const fetchMock = mockTransactions({
      [`GET /api/workspaces/${houseId}/merchants`]: {
        body: [{ ...mercado, id: '01920000-0000-7000-8000-000000000602', name: 'Padaria' }],
      },
      [`POST /api/workspaces/${houseId}/merchants`]: { status: 201, body: mercado },
      [`POST ${base}`]: { status: 201, body: { ...shopping, merchantId: mercado.id } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Compras');
    await chooseCategory(form, 'Mercado');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '50');
    await userEvent.click(within(form).getByText(/^Mais opções/));
    await userEvent.click(
      within(form).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
    );
    await userEvent.type(
      await screen.findByPlaceholderText('Buscar ou adicionar estabelecimento'),
      'Mercado A',
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “Mercado A”' }));
    expect(
      within(form).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
    ).toHaveTextContent('Mercado A');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, `/api/workspaces/${houseId}/merchants`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Mercado A' }),
    });
    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Compras',
        notes: null,
        categoryId: marketCategory.id,
        amountCents: 5_000,
        dueDate: null,
        occurredOn: '2026-10-15',
        period: '2026-10',
        personId: null,
        merchantId: mercado.id,
      }),
    });
  });

  it('shows the merchant on the row, finds it by the search, and keeps it archived on edit', async () => {
    const padaria = {
      id: '01920000-0000-7000-8000-000000000603',
      name: 'Padaria Pão Quente',
      archived: true,
      inUse: true,
    };
    const fetchMock = mockTransactions({
      [`GET /api/workspaces/${houseId}/merchants`]: { body: [padaria] },
      [`GET ${base}`]: { body: [salary, light, { ...shopping, merchantId: padaria.id }] },
      [`PATCH ${base}/${shopping.id}`]: { body: { ...shopping, merchantId: padaria.id } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    expect(row(await section('Saídas'), 'Compras da semana')).toHaveTextContent(
      'Padaria Pão Quente',
    );
    await userEvent.type(screen.getByLabelText('Buscar lançamento'), 'pao quente');
    const found = await section('Saídas');
    expect(within(found).queryByText('Conta de luz')).not.toBeInTheDocument();
    expect(within(found).getByText('Compras da semana')).toBeInTheDocument();

    const menu = await openActions('Compras da semana');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    const form = await screen.findByRole('dialog', { name: 'Editar lançamento' });
    expect(
      within(form).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
    ).toHaveTextContent('Padaria Pão Quente');
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }));

    // Kept as it is: no reactivation of the archived merchant.
    await expectCall(fetchMock, `${base}/${shopping.id}`, {
      method: 'PATCH',
      body: expect.stringContaining(`"merchantId":"${padaria.id}"`) as unknown,
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/merchants/'))).toBe(false);
  });

  it('is read-only for a VIEWER', async () => {
    mockTransactions({
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } },
    });

    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Saídas');
    expect(debits).toHaveTextContent('Conta de luz');
    // No "○ Pagar" to say it: pending is written out.
    expect(row(debits, 'Compras da semana')).toHaveTextContent('Pendente');
    // Only the competência picker, which navigates; nothing that edits.
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([expect.stringMatching(/^Escolher mês/)]);
  });

  it('is reached from the sections of the workspace', async () => {
    mockTransactions({ [`GET /api/workspaces/${houseId}/members`]: { body: [] } });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'Lançamentos' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/lancamentos`);
    expect(await screen.findByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument();
  });
  it('records how it was paid, shows it on the row and finds it by it (ADR 0054)', async () => {
    const fetchMock = mockTransactions({
      [`GET ${base}`]: { body: [salary, light, { ...shopping, paymentMethod: 'PIX' }] },
      [`POST ${base}`]: { status: 201, body: { ...shopping, paymentMethod: 'CREDIT_CARD' } },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    const debits = await section('Saídas');
    expect(row(debits, 'Compras da semana')).toHaveTextContent('Pix');
    await userEvent.type(screen.getByLabelText('Buscar lançamento'), 'pix');
    expect(within(debits).queryByText('Conta de luz')).not.toBeInTheDocument();
    expect(row(debits, 'Compras da semana')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Buscar lançamento'));

    const form = await openNewTransaction();
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Padaria');
    await chooseCategory(form, 'Mercado');
    await userEvent.type(within(form).getByLabelText('Valor (R$)'), '25,00');
    await userEvent.click(within(form).getByText(/^Mais opções/));
    await userEvent.click(
      within(form).getByRole('combobox', { name: 'Meio de pagamento (opcional)' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Crédito' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        type: 'DEBIT',
        description: 'Padaria',
        notes: null,
        categoryId: marketCategory.id,
        amountCents: 2_500,
        dueDate: null,
        occurredOn: '2026-10-15',
        period: '2026-10',
        personId: null,
        paymentMethod: 'CREDIT_CARD',
      }),
    });
  });

  it('shows the day it happened, and starts a new one of this month on today (ADR 0055)', async () => {
    mockTransactions({
      [`GET ${base}`]: {
        body: [
          { ...salary, occurredOn: '2026-10-05' },
          light,
          { ...shopping, occurredOn: '2025-12-28' },
        ],
      },
    });
    renderApp(`/espacos/${houseId}/lancamentos`);

    // Of another year, the day keeps its year.
    expect(row(await section('Saídas'), 'Compras da semana')).toHaveTextContent(
      'Compra em 28/12/2025',
    );
    expect(row(await section('Entradas'), 'Salário de outubro')).toHaveTextContent('Em 05/10');
    const form = await openNewTransaction();
    expect(within(form).getByLabelText('Data da compra (opcional)')).toHaveValue('2026-10-15');
    await userEvent.click(within(form).getByRole('radio', { name: 'Entrada' }));
    expect(within(form).getByLabelText('Data (opcional)')).toHaveValue('2026-10-15');
    // Each generated month comes without a day.
    await userEvent.click(within(form).getByRole('radio', { name: 'Todo mês' }));
    expect(within(form).queryByLabelText('Data (opcional)')).not.toBeInTheDocument();
  });

  it('starts a new one of another month without a day (ADR 0055)', async () => {
    mockTransactions();
    renderApp(`/espacos/${houseId}/lancamentos?competencia=2026-11`);

    const form = await openNewTransaction();
    expect(within(form).getByLabelText('Data da compra (opcional)')).toHaveValue('');
  });

  describe('as a table (from xl)', () => {
    /** The descriptions of a section's table rows, top to bottom. */
    const tableRows = (container: HTMLElement) =>
      within(within(container).getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((tableRow) => within(tableRow).getAllByRole('cell')[2]?.textContent);

    it('offers "Ver como" only where a table fits, and keeps the list on the phone', async () => {
      window.localStorage.setItem('financas:visao:lancamentos', 'TABLE');
      mockTransactions();
      renderApp(`/espacos/${houseId}/lancamentos`);

      const debits = await section('Saídas');
      expect(screen.queryByRole('radiogroup', { name: 'Ver como' })).not.toBeInTheDocument();
      expect(within(debits).queryByRole('table')).not.toBeInTheDocument();
      expect(row(debits, 'Conta de luz')).toBeInTheDocument();
    });

    it('shows each section as a table, sorted by the column clicked, and remembers it', async () => {
      stubPrefersDark(false, { wide: true });
      mockTransactions();
      renderApp(`/espacos/${houseId}/lancamentos`);

      await userEvent.click(await screen.findByRole('radio', { name: 'Tabela' }));

      const debits = await section('Saídas');
      // The status sits under the due date, with no column of its own (ADR 0036 note).
      expect(
        within(debits).queryByRole('columnheader', { name: 'Situação' }),
      ).not.toBeInTheDocument();
      expect(
        within(debits).getByRole('columnheader', { name: /^Onde . Meio/ }),
      ).toBeInTheDocument();
      // By due date at first, one without a date last.
      expect(tableRows(debits)).toEqual(['Conta de luz', 'Compras da semana']);
      const amount = within(debits).getByRole('columnheader', { name: /Valor/ });
      await userEvent.click(within(amount).getByRole('button', { name: /Valor/ }));
      await userEvent.click(within(amount).getByRole('button', { name: /Valor/ }));
      expect(amount).toHaveAttribute('aria-sort', 'descending');
      expect(tableRows(debits)).toEqual(['Compras da semana', 'Conta de luz']);
      expect(within(debits).getByRole('row', { name: /Conta de luz/ })).toHaveTextContent(
        /10\/10\/2026.*Vencido.*Conta de luz.*Energia.*R\$.159,90/,
      );
      expect(window.localStorage.getItem('financas:visao:lancamentos')).toBe('TABLE');
    });

    it('settles from a table row and keeps the menu', async () => {
      stubPrefersDark(false, { wide: true });
      window.localStorage.setItem('financas:visao:lancamentos', 'TABLE');
      const fetchMock = mockTransactions({
        [`PATCH ${base}/${light.id}`]: { body: { ...light, settledAt: '2026-10-15' } },
      });
      renderApp(`/espacos/${houseId}/lancamentos`);

      await userEvent.click(await screen.findByRole('button', { name: 'Pagar: Conta de luz' }));

      await expectCall(fetchMock, `${base}/${light.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ settledAt: '2026-10-15' }),
      });
      const menu = await openActions('Compras da semana');
      expect(within(menu).getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
    });
  });
});
