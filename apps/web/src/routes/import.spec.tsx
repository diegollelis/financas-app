import { TEMPLATE_HEADERS } from '@financas/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import writeXlsxFile from 'write-excel-file/browser';
import { verifiedUser, mockApi } from '@/test/mock-api';
import { renderApp } from '@/test/render';

// Fictitious data only (ADR 0019): the spreadsheets are built here, none lives in the repository.
const houseId = '01920000-0000-7000-8000-000000000002';
const house = { id: houseId, name: 'Casa', isPersonal: false, role: 'EDITOR' };
const base = `/api/workspaces/${houseId}`;
const page = `/espacos/${houseId}/importar/planilha`;
const statementPage = `/espacos/${houseId}/importar/extrato`;

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

/** The template before the "Pessoa" column (ADR 0040 note): still read, columns go by title. */
const EARLIER_HEADERS = TEMPLATE_HEADERS.filter((title) => title !== 'Pessoa');

/** A filled-in template, as a file the person would choose. */
async function spreadsheet(
  rows: (string | number | Date | null)[][],
  headers: readonly string[] = EARLIER_HEADERS,
) {
  const blob = await writeXlsxFile([
    { sheet: 'Lançamentos', data: [[...headers], ...rows], dateFormat: 'dd/mm/yyyy' },
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
  null,
  null,
  5200,
  null,
  day('2026-08-05'),
  day('2026-08-05'),
  null,
];
const groceryRow = [
  '2026-08',
  'Débito',
  'Supermercado',
  'mercado',
  null,
  null,
  640.35,
  null,
  null,
  null,
  null,
];

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
    expect(august).toHaveTextContent('Entradas R$ 5.200,00, saídas R$ 640,35');
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
            occurredOn: null,
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
            occurredOn: null,
          },
        ],
        // The "Origem" it starts with (ADR 0055 note).
        label: 'Planilha modelo',
        // What it brings (ADR 0060): the template has no bank.
        kind: 'TEMPLATE',
        bank: null,
      }),
    });
    expect(await screen.findByText('2 lançamentos importados')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe(`/espacos/${houseId}/lancamentos`),
    );
    expect(router.state.location.search).toBe('?competencia=2026-08');
  });

  it('shows the merchant of a row and sends it by name (ADR 0053)', async () => {
    const fetchMock = mockImport();
    renderApp(page);

    await choose(
      await spreadsheet([
        [
          '2026-08',
          'Saída',
          'Supermercado',
          'mercado',
          'Mercado Bom Preço',
          null,
          640.35,
          null,
          null,
        ],
      ]),
    );

    const august = await screen.findByRole('region', { name: 'agosto de 2026' });
    expect(within(august).getByRole('listitem')).toHaveTextContent('Mercado Bom Preço');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 1 lançamento' }));

    await expectCall(fetchMock, `${base}/imports`, {
      method: 'POST',
      body: expect.stringContaining('"merchantName":"Mercado Bom Preço"') as unknown,
    });
  });

  it('shows the person of a row and sends it by name (ADR 0040 note)', async () => {
    const fetchMock = mockImport();
    renderApp(page);

    await choose(
      await spreadsheet(
        [
          [
            '2026-08',
            'Saída',
            'Conta de luz',
            'Moradia',
            null,
            'Ana Exemplo',
            null,
            189.9,
            null,
            null,
            null,
            null,
          ],
        ],
        TEMPLATE_HEADERS,
      ),
    );

    const august = await screen.findByRole('region', { name: 'agosto de 2026' });
    expect(within(august).getByRole('listitem')).toHaveTextContent('A pagar para Ana Exemplo');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 1 lançamento' }));

    await expectCall(fetchMock, `${base}/imports`, {
      method: 'POST',
      body: expect.stringContaining('"personName":"Ana Exemplo"') as unknown,
    });
  });

  it('shows the payment method of a row and sends it (ADR 0054)', async () => {
    const fetchMock = mockImport();
    renderApp(page);

    await choose(
      await spreadsheet([
        ['2026-08', 'Saída', 'Supermercado', 'mercado', null, 'crédito', 640.35, null, null],
      ]),
    );

    const august = await screen.findByRole('region', { name: 'agosto de 2026' });
    expect(within(august).getByRole('listitem')).toHaveTextContent('Crédito');
    await userEvent.click(screen.getByRole('button', { name: 'Importar 1 lançamento' }));

    await expectCall(fetchMock, `${base}/imports`, {
      method: 'POST',
      body: expect.stringContaining('"paymentMethod":"CREDIT_CARD"') as unknown,
    });
  });

  it('leaves out a row that is unchecked', async () => {
    mockImport();
    renderApp(page);
    await choose(await spreadsheet([salaryRow, groceryRow]));

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Importar Supermercado' }));

    expect(screen.getByRole('button', { name: 'Importar 1 lançamento' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'agosto de 2026' })).toHaveTextContent(
      'Entradas R$ 5.200,00, saídas R$ 0,00',
    );
  });

  it('asks to match a category the workspace does not have', async () => {
    mockImport();
    renderApp(page);
    await choose(
      await spreadsheet([
        salaryRow,
        ['2026-08', 'Débito', 'Feira do sábado', 'Feira', null, null, 85, null, null, null],
      ]),
    );

    const matching = await screen.findByRole('region', { name: 'Categorias novas' });
    expect(screen.getByRole('button', { name: 'Importar 1 lançamento' })).toBeInTheDocument();
    await userEvent.click(
      within(matching).getByRole('combobox', { name: /^Feira \(saída, 1 linha\)/ }),
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Mercado' }));

    expect(
      await screen.findByRole('button', { name: 'Importar 2 lançamentos' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Categorias novas' })).not.toBeInTheDocument();
  });

  it('creates a category the workspace does not have, on import', async () => {
    const feira = category(4, 'Feira', 'DEBIT');
    const fetchMock = mockImport({
      [`POST ${base}/categories`]: { status: 201, body: feira },
      [`POST ${base}/imports`]: {
        status: 201,
        body: { ...previousImport, firstPeriod: '2026-08' },
      },
    });
    renderApp(page);
    await choose(
      await spreadsheet([
        salaryRow,
        ['2026-08', 'Débito', 'Feira do sábado', 'Feira', null, null, 85, null, null, null],
      ]),
    );

    const matching = await screen.findByRole('region', { name: 'Categorias novas' });
    await userEvent.click(within(matching).getByRole('button', { name: 'Criar “Feira”' }));

    // Not created yet: the row says so, and it is ready.
    const august = screen.getByRole('region', { name: 'agosto de 2026' });
    expect(august).toHaveTextContent('Feira (nova)');
    expect(fetchMock).not.toHaveBeenCalledWith(
      new URL(`${base}/categories`, 'http://api.test'),
      expect.objectContaining({ method: 'POST' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Importar 2 lançamentos' }));

    // Created first, then the import with its id.
    await expectCall(fetchMock, `${base}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Feira', type: 'DEBIT' }),
    });
    await expectCall(fetchMock, `${base}/imports`, {
      method: 'POST',
      body: expect.stringContaining(`"categoryId":"${feira.id}"`) as unknown,
    });
  });

  it('fixes a row with an error and brings it into the import', async () => {
    mockImport();
    renderApp(page);
    await choose(
      await spreadsheet([
        salaryRow,
        ['2026-08', 'Débito', 'Conta de luz', 'Moradia', null, null, 0, null, null, null],
      ]),
    );

    const row = (await screen.findByText('Conta de luz')).closest('li')!;
    expect(row).toHaveTextContent('Sem valor');
    expect(screen.getByRole('button', { name: 'Importar 1 lançamento' })).toBeInTheDocument();
    // The check before importing: what goes in, adding up, and what does not.
    expect(screen.getByRole('status').textContent?.replaceAll(' ', ' ')).toBe(
      'Prontas1 de 2SaídasR$ 0,00Entradas+ R$ 5.200,00Com problema1',
    );
    // Only the rows with a problem on screen; the others stay in the import.
    await userEvent.click(screen.getByRole('radio', { name: 'Com problemas' }));
    expect(screen.queryByRole('checkbox', { name: 'Importar Salário' })).not.toBeInTheDocument();
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

    const previous = await screen.findByRole('region', { name: 'Planilhas importadas' });
    // Without a due date, it came from the template.
    expect(within(previous).getByRole('listitem')).toHaveTextContent(
      /^Planilha12 lançamentos, junho de 2026 a julho de 2026/,
    );
    expect(previous).toHaveTextContent('por Maria Exemplo');
    await userEvent.click(within(previous).getByRole('button', { name: /^Ações da importação/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Desfazer importação' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      'inclusive os que foram editados ou marcados como pagos ou recebidos depois',
    );
    // Nothing was built on it: no list of what else changes.
    expect(confirm).not.toHaveTextContent('Também muda');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Desfazer importação' }));

    await expectCall(fetchMock, `${base}/imports/${previousImport.id}`, { method: 'DELETE' });
    expect(await screen.findByText('Importação desfeita')).toBeInTheDocument();
  });

  it('says what else undoing changes, and offers to remove it from the history instead (ADR 0060 note)', async () => {
    const fetchMock = mockImport({
      [`GET ${base}/imports`]: {
        body: [
          {
            ...previousImport,
            dependents: {
              recurrenceMonths: 3,
              splitTransactions: 1,
              installmentAdoptions: 0,
              plansUntil: '2027-05',
            },
          },
        ],
      },
      [`DELETE ${base}/imports/${previousImport.id}?keepTransactions=true`]: {
        status: 204,
        body: null,
      },
    });
    renderApp(page);

    const previous = await screen.findByRole('region', { name: 'Planilhas importadas' });
    const actions = within(previous).getByRole('button', { name: /^Ações da importação/ });
    await userEvent.click(actions);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Desfazer importação' }));
    const undo = await screen.findByRole('alertdialog');
    expect(undo).toHaveTextContent(
      '3 lançamentos viraram meses de recorrência: esses meses não voltam.',
    );
    expect(undo).toHaveTextContent(
      'Os parcelamentos criados por ela saem inteiros, com as parcelas até maio de 2027.',
    );
    expect(undo).toHaveTextContent(
      '1 lançamento foi dividido: as partes das outras pessoas ficam soltas.',
    );
    await userEvent.click(within(undo).getByRole('button', { name: 'Cancelar' }));

    await userEvent.click(actions);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover do histórico' }));
    const forget = await screen.findByRole('alertdialog');
    expect(forget).toHaveTextContent('Os lançamentos e os parcelamentos dela ficam como estão');
    await userEvent.click(within(forget).getByRole('button', { name: 'Remover do histórico' }));

    await expectCall(fetchMock, `${base}/imports/${previousImport.id}?keepTransactions=true`, {
      method: 'DELETE',
    });
    expect(await screen.findByText('Importação removida do histórico')).toBeInTheDocument();
  });

  it('opens the bank statements by default, and moves between the two pages (ADR 0060)', async () => {
    mockImport({
      [`GET ${base}/imports`]: {
        body: [
          previousImport,
          {
            ...previousImport,
            id: '01920000-0000-7000-8000-000000000902',
            kind: 'CARD_STATEMENT',
            bank: 'NUBANK',
            label: 'Fatura Nubank',
          },
        ],
      },
    });
    const { router } = renderApp(`/espacos/${houseId}/importar`);

    await vi.waitFor(() => expect(router.state.location.pathname).toBe(statementPage));
    const tabs = await screen.findByRole('navigation', { name: 'O que importar' });
    expect(within(tabs).getByRole('link', { name: 'Extrato do banco' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Each page lists its own imports.
    const statements = await screen.findByRole('region', { name: 'Extratos importados' });
    expect(within(statements).getAllByRole('listitem')).toHaveLength(1);

    await userEvent.click(within(tabs).getByRole('link', { name: 'Planilha modelo' }));

    expect(router.state.location.pathname).toBe(page);
    const sheets = await screen.findByRole('region', { name: 'Planilhas importadas' });
    expect(within(sheets).getAllByRole('listitem')).toHaveLength(1);
  });

  it('is read-only for a VIEWER', async () => {
    mockImport({
      [`GET ${base}`]: { body: { ...house, role: 'VIEWER' } },
      [`GET ${base}/imports`]: { body: [previousImport] },
    });
    renderApp(page);

    expect(
      await screen.findByText('Quem só visualiza o espaço não importa arquivos.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Escolher planilha (.xlsx)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Desfazer/ })).not.toBeInTheDocument();
  });

  describe('a Nubank card statement (ADR 0055)', () => {
    const pizzaria = {
      id: '01920000-0000-7000-8000-000000000601',
      name: 'Pizzaria Exemplo',
      archived: false,
      inUse: true,
      aliases: [{ id: '01920000-0000-7000-8000-000000000701', alias: 'Ifd*Pizzaria Exemplo' }],
    };
    // An invented statement in the bank's format.
    const csv = [
      'date,title,amount',
      '2026-10-03,Ifd*Pizzaria Exemplo,"86,50"',
      '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
      '2026-10-10,Pagamento recebido,"- 2.345,10"',
    ].join('\n');
    const statementFile = (name = 'Nubank_2026-11-04.csv') =>
      new File([csv], name, { type: 'text/csv' });
    const mockStatement = (overrides: Record<string, { status?: number; body: unknown }> = {}) =>
      mockImport({
        [`GET ${base}/merchants`]: { body: [pizzaria] },
        [`GET ${base}/installments`]: { body: [] },
        [`GET ${base}/transactions`]: { body: [] },
        [`GET ${base}/categories/hints`]: {
          body: {
            merchants: [{ merchantId: pizzaria.id, type: 'DEBIT', categoryId: mercado.id }],
            descriptions: [],
            paymentMethods: { merchants: [], descriptions: [] },
          },
        },
        [`POST ${base}/imports`]: {
          status: 201,
          body: { ...previousImport, transactionCount: 2, firstPeriod: '2026-11' },
        },
        ...overrides,
      });
    const chooseStatement = async (file = statementFile()) => {
      await userEvent.upload(await screen.findByLabelText('Escolher fatura (.csv)'), file);
    };
    /** The due date is typed at the top of the review (ADR 0055 note). */
    const dueDateField = () => screen.findByLabelText('Vencimento da fatura', { exact: true });
    const typeDueDate = async (date = '2026-11-04') => {
      await userEvent.type(await dueDateField(), date);
    };

    it('reviews the statement, learns an alias and imports with its origin and due date', async () => {
      const fetchMock = mockStatement();
      renderApp(statementPage);

      await chooseStatement();

      // The review opens right away, in the month of the latest purchase (ADR 0055 note).
      const october = await screen.findByRole('region', { name: 'outubro de 2026' });
      expect(screen.getByLabelText('Mês de referência')).toHaveValue('2026-10');
      const [pizza, unknown, payment] = within(october).getAllByRole('listitem');
      // By the alias, named by the merchant, with the bank's text to check.
      expect(pizza).toHaveTextContent('Pizzaria Exemplo');
      expect(pizza).toHaveTextContent('No extrato: Ifd*Pizzaria Exemplo');
      expect(payment).toHaveTextContent('Pagamento da fatura anterior: não é uma entrada.');
      expect(within(payment!).getByRole('checkbox')).not.toBeChecked();
      expect(screen.getByLabelText('Origem (opcional)')).toHaveValue('Fatura Nubank');

      // A line without a category picks it on its card.
      await userEvent.click(
        within(unknown!).getByRole('combobox', { name: 'Categoria de Spaceship.Com* Gypcbz' }),
      );
      await userEvent.click(await screen.findByRole('option', { name: 'Moradia' }));
      // Ready without a merchant: only a quiet mark. The due date is still missing.
      expect(unknown).toHaveTextContent('Sem estabelecimento');
      expect(screen.getByRole('button', { name: 'Importar 2 lançamentos' })).toBeDisabled();
      // Why "Importar" is off, beside it.
      expect(screen.getByText('Antes de importar:').parentElement).toHaveTextContent(
        'Informe o vencimento da fatura.',
      );
      await typeDueDate();
      expect(screen.getByRole('button', { name: 'Importar 2 lançamentos' })).toBeEnabled();
      await userEvent.click(within(unknown!).getByRole('button', { name: /^(Editar|Corrigir)/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Linha 3 da fatura' });
      await userEvent.click(
        within(dialog).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
      );
      await userEvent.type(
        await screen.findByPlaceholderText('Buscar ou adicionar estabelecimento'),
        'Spaceship',
      );
      await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “Spaceship”' }));
      expect(within(dialog).getByLabelText('Lembrar como apelido')).toBeChecked();
      const alias = within(dialog).getByLabelText('Apelido');
      expect(alias).toHaveValue('Spaceship.Com* Gypcbz');
      await userEvent.clear(alias);
      await userEvent.type(alias, 'Spaceship.Com');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar na prévia' }));
      await userEvent.click(screen.getByRole('button', { name: 'Importar 2 lançamentos' }));

      await expectCall(fetchMock, `${base}/imports`, {
        method: 'POST',
        body: expect.stringContaining(
          '"aliases":[{"merchantName":"Spaceship","alias":"Spaceship.Com"}],"label":"Fatura Nubank","kind":"CARD_STATEMENT","bank":"NUBANK","statementDueDate":"2026-11-04"',
        ) as unknown,
      });
      await expectCall(fetchMock, `${base}/imports`, {
        method: 'POST',
        body: expect.stringContaining(
          '"description":"Spaceship","notes":null,"categoryId":"' + moradia.id + '"',
        ) as unknown,
      });
    });

    it('offers a merchant added on one line to the others, and applies its alias at once', async () => {
      mockStatement();
      renderApp(statementPage);
      const file = new File(
        [
          [
            'date,title,amount',
            '2026-10-05,Spaceship.Com* Gypcbz,"32,40"',
            '2026-10-07,Spaceship.Com* H2m9u1,"46,97"',
            '2026-10-08,Varejao de Frutas,"20,00"',
          ].join('\n'),
        ],
        'Nubank_2026-11-04.csv',
        { type: 'text/csv' },
      );

      await chooseStatement(file);
      const october = await screen.findByRole('region', { name: 'outubro de 2026' });
      await userEvent.click(
        within(october).getByRole('button', { name: 'Editar Spaceship.Com* Gypcbz' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Linha 2 da fatura' });
      await userEvent.click(
        within(dialog).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
      );
      await userEvent.type(
        await screen.findByPlaceholderText('Buscar ou adicionar estabelecimento'),
        'Spaceship',
      );
      await userEvent.click(await screen.findByRole('option', { name: 'Adicionar “Spaceship”' }));
      const alias = within(dialog).getByLabelText('Apelido');
      await userEvent.clear(alias);
      await userEvent.type(alias, 'Spaceship.Com*');
      // The other line begins with the alias: it takes the merchant now.
      expect(dialog).toHaveTextContent('Mais 1 linha desta fatura');
      // Saved for its merchant alone: the category is still asked on the card.
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar na prévia' }));

      const [first, second, fruits] = within(october).getAllByRole('listitem');
      expect(first).toHaveTextContent('Spaceship');
      expect(
        within(first!).getByRole('combobox', { name: 'Categoria de Spaceship' }),
      ).toBeVisible();
      expect(second).toHaveTextContent('No extrato: Spaceship.Com* H2m9u1');
      expect(within(second!).getByRole('button', { name: 'Editar Spaceship' })).toBeVisible();

      // Not created yet, and offered to the other lines meanwhile.
      await userEvent.click(
        within(fruits!).getByRole('button', { name: 'Editar Varejao de Frutas' }),
      );
      const next = await screen.findByRole('dialog', { name: 'Linha 4 da fatura' });
      await userEvent.click(
        within(next).getByRole('combobox', { name: 'Estabelecimento (opcional)' }),
      );
      expect(
        await screen.findByRole('group', { name: 'Novos, criados ao importar' }),
      ).toHaveTextContent('Spaceship');
      await userEvent.keyboard('{Escape}');
      await userEvent.click(within(next).getByRole('button', { name: 'Cancelar' }));

      // A word on what goes without a merchant, once the line is ready.
      await userEvent.click(
        within(fruits!).getByRole('combobox', { name: 'Categoria de Varejao de Frutas' }),
      );
      await userEvent.click(await screen.findByRole('option', { name: 'Moradia' }));
      expect(screen.getByText('1 saída sem estabelecimento (opcional).')).toBeInTheDocument();
    });

    it('checks and unchecks every line at once, leaving out what the app unchecked on purpose', async () => {
      mockStatement();
      renderApp(statementPage);
      await chooseStatement();

      const all = await screen.findByRole('checkbox', { name: 'Marcar todas' });
      const payment = screen.getByRole('checkbox', { name: 'Importar Pagamento recebido' });
      // The bill payment comes unchecked; the other two are all there is to check.
      expect(all).toBeChecked();
      expect(all).toHaveAccessibleDescription('2 de 3 marcadas');

      await userEvent.click(all);
      expect(all).not.toBeChecked();
      expect(all).toHaveAccessibleDescription('0 de 3 marcadas');
      expect(screen.getByText('Antes de importar:').parentElement).toHaveTextContent(
        'Marque ao menos uma linha.',
      );

      await userEvent.click(all);
      expect(all).toBeChecked();
      expect(payment).not.toBeChecked();

      // Part of them: the mixed state.
      await userEvent.click(screen.getByRole('checkbox', { name: 'Importar Pizzaria Exemplo' }));
      expect(all).toHaveAttribute('aria-checked', 'mixed');
      // The payment still checks on purpose, one by one.
      await userEvent.click(payment);
      expect(payment).toBeChecked();
    });

    it('takes the due date typed, whatever the file name says, and another reference month', async () => {
      mockStatement();
      renderApp(statementPage);

      await chooseStatement();
      // The name carries a date, and the field still comes empty.
      expect(await dueDateField()).toHaveValue('');
      // On the field, and among what keeps "Importar" off.
      expect(screen.getAllByText('Informe o vencimento da fatura.')).toHaveLength(2);
      await typeDueDate('2026-11-10');
      const october = await screen.findByRole('region', { name: 'outubro de 2026' });
      expect(within(october).getAllByRole('listitem')[0]).toHaveTextContent('Vence em 10/11/2026');

      const month = screen.getByLabelText('Mês de referência');
      // jsdom does not type into a month field: the change, as the browser sends it.
      fireEvent.change(month, { target: { value: '2026-09' } });

      expect(await screen.findByRole('region', { name: 'setembro de 2026' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'outubro de 2026' })).not.toBeInTheDocument();
    });

    it('refuses a file that is not a Nubank statement', async () => {
      mockStatement();
      renderApp(statementPage);

      await chooseStatement(
        new File(['Data;Valor\n10/10/2026;10'], 'outra.csv', { type: 'text/csv' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este arquivo não parece a fatura do Nubank',
      );
    });

    it('tells an account statement chosen as a card one, instead of a generic error (ADR 0060)', async () => {
      mockStatement();
      renderApp(statementPage);

      // An invented line in the format of Nubank's account statement.
      await chooseStatement(
        new File(
          ['Data,Valor,Identificador,Descrição\n03/10/2026,-10.00,abc,Pix enviado'],
          'conta.csv',
          { type: 'text/csv' },
        ),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este arquivo parece o extrato de conta do Nubank, que o app ainda não lê.',
      );
    });

    it('asks the bank first, and shows the account statement as coming next (ADR 0060)', async () => {
      mockStatement();
      renderApp(statementPage);

      expect(await screen.findByRole('combobox', { name: 'Banco' })).toHaveTextContent('Nubank');
      expect(screen.getByRole('radio', { name: 'Fatura' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Conta' })).toBeDisabled();
      expect(screen.getByText('"Conta" chega no próximo passo.')).toBeInTheDocument();
    });

    it('names a past import by its origin and due date', async () => {
      mockImport({
        [`GET ${base}/imports`]: {
          body: [
            {
              ...previousImport,
              label: 'Fatura Nubank',
              statementDueDate: '2026-11-04',
              kind: 'CARD_STATEMENT',
              bank: 'NUBANK',
              planCount: 1,
            },
          ],
        },
      });
      renderApp(statementPage);

      const previous = await screen.findByRole('region', { name: 'Extratos importados' });
      // The badge first: a statement, since it has a due date.
      expect(within(previous).getByRole('listitem')).toHaveTextContent(
        /^FaturaFatura Nubank · vence 04\/11\/202612 lançamentos e 1 parcelamento, junho de 2026 a julho de 2026 · /,
      );
    });
  });
});
