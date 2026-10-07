import {
  createTransactionInputSchema,
  normalizeName,
  type Category,
  type CreateTransactionInput,
  type TemplateDraft,
  type TemplateRow,
  type TransactionType,
} from '@financas/shared';

// The import review (ADR 0040), kept apart from the screen: what each row will become, which
// categories still need a match, and what is ready to send. Nothing here talks to the API.

/** A row of the spreadsheet as it stands in the review: read as is, or edited on screen. */
export type ReviewRow = {
  /** The spreadsheet row; also the key, since each line appears once. */
  line: number;
  included: boolean;
  type: TransactionType | null;
  description: string;
  notes: string | null;
  categoryName: string;
  /** Chosen in the form; otherwise the category comes from the name. */
  categoryId: string | null;
  amountCents: number | null;
  period: string | null;
  dueDate: string | null;
  settledAt: string | null;
  /** Warnings of the report (installment in the text, personal data...). */
  warnings: string[];
};

/** "DEBIT|mercado": a spreadsheet category, per type, whatever the case or accents. */
export const categoryKey = (type: TransactionType, name: string) =>
  `${type}|${normalizeName(name)}`;

/**
 * Rows read from the template: the valid ones come in checked; the ones with errors come
 * unchecked, to be fixed first. Warnings stay with their row.
 */
export function startReview(parsed: {
  rows: TemplateRow[];
  drafts: TemplateDraft[];
  issues: { line: number | null; severity: 'error' | 'warning'; message: string }[];
}): ReviewRow[] {
  const warningsOf = (line: number) =>
    parsed.issues
      .filter((issue) => issue.line === line && issue.severity === 'warning')
      .map((issue) => issue.message);
  const rows: ReviewRow[] = [
    ...parsed.rows.map((row) => ({ ...row, included: true })),
    ...parsed.drafts.map((draft) => ({ ...draft, included: false })),
  ].map(({ line, ...row }) => ({ ...row, line, categoryId: null, warnings: warningsOf(line) }));
  return rows.sort((a, b) => a.line - b.line);
}

/**
 * The category a row goes to: the one chosen in the form; else an active category of the same
 * type and name; else the match chosen for that spreadsheet name. Null: none yet.
 */
export function resolveCategory(
  row: ReviewRow,
  categories: Category[],
  matches: ReadonlyMap<string, string>,
): string | null {
  if (row.categoryId) return row.categoryId;
  if (!row.type) return null;
  const key = categoryKey(row.type, row.categoryName);
  const sameName = categories.find(
    (category) => !category.archived && categoryKey(category.type, category.name) === key,
  );
  return sameName?.id ?? matches.get(key) ?? null;
}

/** Spreadsheet categories (per type) the app has no category for, among the checked rows. */
export function unmatchedCategories(
  rows: ReviewRow[],
  categories: Category[],
): { key: string; type: TransactionType; name: string; rowCount: number }[] {
  const found = new Map<
    string,
    { key: string; type: TransactionType; name: string; rowCount: number }
  >();
  for (const row of rows) {
    if (!row.included || row.categoryId || !row.type || !row.categoryName) continue;
    if (resolveCategory(row, categories, new Map())) continue;
    const key = categoryKey(row.type, row.categoryName);
    const entry = found.get(key) ?? { key, type: row.type, name: row.categoryName, rowCount: 0 };
    entry.rowCount += 1;
    found.set(key, entry);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * The transaction a row becomes, checked with the same shared schema the API uses; or what is
 * still wrong with it, in pt-BR.
 */
export function toTransaction(
  row: ReviewRow,
  categoryId: string | null,
): { ok: true; transaction: CreateTransactionInput } | { ok: false; problems: string[] } {
  if (!categoryId) return { ok: false, problems: ['Escolha a categoria.'] };
  const result = createTransactionInputSchema.safeParse({
    type: row.type,
    description: row.description,
    notes: row.notes,
    categoryId,
    amountCents: row.amountCents,
    period: row.period,
    dueDate: row.dueDate,
    settledAt: row.settledAt,
  });
  if (result.success) return { ok: true, transaction: result.data };
  return { ok: false, problems: [...new Set(result.error.issues.map((issue) => issue.message))] };
}

/** The checked rows that are ready, as the API takes them. */
export function readyTransactions(
  rows: ReviewRow[],
  categories: Category[],
  matches: ReadonlyMap<string, string>,
): CreateTransactionInput[] {
  return rows.flatMap((row) => {
    if (!row.included) return [];
    const result = toTransaction(row, resolveCategory(row, categories, matches));
    return result.ok ? [result.transaction] : [];
  });
}

/** Rows by competência, oldest first; a row without a valid competência goes last. */
export function groupByPeriod(rows: ReviewRow[]): { period: string | null; rows: ReviewRow[] }[] {
  const groups = new Map<string | null, ReviewRow[]>();
  for (const row of rows) groups.set(row.period, [...(groups.get(row.period) ?? []), row]);
  return [...groups.entries()]
    .map(([period, grouped]) => ({ period, rows: grouped }))
    .sort((a, b) =>
      a.period === null ? 1 : b.period === null ? -1 : a.period.localeCompare(b.period),
    );
}

/** Credits and debits of the checked rows of a group, in cents. */
export function groupTotals(rows: ReviewRow[]) {
  let credits = 0;
  let debits = 0;
  for (const row of rows) {
    if (!row.included || !row.amountCents || row.amountCents < 0) continue;
    if (row.type === 'CREDIT') credits += row.amountCents;
    if (row.type === 'DEBIT') debits += row.amountCents;
  }
  return { credits, debits };
}
