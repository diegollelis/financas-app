import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubPrefersDark } from '@/test/match-media';
import { mockApi, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019). "Today" is Oct 15th, 2026: this month is October.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'VIEWER' };
const base = `/api/workspaces/${houseId}`;

function renderTransactions(search: string) {
  mockApi({
    'GET /api/me': { body: verifiedUser },
    'GET /api/workspaces': { body: [house] },
    [`GET ${base}`]: { body: house },
    [`GET ${base}/categories`]: { body: [] },
    [`GET ${base}/transactions`]: { body: [] },
  });
  return renderApp(`/espacos/${houseId}/lancamentos${search}`);
}

const openPicker = async (name: RegExp | string = /^Escolher competência/) => {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Escolher competência' });
};

describe('PeriodNav', () => {
  beforeEach(() => {
    // Only Date is faked; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps previous and next, and tells when the month on screen is not this one', async () => {
    renderTransactions('?competencia=2026-03');

    const nav = await screen.findByRole('navigation', { name: 'Competência' });
    expect(
      within(nav).getByRole('link', { name: 'Competência anterior: fevereiro de 2026' }),
    ).toHaveAttribute('href', `/espacos/${houseId}/lancamentos?competencia=2026-02`);
    expect(
      within(nav).getByRole('button', {
        name: 'Escolher competência: março de 2026, fora do mês atual',
      }),
    ).toBeInTheDocument();
    // The row never changes shape: no "Mês atual" in it.
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
  });

  it('jumps to a month of another year, closing the picker', async () => {
    const { router } = renderTransactions('?competencia=2026-03');

    const picker = await openPicker();
    // Opens on the year on screen, with its month marked.
    expect(within(picker).getByText('2026')).toBeInTheDocument();
    expect(within(picker).getByRole('link', { name: 'mar, março de 2026' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(
      within(picker).getByRole('link', { name: 'out, outubro de 2026, mês atual' }),
    ).toBeInTheDocument();

    await userEvent.click(within(picker).getByRole('button', { name: 'Ano anterior: 2025' }));
    await userEvent.click(within(picker).getByRole('link', { name: 'mar, março de 2025' }));

    expect(router.state.location.search).toBe('?competencia=2025-03');
    expect(await screen.findByText('março de 2025')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('goes back to this month from the picker, and offers it only when away', async () => {
    const { router } = renderTransactions('?competencia=2024-05');

    let picker = await openPicker();
    await userEvent.click(within(picker).getByRole('link', { name: 'Ir para o mês atual' }));

    expect(router.state.location.search).toBe('?competencia=2026-10');
    picker = await openPicker('Escolher competência: outubro de 2026');
    expect(
      within(picker).queryByRole('link', { name: 'Ir para o mês atual' }),
    ).not.toBeInTheDocument();
  });

  it('opens as a balloon from md, with the same months', async () => {
    stubPrefersDark(false, { desktop: true });
    const { router } = renderTransactions('');

    const picker = await openPicker();
    await userEvent.click(within(picker).getByRole('link', { name: 'jan, janeiro de 2026' }));

    expect(router.state.location.search).toBe('?competencia=2026-01');
  });
});
