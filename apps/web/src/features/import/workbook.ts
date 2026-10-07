import {
  parseTemplateRows,
  TEMPLATE_CATEGORIES_SHEET,
  TEMPLATE_EXAMPLE,
  TEMPLATE_FILE_NAME,
  TEMPLATE_HEADERS,
  TEMPLATE_SHEET,
  type Category,
  type TemplateCell,
} from '@financas/shared';

// Planilha modelo (ADR 0040). Both libraries load only when the import screen needs them
// (dynamic import), so they never weigh on the rest of the app. The file is read in the browser
// and never sent anywhere: only the confirmed transactions go to the API.

/** The file could not be read as a spreadsheet: the message is for the person. */
export class TemplateReadError extends Error {}

/**
 * Reads the "Lançamentos" sheet (or the first one, if it was renamed) into transactions plus the
 * inconsistency report.
 */
export async function readTemplate(file: Blob) {
  const { readSheet, SheetNotFoundError } = await import('read-excel-file/browser');
  let data;
  try {
    data = await readSheet(file, TEMPLATE_SHEET).catch((error: unknown) => {
      if (error instanceof SheetNotFoundError) return readSheet(file);
      throw error;
    });
  } catch {
    throw new TemplateReadError(
      'Não foi possível ler o arquivo. Use a planilha modelo, salva em .xlsx.',
    );
  }
  return parseTemplateRows(data as unknown as TemplateCell[][]);
}

const typeLabel = { CREDIT: 'Crédito', DEBIT: 'Débito' } as const;

/**
 * The template: the header, one example row and, on a second sheet, the workspace's active
 * categories to pick names from.
 */
async function templateFile(categories: Category[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const active = categories
    .filter((category) => !category.archived)
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name, 'pt-BR'));
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const });

  return writeXlsxFile([
    {
      sheet: TEMPLATE_SHEET,
      data: [TEMPLATE_HEADERS.map(bold), [...TEMPLATE_EXAMPLE]],
      columns: [12, 10, 36, 22, 14, 14, 14, 40].map((width) => ({ width })),
      stickyRowsCount: 1,
    },
    {
      sheet: TEMPLATE_CATEGORIES_SHEET,
      data: [
        ['Tipo', 'Categoria'].map(bold),
        ...active.map((category) => [typeLabel[category.type], category.name]),
      ],
      columns: [{ width: 10 }, { width: 30 }],
      stickyRowsCount: 1,
    },
  ]);
}

/** The template as a file in memory (what the tests read back). */
export async function buildTemplate(categories: Category[]): Promise<Blob> {
  return (await templateFile(categories)).toBlob();
}

/** Builds the template and saves it as `financas-modelo.xlsx`. */
export async function downloadTemplate(categories: Category[]) {
  await (await templateFile(categories)).toFile(TEMPLATE_FILE_NAME);
}
