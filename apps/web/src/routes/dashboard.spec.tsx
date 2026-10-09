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

// Despesas: 60% of R$ 5.000,00. Saving: 50%, 30% and 20% of what is left after expenses.
const budget = testBudget({
  period: '2026-10',
  netIncomeCents: 500_000,
  source: 'INHERITED',
  inheritedFrom: '2026-09',
  basisPoints: [6_000, 5_000, 3_000, 2_000],
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
// An indicator's value: the <dd> after its <dt>, in the "Saldo do mês" section (the chart
// legend also says "Saldo previsto").
const tile = (label: string) =>
  within(screen.getByRole('region', { name: 'Saldo do mês' })).getByText(label, {
    selector: 'dt',
  }).nextElementSibling;
// Intl separates "R$" from the number with a non-breaking space.
const nbsp = (text: string | null | undefined) => text?.replace(/\u00a0/g, ' ');

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

  it('shows the balance, what is available to set aside and what was applied', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
    await section('Saldo do mês');
    // Credits − all debits: 6.000,00 − 3.009,90; settled: 5.000,00 − (350,00 + 500,00).
    expect(tile('Saldo previsto')).toHaveTextContent('R$ 2.990,10');
    expect(tile('Saldo efetivado')).toHaveTextContent('R$ 4.150,00');
    // Credits − expenses (the application is not an expense): 6.000,00 − 2.509,90.
    expect(tile('Disponível para guardar')).toHaveTextContent('R$ 3.490,10');
    expect(tile('Aplicado')).toHaveTextContent('R$ 500,00');
    expect(nbsp(screen.getByRole('status').textContent)).toContain(
      '1 lançamento vencido (R$ 159,90).',
    );
    expect(screen.getByRole('link', { name: 'Ver lançamentos' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}/lancamentos?competencia=2026-10`,
    );
  });

  it('shows where the credits go, the expenses goal and each saving destination', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const chart = await section('Para onde vão os créditos');
    expect(nbsp(within(chart).getByRole('img').getAttribute('aria-label'))).toBe(
      'Créditos de R$ 6.000,00: débitos pagos R$ 850,00, débitos a pagar R$ 2.159,90, saldo previsto R$ 2.990,10.',
    );
    const goal = await section('Orçamento por destino');
    expect(goal).toHaveTextContent('R$ 2.509,90 de R$ 3.000,00 (meta de 60% da renda)');
    expect(goal).toHaveTextContent('Folga de R$ 490,10.');
    const destinations = await section('Orçamento por destino');
    expect(destinations).toHaveTextContent('Orçamento herdado de setembro de 2026.');
    // Despesas apart (ADR 0047): paid 350,00 and 2.159,90 to pay, 2.509,90 of 3.000,00.
    const expenses = await section('Despesas');
    expect(nbsp(expenses.textContent)).toContain(
      'PagoR$ 350,00A pagarR$ 2.159,90Usado da meta83,66%',
    );
    // Where the saving goals come from.
    expect(nbsp((await section('O que sobra para guardar')).textContent)).toContain(
      'Créditos previstosR$ 6.000,00Despesas previstas− R$ 2.509,90Disponível para guardarR$ 3.490,10',
    );
    // On the phone, a card per saving destination: the table's columns do not fit.
    // Investimentos: 50% of 3.490,10 = 1.745,05; 500,00 applied, 28,65% of the goal.
    const investments = within(destinations)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith('Investimentos'));
    expect(nbsp(investments?.textContent)).toBe(
      'Investimentos50%MetaR$ 1.745,05AplicadoR$ 500,00A aplicarR$ 0,00Realizado28,65%',
    );
    expect(within(destinations).queryByRole('table')).not.toBeInTheDocument();
    // Despesas is not one of the saving destinations.
    const savings = await section('Destinos de guardar');
    expect(
      within(savings)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.match(/^\D+/)?.[0]),
    ).toEqual(['Investimentos', 'Reserva de emergência', 'Viagens']);
    // Their shares add up to 100%: nothing is left without a destination.
    expect(savings).not.toHaveTextContent('Sem destino');
  });

  it('shows the destinations as a table from md', async () => {
    stubPrefersDark(false, { desktop: true });
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const savings = await section('Destinos de guardar');
    const investments = within(savings).getByRole('row', { name: /Investimentos/ });
    expect(investments).toHaveTextContent('50%R$ 1.745,05R$ 500,00R$ 0,0028,65%');
    expect(within(savings).queryByRole('row', { name: /Despesas/ })).not.toBeInTheDocument();
    // The goals add up to what is available.
    expect(within(savings).getByRole('row', { name: /Total/ })).toHaveTextContent(
      '100%R$ 3.490,10R$ 500,00R$ 0,0014,33%',
    );
  });

  it('shows what the saving shares leave without a destination', async () => {
    stubPrefersDark(false, { desktop: true });
    const ninety = testBudget({
      period: '2026-10',
      netIncomeCents: 500_000,
      source: 'SAVED',
      basisPoints: [6_000, 5_000, 3_000, 1_000],
    });
    mockDashboard(summarizePeriod(october, ninety, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const savings = await section('Destinos de guardar');
    // 10% of 3.490,10 has no destination.
    expect(within(savings).getByRole('row', { name: /Sem destino/ })).toHaveTextContent(
      '10%R$ 349,01',
    );
    expect(within(savings).getByRole('row', { name: /Total/ })).toHaveTextContent(
      '100%R$ 3.490,10',
    );
  });

  it('warns, in words, when debits pass the credits and the goal', async () => {
    mockDashboard(summarizePeriod([...october, debit(400_000, null)], budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    expect(
      await screen.findByText('Os débitos passam dos créditos em R$ 1.009,90.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Acima da meta em R$ 3.509,90.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nada sobrou para guardar este mês: as despesas previstas alcançaram os créditos.',
      ),
    ).toBeInTheDocument();
    expect(tile('Saldo previsto')).toHaveTextContent('-R$ 1.009,90');
  });

  it('an empty month without income says what is missing', async () => {
    mockDashboard(
      summarizePeriod([], { ...budget, period: '2026-11', netIncomeCents: 0 }, today),
      '2026-11',
    );

    renderApp(`/espacos/${houseId}/painel?competencia=2026-11`);

    expect(await screen.findByText('Nenhum lançamento nesta competência.')).toBeInTheDocument();
    // No net income, so no goal; a VIEWER cannot set it.
    expect(await section('Orçamento por destino')).toHaveTextContent('Renda líquida: não definida');
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

    const destinations = await section('Orçamento por destino');
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
      description: 'Aplicação em Investimentos',
      notes: null,
      categoryId: investimentos,
      amountCents: 124_505,
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

    const destinations = await section('Orçamento por destino');
    // Despesas has no category to apply to: only the saving destinations have the button.
    expect(
      within(destinations).queryByRole('button', { name: 'Aplicar em Despesas' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(destinations).getByRole('button', { name: 'Aplicar em Investimentos' }),
    );

    const form = await screen.findByRole('dialog', { name: 'Aplicação em Investimentos' });
    expect(within(form).getByLabelText('Descrição')).toHaveValue('Aplicação em Investimentos');
    // Goal 1.745,05 − 500,00 applied.
    expect(within(form).getByLabelText('Valor (R$)')).toHaveValue('1.245,05');
    // Type and category are fixed: changing them would make it something else.
    expect(within(form).getByText(/^Débito na categoria/)).toHaveTextContent(
      'Débito na categoria Investimentos.',
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
    ).toEqual(['Não repetir', 'Todo mês']);

    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(`/api/workspaces/${houseId}/transactions`, 'http://api.test'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(
            `"type":"DEBIT","description":"Aplicação em Investimentos","notes":null,"categoryId":"${investimentos}","amountCents":124505`,
          ) as string,
        }),
      ),
    );
  });

  it('offers no application to a VIEWER', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    await section('Orçamento por destino');
    expect(screen.queryByRole('button', { name: /^Aplicar/ })).not.toBeInTheDocument();
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
        await screen.findByRole('link', { name: 'Próxima competência: janeiro de 2027' }),
      );
      expect(router.state.location.search).toBe('?competencia=2027-01');
      expect(await screen.findByText('janeiro de 2027')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Competência anterior: dezembro de 2026' }),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /^Escolher competência/ }));
      await userEvent.click(await screen.findByRole('link', { name: 'Ir para o mês atual' }));
      expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
      // Already on this month: the picker offers no way to it.
      await userEvent.click(
        screen.getByRole('button', { name: 'Escolher competência: outubro de 2026' }),
      );
      expect(
        await screen.findByRole('dialog', { name: 'Escolher competência' }),
      ).toBeInTheDocument();
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
