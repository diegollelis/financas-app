import { summarizePeriod } from '@financas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { stubPrefersDark } from '@/test/match-media';
import { testBudget, testDestinations, verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019). The API's answer is built with the same shared function it uses.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'VIEWER' };
const today = '2026-10-15';

// Every share of R$ 5.000,00 (ADR 0064): Despesas 60%, then 20%, 12% and 8%.
const budget = testBudget({
  period: '2026-10',
  netIncomeCents: 500_000,
  source: 'INHERITED',
  inheritedFrom: '2026-09',
  basisPoints: [6_000, 2_000, 1_200, 800],
});
const expenseCategory = '01920000-0000-7000-8000-0000000000e1';
const investimentos = testDestinations[1]!.categoryId!;
const credit = (amountCents: number, settledAt: string | null = null) => ({
  type: 'CREDIT' as const,
  amountCents,
  dueDate: null,
  settledAt,
  categoryId: '01920000-0000-7000-8000-0000000000e2',
});
const debit = (
  amountCents: number,
  dueDate: string | null,
  settledAt: string | null = null,
  categoryId: string = expenseCategory,
) => ({ type: 'DEBIT' as const, amountCents, dueDate, settledAt, categoryId });
const october = [
  credit(500_000, '2026-10-05'),
  credit(100_000),
  debit(15_990, '2026-10-10'), // overdue
  debit(35_000, null, '2026-10-08'),
  debit(200_000, '2026-10-20'),
  debit(50_000, null, '2026-10-06', investimentos), // applied to Investimentos
];

function mockDashboard(summary: object, period = '2026-10', role = house.role) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: { ...house, role } },
    [`GET /api/workspaces/${houseId}/summary/${period}`]: { body: summary },
  });
}

const section = (name: string) => screen.findByRole('region', { name });
// A labelled amount's value: the <dd> after its <dt>, in one card (the chart legend also says
// "Saldo previsto").
const figure = (card: string, label: string) =>
  within(screen.getByRole('region', { name: card })).getByText(label, { selector: 'dt' })
    .nextElementSibling;
const tile = (label: string) => figure('Saldo do mês', label);
// Intl separates "R$" from the number with a non-breaking space.
const nbsp = (text: string | null | undefined) => text?.replace(/\u00a0/g, ' ');
// A goal's line in the "Metas" card, by its name.
const goal = (savings: HTMLElement, name: string) =>
  within(savings)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.startsWith(name));

describe('DashboardPage', () => {
  it('says how much of the planned view is an estimate of bills that vary', async () => {
    const energy = { ...debit(18_990, '2026-10-25'), amountEstimated: true };
    mockDashboard(summarizePeriod([...october, energy], budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const balance = await section('Saldo do mês');
    expect(nbsp(balance.textContent)).toContain(
      'Inclui R$ 189,90 em valores estimados, de contas que variam.',
    );
  });

  it('leaves money lent with no due date out of the planned balance, and says so (ADR 0057)', async () => {
    const loans = '01920000-0000-7000-8000-0000000000e3';
    const lentBack = { ...credit(300_000), categoryId: loans };
    mockDashboard(summarizePeriod([...october, lentBack], budget, today, new Set([loans])));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const balance = await section('Saldo do mês');
    // 9.000,00 in, 3.000,00 of them with no date: 6.000,00 − 3.009,90, as without it.
    expect(tile('Saldo previsto')).toHaveTextContent('R$ 2.990,10');
    expect(nbsp(balance.textContent)).toContain('Não inclui R$ 3.000,00 a receber sem vencimento.');
    // "Entradas" and the bar count what the balance counts, so they add up (ADR 0057 note).
    expect(nbsp(tile('Entradas')?.textContent)).toContain('R$ 6.000,00');
    expect(within(balance).queryByText('A receber sem vencimento')).not.toBeInTheDocument();
  });

  it('leaves money borrowed with no due date out of the planned balance, and says so', async () => {
    const debts = '01920000-0000-7000-8000-0000000000e4';
    const owed = debit(200_000, null, null, debts);
    mockDashboard(summarizePeriod([...october, owed], budget, today, new Set([debts])));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const balance = await section('Saldo do mês');
    // The debt is in the debits, not in the planned balance: 6.000,00 − 3.009,90, as without it.
    expect(tile('Saldo previsto')).toHaveTextContent('R$ 2.990,10');
    expect(nbsp(balance.textContent)).toContain('Não inclui R$ 2.000,00 a pagar sem vencimento.');
    expect(nbsp(tile('Saídas')?.textContent)).toContain('R$ 3.009,90');
  });

  it('shows the balance, what is left to set aside and what was applied', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
    await section('Saldo do mês');
    // Credits − all debits: 6.000,00 − 3.009,90; settled: 5.000,00 − (350,00 + 500,00).
    expect(tile('Saldo previsto')).toHaveTextContent('R$ 2.990,10');
    expect(tile('Saldo atual')).toHaveTextContent('R$ 4.150,00');
    // What comes in and goes out, with what already happened under it.
    expect(nbsp(tile('Entradas')?.parentElement?.textContent)).toBe(
      'EntradasR$ 6.000,00R$ 5.000,00 recebidos',
    );
    expect(nbsp(tile('Saídas')?.parentElement?.textContent)).toBe(
      'SaídasR$ 3.009,90R$ 850,00 pagos',
    );
    // Credits − expenses (the application is not an expense): 6.000,00 − 2.509,90.
    expect(figure('Metas', 'Sobra prevista')).toHaveTextContent('R$ 3.490,10');
    // The goals add up to 2.000,00 of the income: covered, with 1.490,10 beyond them.
    expect(nbsp(figure('Metas', 'Sobra prevista')?.nextElementSibling?.textContent)).toBe(
      'Cobre as metas e ainda sobram R$ 1.490,10.',
    );
    expect(figure('Metas', 'Guardado')).toHaveTextContent('R$ 500,00');
    expect(nbsp(screen.getByRole('status').textContent)).toContain(
      '1 lançamento vencido (R$ 159,90).',
    );
    expect(screen.getByRole('link', { name: 'Ver lançamentos' })).toHaveAttribute(
      'href',
      // Straight to the overdue ones.
      `/espacos/${houseId}/lancamentos?competencia=2026-10&situacao=vencidos`,
    );
  });

  it('says how much came in without counting as income (ADR 0056)', async () => {
    // An old loan paid back, in a category marked "Nem renda nem gasto".
    mockDashboard({ ...summarizePeriod(october, budget, today), neutralIncomeCents: 300_000 });

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const budgetBar = await section('Orçamento do mês');
    // One line per fact, each starting with its amount.
    const lines = within(budgetBar)
      .getAllByRole('definition')
      .map((line) => nbsp(line.textContent));
    expect(lines).toEqual([
      'R$ 5.000,00',
      'R$ 6.000,00',
      'R$ 1.000,00 acima da renda',
      'Mais R$ 3.000,00 fora da renda',
    ]);
  });

  it('shows where the credits go, the spending limit and each goal', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const balance = await section('Saldo do mês');
    expect(nbsp(within(balance).getByRole('img').getAttribute('aria-label'))).toBe(
      'Entradas de R$ 6.000,00: saídas pagas R$ 850,00, saídas a pagar R$ 2.159,90, saldo previsto R$ 2.990,10.',
    );
    // The amounts are in the card: the legend names the parts only (ADR 0045 note).
    expect(
      within(balance)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Saídas pagas', 'Saídas a pagar', 'Saldo previsto']);
    // The budget in a card (ADR 0046 note): the net income beside the month's credits.
    const budgetBar = await section('Orçamento do mês');
    expect(nbsp(budgetBar.textContent)).toContain(
      'Renda líquidaR$ 5.000,00Entradas do mêsR$ 6.000,00R$ 1.000,00 acima da renda',
    );
    await userEvent.click(
      within(budgetBar).getByRole('button', { name: 'Sobre Orçamento do mês' }),
    );
    expect(await screen.findByRole('dialog', { name: 'Orçamento do mês' })).toHaveTextContent(
      'Orçamento herdado de setembro de 2026.',
    );
    await userEvent.keyboard('{Escape}');
    // Despesas apart (ADR 0047): 2.509,90 of 3.000,00, paid 350,00 and 2.159,90 to pay.
    const limit = await section('Limite de gastos');
    expect(nbsp(limit.textContent)).toContain('GastosR$ 2.509,90 de R$ 3.000,00');
    expect(nbsp(limit.textContent)).toContain(
      'Sobram R$ 490,10 no limite. O limite é 60% da renda líquida.',
    );
    expect(nbsp(limit.textContent)).toContain('Gastos pagosR$ 350,00Gastos a pagarR$ 2.159,90');
    // Investimentos: 20% of 5.000,00 = 1.000,00; 500,00 applied, nothing pending, 500,00 still
    // to launch, 50% of the goal.
    const savings = await section('Metas');
    expect(nbsp(goal(savings, 'Investimentos')?.textContent)).toBe(
      'Investimentos 20% da rendaR$ 500,00 de R$ 1.000,00 (50%)Falta lançar R$ 500,00.',
    );
    expect(
      nbsp(
        within(savings)
          .getByRole('meter', { name: 'Progresso de Investimentos' })
          .getAttribute('aria-valuetext'),
      ),
    ).toBe('R$ 500,00 guardados de R$ 1.000,00');
    // Despesas is not one of the saving destinations.
    expect(
      within(savings)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.match(/^\D+/)?.[0]?.trim()),
    ).toEqual(['Investimentos', 'Reserva de emergência', 'Viagens']);
    expect(within(savings).queryByRole('table')).not.toBeInTheDocument();
    // The limit and the goals add up to 100%: nothing is left without a destination.
    expect(savings).not.toHaveTextContent('Sem meta');
  });

  it('shows the goals as a table from xl, sorted by the column clicked (ADR 0064)', async () => {
    stubPrefersDark(false, { wide: true });
    mockDashboard(summarizePeriod(october, budget, today));
    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const savings = await section('Metas');
    await userEvent.click(within(savings).getByRole('radio', { name: 'Tabela' }));

    const table = within(savings).getByRole('table');
    const names = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
    expect(within(table).getByRole('row', { name: /Investimentos/ })).toHaveTextContent(
      /Investimentos.*20%.*R\$.1\.000,00.*R\$.500,00.*R\$.0,00.*R\$.500,00/,
    );
    // In the budget's order at first; by the share, largest first, after two clicks.
    expect(names()).toEqual(['Investimentos', 'Reserva de emergência', 'Viagens']);
    const share = within(table).getByRole('columnheader', { name: /% da renda/ });
    await userEvent.click(within(share).getByRole('button', { name: /% da renda/ }));
    await userEvent.click(within(share).getByRole('button', { name: /% da renda/ }));
    expect(names()).toEqual(['Investimentos', 'Reserva de emergência', 'Viagens']);
    await userEvent.click(within(share).getByRole('button', { name: /% da renda/ }));
    expect(names()).toEqual(['Viagens', 'Reserva de emergência', 'Investimentos']);
  });

  it('says what is pending on a goal and what is left to launch', async () => {
    const scheduled = debit(30_000, '2026-10-25', null, investimentos);
    mockDashboard(summarizePeriod([...october, scheduled], budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    // 1.000,00 − 500,00 applied − 300,00 pending.
    expect(nbsp(goal(await section('Metas'), 'Investimentos')?.textContent)).toContain(
      'R$ 300,00 pendente. Falta lançar R$ 200,00.',
    );
  });

  it('shows what the limit and the goals leave without a destination', async () => {
    const ninety = testBudget({
      period: '2026-10',
      netIncomeCents: 500_000,
      source: 'SAVED',
      basisPoints: [6_000, 2_000, 1_200, 300],
    });
    mockDashboard(summarizePeriod(october, ninety, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    // The plan in the budget card (ADR 0064): one line per share of the income, down to 100%.
    const budgetCard = await section('Orçamento do mês');
    const plan = within(budgetCard).getByRole('list', { name: 'Divisão da renda líquida' });
    expect(
      within(plan)
        .getAllByRole('listitem')
        .map((line) => nbsp(line.textContent)),
    ).toEqual([
      'Limite de gastos60%R$ 3.000,00',
      'Investimentos20%R$ 1.000,00',
      'Reserva de emergência12%R$ 600,00',
      'Viagens3%R$ 150,00',
      'Sem meta5%R$ 250,00',
      'Total100%R$ 5.000,00',
    ]);
    expect(within(budgetCard).getByRole('img')).toHaveAttribute(
      'aria-label',
      'Divisão da renda líquida: gastos 60%, metas 35%, sem meta 5%.',
    );
    // Never read as money to spend (ADR 0051): said behind the "ⓘ" on its line.
    await userEvent.click(within(plan).getByRole('button', { name: 'Sobre Sem meta' }));
    expect(await screen.findByRole('dialog', { name: 'Sem meta' })).toHaveTextContent(
      'Parte da renda líquida que nem o limite de gastos nem uma meta recebeu. É uma divisão do orçamento, não um saldo.',
    );
  });

  it('warns, in words, when debits pass the credits and the goal', async () => {
    mockDashboard(summarizePeriod([...october, debit(400_000, null)], budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    expect(
      await screen.findByText('As saídas passam das entradas em R$ 1.009,90.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Acima do limite em R$ 3.509,90.')).toBeInTheDocument();
    // Never a negative leftover (ADR 0064): zero, and how far the expenses went.
    expect(figure('Metas', 'Sobra prevista')).toHaveTextContent('R$ 0,00');
    expect(screen.getByText('Os gastos passaram as entradas em R$ 509,90.')).toBeInTheDocument();
    expect(tile('Saldo previsto')).toHaveTextContent('-R$ 1.009,90');
    // The legend leaves the balance out, never "Saldo previsto R$ 0,00" (ADR 0051 note).
    expect(
      within(await section('Saldo do mês'))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Saídas pagas', 'Saídas a pagar']);
    // Nothing left: the goals of the month are zero, the plan is not (ADR 0064 note).
    const savings = await section('Metas');
    expect(nbsp(goal(savings, 'Investimentos')?.textContent)).toContain('Sem valor este mês.');
    expect(nbsp(goal(savings, 'Investimentos')?.textContent)).toContain(
      'Reduzida pela sobra do mês (plano: R$ 1.000,00).',
    );
    const plan = within(await section('Orçamento do mês')).getByRole('list', {
      name: 'Divisão da renda líquida',
    });
    expect(nbsp(within(plan).getAllByRole('listitem')[1]?.textContent)).toBe(
      'Investimentos20%R$ 1.000,00',
    );
  });

  it('cuts the goals to what is left, and "Guardar" offers only that (ADR 0064 note)', async () => {
    stubPrefersDark(false, { desktop: true });
    const reserva = testDestinations[2]!.categoryId!;
    // 2.490,10 more spent: 1.000,00 left for 2.000,00 of goals, half of each.
    mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'EDITOR' } },
      [`GET /api/workspaces/${houseId}/summary/2026-10`]: {
        body: summarizePeriod([...october, debit(249_010, null)], budget, today),
      },
      [`GET /api/workspaces/${houseId}/categories`]: {
        body: [{ id: reserva, name: 'Reserva de emergência', type: 'DEBIT', archived: false }],
      },
      [`GET /api/workspaces/${houseId}/people`]: { body: [] },
    });
    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const savings = await section('Metas');
    expect(nbsp(figure('Metas', 'Sobra prevista')?.nextElementSibling?.textContent)).toBe(
      'Não cobre as metas do plano: elas ficam em R$ 1.000,00.',
    );
    expect(nbsp(goal(savings, 'Reserva de emergência')?.textContent)).toBe(
      'Reserva de emergência 12% da rendaGuardar em Reserva de emergênciaR$ 0,00 de R$ 300,00 (0%)Falta lançar R$ 300,00.Reduzida pela sobra do mês (plano: R$ 600,00).',
    );
    await userEvent.click(
      within(savings).getByRole('button', { name: 'Guardar em Reserva de emergência' }),
    );
    const form = await screen.findByRole('dialog', { name: 'Registrar valor guardado' });
    expect(within(form).getByLabelText('Valor (R$)')).toHaveValue('300,00');
  });

  it('keeps the reference month of the screenshots in place (regression)', async () => {
    // The test account's month (fictitious): 5.200,00 received and 5.595,00 to come, 18.342,70
    // to pay, nothing paid, no budget.
    const reference = [
      credit(520_000, '2026-10-05'),
      credit(559_500),
      debit(1_834_270, '2026-10-01'),
    ];
    mockDashboard(summarizePeriod(reference, testBudget({ period: '2026-10' }), today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    await section('Saldo do mês');
    expect(tile('Saldo previsto')).toHaveTextContent('-R$ 7.547,70');
    expect(tile('Saldo atual')).toHaveTextContent('R$ 5.200,00');
    expect(nbsp(tile('Entradas')?.parentElement?.textContent)).toBe(
      'EntradasR$ 10.795,00R$ 5.200,00 recebidos',
    );
    expect(nbsp(tile('Saídas')?.parentElement?.textContent)).toBe(
      'SaídasR$ 18.342,70R$ 0,00 pagos',
    );
    expect(screen.getByText('As saídas passam das entradas em R$ 7.547,70.')).toBeInTheDocument();
    // No budget: one card that says so, no empty limit or goals.
    expect(await section('Orçamento do mês')).toHaveTextContent(
      'Nenhum orçamento definido até aqui.',
    );
    expect(screen.queryByRole('region', { name: 'Limite de gastos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Metas' })).not.toBeInTheDocument();
  });

  it('an empty month without income says what is missing', async () => {
    mockDashboard(
      summarizePeriod([], { ...budget, period: '2026-11', netIncomeCents: 0 }, today),
      '2026-11',
    );

    renderApp(`/espacos/${houseId}/painel?competencia=2026-11`);

    expect(await screen.findByText('Nenhum lançamento neste mês.')).toBeInTheDocument();
    // No net income, so no goal; a VIEWER cannot set it.
    expect(await section('Orçamento do mês')).toHaveTextContent('Renda líquidaNão definida');
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // Nothing that changes the budget (ADR 0046).
    expect(screen.queryByRole('button', { name: 'Definir orçamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar orçamento' })).not.toBeInTheDocument();
  });

  it('highlights "Definir orçamento" to whoever edits, until there is a budget (ADR 0047)', async () => {
    mockDashboard(
      summarizePeriod([], testBudget({ period: '2026-11' }), today),
      '2026-11',
      'EDITOR',
    );

    renderApp(`/espacos/${houseId}/painel?competencia=2026-11`);

    const destinations = await section('Orçamento do mês');
    expect(destinations).toHaveTextContent('Nenhum orçamento definido até aqui.');
    // It opens the budget dialog (tested in budget.spec.tsx).
    expect(
      within(destinations).getByRole('button', { name: 'Definir orçamento' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar orçamento' })).not.toBeInTheDocument();
  });

  it('registers an application to a saving destination, for what is missing to its goal', async () => {
    stubPrefersDark(false, { desktop: true });
    const created = {
      id: '01920000-0000-7000-8000-0000000000f1',
      type: 'DEBIT',
      description: 'Aporte em Investimentos',
      notes: null,
      categoryId: investimentos,
      amountCents: 50_000,
      period: '2026-10',
      dueDate: null,
      settledAt: null,
    };
    const fetchMock = mockApi({
      [`POST /api/workspaces/${houseId}/transactions`]: { status: 201, body: created },
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'EDITOR' } },
      [`GET /api/workspaces/${houseId}/summary/2026-10`]: {
        body: summarizePeriod(october, budget, today),
      },
      [`GET /api/workspaces/${houseId}/categories`]: {
        body: [{ id: investimentos, name: 'Investimentos', type: 'DEBIT', archived: false }],
      },
      [`GET /api/workspaces/${houseId}/people`]: { body: [] },
    });
    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const destinations = await section('Metas');
    // Despesas has no category to apply to: only the saving destinations have the button.
    expect(
      within(destinations).queryByRole('button', { name: 'Guardar em Despesas' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(destinations).getByRole('button', { name: 'Guardar em Investimentos' }),
    );

    const form = await screen.findByRole('dialog', { name: 'Registrar valor guardado' });
    // The goal in the description: a record, not an investment the app makes (ADR 0051).
    expect(form).toHaveAccessibleDescription(/^Em Investimentos, no mês de outubro de 2026/);
    expect(within(form).getByLabelText('Descrição')).toHaveValue('Aporte em Investimentos');
    // Goal 1.000,00 − 500,00 applied.
    expect(within(form).getByLabelText('Valor (R$)')).toHaveValue('500,00');
    // Type and category are fixed: changing them would make it something else.
    // Said plainly: a record, not money moved.
    expect(within(form).getByText(/^Será lançada uma saída/)).toHaveTextContent(
      'Será lançada uma saída na categoria Investimentos. Nenhum dinheiro é movido: é só o registro do que você guardou.',
    );
    expect(within(form).queryByRole('radiogroup', { name: 'Tipo' })).not.toBeInTheDocument();
    expect(within(form).queryByRole('combobox', { name: 'Categoria' })).not.toBeInTheDocument();
    // An application has no person and no split; it repeats every month at most.
    expect(within(form).queryByLabelText(/A pagar para/)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText('Dividir com alguém')).not.toBeInTheDocument();
    const repeat = within(form).getByRole('radiogroup', { name: 'Repetir' });
    expect(
      within(repeat)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Não repetir', 'Todo mês', 'Todo ano']);

    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(`/api/workspaces/${houseId}/transactions`, 'http://api.test'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(
            `"type":"DEBIT","description":"Aporte em Investimentos","notes":null,"categoryId":"${investimentos}","amountCents":50000`,
          ) as string,
        }),
      ),
    );
  });

  it('names the transaction after any goal, one the person created too', async () => {
    stubPrefersDark(false, { desktop: true });
    const viagens = testDestinations[3]!;
    mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'EDITOR' } },
      [`GET /api/workspaces/${houseId}/summary/2026-10`]: {
        body: summarizePeriod(october, budget, today),
      },
      [`GET /api/workspaces/${houseId}/categories`]: {
        body: [{ id: viagens.categoryId, name: viagens.name, type: 'DEBIT', archived: false }],
      },
      [`GET /api/workspaces/${houseId}/people`]: { body: [] },
    });
    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    await userEvent.click(
      within(await section('Metas')).getByRole('button', { name: 'Guardar em Viagens' }),
    );

    const form = await screen.findByRole('dialog', { name: 'Registrar valor guardado' });
    expect(form).toHaveAccessibleDescription(/^Em Viagens, no mês de outubro de 2026/);
    // A noun, right while pending and once paid (ADR 0051).
    expect(within(form).getByLabelText('Descrição')).toHaveValue('Aporte em Viagens');
  });

  it('offers no application to a VIEWER', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    await section('Metas');
    expect(screen.queryByRole('button', { name: /^Guardar/ })).not.toBeInTheDocument();
  });

  it('is reached from the sections of the workspace, on this month', async () => {
    // Only Date is faked: "today" is Oct 15th, 2026 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
    mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { body: house },
      [`GET /api/workspaces/${houseId}/members`]: { body: [] },
      [`GET /api/workspaces/${houseId}/summary/2026-10`]: {
        body: summarizePeriod(october, budget, today),
      },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    try {
      await userEvent.click(await screen.findByRole('link', { name: 'Painel' }));

      expect(router.state.location.pathname).toBe(`/espacos/${houseId}/painel`);
      expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
      expect(await section('Saldo do mês')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves between competências, across the year, and back to this month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
    const summaryOf = (period: string) => ({
      body: summarizePeriod([], { ...budget, period }, today),
    });
    const fetchMock = mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET /api/workspaces/${houseId}`]: { body: house },
      [`GET /api/workspaces/${houseId}/summary/2026-12`]: summaryOf('2026-12'),
      [`GET /api/workspaces/${houseId}/summary/2027-01`]: summaryOf('2027-01'),
      [`GET /api/workspaces/${houseId}/summary/2026-10`]: summaryOf('2026-10'),
    });
    const { router } = renderApp(`/espacos/${houseId}/painel?competencia=2026-12`);

    try {
      await userEvent.click(
        await screen.findByRole('link', { name: 'Próximo mês: janeiro de 2027' }),
      );
      expect(router.state.location.search).toBe('?competencia=2027-01');
      expect(await screen.findByText('janeiro de 2027')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Mês anterior: dezembro de 2026' }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /^Escolher mês/ }));
      await userEvent.click(await screen.findByRole('link', { name: 'Ir para o mês atual' }));
      expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
      // Already on this month: the picker offers no way to it.
      await userEvent.click(screen.getByRole('button', { name: 'Escolher mês: outubro de 2026' }));
      expect(await screen.findByRole('dialog', { name: 'Escolher mês' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Ir para o mês atual' })).not.toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/espacos/${houseId}/painel`);
      await vi.waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          new URL(`/api/workspaces/${houseId}/summary/2027-01`, 'http://api.test'),
          expect.anything(),
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
