import { formatCents } from '@financas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// "Pagar a Ana" (ADR 0065). Fictitious data only (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/people`;
const page = `/espacos/${houseId}/pessoas`;

const bonus = {
  id: '01920000-0000-7000-8000-000000000101',
  name: 'Bônus',
  type: 'CREDIT',
  archived: false,
};
const market = {
  id: '01920000-0000-7000-8000-000000000102',
  name: 'Mercado',
  type: 'DEBIT',
  archived: false,
};
const refund = {
  id: '01920000-0000-7000-8000-000000000103',
  name: 'Reembolso',
  type: 'CREDIT',
  archived: false,
};

const person = (n: number, name: string, fields: Record<string, unknown> = {}) => ({
  id: `01920000-0000-7000-8000-0000000003${String(n).padStart(2, '0')}`,
  name,
  memberUserId: null,
  isMember: false,
  archived: false,
  receivableCents: 0,
  payableCents: 0,
  ...fields,
});
const ana = person(1, 'Ana', { receivableCents: 20_000, payableCents: 40_000 });
const bruno = person(2, 'Bruno', { receivableCents: 30_000 });

const transaction = (n: number, fields: Record<string, unknown>) => ({
  id: `01920000-0000-7000-8000-0000000004${String(n).padStart(2, '0')}`,
  type: 'DEBIT',
  notes: null,
  categoryId: market.id,
  period: '2026-10',
  dueDate: null,
  settledAt: null,
  personId: ana.id,
  paymentMethod: 'MEAL_VOUCHER',
  ...fields,
});
const groceries = transaction(1, { description: 'Mercado Exemplo', amountCents: 25_000 });
const bakery = transaction(2, { description: 'Padaria Exemplo', amountCents: 15_000 });
const cinema = transaction(3, {
  type: 'CREDIT',
  description: 'Ingressos do cinema',
  categoryId: refund.id,
  amountCents: 20_000,
  paymentMethod: null,
});
const draft = { debits: [groceries, bakery], credits: [cinema], rewardCategoryId: bonus.id };

function mockSettlement(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET ${base}`]: { body: [ana, bruno] },
    [`GET /api/workspaces/${houseId}/categories`]: { body: [bonus, market, refund] },
    [`GET /api/workspaces/${houseId}/merchants`]: { body: [] },
    [`GET ${base}/${ana.id}/settlement`]: { body: draft },
    ...overrides,
  });
}

// Intl separates "R$" from the number with a non-breaking space.
const text = (element: HTMLElement) =>
  element.textContent?.replaceAll(String.fromCharCode(0xa0), ' ');

async function openSettlement() {
  await userEvent.click(await screen.findByRole('button', { name: 'Pagar a Ana' }));
  return screen.findByRole('dialog', { name: 'Pagar a Ana' });
}

describe('Pagar a Ana', () => {
  beforeEach(() => {
    // Only Date is faked: "today" is Oct 30th, 2026 in São Paulo; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is offered only for someone you owe now', async () => {
    mockSettlement();
    renderApp(page);

    expect(await screen.findByRole('button', { name: 'Pagar a Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar a Bruno' })).not.toBeInTheDocument();
    // Also in words in the row's menu, as the row's action is in Lançamentos.
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Ana' }));
    expect(await screen.findByRole('menuitem', { name: 'Pagar a Ana' })).toBeInTheDocument();
  });

  it('pays the purchases at once, less the reward in percent', async () => {
    const fetchMock = mockSettlement({
      [`POST ${base}/${ana.id}/settlements`]: {
        status: 201,
        body: {
          id: '01920000-0000-7000-8000-000000000501',
          personId: ana.id,
          settledAt: '2026-10-30',
          debitCents: 40_000,
          creditCents: 0,
          reward: null,
          transactionIds: [groceries.id, bakery.id],
        },
      },
    });
    renderApp(page);

    const dialog = await openSettlement();
    // The purchases checked, what she owes unchecked: offsetting is a choice.
    expect(within(dialog).getByRole('checkbox', { name: /Mercado Exemplo/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /Ingressos do cinema/ })).not.toBeChecked();
    expect(text(dialog)).toContain('Você transfereR$ 400,00');

    await userEvent.type(within(dialog).getByLabelText('Recompensa (opcional)'), '10');

    expect(text(dialog)).toContain('R$ 40,00 das compras marcadas.');
    expect(text(dialog)).toContain('Recompensa− R$ 40,00Você transfereR$ 360,00');
    // The category of the last reward, or "Bônus", comes chosen.
    expect(
      within(dialog).getByRole('combobox', { name: 'Categoria da recompensa' }),
    ).toHaveTextContent('Bônus');
    await userEvent.click(
      within(dialog).getByRole('button', { name: `Pagar ${formatCents(36_000)} (2 lançamentos)` }),
    );

    expect(await screen.findByText('Acerto com Ana registrado: 2 lançamentos')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(`${base}/${ana.id}/settlements`, 'http://api.test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          transactionIds: [groceries.id, bakery.id],
          settledAt: '2026-10-30',
          reward: { amountCents: 4_000, categoryId: bonus.id },
        }),
      }),
    );
  });

  it('offsets what she owes when checked', async () => {
    mockSettlement();
    renderApp(page);

    const dialog = await openSettlement();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Ingressos do cinema/ }));

    expect(text(dialog)).toContain('Compensado− R$ 200,00Você transfereR$ 200,00');
    expect(
      within(dialog).getByRole('button', { name: `Pagar ${formatCents(20_000)} (3 lançamentos)` }),
    ).toBeEnabled();
  });

  it('says when she would transfer to you, and refuses a reward over the purchases', async () => {
    mockSettlement();
    renderApp(page);

    const dialog = await openSettlement();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Mercado Exemplo/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Ingressos do cinema/ }));

    expect(text(dialog)).toContain('Ana te transfereR$ 50,00');
    expect(
      within(dialog).getByRole('button', {
        name: `Receber ${formatCents(5_000)} de Ana (2 lançamentos)`,
      }),
    ).toBeEnabled();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'R$' }));
    await userEvent.type(within(dialog).getByLabelText('Recompensa (opcional)'), '200');

    expect(dialog).toHaveTextContent('A recompensa passa do total das compras.');
    expect(within(dialog).getByRole('button', { name: /^Receber/ })).toBeDisabled();
  });

  it('is not offered to a VIEWER', async () => {
    mockSettlement({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });
    renderApp(page);

    await screen.findByRole('region', { name: 'Pessoas' });
    expect(screen.queryByRole('button', { name: 'Pagar a Ana' })).not.toBeInTheDocument();
  });
});
