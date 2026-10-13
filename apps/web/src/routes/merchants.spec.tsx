import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data (ADR 0019).
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}/merchants`;
const page = `/espacos/${houseId}/estabelecimentos`;

const merchant = (n: number, name: string, fields: object = {}) => ({
  id: `01920000-0000-7000-8000-0000000006${String(n).padStart(2, '0')}`,
  name,
  archived: false,
  inUse: false,
  ...fields,
});
const acougue = merchant(1, 'Açougue Central', { inUse: true });
const netflix = merchant(2, 'Netflix');
const padaria = merchant(3, 'Padaria Pão Quente', { archived: true, inUse: true });
const banca = merchant(4, 'Banca do Zé', { archived: true });
const merchants = [acougue, banca, netflix, padaria];

function mockMerchants(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET /api/workspaces/${houseId}`]: { body: house },
    [`GET ${base}`]: { body: merchants },
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

async function openActions(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Ações de ${name}` }));
  return screen.findByRole('menu');
}

/** The items of a merchant's menu, closing it afterwards. */
async function menuOf(name: string) {
  const menu = await openActions(name);
  const items = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
  await userEvent.keyboard('{Escape}');
  return items;
}

async function choose(name: string, action: string) {
  const menu = await openActions(name);
  await userEvent.click(within(menu).getByRole('menuitem', { name: action }));
}

const rowsOf = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('MerchantsPage', () => {
  it('lists the active ones and the archived apart, deleting only an archived one never used', async () => {
    mockMerchants();
    renderApp(page);

    const region = await screen.findByRole('region', { name: 'Ativos' });
    const [active, archived] = within(region).getAllByRole('list');
    expect(rowsOf(active!)).toEqual(['Açougue Central', 'Netflix']);
    expect(within(region).getByRole('heading', { name: 'Arquivados' })).toBeInTheDocument();
    expect(rowsOf(archived!)).toEqual(['Banca do Zé', 'Padaria Pão Quente']);
    expect(await menuOf('Netflix')).toEqual(['Renomear', 'Arquivar']);
    expect(await menuOf('Banca do Zé')).toEqual(['Reativar', 'Excluir']);
    // In use: it stays on the transactions that name it.
    expect(await menuOf('Padaria Pão Quente')).toEqual(['Reativar']);
  });

  it('finds a merchant by name, ignoring accents', async () => {
    mockMerchants();
    renderApp(page);

    await userEvent.type(await screen.findByLabelText('Buscar estabelecimento'), 'acougue');

    const region = screen.getByRole('region', { name: 'Ativos' });
    expect(region).toHaveTextContent('1 de 2 estabelecimentos');
    expect(rowsOf(within(region).getByRole('list'))).toEqual(['Açougue Central']);
  });

  it('adds a merchant, showing the API reason for a name already used', async () => {
    const fetchMock = mockMerchants({
      [`POST ${base}`]: {
        status: 409,
        body: {
          code: 'MERCHANT_EXISTS',
          message:
            'Já existe um estabelecimento com esse nome. Se ele estiver arquivado, reative-o.',
        },
      },
    });
    renderApp(page);

    await userEvent.click(await screen.findByRole('button', { name: 'Novo estabelecimento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo estabelecimento' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'netflix');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    await expectCall(fetchMock, base, {
      method: 'POST',
      body: JSON.stringify({ name: 'netflix' }),
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Já existe um estabelecimento com esse nome.',
    );
  });

  it('renames, archives and reactivates', async () => {
    const fetchMock = mockMerchants({
      [`PATCH ${base}/${netflix.id}`]: { body: { ...netflix, name: 'Netflix BR' } },
      [`PATCH ${base}/${banca.id}`]: { body: { ...banca, archived: false } },
    });
    renderApp(page);

    await choose('Netflix', 'Renomear');
    const dialog = await screen.findByRole('dialog', { name: 'Renomear estabelecimento' });
    const field = within(dialog).getByLabelText('Novo nome para Netflix');
    await userEvent.clear(field);
    await userEvent.type(field, 'Netflix BR');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await expectCall(fetchMock, `${base}/${netflix.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Netflix BR' }),
    });
    expect(await screen.findByText('Estabelecimento renomeado')).toBeInTheDocument();

    await choose('Netflix', 'Arquivar');
    await expectCall(fetchMock, `${base}/${netflix.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    await choose('Banca do Zé', 'Reativar');
    await expectCall(fetchMock, `${base}/${banca.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: false }),
    });
  });

  it('asks for confirmation, naming the merchant, before deleting', async () => {
    const fetchMock = mockMerchants({
      [`DELETE ${base}/${banca.id}`]: { status: 204, body: null },
    });
    renderApp(page);

    await choose('Banca do Zé', 'Excluir');
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir Banca do Zé?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await expectCall(fetchMock, `${base}/${banca.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Estabelecimento excluído')).toBeInTheDocument();
  });

  it('says where merchants come from when there is none yet', async () => {
    mockMerchants({ [`GET ${base}`]: { body: [] } });
    renderApp(page);

    expect(await screen.findByText('Nenhum estabelecimento ainda.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar estabelecimento')).not.toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockMerchants({ [`GET /api/workspaces/${houseId}`]: { body: { ...house, role: 'VIEWER' } } });
    renderApp(page);

    expect(await screen.findByRole('region', { name: 'Ativos' })).toHaveTextContent('Netflix');
    expect(screen.queryByRole('button', { name: 'Novo estabelecimento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ações de/ })).not.toBeInTheDocument();
  });
});
