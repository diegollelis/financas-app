import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/cards`;
const page = `/espacos/${houseId}/cartoes`;

const card = (n: number, name: string, fields: object = {}) => ({
  id: `01920000-0000-7000-8000-0000000008${String(n).padStart(2, '0')}`,
  name,
  bank: 'NUBANK',
  functions: ['CREDIT', 'DEBIT'],
  closingDay: 27,
  dueDay: 4,
  archived: false,
  inUse: false,
  ...fields,
});
const exemplo = card(1, 'Cartão Exemplo', { inUse: true });
const debito = card(2, 'Débito Exemplo', {
  bank: null,
  functions: ['DEBIT'],
  closingDay: null,
  dueDay: null,
});
const antigo = card(3, 'Cartão Antigo', { archived: true, inUse: true });
const semUso = card(4, 'Cartão Sem Uso', { archived: true });
const cards = [antigo, exemplo, semUso, debito];

function mockCards(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET ${base}`]: { body: cards },
    ...overrides,
  });
}

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, init: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining(init),
    ),
  );
}

/** The items of a card's menu, closing it afterwards. */
async function menuOf(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Ações de ${name}` }));
  const menu = await screen.findByRole('menu');
  const items = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
  await userEvent.keyboard('{Escape}');
  return items;
}

const rowsOf = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

async function openNewCard() {
  await userEvent.click(await screen.findByRole('button', { name: 'Novo cartão' }));
  return screen.findByRole('dialog', { name: 'Novo cartão' });
}

describe('CardsPage', () => {
  // "Today" is Oct 28th, 2026: only Date is faked, timers stay real.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-28T12:00:00-03:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the cards with their functions, bank and bill days, the archived apart', async () => {
    mockCards();
    renderApp(page);

    const region = await screen.findByRole('region', { name: 'Ativos' });
    const [active, archived] = within(region).getAllByRole('list');
    expect(rowsOf(active!)).toEqual([
      'Cartão ExemploCréditoDébitoNubank. Fecha no dia 27 e vence no dia 4.',
      'Débito ExemploDébitoOutro banco.',
    ]);
    expect(rowsOf(archived!)).toEqual([
      'Cartão AntigoCréditoDébitoNubank. Fecha no dia 27 e vence no dia 4.',
      'Cartão Sem UsoCréditoDébitoNubank. Fecha no dia 27 e vence no dia 4.',
    ]);
    expect(within(region).getByText('2 cartões')).toBeInTheDocument();

    // By the bank too, ignoring case.
    await userEvent.type(screen.getByLabelText('Buscar cartão'), 'outro');
    expect(rowsOf(within(region).getAllByRole('list')[0]!)).toEqual([
      'Débito ExemploDébitoOutro banco.',
    ]);
    expect(within(region).getByText('1 de 2 cartões')).toBeInTheDocument();
  });

  it('offers to edit or archive an active card, and to delete only an archived one unused', async () => {
    mockCards();
    renderApp(page);

    // "Pagar fatura" only on a card with Crédito (ADR 0062).
    expect(await menuOf('Cartão Exemplo')).toEqual(['Editar', 'Pagar fatura', 'Arquivar']);
    expect(await menuOf('Débito Exemplo')).toEqual(['Editar', 'Arquivar']);
    expect(await menuOf('Cartão Antigo')).toEqual(['Reativar']);
    expect(await menuOf('Cartão Sem Uso')).toEqual(['Reativar', 'Excluir']);
  });

  it('adds a card, asking the bill days only with Crédito', async () => {
    const created = card(5, 'Cartão Novo');
    const fetchMock = mockCards({ [`POST ${base}`]: { status: 201, body: created } });
    renderApp(page);

    const dialog = await openNewCard();
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Cartão Novo');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Débito' }));
    expect(within(dialog).queryByLabelText('Fecha no dia')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Crédito e débito' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar cartão' }));
    expect(await within(dialog).findAllByText('Use um dia de 1 a 31.')).toHaveLength(2);

    await userEvent.type(within(dialog).getByLabelText('Fecha no dia'), '27');
    await userEvent.type(within(dialog).getByLabelText('Vence no dia'), '4');
    // After the closing on the 27th: today's purchase goes to December's bill.
    expect(
      within(dialog).getByText(
        'Uma compra hoje, 28/10/2026, entra na fatura que vence em 04/12/2026.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar cartão' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cartão Novo',
        bank: 'NUBANK',
        functions: ['CREDIT', 'DEBIT'],
        closingDay: 27,
        dueDay: 4,
      }),
    });
    expect(await screen.findByText('Cartão adicionado')).toBeInTheDocument();
  });

  it('offers the first card the transactions with no card, both groups checked (ADR 0062 note)', async () => {
    const created = card(5, 'Cartão Novo');
    const fetchMock = mockCards({
      [`GET ${base}`]: { body: [] },
      [`POST ${base}`]: { status: 201, body: created },
      [`GET ${base}/unlinked`]: { body: { credit: 23, debit: 41 } },
      [`POST ${base}/${created.id}/link`]: { body: { linked: 64 } },
    });
    renderApp(page);

    expect(await screen.findByText('Nenhum cartão ainda.')).toBeInTheDocument();
    const form = await openNewCard();
    await userEvent.type(within(form).getByLabelText('Nome'), 'Cartão Novo');
    await userEvent.type(within(form).getByLabelText('Fecha no dia'), '27');
    await userEvent.type(within(form).getByLabelText('Vence no dia'), '4');
    await userEvent.click(within(form).getByRole('button', { name: 'Adicionar cartão' }));

    const offer = await screen.findByRole('dialog', { name: 'Ligar lançamentos ao Cartão Novo?' });
    expect(
      within(offer).getByRole('checkbox', { name: '23 no Crédito, ainda a pagar' }),
    ).toBeChecked();
    expect(within(offer).getByRole('checkbox', { name: '41 no Débito' })).toBeChecked();
    await userEvent.click(within(offer).getByRole('checkbox', { name: '41 no Débito' }));
    await userEvent.click(within(offer).getByRole('button', { name: 'Ligar 23 lançamentos' }));

    await expectCall(fetchMock, `${base}/${created.id}/link`, {
      method: 'POST',
      body: JSON.stringify({ functions: ['CREDIT'] }),
    });
    expect(await screen.findByText('64 lançamentos ligados ao Cartão Novo')).toBeInTheDocument();
  });

  it('lets a VIEWER read the cards but not change them', async () => {
    mockCards({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });
    renderApp(page);

    expect(await screen.findByText('Cartão Exemplo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo cartão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ações de/ })).not.toBeInTheDocument();
  });
});
