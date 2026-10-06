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
    [`GET /api/workspaces/${houseId}/categories`]: {
      body: [salaryCategory, energyCategory, marketCategory],
    },
    [`GET ${base}`]: { body: [salary, light, shopping] },
    ...overrides,
  });
}

const section = (name: 'Créditos' | 'Débitos') => screen.findByRole('region', { name });

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
      'Competência de novembro de 2026.',
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
