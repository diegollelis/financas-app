import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, verifiedUser } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data only (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/people`;
const page = `/espacos/${houseId}/pessoas`;

const person = (n: number, name: string, fields: Record<string, unknown> = {}) => ({
  id: `01920000-0000-7000-8000-0000000003${String(n).padStart(2, '0')}`,
  name,
  memberUserId: null,
  archived: false,
  receivableCents: 0,
  payableCents: 0,
  ...fields,
});
const ana = person(1, 'Ana', { receivableCents: 15_000, payableCents: 40_000 });
const bruno = person(2, 'Bruno', { receivableCents: 30_000 });
const carlos = person(3, 'Carlos');
const dani = person(4, 'Dani', { archived: true });

function mockPeople(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET ${base}`]: { body: [ana, bruno, carlos, dani] },
    ...overrides,
  });
}

// Intl separates "R$" from the number with a non-breaking space.
const text = (element: HTMLElement) =>
  element.textContent?.replaceAll(String.fromCharCode(0xa0), ' ');

describe('PeoplePage', () => {
  it('shows what each person owes you and what you owe them', async () => {
    mockPeople();
    renderApp(page);

    const list = await screen.findByRole('region', { name: 'Pessoas' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map(text)).toEqual([
      expect.stringContaining('AnaVer lançamentosTe deve R$ 150,00Você deve R$ 400,00'),
      expect.stringContaining('BrunoVer lançamentosTe deve R$ 300,00'),
      expect.stringContaining('CarlosVer lançamentosEm dia'),
    ]);
    expect(screen.getByRole('region', { name: 'Arquivadas' })).toHaveTextContent('Dani');
  });

  it('adds a person by name', async () => {
    const fetchMock = mockPeople({ [`POST ${base}`]: { status: 201, body: person(5, 'Edu') } });
    renderApp(page);

    await userEvent.type(await screen.findByLabelText('Nova pessoa'), 'Edu');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('Edu adicionada')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(base, 'http://api.test'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Edu' }) }),
    );
  });

  it("opens a person's transactions of every month, and settles a pending one there", async () => {
    const fetchMock = mockPeople({
      [`PATCH /api/workspaces/${houseId}/transactions/01920000-0000-7000-8000-000000000401`]: {
        body: {
          id: '01920000-0000-7000-8000-000000000401',
          type: 'CREDIT',
          description: 'Ana: parte de Jantar',
          notes: null,
          categoryId: '01920000-0000-7000-8000-000000000101',
          amountCents: 15_000,
          period: '2026-10',
          dueDate: null,
          settledAt: '2026-10-15',
          personId: ana.id,
        },
      },
      [`GET ${base}/${ana.id}/transactions`]: {
        body: [
          {
            id: '01920000-0000-7000-8000-000000000401',
            type: 'CREDIT',
            description: 'Ana: parte de Jantar',
            notes: null,
            categoryId: '01920000-0000-7000-8000-000000000101',
            amountCents: 15_000,
            period: '2026-10',
            dueDate: null,
            settledAt: null,
            personId: ana.id,
          },
          {
            id: '01920000-0000-7000-8000-000000000402',
            type: 'DEBIT',
            description: 'Casa de praia',
            notes: null,
            categoryId: '01920000-0000-7000-8000-000000000102',
            amountCents: 40_000,
            period: '2026-07',
            dueDate: null,
            settledAt: '2026-07-20',
            personId: ana.id,
          },
        ],
      },
    });
    renderApp(page);

    await userEvent.click(await screen.findByRole('button', { name: 'Ver lançamentos com Ana' }));

    const history = await screen.findByRole('dialog', { name: 'Lançamentos com Ana' });
    const items = within(history).getAllByRole('listitem');
    expect(text(items[0]!)).toContain('Ana: parte de Jantaroutubro de 2026A receberPendente');
    expect(text(items[1]!)).toContain('Casa de praiajulho de 2026A pagarPago');
    // Only the pending one can be marked, with the same settling as "Efetivar".
    expect(within(items[1]!).queryByRole('button')).not.toBeInTheDocument();
    await userEvent.click(
      within(items[0]!).getByRole('button', {
        name: 'Marcar como recebido (Ana: parte de Jantar)',
      }),
    );

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(
          `/api/workspaces/${houseId}/transactions/01920000-0000-7000-8000-000000000401`,
          'http://api.test',
        ),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringMatching(/^\{"settledAt":"\d{4}-\d{2}-\d{2}"\}$/) as string,
        }),
      ),
    );
    expect(await screen.findByText('Marcado como recebido')).toBeInTheDocument();
  });

  it('says so when the history cannot load, without the workspace "not found" notice', async () => {
    // Someone else deleted the person meanwhile, or the API is still being deployed.
    mockPeople({
      [`GET ${base}/${ana.id}/transactions`]: { status: 404, body: { message: 'Not Found' } },
    });
    renderApp(page);

    await userEvent.click(await screen.findByRole('button', { name: 'Ver lançamentos com Ana' }));

    const history = await screen.findByRole('dialog', { name: 'Lançamentos com Ana' });
    expect(await within(history).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os lançamentos desta pessoa agora.',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('archives someone, and deletes only from the archived', async () => {
    const fetchMock = mockPeople({
      [`PATCH ${base}/${carlos.id}`]: { body: { ...carlos, archived: true } },
      [`DELETE ${base}/${dani.id}`]: { status: 204, body: null },
    });
    renderApp(page);

    await userEvent.click(await screen.findByRole('button', { name: 'Ações de Carlos' }));
    expect(screen.queryByRole('menuitem', { name: 'Excluir' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Arquivar' }));
    expect(await screen.findByText('Carlos arquivada')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ações de Dani' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir Dani?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        new URL(`${base}/${dani.id}`, 'http://api.test'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('is read-only for a VIEWER', async () => {
    mockPeople({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });
    renderApp(page);

    expect(
      await screen.findByRole('button', { name: 'Ver lançamentos com Ana' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nova pessoa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações de Ana' })).not.toBeInTheDocument();
  });
});
