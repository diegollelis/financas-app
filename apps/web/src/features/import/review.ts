import {
  importInstallmentPlanInputSchema,
  plainTransactionInputSchema,
  normalizeName,
  type Category,
  type ImportInstallmentPlanInput,
  type ImportMerchantAliasInput,
  type ImportTransactionInput,
  type PaymentMethod,
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
  /** Where it was bought or who paid it (ADR 0053); '' when none. A new name is created. */
  merchantName: string;
  /** How it was paid or received (ADR 0054); null when none. */
  paymentMethod: PaymentMethod | null;
  /** Chosen in the form; otherwise the category comes from the name. */
  categoryId: string | null;
  amountCents: number | null;
  period: string | null;
  /** The day it happened (ADR 0055); null when none. */
  occurredOn: string | null;
  dueDate: string | null;
  settledAt: string | null;
  /** Warnings of the report (installment in the text, personal data...), or why a line of a
   * card statement becomes what it becomes, or comes unchecked. */
  warnings: string[];
  /** A card statement's line (ADR 0055): the title as the bank wrote it. */
  statementTitle?: string;
  /** Its merchant came from an alias: there is no alias to learn. */
  merchantByAlias?: boolean;
  /** The alias to remember for its merchant on import; null or absent: none. */
  rememberAlias?: string | null;
  /** An installment of a statement that starts a plan: N installments, created from `firstNumber`. */
  plan?: { installments: number; firstNumber: number };
  /** A statement's row the person changed: a new reference month keeps their choices. */
  touched?: boolean;
};

/** "2026-11" − "2026-10" = 1: how many months the first is after the second. */
const monthsBetween = (later: string, earlier: string) =>
  (Number(later.slice(0, 4)) - Number(earlier.slice(0, 4))) * 12 +
  Number(later.slice(5, 7)) -
  Number(earlier.slice(5, 7));

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
): { ok: true; transaction: ImportTransactionInput } | { ok: false; problems: string[] } {
  if (!categoryId) return { ok: false, problems: ['Escolha a categoria.'] };
  const result = plainTransactionInputSchema.safeParse({
    type: row.type,
    description: row.description,
    notes: row.notes,
    categoryId,
    amountCents: row.amountCents,
    period: row.period,
    dueDate: row.dueDate,
    settledAt: row.settledAt,
    occurredOn: row.occurredOn,
    // Only when there is one, as a new transaction in the form (ADR 0054).
    ...(row.paymentMethod && { paymentMethod: row.paymentMethod }),
  });
  if (result.success) {
    const merchantName = row.merchantName.trim();
    return {
      ok: true,
      transaction: merchantName ? { ...result.data, merchantName } : result.data,
    };
  }
  return { ok: false, problems: [...new Set(result.error.issues.map((issue) => issue.message))] };
}

/**
 * The installment plan a statement's row becomes (ADR 0055): the bill's line as its installment,
 * from the reference month on, each due on the bill's day as far from its month as this one; or
 * what is wrong.
 */
export function toPlan(
  row: ReviewRow,
  categoryId: string | null,
): { ok: true; plan: ImportInstallmentPlanInput } | { ok: false; problems: string[] } {
  if (!categoryId) return { ok: false, problems: ['Escolha a categoria.'] };
  const merchantName = row.merchantName.trim();
  // A plan is due in the month of each installment or the next (ADR 0038 note).
  const dueMonthOffset =
    row.dueDate && row.period ? monthsBetween(row.dueDate.slice(0, 7), row.period) : 0;
  if (dueMonthOffset < 0 || dueMonthOffset > 1) {
    return {
      ok: false,
      problems: ['Num parcelamento, o vencimento fica no mês de referência ou no seguinte.'],
    };
  }
  const result = importInstallmentPlanInputSchema.safeParse({
    type: row.type,
    description: row.description,
    notes: row.notes,
    categoryId,
    installments: row.plan?.installments,
    firstNumber: row.plan?.firstNumber,
    amountCents: row.amountCents,
    firstPeriod: row.period,
    occurredOn: row.occurredOn,
    dueDay: row.dueDate ? Number(row.dueDate.slice(8)) : null,
    dueMonthOffset,
    ...(row.paymentMethod && { paymentMethod: row.paymentMethod }),
    ...(merchantName && { merchantName }),
  });
  if (result.success) return { ok: true, plan: result.data };
  return { ok: false, problems: [...new Set(result.error.issues.map((issue) => issue.message))] };
}

/** What still keeps a row out of the import: a transaction's problems, or a plan's. */
export function rowProblems(row: ReviewRow, categoryId: string | null): string[] {
  const result = row.plan ? toPlan(row, categoryId) : toTransaction(row, categoryId);
  return result.ok ? [] : result.problems;
}

/** What the import sends: the transactions, the plans and the aliases learned (ADR 0055). */
export type ReadyImport = {
  transactions: ImportTransactionInput[];
  plans: ImportInstallmentPlanInput[];
  aliases: ImportMerchantAliasInput[];
};

/** The checked rows that are ready, as the API takes them, with the aliases to remember. */
export function readyImport(
  rows: ReviewRow[],
  categories: Category[],
  matches: ReadonlyMap<string, string>,
): ReadyImport {
  const ready: ReadyImport = { transactions: [], plans: [], aliases: [] };
  for (const row of rows) {
    if (!row.included) continue;
    const categoryId = resolveCategory(row, categories, matches);
    if (row.plan) {
      const result = toPlan(row, categoryId);
      if (!result.ok) continue;
      ready.plans.push(result.plan);
    } else {
      const result = toTransaction(row, categoryId);
      if (!result.ok) continue;
      ready.transactions.push(result.transaction);
    }
    const alias = row.rememberAlias?.trim();
    const merchantName = row.merchantName.trim();
    if (alias && merchantName) ready.aliases.push({ merchantName, alias });
  }
  return ready;
}

/** The checked rows that are ready, as the API takes them. */
export function readyTransactions(
  rows: ReviewRow[],
  categories: Category[],
  matches: ReadonlyMap<string, string>,
): ImportTransactionInput[] {
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
