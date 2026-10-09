import { TEMPLATE_HEADERS } from '@financas/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import writeXlsxFile from 'write-excel-file/browser';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data only (ADR 0019): the spreadsheets are built here, none lives in the repository.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}`;
const page = `/espacos/${houseId}/importar`;

const category = (n: number, name: string, type: 'CREDIT' | 'DEBIT') => ({
  id: `01920000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  name,
  type,
  archived: false,
});
const salario = category(1, 'Salário', 'CREDIT');
const mercado = category(2, 'Mercado', 'DEBIT');
const moradia = category(3, 'Moradia', 'DEBIT');

const previousImport = {
  id: '01920000-0000-7000-8000-000000000301',
  transactionCount: 12,
  firstPeriod: '2026-06',
  lastPeriod: '2026-07',
  createdAt: '2026-10-07T12:12:00.000Z',
  createdBy: { name: 'Maria Exemplo' },
};

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A filled-in template, as a file the person would choose. */
async function spreadsheet(rows: (string | number | Date | null)[][]) {
  const blob = await writeXlsxFile([
    { sheet: 'Lançamentos', data: [[...TEMPLATE_HEADERS], ...rows], dateFormat: 'dd/mm/yyyy' },
  ]).toBlob();
  return new File([blob], 'minha-planilha.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const salaryRow = [
  '2026-08',
  'Crédito',
  'Salário',
  'Salário',
  5200,
  day('2026-08-05'),
  day('2026-08-05'),
  null,
];
const groceryRow = ['2026-08', 'Débito', 'Supermercado', 'mercado', 640.35, null, null, null];

function mockImport(overrides: Record<string, { status?: number; body: unknown }> = {}) {
  return mockApi({
    'GET /api/me': { body: verifiedUser },
    [`GET ${base}`]: { body: house },
    [`GET ${base}/categories`]: { body: [salario, mercado, moradia] },
    [`GET ${base}/imports`]: { body: [] },
    ...overrides,
  });
}

async function choose(file: File) {
  await userEvent.upload(await screen.findByLabelText('Escolher planilha (.xlsx)'), file);
}

function expectCall(fetchMock: ReturnType<typeof mockApi>, path: string, init: object) {
  return vi.waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, 'http://api.test'),
      expect.objectContaining(init),
    ),
  );
}

describe('ImportPage', () => {
  it('previews the rows by competência and imports the checked ones', async () => {
    const fetchMock = mockImport({
      [`POST ${base}/imports`]: {
        status: 201,
        body: {
          ...previousImport,
          transactionCount: 2,
          firstPeriod: '2026-08',
          lastPeriod: '2026-08',
        },
      },
    });
    const { router } = renderApp(page);

    // Numbered steps: choosing the file opens the review, it imports nothing yet.
    expect(await screen.findByRole('heading', { name: '1. Baixe o modelo' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '2. Escolha a planilha preenchida' }),
    ).toBeInTheDocument();
    await choose(await spreadsheet([salaryRow, groceryRow]));
    expect(await screen.findByRole('heading', { name: '3. Revise e importe' })).toBeInTheDocument();

    const august = await screen.findByRole('region', { name: 'agosto de 2026' });
    expect(august).toHaveTextContent('Créditos R$ 5.200,00, débitos R$ 640,35');
    expect(within(august).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 lançamentos' }));

    await expectCall(fetchMock, `${base}/imports`, {
      method: 'POST',
      body: JSON.stringify({
        transactions: [
          {
            type: 'CREDIT',
            description: 'Salário',
            notes: null,
            categoryId: salario.id,
            amountCents: 520_000,
            period: '2026-08',
            dueDate: '2026-08-05',
            settledAt: '2026-08-05',
          },
          {
            type: 'DEBIT',
            description: 'Supermercado',
            notes: null,
            categoryId: mercado.id,
            amountCents: 64_035,
            period: '2026-08',
            dueDate: null,
            settledAt: null,
          },
        ],
      }),
    });
    expect(await screen.findByText('2 lançamentos importados')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/espacos/${houseId}/lancamentos`),
    );
    expect(router.state.location.search).toBe('?competencia=2026-08');
  });

  it('leaves out a row that is unchecked', async () => {
    mockImport();
    renderApp(page);
    await choose(await spreadsheet([salaryRow, groceryRow]));

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Importar Supermercado' }));

    expect(screen.getByRole('button', { name: 'Importar 1 lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'agosto de 2026' })).toHaveTextContent(
      'Créditos R$ 5.200,00, débitos R$ 0,00',
    );
  });

  it('asks to match a category the workspace does not have', async () => {
    mockImport();
    renderApp(page);
    await choose(
      await spreadsheet([
        salaryRow,
        ['2026-08', 'Débito', 'Feira do sábado', 'Feira', 85, null, null, null],
      ]),
    );

    const matching = await screen.findByRole('region', { name: 'Categorias' });
    expect(screen.getByRole('button', { name: 'Importar 1 lançamento' })).toBeInTheDocument();
    await userEvent.click(
      within(matching).getByRole('combobox', { name: /^Feira \(débito, 1 linha\)/ }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Mercado' }));

    expect(
      await screen.findByRole('button', { name: 'Importar 2 lançamentos' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Categorias' })).not.toBeInTheDocument();
  });

  it('fixes a row with an error and brings it into the import', async () => {
    mockImport();
    renderApp(page);
    await choose(
      await spreadsheet([
        salaryRow,
        ['2026-08', 'Débito', 'Conta de luz', 'Moradia', 0, null, null, null],
      ]),
    );

    const row = (await screen.findByText('Conta de luz')).closest('li')!;
    expect(row).toHaveTextContent('Sem valor');
    expect(screen.getByRole('button', { name: 'Importar 1 lançamento' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir Conta de luz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Linha 3 da planilha' });
    await userEvent.type(within(dialog).getByLabelText('Valor (R$)'), '189,90');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar na prévia' }));

    expect(
      await screen.findByRole('button', { name: 'Importar 2 lançamentos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Importar Conta de luz' })).toBeChecked();
  });

  it('explains when the file is not a spreadsheet, even named .xlsx', async () => {
    mockImport();
    renderApp(page);

    // The field only accepts .xlsx; a renamed text file still gets through it.
    await choose(
      new File(['Descrição;Valor'], 'planilha.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    expect(
      await screen.findByText(
        'Não foi possível ler o arquivo. Use a planilha modelo, salva em .xlsx.',
      ),
    ).toBeInTheDocument();
  });

  it('warns when the competências were already imported', async () => {
    mockImport({
      [`GET ${base}/imports`]: { body: [{ ...previousImport, lastPeriod: '2026-08' }] },
    });
    renderApp(page);

    await choose(await spreadsheet([salaryRow]));

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Importar de novo duplica os lançamentos',
    );
  });

  it('lists the previous imports and undoes one after confirming', async () => {
    const fetchMock = mockImport({
      [`GET ${base}/imports`]: { body: [previousImport] },
      [`DELETE ${base}/imports/${previousImport.id}`]: { status: 204, body: null },
    });
    renderApp(page);

    const previous = await screen.findByRole('region', { name: 'Importações anteriores' });
    expect(previous).toHaveTextContent('12 lançamentos, junho de 2026 a julho de 2026');
    expect(previous).toHaveTextContent('por Maria Exemplo');
    await userEvent.click(within(previous).getByRole('button', { name: /^Desfazer a importação/ }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('inclusive os que foram editados ou efetivados depois');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Desfazer importação' }));

    await expectCall(fetchMock, `${base}/imports/${previousImport.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Importação desfeita')).toBeInTheDocument();
  });

  it('is read-only for a VIEWER', async () => {
    mockImport({
      [`GET ${base}`]: { body: { ...house, role: 'VIEWER' } },
      [`GET ${base}/imports`]: { body: [previousImport] },
    });
    renderApp(page);

    expect(
      await screen.findByText('Quem só visualiza o espaço não importa planilhas.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Escolher planilha (.xlsx)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Desfazer/ })).not.toBeInTheDocument();
  });
});
