import type { TransactionType } from './category.ts';
import { MAX_IMPORT_TRANSACTIONS } from './import.ts';
import { amountCentsSchema, isoDateSchema, parseReais, periodSchema } from './money-and-dates.ts';
import { transactionDescriptionSchema, transactionNotesSchema } from './transaction.ts';

// Planilha modelo (ADR 0040): the one format the import reads. One row per transaction on the
// "Lançamentos" sheet, header in the first row; columns are found by their title, whatever the
// order, case or accents. Everything here is pure: the web app reads the file and hands over
// the cells, so the rules are tested without a spreadsheet.

export const TEMPLATE_SHEET = 'Lançamentos';
export const TEMPLATE_CATEGORIES_SHEET = 'Categorias';
export const TEMPLATE_FILE_NAME = 'financas-modelo.xlsx';

/** What a cell holds once read: dates already as Date (midnight UTC), numbers as numbers. */
export type TemplateCell = string | number | boolean | Date | null;

const columns = [
  { key: 'period', title: 'Competência', required: true },
  { key: 'type', title: 'Tipo', required: true },
  { key: 'description', title: 'Descrição', required: true },
  { key: 'category', title: 'Categoria', required: true },
  { key: 'amount', title: 'Valor', required: true },
  { key: 'dueDate', title: 'Vencimento', required: false },
  { key: 'settledAt', title: 'Efetivado em', required: false },
  { key: 'notes', title: 'Observações', required: false },
] as const;

type ColumnKey = (typeof columns)[number]['key'];

/** The header of the template, in order. */
export const TEMPLATE_HEADERS: readonly string[] = columns.map((column) => column.title);

/** The example row the downloaded template comes with (fictitious, ADR 0019). */
export const TEMPLATE_EXAMPLE: readonly string[] = [
  '2026-09',
  'Débito',
  'Aluguel',
  'Moradia',
  '1.500,00',
  '10/09/2026',
  '10/09/2026',
  '',
];

/** One transaction read from the template; the category is still a name (the screen maps it). */
export type TemplateRow = {
  /** The row in the spreadsheet (the header is row 1), for the report. */
  line: number;
  type: TransactionType;
  description: string;
  notes: string | null;
  categoryName: string;
  amountCents: number;
  period: string;
  dueDate: string | null;
  settledAt: string | null;
};

/**
 * A row with errors, as far as it could be read: what is valid comes filled in, what is not
 * comes empty, so the screen can open it in the transaction form to be fixed (ADR 0040).
 */
export type TemplateDraft = {
  line: number;
  type: TransactionType | null;
  description: string;
  notes: string | null;
  categoryName: string;
  /** Null when missing or unreadable; a zero or negative amount stays, to be corrected. */
  amountCents: number | null;
  period: string | null;
  dueDate: string | null;
  settledAt: string | null;
};

/** An error leaves the row out; a warning only asks for a look. `line` null: the whole sheet. */
export type ImportIssue = {
  line: number | null;
  severity: 'error' | 'warning';
  message: string;
};

/** "Efetivado  em" → "efetivado em": no accents, no case, single spaces. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const text = (cell: TemplateCell | undefined): string =>
  cell === null || cell === undefined ? '' : cell instanceof Date ? '' : String(cell).trim();

const isEmpty = (cell: TemplateCell | undefined) =>
  cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');

/** A Date cell is midnight UTC of the day typed: read it in UTC, never in local time. */
const isoOfDate = (date: Date) => date.toISOString().slice(0, 10);

/** "2026-09", "09/2026", "9/2026" or a date cell (Excel turns "2026-09" into one). */
function readPeriod(cell: TemplateCell | undefined): string | null {
  if (cell instanceof Date) return isoOfDate(cell).slice(0, 7);
  const value = text(cell);
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(value);
  const period = monthYear ? `${monthYear[2]}-${monthYear[1]?.padStart(2, '0')}` : value;
  return periodSchema.safeParse(period).success ? period : null;
}

/** "10/09/2026", "2026-09-10" or a date cell; null when empty, undefined when invalid. */
function readDate(cell: TemplateCell | undefined): string | null | undefined {
  if (isEmpty(cell)) return null;
  if (cell instanceof Date) return isoOfDate(cell);
  const value = text(cell);
  const dayMonthYear = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = dayMonthYear
    ? `${dayMonthYear[3]}-${dayMonthYear[2]?.padStart(2, '0')}-${dayMonthYear[1]?.padStart(2, '0')}`
    : value;
  return isoDateSchema.safeParse(iso).success ? iso : undefined;
}

function readType(cell: TemplateCell | undefined): TransactionType | null {
  const value = normalizeName(text(cell));
  if (value === 'credito' || value === 'credit') return 'CREDIT';
  if (value === 'debito' || value === 'debit') return 'DEBIT';
  return null;
}

/** A number cell (1500.1) or text in reais ("1.500,10"); cents, or null when not an amount. */
function readAmount(cell: TemplateCell | undefined): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? Math.round(cell * 100) : null;
  return parseReais(text(cell));
}

// Warnings only: the spreadsheet stored these in free text (docs/dominio/planilha-origem.md).
const INSTALLMENT_TEXT = /parcela\s*\d+\s*(?:de|\/)\s*\d+/i;
const SENSITIVE_TEXT = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, // CPF
  /\bpix\b/i,
  /\b(?:conta|c\/c|ag[eê]ncia|ag\.)\s*:?\s*\d/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/, // e-mail
];

/**
 * Reads the template's rows (the first one is the header) into transactions plus a report.
 * Empty rows are skipped. A row with any error is left out of `rows`, with the reasons in
 * `issues`, and comes in `drafts` with what could be read, to be fixed on screen.
 */
export function parseTemplateRows(rows: readonly (readonly TemplateCell[])[]): {
  rows: TemplateRow[];
  drafts: TemplateDraft[];
  issues: ImportIssue[];
} {
  const issues: ImportIssue[] = [];
  const [header = [], ...body] = rows;
  const titles = header.map((cell) => normalizeName(text(cell)));
  const index = new Map<ColumnKey, number>();
  for (const column of columns) {
    const position = titles.indexOf(normalizeName(column.title));
    if (position >= 0) index.set(column.key, position);
    else if (column.required) {
      issues.push({
        line: 1,
        severity: 'error',
        message: `Falta a coluna "${column.title}" no cabeçalho. Use a planilha modelo.`,
      });
    }
  }
  if (issues.length > 0) return { rows: [], drafts: [], issues };

  const parsed: TemplateRow[] = [];
  const drafts: TemplateDraft[] = [];
  body.forEach((cells, position) => {
    const line = position + 2;
    const cell = (key: ColumnKey) => {
      const column = index.get(key);
      return column === undefined ? undefined : cells[column];
    };
    if (columns.every((column) => isEmpty(cell(column.key)))) return;

    const errors: string[] = [];
    const period = readPeriod(cell('period'));
    if (!period) errors.push('Competência inválida: use AAAA-MM, como 2026-09.');
    const type = readType(cell('type'));
    if (!type) errors.push('Tipo inválido: use Crédito ou Débito.');
    const description = transactionDescriptionSchema.safeParse(text(cell('description')));
    if (!description.success)
      errors.push(description.error.issues[0]?.message ?? 'Descrição inválida.');
    const categoryName = text(cell('category'));
    if (!categoryName) errors.push('Informe a categoria.');
    const amountCents = readAmount(cell('amount'));
    const amount = amountCentsSchema.safeParse(amountCents);
    if (amountCents === null) errors.push('Valor inválido: use números, como 1.500,00.');
    else if (!amount.success) {
      errors.push(
        amountCents <= 0
          ? 'Valor zero ou negativo: informe o valor do lançamento.'
          : (amount.error.issues[0]?.message ?? 'Valor inválido.'),
      );
    }
    const dueDate = readDate(cell('dueDate'));
    if (dueDate === undefined) errors.push('Vencimento inválido: use dd/mm/aaaa.');
    const settledAt = readDate(cell('settledAt'));
    if (settledAt === undefined) errors.push('Data de efetivação inválida: use dd/mm/aaaa.');
    const notes = transactionNotesSchema.safeParse(text(cell('notes')));
    if (!notes.success) errors.push(notes.error.issues[0]?.message ?? 'Observações inválidas.');

    if (errors.length > 0 || !period || !type || !description.success || !amount.success) {
      for (const message of errors) issues.push({ line, severity: 'error', message });
      // What is valid goes along; the form shows the rest empty, to be filled in.
      drafts.push({
        line,
        type,
        description: text(cell('description')),
        notes: text(cell('notes')) || null,
        categoryName,
        amountCents,
        period,
        dueDate: dueDate ?? null,
        settledAt: settledAt ?? null,
      });
      return;
    }

    const freeText = `${description.data} ${notes.success ? (notes.data ?? '') : ''}`;
    if (INSTALLMENT_TEXT.test(freeText)) {
      issues.push({
        line,
        severity: 'warning',
        message:
          'Parece uma parcela. Para o app acompanhar as próximas, crie um parcelamento em Lançamentos.',
      });
    }
    if (SENSITIVE_TEXT.some((pattern) => pattern.test(freeText))) {
      issues.push({
        line,
        severity: 'warning',
        message:
          'A descrição ou as observações parecem ter dado pessoal (CPF, Pix, conta ou e-mail).',
      });
    }
    if (settledAt && settledAt.slice(0, 7) !== period) {
      issues.push({
        line,
        severity: 'warning',
        message: `Efetivado em ${settledAt.slice(0, 7)}, fora da competência ${period}.`,
      });
    }

    parsed.push({
      line,
      type,
      description: description.data,
      notes: notes.success ? notes.data : null,
      categoryName,
      amountCents: amount.data,
      period,
      dueDate: dueDate ?? null,
      settledAt: settledAt ?? null,
    });
  });

  if (parsed.length > MAX_IMPORT_TRANSACTIONS) {
    issues.push({
      line: null,
      severity: 'error',
      message: `A planilha tem ${parsed.length} lançamentos; importe no máximo ${MAX_IMPORT_TRANSACTIONS} de cada vez.`,
    });
  }
  return { rows: parsed, drafts, issues };
}
