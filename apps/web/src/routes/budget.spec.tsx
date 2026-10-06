import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/budget`;

const inherited = {
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

function mockBudget(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: fakeUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET ${base}/2026-10`]: { body: inherited },
    ...overrides,
  });
}

describe('BudgetPage', () => {
  beforeEach(() => {
    // Only Date is faked: "today" is Oct 15th, 2026 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows where the configuration came from and what each percentage means in reais', async () => {
    mockBudget();

    renderApp(`/espacos/${houseId}/orcamento`);

    expect(await screen.findByText('outubro de 2026')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Herdado de setembro de 2026. Ao salvar, outubro de 2026 passa a ter o seu próprio orçamento.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Renda líquida (R$)')).toHaveValue('5.000,00');
    expect(screen.getByLabelText('Renda bruta (R$, opcional)')).toHaveValue('');
    expect(screen.getByLabelText('Despesas (%)')).toHaveValue('60');
    expect(screen.getByText('R$ 3.000,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 250,00')).toBeInTheDocument();
    expect(screen.getByText('Soma: 100%')).toBeInTheDocument();
  });

  it('explains the defaults when no competência was ever saved', async () => {
    mockBudget({
      [`GET ${base}/2026-11`]: {
        body: {
          ...inherited,
          period: '2026-11',
          netIncomeCents: 0,
          source: 'DEFAULT',
          inheritedFrom: null,
        },
      },
    });

    renderApp(`/espacos/${houseId}/orcamento?competencia=2026-11`);

    expect(
      await screen.findByText(/^Percentuais padrão: nenhuma competência até aqui/),
    ).toBeInTheDocument();
  });

  it('saves the whole configuration for the competência', async () => {
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
    renderApp(`/espacos/${houseId}/orcamento`);

    await userEvent.type(await screen.findByLabelText('Renda bruta (R$, opcional)'), '6.500');
    const travel = screen.getByLabelText('Viagens (%)');
    await userEvent.clear(travel);
    await userEvent.type(travel, '2,5');
    expect(screen.getByText('Soma: 97,5%. Sem destino: 2,5%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar para outubro de 2026' }));

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
  });

  it('refuses percentages adding up to more than 100% before calling the API', async () => {
    const fetchMock = mockBudget();
    renderApp(`/espacos/${houseId}/orcamento`);

    const travel = await screen.findByLabelText('Viagens (%)');
    await userEvent.clear(travel);
    await userEvent.type(travel, '10');
    expect(screen.getByText('Soma: 105%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar para outubro de 2026' }));

    expect(
      await screen.findByText('A soma dos percentuais não pode passar de 100%.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('another competência starts fresh, with its own values', async () => {
    mockBudget({
      [`PUT ${base}/2026-10`]: { body: { ...inherited, source: 'SAVED', inheritedFrom: null } },
      [`GET ${base}/2026-11`]: {
        body: {
          ...inherited,
          period: '2026-11',
          netIncomeCents: 520_000,
          inheritedFrom: '2026-10',
        },
      },
    });
    renderApp(`/espacos/${houseId}/orcamento`);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Salvar para outubro de 2026' }),
    );
    expect(await screen.findByText('Orçamento salvo')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('link', { name: 'Próxima competência: novembro de 2026' }),
    );

    expect(await screen.findByLabelText('Renda líquida (R$)')).toHaveValue('5.200,00');
    expect(
      screen.getByRole('button', { name: 'Salvar para novembro de 2026' }),
    ).toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockBudget({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });

    renderApp(`/espacos/${houseId}/orcamento`);

    expect(await screen.findByText('Herdado de setembro de 2026.')).toBeInTheDocument();
    expect(screen.getByText('Reserva de emergência').nextSibling).toHaveTextContent('15%');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('is reached from the sections of the workspace', async () => {
    mockBudget({ [`GET /api/workspaces/${houseId}/members`]: { body: [] } });
    const { router } = renderApp(`/espacos/${houseId}`);

    await userEvent.click(await screen.findByRole('link', { name: 'Orçamento' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/orcamento`);
    expect(await screen.findByRole('heading', { name: 'Orçamento' })).toBeInTheDocument();
  });
});
