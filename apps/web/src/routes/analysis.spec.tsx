import { previousRange } from '@financas/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubPrefersDark } from '@/test/match-media';
import { mockApi, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019). "Today" is Oct 15th, 2026: the default range is May to October.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'VIEWER' };
const base = `/api/workspaces/${houseId}`;
const salario = {
  id: '01920000-0000-7000-8000-000000000101',
  name: 'Salário',
  type: 'CREDIT',
  archived: false,
};
const mercado = {
  id: '01920000-0000-7000-8000-000000000102',
  name: 'Mercado',
  type: 'DEBIT',
  archived: false,
};
const aluguel = {
  id: '01920000-0000-7000-8000-000000000103',
  name: 'Aluguel',
  type: 'DEBIT',
  archived: false,
};

const row = (
  period: string,
  type: 'CREDIT' | 'DEBIT',
  categoryId: string,
  plannedCents: number,
  settledCents = plannedCents,
) => ({ period, type, categoryId, plannedCents, settledCents });

const rows = [
  row('2026-09', 'CREDIT', salario.id, 500_000),
  row('2026-09', 'DEBIT', aluguel.id, 180_000),
  row('2026-09', 'DEBIT', mercado.id, 60_000),
  row('2026-10', 'CREDIT', salario.id, 500_000, 0),
  row('2026-10', 'DEBIT', aluguel.id, 180_000, 0),
  row('2026-10', 'DEBIT', mercado.id, 70_000, 30_000),
];

function mockAnalysis(
  from: string,
  to: string,
  body: { from: string; to: string; rows: unknown[] } = { from, to, rows },
  before: unknown[] = [],
  categories: unknown[] = [salario, aluguel, mercado],
) {
  // The range right before, compared with (empty unless a test gives it rows).
  const previous = previousRange(body.from, body.to);
  const routes: Record<string, { status?: number; body: unknown }> = {
    [`GET ${base}/analysis?from=${previous.from}&to=${previous.to}`]: {
      body: { ...previous, rows: before },
    },
    'GET /api/me': { body: verifiedUser },
    'GET /api/workspaces': { body: [house] },
    [`GET ${base}`]: { body: house },
    [`GET ${base}/categories`]: { body: categories },
    [`GET ${base}/analysis`]: { body },
  };
  return mockApi(routes);
}

/** The query string of the analysis requests, in order, without the ranges compared with. */
function requestedRanges(fetchMock: ReturnType<typeof mockApi>) {
  const urls = fetchMock.mock.calls
    .map(([url]) => new URL(url))
    .filter((url) => url.pathname.endsWith('/analysis'));
  const compared = new Set(
    urls.map((url) => {
      const range = previousRange(
        url.searchParams.get('from') ?? '',
        url.searchParams.get('to') ?? '',
      );
      return `?from=${range.from}&to=${range.to}`;
    }),
  );
  return urls.map((url) => url.search).filter((search) => !compared.has(search));
}

/** The table of the monthly values, as rows of text. */
async function monthlyTable() {
  await userEvent.click(await screen.findByRole('button', { name: 'Ver como tabela' }));
  return within(screen.getByRole('table', { name: 'Valores por competência' }))
    .getAllByRole('row')
    .map((tr) => nbsp(tr.textContent));
}

// Intl separates "R$" from the number with a non-breaking space.
function nbsp(text: string | null | undefined) {
  return text?.replaceAll(String.fromCharCode(0xa0), ' ');
}

describe('AnalysisPage', () => {
  beforeEach(() => {
    // Only Date is faked; timers stay real.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps applications apart from spending, as on the dashboard (ADR 0047)', async () => {
    const investimentos = {
      id: '01920000-0000-7000-8000-000000000104',
      name: 'Investimentos',
      type: 'DEBIT',
      archived: false,
      destinationId: '01920000-0000-7000-8000-0000000000d2',
    };
    const withApplication = [...rows, row('2026-10', 'DEBIT', investimentos.id, 50_000)];
    mockAnalysis(
      '2026-05',
      '2026-10',
      { from: '2026-05', to: '2026-10', rows: withApplication },
      [],
      [salario, aluguel, mercado, investimentos],
    );

    renderApp(`/espacos/${houseId}/analise`);

    const stat = async (label: string) =>
      nbsp((await screen.findByText(label, { selector: 'dt' })).nextElementSibling?.textContent);
    // Spending is the expenses only; the application is shown apart.
    expect(await stat('Gasto')).toBe('R$ 4.900,00');
    expect(await stat('Aplicado')).toBe('R$ 500,00');
    // The balance is after every debit, as on the dashboard.
    expect(await stat('Saldo do período')).toBe('R$ 4.600,00');
    const ranking = await screen.findByRole('region', { name: 'Gastos por categoria' });
    expect(within(ranking).queryByText('Investimentos')).not.toBeInTheDocument();
  });

  it('shows a tapped month against the one before', async () => {
    mockAnalysis('2026-05', '2026-10');
    renderApp(`/espacos/${houseId}/analise`);

    await screen.findByText('Saldo do período');
    // The tap targets cover each month; October is the last one.
    const months = document.querySelectorAll('svg rect[fill="transparent"]');
    fireEvent.pointerUp(months[months.length - 1]!);

    // September's balance was R$ 2.600,00, October's R$ 2.500,00.
    expect(
      await screen.findByText('Saldo do mês: R$ 100,00 a menos que em setembro', {
        normalizer: (text) => nbsp(text) ?? '',
      }),
    ).toBeInTheDocument();
  });

  it('compares with the range of the same length right before', async () => {
    // May to October against November to April: R$ 4.900,00 spent now, R$ 4.000,00 before.
    mockAnalysis('2026-05', '2026-10', undefined, [
      row('2026-03', 'CREDIT', salario.id, 1_000_000),
      row('2026-03', 'DEBIT', aluguel.id, 400_000),
    ]);

    renderApp(`/espacos/${houseId}/analise`);

    const gasto = await screen.findByText('Gasto', { selector: 'dt' });
    expect(nbsp(gasto.nextElementSibling?.textContent)).toBe(
      'R$ 4.900,00R$ 900,00 a mais que nos 6 meses anteriores.',
    );
    const recebido = screen.getByText('Recebido', { selector: 'dt' });
    expect(nbsp(recebido.nextElementSibling?.textContent)).toContain(
      'O mesmo que nos 6 meses anteriores.',
    );
  });

  it('shows the last 6 months by default: totals, and every month even without transactions', async () => {
    const fetchMock = mockAnalysis('2026-05', '2026-10');

    renderApp(`/espacos/${houseId}/analise`);

    expect(await screen.findByText('Últimos 6 meses, previsto')).toBeInTheDocument();
    const balance = await screen.findByText('Saldo do período');
    expect(nbsp(balance.nextElementSibling?.textContent)).toBe('R$ 5.100,00');
    expect(requestedRanges(fetchMock)).toEqual(['?from=2026-05&to=2026-10']);
    expect(await monthlyTable()).toEqual([
      'CompetênciaCréditosDébitosSaldo do mês',
      'maio de 2026R$ 0,00R$ 0,00R$ 0,00',
      'junho de 2026R$ 0,00R$ 0,00R$ 0,00',
      'julho de 2026R$ 0,00R$ 0,00R$ 0,00',
      'agosto de 2026R$ 0,00R$ 0,00R$ 0,00',
      'setembro de 2026R$ 5.000,00R$ 2.400,00R$ 2.600,00',
      'outubro de 2026R$ 5.000,00R$ 2.500,00R$ 2.500,00',
    ]);
  });

  it('reads the filters from the address: 12 months, settled, debits only', async () => {
    const fetchMock = mockAnalysis('2025-11', '2026-10');

    renderApp(`/espacos/${houseId}/analise?periodo=12&visao=efetivado&tipo=debitos`);

    expect(await screen.findByText('Últimos 12 meses, efetivado, só débitos')).toBeInTheDocument();
    const spent = await screen.findByText('Gasto no período');
    expect(nbsp(spent.nextElementSibling?.textContent)).toBe('R$ 2.700,00');
    expect(requestedRanges(fetchMock)).toEqual(['?from=2025-11&to=2026-10']);
    const table = await monthlyTable();
    expect(table[0]).toBe('CompetênciaDébitos');
    expect(table.at(-1)).toBe('outubro de 2026R$ 300,00');
  });

  it('accepts a range of one’s own, and ignores an invalid one', async () => {
    const fetchMock = mockAnalysis('2026-01', '2026-03', {
      from: '2026-01',
      to: '2026-03',
      rows: [],
    });

    renderApp(`/espacos/${houseId}/analise?de=2026-01&ate=2026-03`);

    expect(
      await screen.findByText('De janeiro de 2026 a março de 2026, previsto'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Nenhum lançamento de janeiro de 2026 a março de 2026.'),
    ).toBeInTheDocument();
    expect(requestedRanges(fetchMock)).toEqual(['?from=2026-01&to=2026-03']);
  });

  it('changes the filters on the phone, keeping them in the address', async () => {
    const fetchMock = mockAnalysis('2026-05', '2026-10');
    const { router } = renderApp(`/espacos/${houseId}/analise`);

    await userEvent.click(await screen.findByRole('button', { name: 'Filtros' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filtros' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Efetivado' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Débitos' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Período' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Últimos 3 meses' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ver resultado' }));

    expect(new URLSearchParams(router.state.location.search).toString()).toBe(
      'periodo=3&visao=efetivado&tipo=debitos',
    );
    expect(await screen.findByText('Últimos 3 meses, efetivado, só débitos')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(requestedRanges(fetchMock)).toContain('?from=2026-08&to=2026-10'),
    );
  });

  it('keeps only the chosen categories, without asking the API again', async () => {
    const fetchMock = mockAnalysis('2026-05', '2026-10');
    const { router } = renderApp(`/espacos/${houseId}/analise?tipo=debitos`);

    // One filter on (only debits): the button says so before the sheet is opened.
    await userEvent.click(await screen.findByRole('button', { name: 'Filtros (1)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filtros' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Categorias' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Mercado' }));
    await userEvent.keyboard('{Escape}');

    expect(router.state.location.search).toContain(`categorias=${mercado.id}`);
    expect(
      await screen.findByText('Últimos 6 meses, previsto, só débitos, Mercado'),
    ).toBeInTheDocument();
    const spent = screen.getByText('Gasto no período');
    expect(nbsp(spent.nextElementSibling?.textContent)).toBe('R$ 1.300,00');
    expect(requestedRanges(fetchMock)).toHaveLength(1);
  });

  it('shows the filters on the page from md, with no button', async () => {
    stubPrefersDark(false, { desktop: true });
    mockAnalysis('2026-05', '2026-10');

    renderApp(`/espacos/${houseId}/analise`);

    const filters = await screen.findByRole('region', { name: 'Filtros' });
    expect(await within(filters).findByRole('radiogroup', { name: 'Visão' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filtros' })).not.toBeInTheDocument();
  });

  it('ranks where the money went, with share and monthly average', async () => {
    mockAnalysis('2026-05', '2026-10');
    renderApp(`/espacos/${houseId}/analise`);

    const ranking = await screen.findByRole('region', { name: 'Gastos por categoria' });
    const rows = within(ranking)
      .getAllByRole('button')
      .map((button) => nbsp(button.textContent));
    expect(rows).toEqual([
      'AluguelR$ 3.600,0073,47% do totalmédia de R$ 600,00 por mês',
      'MercadoR$ 1.300,0026,53% do totalmédia de R$ 216,67 por mês',
    ]);
  });

  it('ranks the credits when the type filter asks for them', async () => {
    mockAnalysis('2026-05', '2026-10');
    renderApp(`/espacos/${houseId}/analise?tipo=creditos`);

    const ranking = await screen.findByRole('region', { name: 'Recebidos por categoria' });
    expect(within(ranking).getByRole('button', { name: /^Salário/ })).toBeInTheDocument();
  });

  it('opens a category month by month, in the address, and closes back to it', async () => {
    mockAnalysis('2026-05', '2026-10');
    const { router } = renderApp(`/espacos/${houseId}/analise`);

    const ranking = await screen.findByRole('region', { name: 'Gastos por categoria' });
    const mercadoRow = within(ranking).getByRole('button', { name: /^Mercado/ });
    await userEvent.click(mercadoRow);

    expect(router.state.location.search).toBe(`?categoria=${mercado.id}`);
    const detail = await screen.findByRole('dialog', { name: 'Mercado' });
    expect(detail).toHaveTextContent('Últimos 6 meses, previsto.');
    expect(nbsp(within(detail).getByText('Média por mês').nextElementSibling?.textContent)).toBe(
      'R$ 216,67',
    );
    const lastMonth = within(detail).getAllByRole('row').at(-1);
    expect(nbsp(lastMonth?.textContent)).toBe('outubro de 2026R$ 700,00');

    await userEvent.keyboard('{Escape}');
    await vi.waitFor(() => expect(router.state.location.search).toBe(''));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /^Mercado/ })).toHaveFocus());
  });

  it('folds the smallest categories into "Outras", and shows them all on request', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `01920000-0000-7000-8000-0000000003${String(i).padStart(2, '0')}`,
      name: `Despesa ${i + 1}`,
      type: 'DEBIT',
      archived: false,
    }));
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/workspaces': { body: [house] },
      [`GET ${base}`]: { body: house },
      [`GET ${base}/categories`]: { body: many },
      [`GET ${base}/analysis`]: {
        body: {
          from: '2026-05',
          to: '2026-10',
          rows: many.map((category, i) => row('2026-10', 'DEBIT', category.id, (10 - i) * 10_000)),
        },
      },
    });
    renderApp(`/espacos/${houseId}/analise`);

    const ranking = await screen.findByRole('region', { name: 'Gastos por categoria' });
    expect(within(ranking).getAllByRole('button', { name: /^Despesa/ })).toHaveLength(7);
    expect(within(ranking).getByText('Outras 3 categorias')).toBeInTheDocument();
    await userEvent.click(
      within(ranking).getByRole('button', { name: 'Ver todas as 10 categorias' }),
    );

    expect(within(ranking).getAllByRole('button', { name: /^Despesa/ })).toHaveLength(10);
    expect(within(ranking).queryByText('Outras 3 categorias')).not.toBeInTheDocument();
  });

  it('is a tab of the bottom bar on the phone (ADR 0046)', async () => {
    mockApi({
      'GET /api/me': { body: verifiedUser },
      'GET /api/workspaces': { body: [house] },
      [`GET ${base}`]: { body: house },
      [`GET ${base}/members`]: { body: [] },
      [`GET ${base}/categories`]: { body: [] },
      [`GET ${base}/analysis`]: { body: { from: '2026-05', to: '2026-10', rows: [] } },
    });
    const { router } = renderApp(`/espacos/${houseId}`);

    const sections = await screen.findByRole('navigation', { name: 'Seções do espaço' });
    await userEvent.click(within(sections).getByRole('link', { name: 'Análise' }));

    expect(router.state.location.pathname).toBe(`/espacos/${houseId}/analise`);
    expect(await screen.findByRole('heading', { name: 'Análise' })).toBeInTheDocument();
  });
});
