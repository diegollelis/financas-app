import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { stubPrefersDark } from '@/test/match-media';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}`;
const page = `/espacos/${houseId}/recorrencias`;

const category = (n: number, name: string, type: 'CREDIT' | 'DEBIT') => ({
  id: `01920000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  name,
  type,
  archived: false,
});
const moradia = category(1, 'Moradia', 'DEBIT');
const contas = category(2, 'Contas da casa', 'DEBIT');
const salario = category(3, 'Salário', 'CREDIT');

const recurrence = (n: number, fields: object) => ({
  id: `01920000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`,
  type: 'DEBIT',
  notes: null,
  categoryId: moradia.id,
  variableAmount: false,
  dueDay: null,
  startPeriod: '2026-01',
  endPeriod: null,
  ...fields,
});
const person = (n: number, name: string) => ({
  id: `01920000-0000-7000-8000-0000000004${String(n).padStart(2, '0')}`,
  name,
  memberUserId: null,
  isMember: false,
  archived: false,
  receivableCents: 0,
  payableCents: 0,
});
const ana = person(1, 'Ana');
const bruno = person(2, 'Bruno');
const merchant = (n: number, name: string, archived = false) => ({
  id: `01920000-0000-7000-8000-0000000005${String(n).padStart(2, '0')}`,
  name,
  archived,
  inUse: true,
  aliases: [],
});
const imobiliaria = merchant(1, 'Imobiliária Exemplo');
const lojaAntiga = merchant(2, 'Loja Antiga', true);

const aluguel = recurrence(1, {
  description: 'Aluguel',
  amountCents: 150_000,
  dueDay: 10,
  personId: ana.id,
  merchantId: imobiliaria.id,
});
const energia = recurrence(2, {
  description: 'Conta de luz',
  categoryId: contas.id,
  amountCents: 18_990,
  variableAmount: true,
});
const academia = recurrence(3, {
  description: 'Academia',
  amountCents: 9_990,
  endPeriod: '2026-05',
});

const plan = (n: number, fields: object) => ({
  id: `01920000-0000-7000-8000-0000000003${String(n).padStart(2, '0')}`,
  type: 'DEBIT',
  notes: null,
  categoryId: moradia.id,
  firstPeriod: '2026-09',
  dueDay: null,
  endedAt: null,
  settledCount: 0,
  ...fields,
});
const geladeira = plan(1, {
  description: 'Geladeira',
  personId: bruno.id,
  merchantId: lojaAntiga.id,
  totalCents: 100_000,
  installments: 3,
  settledCount: 1,
  // The two left, the leftover cents on the last.
  pendingCount: 2,
  pendingCents: 66_667,
  lastPendingPeriod: '2026-11',
});
const sofa = plan(2, {
  description: 'Sofá',
  totalCents: 120_000,
  installments: 10,
  settledCount: 10,
});

// Intl separates "R$" from the number with a non-breaking space.
const nbsp = (text: string | null | undefined) => text?.replace(/\u00a0/g, ' ');

function mockRecurrences(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET ${base}`]: { body: house },
    [`GET ${base}/categories`]: { body: [moradia, contas, salario] },
    [`GET ${base}/recurrences`]: { body: [aluguel, energia, academia] },
    [`GET ${base}/installments`]: { body: [geladeira, sofa] },
    [`GET ${base}/people`]: { body: [ana, bruno] },
    [`GET ${base}/merchants`]: { body: [imobiliaria, lojaAntiga] },
    ...overrides,
  });
}

const section = (name: string) => screen.findByRole('region', { name });

const rowsOf = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, init: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining(init),
    ),
  );
}

async function choose(name: string, action: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Ações de ${name}` }));
  const menu = await screen.findByRole('menu');
  await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
}

describe('RecurrencesPage', () => {
  it('shows a yearly one with its month and when it comes again (ADR 0038 note)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
    const ipva = recurrence(4, {
      description: 'IPVA',
      amountCents: 120_000,
      startPeriod: '2026-03',
      intervalMonths: 12,
    });
    mockRecurrences({ [`GET ${base}/recurrences`]: { body: [aluguel, ipva] } });
    renderApp(page);

    const recurring = await section('Recorrentes');
    // A yearly one falls in one month only: its own total, not in the monthly one.
    expect(nbsp(recurring.textContent)).toContain(
      'Por mês: R$ 1.500,00 em saídas. Por ano: R$ 1.200,00 em saídas.',
    );
    const [active] = within(recurring).getAllByRole('list');
    expect(rowsOf(active!)).toEqual([
      expect.stringMatching(/Aluguel.*Todo mês/),
      expect.stringMatching(/IPVA.*Todo ano em março.*Desde março de 2026.*Próximo: março de 2027/),
    ]);
    vi.useRealTimers();
  });

  it('lists active recurrences and running plans, with the past ones apart', async () => {
    mockRecurrences();
    renderApp(page);

    const monthly = await section('Recorrentes');
    // What the active ones add up to; the variable one is an estimate. Academia ended.
    expect(nbsp(monthly.textContent)).toContain(
      'Por mês: R$ 1.689,90 em saídas, dos quais R$ 189,90 estimados.',
    );
    const [active, ended] = within(monthly).getAllByRole('list');
    expect(rowsOf(active!)).toEqual([
      expect.stringMatching(
        /Aluguel.*Saída.*Moradia.*A pagar para Ana.*Vence dia 10.*Desde janeiro de 2026/,
      ),
      expect.stringMatching(/Conta de luz.*Varia todo mês.*Contas da casa/),
    ]);
    expect(within(monthly).getByRole('heading', { name: 'Encerradas' })).toBeInTheDocument();
    // From its first month to its last: the start is not lost once it ends.
    expect(rowsOf(ended!)).toEqual([expect.stringMatching(/Academia.*Janeiro a maio de 2026/)]);
    // History has nothing to act on.
    expect(screen.queryByRole('button', { name: 'Ações de Academia' })).not.toBeInTheDocument();

    const plans = await section('Parcelamentos');
    const [running, over] = within(plans).getAllByRole('list');
    expect(rowsOf(running!)).toEqual([
      // What is left, and the amount named as the total.
      expect.stringMatching(
        /Geladeira.*total em 3 parcelas.*A pagar para Bruno.*1 de 3 pagas.*Faltam 2 parcelas: R\$.666,67, até novembro de 2026/,
      ),
    ]);
    expect(rowsOf(over!)).toEqual([expect.stringMatching(/Sofá.*total em 10 de R\$.*Pago/)]);
    expect(screen.queryByRole('button', { name: 'Ações de Sofá' })).not.toBeInTheDocument();
  });

  it('shows a plan created at 3/10 as the bill does (ADR 0055)', async () => {
    const tv = plan(3, {
      description: 'TV',
      totalCents: 40_000,
      installments: 10,
      firstNumber: 3,
      settledCount: 1,
      pendingCount: 7,
      pendingCents: 35_000,
      lastPendingPeriod: '2027-04',
    });
    mockRecurrences({ [`GET ${base}/installments`]: { body: [tv] } });
    renderApp(page);

    const plans = await section('Parcelamentos');
    // 1/10 and 2/10 were charged before it, and one more is paid here.
    expect(nbsp(rowsOf(within(plans).getByRole('list'))[0])).toMatch(
      /TV.*total em 8 de R\$ 50,00.*3 de 10 pagas.*Da 3\/10 à 10\/10.*Faltam 7 parcelas/,
    );
  });

  it('shows who a recurrence is split with, and does not change the split when editing', async () => {
    const split = {
      ...energia,
      split: [
        { personId: ana.id, amountCents: null, basisPoints: 5_000 },
        { personId: bruno.id, amountCents: 3_000, basisPoints: null },
      ],
    };
    mockRecurrences({ [`GET ${base}/recurrences`]: { body: [aluguel, split] } });
    renderApp(page);

    const monthly = await section('Recorrentes');
    expect(nbsp(monthly.textContent)).toContain('Dividido com Ana (50%) e Bruno (R$ 30,00)');

    await choose('Conta de luz', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Conta de luz' });
    expect(
      within(dialog).queryByRole('combobox', { name: /A pagar para/ }),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText(/A divisão não muda aqui/)).toBeInTheDocument();
  });

  it('adds a category while editing a recurrence, creating it first', async () => {
    const lazer = {
      id: '01920000-0000-7000-8000-000000000109',
      name: 'Lazer',
      type: 'DEBIT',
      archived: false,
      recentUses: 0,
    };
    const fetchMock = mockRecurrences({
      [`POST ${base}/categories`]: { status: 201, body: lazer },
      [`PATCH ${base}/recurrences/${aluguel.id}`]: { body: { ...aluguel, categoryId: lazer.id } },
    });
    renderApp(page);

    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Categoria' }));
    await userEvent.type(
      await screen.findByPlaceholderText('Buscar ou adicionar categoria'),
      'Lazer',
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “Lazer”' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Lazer', type: 'DEBIT' }),
    });
    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ categoryId: lazer.id }),
    });
  });

  it('sends only what changed when editing a recurrence', async () => {
    const fetchMock = mockRecurrences({
      [`PATCH ${base}/recurrences/${aluguel.id}`]: {
        body: { ...aluguel, amountCents: 160_000, dueDay: 5 },
      },
    });
    renderApp(page);

    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    expect(dialog).toHaveTextContent('pendentes deste mês em diante');
    const amount = within(dialog).getByLabelText('Valor (R$)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '1.600,00');
    const day = within(dialog).getByLabelText('Dia do vencimento (opcional)');
    await userEvent.clear(day);
    await userEvent.type(day, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ amountCents: 160_000, dueDay: 5 }),
    });
    expect(await screen.findByText('Recorrência alterada')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a bill due in the next month, and moves it back to the same month', async () => {
    const nextMonth = { ...aluguel, dueMonthOffset: 1 };
    const fetchMock = mockRecurrences({
      [`GET ${base}/recurrences`]: { body: [nextMonth] },
      [`PATCH ${base}/recurrences/${aluguel.id}`]: { body: aluguel },
    });
    renderApp(page);

    const monthly = await section('Recorrentes');
    expect(monthly).toHaveTextContent('Vence dia 10 do mês seguinte');
    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    expect(within(dialog).getByRole('radio', { name: 'Mês seguinte' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Mesmo mês' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ dueMonthOffset: 0 }),
    });
  });

  it('changes how a recurrence is paid, sending only that (ADR 0054)', async () => {
    const fetchMock = mockRecurrences({
      [`PATCH ${base}/recurrences/${aluguel.id}`]: {
        body: { ...aluguel, paymentMethod: 'AUTO_DEBIT' },
      },
    });
    renderApp(page);

    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    await userEvent.click(
      within(dialog).getByRole('combobox', { name: 'Meio de pagamento (opcional)' }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Débito automático' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentMethod: 'AUTO_DEBIT' }),
    });
  });

  it('changes the person of a recurrence, a new name becoming a person first', async () => {
    const carla = person(3, 'Carla');
    const fetchMock = mockRecurrences({
      [`POST ${base}/people`]: { status: 201, body: carla },
      [`PATCH ${base}/recurrences/${aluguel.id}`]: { body: { ...aluguel, personId: carla.id } },
    });
    renderApp(page);

    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    const field = within(dialog).getByRole('combobox', { name: 'A pagar para (opcional)' });
    expect(field).toHaveTextContent('Ana');
    await userEvent.click(field);
    await userEvent.type(await screen.findByPlaceholderText('Buscar ou adicionar pessoa'), 'Carla');
    await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “Carla”' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/people`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Carla' }),
    });
    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ personId: carla.id }),
    });
  });

  it('changes the merchant of a recurrence, a new name becoming a merchant first (ADR 0053)', async () => {
    const corretora = merchant(3, 'Corretora Exemplo');
    const fetchMock = mockRecurrences({
      [`POST ${base}/merchants`]: { status: 201, body: corretora },
      [`PATCH ${base}/recurrences/${aluguel.id}`]: {
        body: { ...aluguel, merchantId: corretora.id },
      },
    });
    renderApp(page);

    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    const field = within(dialog).getByRole('combobox', { name: 'Estabelecimento (opcional)' });
    expect(field).toHaveTextContent('Imobiliária Exemplo');
    await userEvent.click(field);
    await userEvent.type(
      await screen.findByPlaceholderText('Buscar ou adicionar estabelecimento'),
      'Corretora Exemplo',
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Adicionar “Corretora Exemplo”' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/merchants`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Corretora Exemplo' }),
    });
    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ merchantId: corretora.id }),
    });
  });

  it('turns a fixed recurrence variable, and validates the day', async () => {
    const fetchMock = mockRecurrences({
      [`PATCH ${base}/recurrences/${aluguel.id}`]: { body: { ...aluguel, variableAmount: true } },
    });
    renderApp(page);

    await choose('Aluguel', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Aluguel' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Variável' }));
    expect(within(dialog).getByLabelText('Valor estimado (R$)')).toBeInTheDocument();
    const day = within(dialog).getByLabelText('Dia do vencimento (opcional)');
    await userEvent.clear(day);
    await userEvent.type(day, '32');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Use um dia entre 1 e 31.')).toBeInTheDocument();

    await userEvent.clear(day);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await expectCall(fetchMock, `${base}/recurrences/${aluguel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ dueDay: null, variableAmount: true }),
    });
  });

  it('closes without a request when nothing changed', async () => {
    const fetchMock = mockRecurrences();
    renderApp(page);

    await choose('Conta de luz', 'Editar');
    const dialog = await screen.findByRole('dialog', { name: 'Editar Conta de luz' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('ends a recurrence after confirming', async () => {
    const fetchMock = mockRecurrences({
      [`DELETE ${base}/recurrences/${energia.id}`]: { status: 204, body: null },
    });
    renderApp(page);

    await choose('Conta de luz', 'Encerrar recorrência');
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Encerrar a recorrência Conta de luz?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Encerrar recorrência' }));

    await expectCall(fetchMock, `${base}/recurrences/${energia.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Recorrência encerrada')).toBeInTheDocument();
  });

  it('says the transaction that existed before stays, when ending one made from it (ADR 0038 note)', async () => {
    mockRecurrences({
      [`GET ${base}/recurrences`]: {
        body: [{ ...energia, adoptedTransactionId: '01920000-0000-7000-8000-000000000501' }],
      },
    });
    renderApp(page);

    await choose('Conta de luz', 'Encerrar recorrência');
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Encerrar a recorrência Conta de luz?',
    });
    expect(confirm).toHaveTextContent(
      'O lançamento que já existia antes continua, como avulso, se ainda estiver pendente.',
    );
  });

  it('ends an installment plan after confirming', async () => {
    const fetchMock = mockRecurrences({
      [`DELETE ${base}/installments/${geladeira.id}`]: { status: 204, body: null },
    });
    renderApp(page);

    await choose('Geladeira', 'Encerrar parcelamento');
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Encerrar o parcelamento Geladeira?',
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Encerrar parcelamento' }));

    await expectCall(fetchMock, `${base}/installments/${geladeira.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Parcelamento encerrado')).toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockRecurrences({ [`GET ${base}`]: { body: { ...house, role: 'VIEWER' } } });
    renderApp(page);

    expect(await screen.findByText('Aluguel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ações de/ })).not.toBeInTheDocument();
  });

  it('points to "Novo lançamento" when there is nothing yet', async () => {
    mockRecurrences({
      [`GET ${base}/recurrences`]: { body: [] },
      [`GET ${base}/installments`]: { body: [] },
    });
    renderApp(page);

    const empty = await screen.findByText(/Nenhuma recorrência nem parcelamento/);
    expect(within(empty).getByRole('link', { name: 'Lançamentos' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}/lancamentos`,
    );
  });

  describe('editing and deleting a plan (ADR 0038 note)', () => {
    // Nothing paid yet: its amounts can change, and it is deleted rather than ended.
    const tv = plan(3, {
      description: 'TV',
      totalCents: 90_000,
      installments: 3,
      settledCount: 0,
      pendingCount: 3,
      pendingCents: 90_000,
      lastPendingPeriod: '2026-11',
    });

    it('edits a plan with nothing paid, amounts too, sending only what changed', async () => {
      const fetchMock = mockRecurrences({
        [`GET ${base}/installments`]: { body: [tv] },
        [`PATCH ${base}/installments/${tv.id}`]: { body: { ...tv, installments: 4 } },
      });
      renderApp(page);

      await choose('TV', 'Editar');
      const dialog = await screen.findByRole('dialog', { name: 'Editar TV' });
      expect(dialog).toHaveTextContent('refaz todas as parcelas');
      const installments = within(dialog).getByLabelText('Parcelas');
      await userEvent.clear(installments);
      await userEvent.type(installments, '4');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      await expectCall(fetchMock, `${base}/installments/${tv.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ amountCents: 90_000, amountIs: 'TOTAL', installments: 4 }),
      });
      expect(await screen.findByText('Parcelamento alterado')).toBeInTheDocument();
    });

    it('keeps the amounts of a plan with a paid installment, and changes the rest', async () => {
      const fetchMock = mockRecurrences({
        [`PATCH ${base}/installments/${geladeira.id}`]: {
          body: { ...geladeira, description: 'Geladeira nova' },
        },
      });
      renderApp(page);

      await choose('Geladeira', 'Editar');
      const dialog = await screen.findByRole('dialog', { name: 'Editar Geladeira' });
      expect(within(dialog).getByLabelText('Valor total (R$)')).toHaveAttribute('readonly');
      expect(dialog).toHaveTextContent('Com parcelas pagas, o valor e as parcelas não mudam');
      // Its archived merchant shows and stays as it is: not sent, not reactivated.
      expect(
        within(dialog).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
      ).toHaveTextContent('Loja Antiga');
      const description = within(dialog).getByLabelText('Descrição');
      await userEvent.clear(description);
      await userEvent.type(description, 'Geladeira nova');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      await expectCall(fetchMock, `${base}/installments/${geladeira.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ description: 'Geladeira nova' }),
      });
      expect(fetchMock).not.toHaveBeenCalledWith(
        new URL(`${base}/merchants/${lojaAntiga.id}`, 'http://api.test'),
        expect.anything(),
      );
    });

    it('takes the merchant out of a plan (ADR 0053)', async () => {
      const fetchMock = mockRecurrences({
        [`PATCH ${base}/installments/${geladeira.id}`]: {
          body: { ...geladeira, merchantId: null },
        },
      });
      renderApp(page);

      await choose('Geladeira', 'Editar');
      const dialog = await screen.findByRole('dialog', { name: 'Editar Geladeira' });
      await userEvent.click(
        within(dialog).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
      );
      await userEvent.click(await screen.findByRole('option', { name: 'Nenhum' }));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      await expectCall(fetchMock, `${base}/installments/${geladeira.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ merchantId: null }),
      });
    });

    it('deletes a plan with nothing paid, saying how many installments go', async () => {
      const fetchMock = mockRecurrences({
        [`GET ${base}/installments`]: { body: [tv] },
        [`DELETE ${base}/installments/${tv.id}`]: { status: 204, body: null },
      });
      renderApp(page);

      await choose('TV', 'Excluir parcelamento');
      const dialog = await screen.findByRole('alertdialog', { name: 'Excluir o parcelamento TV?' });
      expect(dialog).toHaveTextContent('sai com 3 parcelas pendentes');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir parcelamento' }));

      await expectCall(fetchMock, `${base}/installments/${tv.id}`, { method: 'DELETE' });
      expect(await screen.findByText('Parcelamento excluído')).toBeInTheDocument();
    });

    it('offers to delete an ended plan with nothing paid, from the history', async () => {
      const ended = { ...tv, endedAt: '2026-10-01T12:00:00.000Z', pendingCount: 1 };
      mockRecurrences({ [`GET ${base}/installments`]: { body: [ended, sofa] } });
      renderApp(page);

      const plans = await section('Parcelamentos');
      expect(
        within(plans).getByRole('heading', { name: 'Encerrados e quitados' }),
      ).toBeInTheDocument();
      await choose('TV', 'Excluir parcelamento');
      expect(await screen.findByRole('alertdialog')).toHaveTextContent('1 parcela pendente');
      // Paid off: history, nothing to act on.
      expect(screen.queryByRole('button', { name: 'Ações de Sofá' })).not.toBeInTheDocument();
    });
  });

  describe('as a table (from xl)', () => {
    /** The first cell of each body row of a table: the descriptions, top to bottom. */
    const descriptions = (table: HTMLElement) =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

    it('keeps the list on the phone, even with the table chosen', async () => {
      window.localStorage.setItem('financas:visao:recorrencias', 'TABLE');
      mockRecurrences();
      renderApp(page);

      const monthly = await section('Recorrentes');
      expect(screen.queryByRole('radiogroup', { name: 'Ver como' })).not.toBeInTheDocument();
      expect(within(monthly).queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows each part as a table, sorted by the column clicked, with the menu on active rows', async () => {
      stubPrefersDark(false, { wide: true });
      mockRecurrences();
      renderApp(page);

      await userEvent.click(await screen.findByRole('radio', { name: 'Tabela' }));

      const monthly = await section('Recorrentes');
      const [active, ended] = within(monthly).getAllByRole('table');
      expect(within(active!).getByRole('row', { name: /Aluguel/ })).toHaveTextContent(
        /Aluguel.*Saída.*Moradia.*A pagar para Ana.*Dia 10.*Desde janeiro de 2026.*R\$.1\.500,00/,
      );
      // By description at first; by amount, highest first, after two clicks.
      expect(descriptions(active!)).toEqual(['Aluguel', 'Conta de luz']);
      const amount = within(active!).getByRole('columnheader', { name: /Valor/ });
      await userEvent.click(within(amount).getByRole('button', { name: /Valor/ }));
      expect(descriptions(active!)).toEqual(['Conta de luz', 'Aluguel']);
      await userEvent.click(within(amount).getByRole('button', { name: /Valor/ }));
      expect(amount).toHaveAttribute('aria-sort', 'descending');
      expect(descriptions(active!)).toEqual(['Aluguel', 'Conta de luz']);
      expect(screen.getByRole('button', { name: 'Ações de Aluguel' })).toBeInTheDocument();
      // History: no actions column.
      expect(within(ended!).queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument();

      const plans = await section('Parcelamentos');
      expect(within(plans).getAllByRole('table')[0]).toHaveTextContent(
        /Geladeira.*A pagar para Bruno.*1 de 3.*Faltam 2 parcelas/,
      );
    });
  });
});
