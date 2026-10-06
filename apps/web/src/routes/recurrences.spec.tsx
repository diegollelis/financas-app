import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
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
const aluguel = recurrence(1, { description: 'Aluguel', amountCents: 150_000, dueDay: 10 });
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
  totalCents: 100_000,
  installments: 3,
  settledCount: 1,
});
const sofa = plan(2, {
  description: 'Sofá',
  totalCents: 120_000,
  installments: 10,
  settledCount: 10,
});

function mockRecurrences(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET ${base}`]: { body: house },
    [`GET ${base}/categories`]: { body: [moradia, contas, salario] },
    [`GET ${base}/recurrences`]: { body: [aluguel, energia, academia] },
    [`GET ${base}/installments`]: { body: [geladeira, sofa] },
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
  it('lists active recurrences and running plans, with the past ones apart', async () => {
    mockRecurrences();
    renderApp(page);

    const monthly = await section('Todo mês');
    const [active, ended] = within(monthly).getAllByRole('list');
    expect(rowsOf(active!)).toEqual([
      expect.stringMatching(/Aluguel.*Débito.*Moradia.*Vence dia 10.*Desde janeiro de 2026/),
      expect.stringMatching(/Conta de luz.*Contas da casa.*Varia todo mês/),
    ]);
    expect(within(monthly).getByRole('heading', { name: 'Encerradas' })).toBeInTheDocument();
    expect(rowsOf(ended!)).toEqual([expect.stringMatching(/Academia.*Até maio de 2026/)]);
    // History has nothing to act on.
    expect(screen.queryByRole('button', { name: 'Ações de Academia' })).not.toBeInTheDocument();

    const plans = await section('Parcelamentos');
    const [running, over] = within(plans).getAllByRole('list');
    expect(rowsOf(running!)).toEqual([
      expect.stringMatching(/Geladeira.*1 de 3 pagas.*Última em novembro de 2026.*3 parcelas/),
    ]);
    expect(rowsOf(over!)).toEqual([expect.stringMatching(/Sofá.*Quitado.*10 de R\$/)]);
    expect(screen.queryByRole('button', { name: 'Ações de Sofá' })).not.toBeInTheDocument();
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
});
