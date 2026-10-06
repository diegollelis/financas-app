import { DEFAULT_BUDGET_SHARES, summarizePeriod, type Budget } from '@financas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { stubPrefersDark } from '@/test/match-media';
import { fakeUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019). The API's answer is built with the same shared function it uses.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'VIEWER' };
const today = '2026-10-15';

const budget: Budget = {
  period: '2026-10',
  netIncomeCents: 500_000,
  grossIncomeCents: null,
  ...DEFAULT_BUDGET_SHARES,
  source: 'INHERITED',
  inheritedFrom: '2026-09',
};
const credit = (amountCents: number, settledAt: string | null = null) => ({
  type: 'CREDIT' as const,
  amountCents,
  dueDate: null,
  settledAt,
});
const debit = (amountCents: number, dueDate: string | null, settledAt: string | null = null) => ({
  type: 'DEBIT' as const,
  amountCents,
  dueDate,
  settledAt,
});
const october = [
  credit(500_000, '2026-10-05'),
  credit(100_000),
  debit(15_990, '2026-10-10'), // overdue
  debit(35_000, null, '2026-10-08'),
  debit(200_000, '2026-10-20'),
];

function mockDashboard(summary: object, period = '2026-10') {
  return mockApi({
    'GET /api/me': { body: fakeUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET /api/workspaces/${houseId}/summary/${period}`]: { body: summary },
  });
}

const section = (name: string) => screen.findByRole('region', { name });
// An indicator's value: the <dd> after its <dt>, in the "Saldo e resultado" section (the chart
// legend also says "Saldo previsto").
const tile = (label: string) =>
  within(screen.getByRole('region', { name: 'Saldo e resultado' })).getByText(label, {
    selector: 'dt',
  }).nextElementSibling;
// Intl separates "R$" from the number with a non-breaking space.
const nbsp = (text: string | null | undefined) => text?.replace(/\u00a0/g, ' ');

describe('DashboardPage', () => {
  it('shows the balance and the result in both views, and what is overdue', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
    await section('Saldo e resultado');
    expect(tile('Saldo previsto')).toHaveTextContent('R$ 3.490,10');
    expect(tile('Saldo efetivado')).toHaveTextContent('R$ 4.650,00');
    expect(tile('Resultado previsto')).toHaveTextContent('R$ 1.090,10');
    expect(tile('Resultado efetivado')).toHaveTextContent('R$ 2.650,00');
    expect(nbsp(screen.getByRole('status').textContent)).toContain(
      '1 lançamento vencido (R$ 159,90).',
    );
    expect(screen.getByRole('link', { name: 'Ver lançamentos' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}/lancamentos?competencia=2026-10`,
    );
  });

  it('shows where the credits go, the expenses goal and each destination', async () => {
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const chart = await section('Para onde vão os créditos');
    expect(nbsp(within(chart).getByRole('img').getAttribute('aria-label'))).toBe(
      'Créditos de R$ 6.000,00: débitos pagos R$ 350,00, débitos a pagar R$ 2.159,90, saldo previsto R$ 3.490,10.',
    );
    const goal = await section('Despesas e meta');
    expect(goal).toHaveTextContent('R$ 2.509,90 de R$ 3.000,00 (meta de 60% da renda)');
    expect(goal).toHaveTextContent('Folga de R$ 490,10.');
    const destinations = await section('Orçamento por destino');
    expect(destinations).toHaveTextContent('Orçamento herdado de setembro de 2026.');
    // On the phone, a card per destination: the table's five columns do not fit.
    const investments = within(destinations)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.startsWith('Investimentos'));
    expect(nbsp(investments?.textContent)).toBe(
      'Investimentos20%MetaR$ 1.000,00PrevistoR$ 1.200,00EfetivadoR$ 1.000,00',
    );
    expect(within(destinations).queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the destinations as a table from md', async () => {
    stubPrefersDark(false, { desktop: true });
    mockDashboard(summarizePeriod(october, budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    const destinations = await section('Orçamento por destino');
    const investments = within(destinations).getByRole('row', { name: /Investimentos/ });
    expect(investments).toHaveTextContent('20%R$ 1.000,00R$ 1.200,00R$ 1.000,00');
  });

  it('warns, in words, when debits pass the credits and the goal', async () => {
    mockDashboard(summarizePeriod([...october, debit(400_000, null)], budget, today));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-10`);

    expect(
      await screen.findByText('Os débitos passam dos créditos em R$ 509,90.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Acima da meta em R$ 3.509,90.')).toBeInTheDocument();
    expect(tile('Saldo previsto')).toHaveTextContent('-R$ 509,90');
  });

  it('an empty month without income says what is missing', async () => {
    mockDashboard(
      summarizePeriod([], { ...budget, period: '2026-11', netIncomeCents: 0 }, today),
      '2026-11',
    );

    renderApp(`/espacos/${houseId}/painel?competencia=2026-11`);

    expect(await screen.findByText('Nenhum lançamento nesta competência.')).toBeInTheDocument();
    expect(
      screen.getByText('Informe a renda líquida no orçamento para acompanhar a meta de despesas.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver orçamento' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}/orcamento?competencia=2026-11`,
    );
  });

  it('is reached from the sections of the workspace, on this month', async () => {
    // Only Date is faked: "today" is Oct 15th, 2026 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
    mockApi({
      'GET /api/me': { body: fakeUser },
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
      expect(await section('Saldo e resultado')).toBeInTheDocument();
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
      'GET /api/me': { body: fakeUser },
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

      await userEvent.click(screen.getByRole('link', { name: 'Mês atual' }));
      expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
      // Already on this month: no link to it.
      expect(screen.queryByRole('link', { name: 'Mês atual' })).not.toBeInTheDocument();
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
