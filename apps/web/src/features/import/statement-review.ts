import {
  currentPeriod,
  findMerchantByAlias,
  formatCents,
  formatPeriod,
  installmentsCreated,
  normalizeName,
  normalizeStatementTitle,
  statementTitleKey,
  suggestCategory,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  type Category,
  type CategoryHints,
  type InstallmentPlan,
  type Merchant,
  type StatementLine,
  type Transaction,
  type TransactionType,
} from '@financas/shared';
import type { AccountMatch, ReviewRow } from './review';

// The review of a card statement (ADR 0055 and its notes), kept apart from the screen: what each
// line of the bank's file becomes, and why a line comes unchecked. Nothing here talks to the API.

/** What the review needs to know about the workspace, read before it opens. */
export type StatementContext = {
  /** The statement's reference month, its billing cycle: every line goes to it. */
  period: string;
  /** The bill's due date, typed in the review; null until then. */
  dueDate: string | null;
  merchants: Merchant[];
  categories: Category[];
  hints: CategoryHints | undefined;
  plans: InstallmentPlan[];
  /** The transactions of the reference month, the recurrences' pending months among them. */
  transactions: Transaction[];
};

/**
 * The reference month to suggest (ADR 0055 note): the month of the statement's latest purchase,
 * near the bill's closing; installments leave out, as their dates are the original purchase's.
 */
export function suggestedPeriod(lines: StatementLine[]): string {
  const days = lines
    .filter((line) => line.kind !== 'PAYMENT' && !line.installment)
    .map((line) => line.occurredOn);
  const latest = (days.length > 0 ? days : lines.map((line) => line.occurredOn)).sort().at(-1);
  return latest ? latest.slice(0, 7) : currentPeriod();
}

/**
 * A recurrence's month is "the same" when within 20% of the line (a bill in dollars varies), as
 * on the account statement (ADR 0061 note).
 */
const closeAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.2;

const sameText = (a: string, b: string) => normalizeName(a) === normalizeName(b);

/** A purchase launched by hand is the bank's line when their days are this close. */
const SAME_PURCHASE_DAYS = 3;

/** Days from one ISO date to another, by the calendar (no time zone shift). */
function daysBetween(a: string, b: string): number {
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((day(b) - day(a)) / 86_400_000);
}

/** The plan this installment line already belongs to: same merchant (or description), N and amount. */
function existingPlan(
  line: StatementLine,
  description: string,
  merchantId: string | null,
  plans: InstallmentPlan[],
) {
  const { number, count } = line.installment!;
  return plans.find(
    (plan) =>
      plan.installments === count &&
      (merchantId ? plan.merchantId === merchantId : sameText(plan.description, description)) &&
      number >= plan.firstNumber &&
      Math.abs(plan.totalCents / installmentsCreated(plan) - line.amountCents) <= 1,
  );
}

/**
 * Rows from a card statement's lines: each one a transaction of the statement's reference month,
 * due on the bill's date; a purchase a debit paid by credit card, with the merchant of its alias
 * (its name as the description) and the category of the history. An installment billed here
 * starts a plan in that month, unless it already belongs to one; the last one is a plain
 * transaction. The payment of the last bill, a purchase already imported and a recurrence's month
 * come unchecked, with the reason.
 */
export function startStatementReview(
  lines: StatementLine[],
  context: StatementContext,
): ReviewRow[] {
  const { period } = context;
  // Each transaction already in the app is one line only (ADR 0061 note).
  const used = new Set<string>();
  return lines.map((line) => {
    const type: TransactionType = line.kind === 'PURCHASE' ? 'DEBIT' : 'CREDIT';
    const merchantId = findMerchantByAlias(line.title, context.merchants);
    const merchant = context.merchants.find((item) => item.id === merchantId);
    const description = (merchant?.name ?? line.cleanTitle).slice(
      0,
      TRANSACTION_DESCRIPTION_MAX_LENGTH,
    );
    const suggested =
      context.hints && line.kind !== 'PAYMENT'
        ? suggestCategory(context.hints, { type, description, merchantId })
        : null;
    const categoryId = context.categories.some(
      (category) => category.id === suggested && category.type === type && !category.archived,
    )
      ? suggested
      : null;
    const row: ReviewRow = {
      line: line.line,
      included: true,
      type,
      description,
      notes: null,
      categoryName: '',
      merchantName: merchant?.name ?? '',
      paymentMethod: line.kind === 'PAYMENT' ? null : 'CREDIT_CARD',
      categoryId,
      amountCents: line.amountCents,
      period,
      occurredOn: line.occurredOn,
      dueDate: context.dueDate,
      settledAt: null,
      warnings: [],
      statementTitle: line.title,
      merchantByAlias: Boolean(merchant),
      rememberAlias: null,
    };
    const skip = (reason: string): ReviewRow => ({
      ...row,
      included: false,
      skipped: true,
      warnings: [reason],
    });

    if (line.kind === 'PAYMENT') {
      return skip('Pagamento da fatura anterior: não é uma entrada.');
    }
    const sameMerchant = (transaction: Transaction) =>
      merchantId
        ? transaction.merchantId === merchantId
        : sameText(transaction.description, description);
    // Already in the app (ADR 0061 note): importing gives it the bill's due date and the
    // purchase's day, creating nothing. Each transaction is one line only.
    const asMatch = (found: Transaction): ReviewRow => {
      used.add(found.id);
      const match: AccountMatch = {
        transactionId: found.id,
        description: found.description,
        pending: found.settledAt === null,
        date: found.dueDate,
        amountCents: found.amountCents,
        sameAmount: found.amountCents === line.amountCents,
        card: true,
        ...(found.recurrenceId !== null && { recurring: true }),
      };
      return { ...row, match };
    };
    const open = context.transactions.filter(
      (transaction) =>
        !used.has(transaction.id) &&
        transaction.period === period &&
        transaction.type === type &&
        transaction.installment === null &&
        sameMerchant(transaction),
    );
    // The same purchase: the same amount, on a day near the line's (one launched by hand may be
    // a day or two off the bank's), the closest first; or with no day at all.
    const samePurchase = open
      .filter(
        (transaction) =>
          transaction.amountCents === line.amountCents &&
          (transaction.occurredOn === null ||
            Math.abs(daysBetween(transaction.occurredOn, line.occurredOn)) <= SAME_PURCHASE_DAYS),
      )
      .sort(
        (a, b) =>
          Math.abs(daysBetween(a.occurredOn ?? line.occurredOn, line.occurredOn)) -
          Math.abs(daysBetween(b.occurredOn ?? line.occurredOn, line.occurredOn)),
      )[0];

    if (line.installment) {
      const { number, count } = line.installment;
      // An installment of a plan already in the app is that plan's month (ADR 0061 note).
      const plan = existingPlan(line, description, merchantId, context.plans);
      const installment =
        plan &&
        context.transactions.find(
          (transaction) =>
            !used.has(transaction.id) &&
            transaction.installment?.planId === plan.id &&
            transaction.installment.number === number,
        );
      if (installment) return asMatch(installment);
      if (number === count) {
        // The last one is a plain purchase: already launched as one, it is that one.
        if (samePurchase) return asMatch(samePurchase);
        return {
          ...row,
          notes: `Parcela ${number}/${count}`,
          warnings: [
            `A última parcela entra como um lançamento simples, com "Parcela ${number}/${count}" nas observações.`,
          ],
        };
      }
      if (plan) {
        return skip(
          `Já lançada: é a parcela ${number}/${count} do parcelamento "${plan.description}".`,
        );
      }
      const created = count - number + 1;
      return {
        ...row,
        plan: { installments: count, firstNumber: number },
        warnings: [
          `Vai criar um parcelamento: da ${number}/${count} à ${count}/${count}, ${created} parcelas de ${formatCents(line.amountCents)}, a primeira em ${formatPeriod(period)}.`,
        ],
      };
    }

    // Or a recurrence's month of the merchant, with an amount near the line's.
    const found =
      samePurchase ??
      (type === 'DEBIT'
        ? open.find(
            (transaction) =>
              transaction.recurrenceId !== null &&
              closeAmount(transaction.amountCents, line.amountCents),
          )
        : undefined);
    if (found) return asMatch(found);
    return line.kind === 'REFUND'
      ? {
          ...row,
          warnings: [
            'Valor negativo na fatura: entra como entrada (um estorno). Desmarque se não quiser.',
          ],
        }
      : row;
  });
}

/**
 * The review again after the reference month or the due date changed (ADR 0055 note): the rows
 * as the new statement gives them, but a row the person already touched keeps what they chose
 * (checked or not, category, merchant, description, alias...). It takes the new due date, and
 * the new month unless it was moved to another one by hand.
 */
export function mergeStatementRows(
  current: ReviewRow[],
  next: ReviewRow[],
  previousPeriod: string | null,
): ReviewRow[] {
  return next.map((row) => {
    const old = current.find((item) => item.line === row.line);
    if (!old?.touched) return row;
    return {
      ...old,
      period: old.period === previousPeriod ? row.period : old.period,
      dueDate: row.dueDate,
      plan: old.plan ?? row.plan,
      warnings: row.warnings,
    };
  });
}

/**
 * A debit paid by credit card in the reference month whose amount is close to the whole
 * statement (within 5%): the bill seems already launched in full, and importing its purchases
 * would count them twice (ADR 0055). Null when there is none.
 */
export function wholeBillAlreadyLaunched(lines: StatementLine[], context: StatementContext) {
  const total = lines.reduce(
    (sum, line) =>
      line.kind === 'PURCHASE'
        ? sum + line.amountCents
        : line.kind === 'REFUND'
          ? sum - line.amountCents
          : sum,
    0,
  );
  if (total <= 0) return null;
  const transaction = context.transactions.find(
    (item) =>
      item.period === context.period &&
      item.type === 'DEBIT' &&
      item.paymentMethod === 'CREDIT_CARD' &&
      item.installment === null &&
      Math.abs(item.amountCents - total) <= total * 0.05,
  );
  return transaction ? { transaction, totalCents: total } : null;
}

/**
 * How another line relates to the one whose choices were made: the same title, or a title the
 * alias learned on it begins (as the next statement would read it); null for neither.
 */
function sameLine(row: ReviewRow, other: ReviewRow, alias: string | null | undefined) {
  if (other.line === row.line || !row.statementTitle || !other.statementTitle) return null;
  if (other.type !== row.type) return null;
  const title = statementTitleKey({ title: other.statementTitle });
  if (title === statementTitleKey({ title: row.statementTitle })) return 'TITLE';
  const key = alias ? normalizeStatementTitle(alias) : '';
  return key && title.startsWith(key) ? 'ALIAS' : null;
}

/**
 * The choices made on one line of a statement go to the other lines that do not have them yet
 * (ADR 0055 notes): those of the same title and, with an alias to remember, those it begins, as
 * the next statement would find them. The merchant (and its name as the description, when the
 * description was still the statement's text) and the category.
 */
export function applyToSameTitle(rows: ReviewRow[], fixed: ReviewRow): ReviewRow[] {
  return rows.map((row) => {
    if (row.line === fixed.line) return fixed;
    const how = sameLine(fixed, row, fixed.rememberAlias);
    if (!how) return row;
    const takesMerchant = !row.merchantName && Boolean(fixed.merchantName);
    const takesCategory = !row.categoryId && Boolean(fixed.categoryId);
    if (!takesMerchant && !takesCategory) return row;
    return {
      ...row,
      merchantName: takesMerchant ? fixed.merchantName : row.merchantName,
      description: takesMerchant ? fixed.merchantName : row.description,
      // Its merchant came from the alias: there is none to learn on it.
      ...(takesMerchant && how === 'ALIAS' && { merchantByAlias: true }),
      categoryId: row.categoryId ?? fixed.categoryId,
      touched: true,
    };
  });
}

/**
 * How many other lines of the statement take this line's choices: the same title, and those
 * the alias begins.
 */
export function sameTitleCount(rows: ReviewRow[], row: ReviewRow, alias?: string | null) {
  return rows.filter((other) => sameLine(row, other, alias)).length;
}

/**
 * The merchants named in the review that do not exist yet (ADR 0055 note): created on import,
 * offered meanwhile to the other lines, with the aliases they are to learn.
 */
export function pendingMerchants(rows: ReviewRow[], merchants: Merchant[]) {
  const known = new Set(merchants.map((merchant) => normalizeName(merchant.name)));
  const pending = new Map<string, { name: string; aliases: string[] }>();
  for (const row of rows) {
    const name = row.merchantName.trim();
    const key = normalizeName(name);
    if (!name || known.has(key)) continue;
    const entry = pending.get(key) ?? { name, aliases: [] };
    const alias = row.rememberAlias?.trim();
    if (alias && !entry.aliases.includes(alias)) entry.aliases.push(alias);
    pending.set(key, entry);
  }
  return [...pending.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
