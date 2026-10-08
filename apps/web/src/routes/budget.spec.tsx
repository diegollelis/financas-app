import { summarizePeriod, type Budget } from '@financas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019). The budget is edited in a dialog on the dashboard (ADR 0046).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/budget`;
const today = '2026-10-15';

const inherited: Budget = {
  period: '2026-10',
  netIncomeCents: 500_000,
  grossIncomeCents: null,
  expensesBp: 6_000,
  investmentsBp: 2_000,
  emergencyReserveBp: 1_500,
  travelBp: 500,
  source: 'INHERITED',
  inheritedFrom: '2026-09',
};

/** The dashboard of a competência, and the budget the dialog loads for it. */
const monthRoutes = (budget: Budget) => ({
  [`GET /api/workspaces/${houseId}/summary/${budget.period}`]: {
    body: summarizePeriod([], budget, today),
  },
  [`GET ${base}/${budget.period}`]: { body: budget },
});

function mockBudget(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    ...monthRoutes(inherited),
    ...overrides,
  });
}

const openDialog = async () => {
  await userEvent.click(await screen.findByRole('button', { name: 'Editar orçamento' }));
  return screen.findByRole('dialog', { name: 'Orçamento de outubro de 2026' });
};

describe('Budget dialog (on the dashboard)', () => {
  beforeEach(() => {
    // Only Date is faked: "today" is Oct 15th, 2026 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the net income on the dashboard, and opens the budget with where it came from', async () => {
    mockBudget();

    renderApp(`/espacos/${houseId}/painel`);

    const budget = await screen.findByRole('region', { name: 'Orçamento por destino' });
    expect(budget).toHaveTextContent('Renda líquida: R$');
    const dialog = await openDialog();
    expect(
      await within(dialog).findByText(
        'Herdado de setembro de 2026. Ao salvar, outubro de 2026 passa a ter o seu próprio orçamento.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Renda líquida (R$)')).toHaveValue('5.000,00');
    expect(within(dialog).getByLabelText('Renda bruta (R$, opcional)')).toHaveValue('');
    expect(within(dialog).getByLabelText('Despesas (%)')).toHaveValue('60');
    expect(within(dialog).getByText('R$ 3.000,00')).toBeInTheDocument();
    expect(within(dialog).getByText('R$ 250,00')).toBeInTheDocument();
    expect(within(dialog).getByText('Soma: 100%')).toBeInTheDocument();
  });

  it('explains the defaults when no competência was ever saved', async () => {
    const defaults: Budget = {
      ...inherited,
      period: '2026-11',
      netIncomeCents: 0,
      source: 'DEFAULT',
      inheritedFrom: null,
    };
    mockBudget(monthRoutes(defaults));

    renderApp(`/espacos/${houseId}/painel?competencia=2026-11`);

    await userEvent.click(await screen.findByRole('button', { name: 'Editar orçamento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Orçamento de novembro de 2026' });
    expect(
      await within(dialog).findByText(/^Percentuais padrão: nenhuma competência até aqui/),
    ).toBeInTheDocument();
  });

  it('saves the whole configuration for the competência, then closes', async () => {
    const fetchMock = mockBudget({
      [`PUT ${base}/2026-10`]: {
        body: {
          ...inherited,
          travelBp: 250,
          grossIncomeCents: 650_000,
          source: 'SAVED',
          inheritedFrom: null,
        },
      },
    });
    renderApp(`/espacos/${houseId}/painel`);

    const dialog = await openDialog();
    await userEvent.type(
      await within(dialog).findByLabelText('Renda bruta (R$, opcional)'),
      '6.500',
    );
    const travel = within(dialog).getByLabelText('Viagens (%)');
    await userEvent.clear(travel);
    await userEvent.type(travel, '2,5');
    expect(within(dialog).getByText('Soma: 97,5%. Sem destino: 2,5%')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar orçamento' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(`${base}/2026-10`, 'http://api.test'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            netIncomeCents: 500_000,
            grossIncomeCents: 650_000,
            expensesBp: 6_000,
            investmentsBp: 2_000,
            emergencyReserveBp: 1_500,
            travelBp: 250,
          }),
        }),
      ),
    );
    expect(await screen.findByText('Orçamento salvo')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Back where it was opened.
    expect(screen.getByRole('button', { name: 'Editar orçamento' })).toHaveFocus();
  });

  it('refuses percentages adding up to more than 100% before calling the API', async () => {
    const fetchMock = mockBudget();
    renderApp(`/espacos/${houseId}/painel`);

    const dialog = await openDialog();
    const travel = await within(dialog).findByLabelText('Viagens (%)');
    await userEvent.clear(travel);
    await userEvent.type(travel, '10');
    expect(within(dialog).getByText('Soma: 105%')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar orçamento' }));

    expect(
      await within(dialog).findByText('A soma dos percentuais não pode passar de 100%.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('opens from the empty expenses goal to set the net income', async () => {
    const noIncome: Budget = { ...inherited, netIncomeCents: 0 };
    mockBudget(monthRoutes(noIncome));
    renderApp(`/espacos/${houseId}/painel`);

    await userEvent.click(await screen.findByRole('button', { name: 'Definir renda' }));

    const dialog = await screen.findByRole('dialog', { name: 'Orçamento de outubro de 2026' });
    expect(await within(dialog).findByLabelText('Renda líquida (R$)')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Definir renda' })).toHaveFocus();
  });

  it('another competência starts fresh, with its own values', async () => {
    mockBudget(
      monthRoutes({
        ...inherited,
        period: '2026-11',
        netIncomeCents: 520_000,
        inheritedFrom: '2026-10',
      }),
    );
    renderApp(`/espacos/${houseId}/painel`);

    let dialog = await openDialog();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Cancelar' }));
    await userEvent.click(
      screen.getByRole('link', { name: 'Próxima competência: novembro de 2026' }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar orçamento' }));
    dialog = await screen.findByRole('dialog', { name: 'Orçamento de novembro de 2026' });

    expect(await within(dialog).findByLabelText('Renda líquida (R$)')).toHaveValue('5.200,00');
  });

  it('offers no way to change it to a VIEWER', async () => {
    mockBudget({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });

    renderApp(`/espacos/${houseId}/painel`);

    expect(
      await screen.findByRole('region', { name: 'Orçamento por destino' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar orçamento' })).not.toBeInTheDocument();
  });

  it('sends the old budget address to the dashboard of the same competência', async () => {
    mockBudget(monthRoutes({ ...inherited, period: '2026-11' }));

    const { router } = renderApp(`/espacos/${houseId}/orcamento?competencia=2026-11`);

    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/painel`);
    expect(router.state.location.search).toBe('?competencia=2026-11');
  });
});
