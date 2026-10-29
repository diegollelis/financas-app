import {
  importInstallmentPlanInputSchema,
  plainTransactionInputSchema,
  normalizeName,
  type Category,
  type ImportBillInput,
  type ImportInstallmentPlanInput,
  type ImportMatchInput,
  type ImportMerchantAliasInput,
  type ImportPartInput,
  type ImportTransactionInput,
  type PaymentMethod,
  type TemplateDraft,
  type TemplateRow,
  type TransactionType,
} from '@financas/shared';
import { newCategoryName } from '@/features/categories/new-category';

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
  /** A receber de / a pagar para (ADR 0040 note); '' or absent when none. A new name is
   * created on import. */
  personName?: string;
  /** How it was paid or received (ADR 0054); null when none. */
  paymentMethod: PaymentMethod | null;
  /** Chosen in the form (`newCategoryValue` for one to create on import); otherwise the category comes from the name. */
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
  /** A statement's line the app unchecked for a reason (the bill payment, one already in):
   * "Marcar todas" leaves it out, so it is only checked on purpose, one by one. */
  skipped?: boolean;
  /** An account statement's movement (ADR 0061): the bank's identifier, with the bank. */
  externalId?: string;
  /** The transaction already in the app the movement seems to be (ADR 0061). */
  match?: AccountMatch;
  /** A part of a loan still pending (ADR 0061 note): received or paid on the movement's day. */
  part?: AccountPart;
  /** "Não é este" / "É outro": the movement comes in as a new transaction after all. */
  matchRefused?: boolean;
  /**
   * An account statement's bill payment matched with a card bill still open (ADR 0062 note):
   * checked, importing pays that bill; it never comes in as a transaction.
   */
  bill?: AccountBill;
};

/** A card bill still open that an account statement's bill payment paid (ADR 0062 note). */
export type AccountBill = {
  cardId: string;
  cardName: string;
  dueDate: string;
  /** Its pending transactions, and their total (purchases less refunds). */
  count: number;
  totalCents: number;
  /** False: the bank paid another amount; checked anyway, the bill is paid all the same. */
  sameAmount: boolean;
};

/** A bill payment checked: importing pays the bill it matched. */
export const takesBill = (row: ReviewRow): row is ReviewRow & { bill: AccountBill } =>
  Boolean(row.bill) && row.included;

/** A loan still pending that an account statement's movement is a part of (ADR 0061 note). */
export type AccountPart = {
  transactionId: string;
  description: string;
  personName: string;
  /** What the loan still had before this movement. */
  remainingCents: number;
};

/** A movement taken as a part of the loan it matched, not as a new transaction. */
export const takesPart = (row: ReviewRow): row is ReviewRow & { part: AccountPart } =>
  Boolean(row.part) && !row.matchRefused;

/** A transaction already in the app that an account statement's movement is (ADR 0061). */
export type AccountMatch = {
  transactionId: string;
  description: string;
  /** Pending: importing settles it on the movement's day. Settled: only linked. */
  pending: boolean;
  /** Its due date while pending, its settlement day once settled. */
  date: string | null;
  amountCents: number;
  /** False: "Valor diferente", the bank's amount replaces the app's if confirmed. */
  sameAmount: boolean;
  /**
   * A card statement's line (ADR 0061 note): nothing is settled, the transaction takes the bill's
   * due date and the day of the purchase; there is no identifier.
   */
  card?: boolean;
  /** A recurrence's month, said on the card. */
  recurring?: boolean;
};

/** A movement taken as the transaction it matched, not as a new one. */
export const takesMatch = (row: ReviewRow): row is ReviewRow & { match: AccountMatch } =>
  Boolean(row.match) && !row.matchRefused;

/**
 * A category still to create (`newCategoryValue`) is checked as if it existed: it becomes a
 * real one when the import is sent, and the value goes along until then.
 */
const NEW_CATEGORY_STAND_IN = '01920000-0000-7000-8000-000000000000';
const checkable = (categoryId: string) =>
  newCategoryName(categoryId) === null ? categoryId : NEW_CATEGORY_STAND_IN;

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
    categoryId: checkable(categoryId),
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
    const personName = row.personName?.trim();
    return {
      ok: true,
      transaction: {
        ...result.data,
        categoryId,
        ...(merchantName && { merchantName }),
        ...(personName && { personName }),
      },
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
    categoryId: checkable(categoryId),
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
  if (result.success) return { ok: true, plan: { ...result.data, categoryId } };
  return { ok: false, problems: [...new Set(result.error.issues.map((issue) => issue.message))] };
}

/** What still keeps a row out of the import: a transaction's problems, or a plan's. */
export function rowProblems(row: ReviewRow, categoryId: string | null): string[] {
  // A movement already in the app creates nothing: it needs no category (ADR 0061); a part of a
  // loan takes the loan's; a bill payment pays a bill (ADR 0062 note).
  if (takesMatch(row) || takesPart(row) || row.bill) return [];
  const result = row.plan ? toPlan(row, categoryId) : toTransaction(row, categoryId);
  return result.ok ? [] : result.problems;
}

/** What the import sends: the transactions, the plans and the aliases learned (ADR 0055). */
export type ReadyImport = {
  transactions: ImportTransactionInput[];
  plans: ImportInstallmentPlanInput[];
  aliases: ImportMerchantAliasInput[];
  /** An account statement's movements already in the app (ADR 0061). */
  matches: ImportMatchInput[];
  /** An account statement's movements that are parts of a loan (ADR 0061 note). */
  parts: ImportPartInput[];
  /** The card bills an account statement paid (ADR 0062 note). */
  bills: ImportBillInput[];
};

/** The checked rows that are ready, as the API takes them, with the aliases to remember. */
export function readyImport(
  rows: ReviewRow[],
  categories: Category[],
  matches: ReadonlyMap<string, string>,
): ReadyImport {
  const ready: ReadyImport = {
    transactions: [],
    plans: [],
    aliases: [],
    matches: [],
    parts: [],
    bills: [],
  };
  for (const row of rows) {
    if (!row.included) continue;
    // A bill payment pays the bill it matched, on the movement's day; never a transaction.
    if (row.bill) {
      if (row.occurredOn) {
        ready.bills.push({
          cardId: row.bill.cardId,
          dueDate: row.bill.dueDate,
          settledAt: row.occurredOn,
        });
      }
      continue;
    }
    if (takesMatch(row)) {
      const amount =
        !row.match.sameAmount && row.amountCents ? { amountCents: row.amountCents } : {};
      // A card's line: the bill's due date and the purchase's day, nothing settled.
      if (row.match.card) {
        if (row.dueDate) {
          ready.matches.push({
            transactionId: row.match.transactionId,
            dueDate: row.dueDate,
            ...(row.occurredOn && { occurredOn: row.occurredOn }),
            ...amount,
          });
        }
        continue;
      }
      // Settled (or linked) on the movement's day, with the bank's amount when it differs.
      if (row.externalId && row.occurredOn) {
        ready.matches.push({
          transactionId: row.match.transactionId,
          externalId: row.externalId,
          settledAt: row.occurredOn,
          ...(!row.match.sameAmount && row.amountCents && { amountCents: row.amountCents }),
        });
      }
      continue;
    }
    if (takesPart(row)) {
      if (row.externalId && row.occurredOn && row.amountCents) {
        ready.parts.push({
          transactionId: row.part.transactionId,
          externalId: row.externalId,
          amountCents: row.amountCents,
          settledAt: row.occurredOn,
        });
      }
      continue;
    }
    const categoryId = resolveCategory(row, categories, matches);
    if (row.plan) {
      const result = toPlan(row, categoryId);
      if (!result.ok) continue;
      ready.plans.push(result.plan);
    } else {
      const result = toTransaction(row, categoryId);
      if (!result.ok) continue;
      ready.transactions.push(
        row.externalId ? { ...result.transaction, externalId: row.externalId } : result.transaction,
      );
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
