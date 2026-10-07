import type { Category } from '@financas/shared';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/browser';
import { buildTemplate, readTemplate, TemplateReadError } from './workbook';

// A fictitious workbook built in the test (ADR 0019): no .xlsx lives in the repository.
const category = (n: number, name: string, type: Category['type'], archived = false) => ({
  id: `01920000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  name,
  type,
  archived,
  recentUses: 0,
});

describe('planilha modelo', () => {
  it('reads back the template it builds: header and example row', async () => {
    const file = await buildTemplate([
      category(1, 'Salário', 'CREDIT'),
      category(2, 'Moradia', 'DEBIT'),
      category(3, 'IPVA', 'DEBIT', true),
    ]);

    const { rows, issues } = await readTemplate(file);

    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        type: 'DEBIT',
        description: 'Aluguel',
        notes: null,
        categoryName: 'Moradia',
        amountCents: 150_000,
        period: '2026-09',
        dueDate: '2026-09-10',
        settledAt: '2026-09-10',
      },
    ]);
  });

  it('reads a filled template with real date and number cells', async () => {
    const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
    const file = await writeXlsxFile([
      {
        sheet: 'Lançamentos',
        data: [
          ['Competência', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Vencimento', 'Efetivado em'],
          ['2026-08', 'Crédito', 'Salário', 'Salário', 5200, day('2026-08-05'), day('2026-08-05')],
          ['2026-08', 'Débito', 'Conta de luz', 'Moradia', 189.9, day('2026-08-12'), null],
          ['2026-08', 'Débito', 'Erro', 'Moradia', 0, null, null],
        ],
        dateFormat: 'dd/mm/yyyy',
      },
    ]).toBlob();

    const { rows, issues } = await readTemplate(file);

    expect(
      rows.map((row) => [row.description, row.amountCents, row.dueDate, row.settledAt]),
    ).toEqual([
      ['Salário', 520_000, '2026-08-05', '2026-08-05'],
      ['Conta de luz', 18_990, '2026-08-12', null],
    ]);
    expect(issues).toEqual([
      {
        line: 4,
        severity: 'error',
        message: 'Valor zero ou negativo: informe o valor do lançamento.',
      },
    ]);
  });

  it('reads the first sheet when "Lançamentos" was renamed', async () => {
    const file = await writeXlsxFile([
      {
        sheet: 'Minha planilha',
        data: [
          ['Competência', 'Tipo', 'Descrição', 'Categoria', 'Valor'],
          ['2026-08', 'Débito', 'Padaria', 'Mercado', '12,50'],
        ],
      },
    ]).toBlob();

    const { rows } = await readTemplate(file);

    expect(rows[0]).toMatchObject({ description: 'Padaria', amountCents: 1250 });
  });

  it('explains when the file is not a spreadsheet', async () => {
    const notASpreadsheet = new Blob(['Descrição;Valor\nAluguel;1500'], { type: 'text/csv' });

    await expect(readTemplate(notASpreadsheet)).rejects.toThrow(TemplateReadError);
    await expect(readTemplate(notASpreadsheet)).rejects.toThrow(
      'Não foi possível ler o arquivo. Use a planilha modelo, salva em .xlsx.',
    );
  });
});
