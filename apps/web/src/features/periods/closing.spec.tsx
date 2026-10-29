import { summarizePeriod } from '@financas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, testBudget, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fechamento do mês (ADR 0063). Fictitious data (ADR 0019); "today" is Oct 15th, 2026.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const ws = `/api/workspaces/${houseId}`;
const september = '2026-09';
const closingPath = `${ws}/periods/${september}`;

const closedBy = {
  id: '01920000-0000-7000-8000-0000000009c1',
  period: september,
  closedAt: '2026-10-02T13:00:00.000Z',
  closedBy: 'Maria Exemplo',
  reopenedAt: null,
  reopenedBy: null,
  reopenReason: null,
};
const reopenedOnce = {
  ...closedBy,
  id: '01920000-0000-7000-8000-0000000009c0',
  closedAt: '2026-10-01T13:00:00.000Z',
  reopenedAt: '2026-10-01T18:00:00.000Z',
  reopenedBy: 'João Exemplo',
  reopenReason: 'Faltou a conta de luz',
};
const openState = (pending: unknown[] = [], history: unknown[] = []) => ({
  period: september,
  closing: null,
  history,
  pending,
});
const closedState = {
  period: september,
  closing: closedBy,
  history: [closedBy, reopenedOnce],
  pending: [],
};

const budget = testBudget({
  period: september,
  netIncomeCents: 500_000,
  source: 'INHERITED',
  inheritedFrom: '2026-08',
  basisPoints: [6_000, 5_000, 3_000, 2_000],
});

function mockDashboard(
  closing: unknown,
  routes: Record<string, { status?: number; body: unknown }> = {},
) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET ${ws}`]: { body: house },
    [`GET ${ws}/summary/${september}`]: { body: summarizePeriod([], budget, '2026-10-15') },
    [`GET ${closingPath}/closing`]: { body: closing },
    ...routes,
  });
}

const card = () => screen.findByRole('region', { name: 'Fechamento do mês' });

describe('month closing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists what keeps the month from closing, with a link to the pending ones', async () => {
    mockDashboard(
      openState([
        {
          id: '01920000-0000-7000-8000-000000000201',
          type: 'DEBIT',
          description: 'Aluguel',
          amountCents: 150_000,
          dueDate: '2026-09-10',
        },
      ]),
    );

    renderApp(`/espacos/${houseId}/painel?competencia=${september}`);

    const closing = await card();
    expect(
      await within(closing).findByText('Falta 1 lançamento para fechar setembro de 2026.'),
    ).toBeVisible();
    expect(within(closing).getByText('Aluguel')).toBeVisible();
    expect(within(closing).getByRole('link', { name: 'Ver pendentes' })).toHaveAttribute(
      'href',
      `/espacos/${houseId}/lancamentos?competencia=${september}&situacao=pendentes`,
    );
    expect(within(closing).queryByRole('button', { name: 'Fechar mês' })).not.toBeInTheDocument();
  });

  it('closes the month after saying what locks, the inherited budget included', async () => {
    const fetchMock = mockDashboard(openState(), {
      [`POST ${closingPath}/close`]: { body: closedState },
    });

    renderApp(`/espacos/${houseId}/painel?competencia=${september}`);

    const closing = await card();
    await userEvent.click(await within(closing).findByRole('button', { name: 'Fechar mês' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Fechar setembro de 2026?' });
    expect(within(dialog).getByText(/orçamento herdado de agosto de 2026/)).toBeVisible();
    expect(within(dialog).getByText(/marcar "Nem renda nem gasto"/)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar mês' }));

    expect(await screen.findByText('Mês fechado')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).endsWith(`${closingPath}/close`) && init?.method === 'POST',
      ),
    ).toBe(true);
    expect(
      await within(closing).findByText('Fechado em 02/10/2026 por Maria Exemplo.'),
    ).toBeVisible();
  });

  it('shows a closed month locked, with its reopenings, and reopens it with a reason', async () => {
    const fetchMock = mockDashboard(closedState, {
      [`POST ${closingPath}/reopen`]: {
        body: openState(
          [],
          [
            {
              ...closedBy,
              reopenedAt: '2026-10-15T15:00:00.000Z',
              reopenedBy: 'Maria Exemplo',
              reopenReason: 'Correção',
            },
            reopenedOnce,
          ],
        ),
      },
    });

    renderApp(`/espacos/${houseId}/painel?competencia=${september}`);

    const closing = await card();
    expect(
      await within(closing).findByText('Fechado em 02/10/2026 por Maria Exemplo.'),
    ).toBeVisible();
    expect(
      within(closing).getByText(
        'Fechado em 01/10/2026 por Maria Exemplo. Reaberto em 01/10/2026 por João Exemplo: Faltou a conta de luz',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Escolher mês: setembro de 2026.*mês fechado/i }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Editar orçamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerenciar metas' })).not.toBeInTheDocument();

    await userEvent.click(within(closing).getByRole('button', { name: 'Reabrir mês' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reabrir setembro de 2026' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reabrir mês' }));
    expect(await within(dialog).findByText('Diga por que o mês vai ser reaberto.')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Correção');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reabrir mês' }));

    expect(await screen.findByText('Mês reaberto')).toBeVisible();
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/reopen'))!;
    expect(JSON.parse(init?.body as string)).toEqual({ reason: 'Correção' });
  });

  it('keeps the transactions of a closed month to be seen, but a part of a loan with no due date', async () => {
    const salaryCategory = {
      id: '01920000-0000-7000-8000-000000000101',
      name: 'Salário',
      type: 'CREDIT',
      archived: false,
    };
    const loanCategory = {
      id: '01920000-0000-7000-8000-000000000104',
      name: 'Empréstimo feito',
      type: 'CREDIT',
      archived: false,
      neutral: true,
    };
    const transaction = (n: number, fields: Record<string, unknown>) => ({
      id: `01920000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`,
      type: 'CREDIT',
      notes: null,
      period: september,
      dueDate: null,
      settledAt: null,
      ...fields,
    });
    mockApi({
      'GET /api/me': { body: verifiedUser },
      [`GET ${ws}`]: { body: house },
      [`GET ${ws}/people`]: { body: [] },
      [`GET ${ws}/merchants`]: { body: [] },
      [`GET ${ws}/categories`]: { body: [salaryCategory, loanCategory] },
      [`GET ${ws}/categories/hints`]: { body: { merchants: [], descriptions: [] } },
      [`GET ${ws}/transactions`]: {
        body: [
          transaction(1, {
            description: 'Salário de setembro',
            categoryId: salaryCategory.id,
            amountCents: 500_000,
            settledAt: '2026-09-05',
          }),
          transaction(2, {
            description: 'Ana me deve',
            categoryId: loanCategory.id,
            amountCents: 50_000,
          }),
        ],
      },
      [`GET ${closingPath}/closing`]: { body: closedState },
    });

    renderApp(`/espacos/${houseId}/lancamentos?competencia=${september}`);

    expect(
      await screen.findByText('setembro de 2026 está fechado: os lançamentos só podem ser vistos.'),
    ).toBeVisible();
    expect(await screen.findByText('Salário de setembro')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Novo lançamento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Receber/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ações de Salário de setembro' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ações de Ana me deve' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Recebimento parcial']);
  });
});
