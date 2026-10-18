import {
  findMerchantByAlias,
  formatCents,
  formatPeriod,
  installmentsCreated,
  MAX_DUE_MONTH_OFFSET,
  normalizeName,
  shiftPeriod,
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
import type { ReviewRow } from './review';

// The review of a card statement (ADR 0055 and its notes), kept apart from the screen: what each
// line of the bank's file becomes, and why a line comes unchecked. Nothing here talks to the API.

/** What the review needs to know about the workspace, read before it opens. */
export type StatementContext = {
  /** The bill's due date, typed by the person: every line is due on it. */
  dueDate: string;
  merchants: Merchant[];
  categories: Category[];
  hints: CategoryHints | undefined;
  plans: InstallmentPlan[];
  /** The transactions of the competências the lines go to (`statementPeriods`). */
  transactions: Transaction[];
};

/** "2026-11" − "2026-10" = 1: how many months the first is after the second. */
const monthsBetween = (later: string, earlier: string) =>
  (Number(later.slice(0, 4)) - Number(earlier.slice(0, 4))) * 12 +
  Number(later.slice(5, 7)) -
  Number(earlier.slice(5, 7));

/**
 * The competência of a line (ADR 0055 note): the month of the purchase, and of an installment the
 * purchase's month plus its number ("Parcela 3/10" of 28/08 is October's).
 */
export function linePeriod(line: StatementLine): string {
  return shiftPeriod(line.occurredOn.slice(0, 7), (line.installment?.number ?? 1) - 1);
}

/** Every competência a statement's lines go to: what the review compares with. */
export function statementPeriods(lines: StatementLine[]): string[] {
  return [...new Set(lines.map(linePeriod))].sort();
}

/** A recurrence's month is "the same" when within 10% of the line (an energy bill varies). */
const closeAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.1;

const sameText = (a: string, b: string) => normalizeName(a) === normalizeName(b);

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
 * Rows from a card statement's lines: each purchase a debit of the month it was made in, due on
 * the bill's due date, paid by credit card, with the merchant of its alias (its name as the
 * description, ADR 0055 note) and the category of the history. An installment starts a plan,
 * unless it already belongs to one; the last one is a plain transaction. The payment of the last
 * bill, a purchase already imported and a recurrence's month come unchecked, with the reason.
 */
export function startStatementReview(
  lines: StatementLine[],
  context: StatementContext,
): ReviewRow[] {
  const dueMonth = context.dueDate.slice(0, 7);
  return lines.map((line) => {
    const type: TransactionType = line.kind === 'PURCHASE' ? 'DEBIT' : 'CREDIT';
    const period = linePeriod(line);
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
    const skip = (reason: string): ReviewRow => ({ ...row, included: false, warnings: [reason] });

    if (line.kind === 'PAYMENT') {
      return skip('Pagamento da fatura anterior: não é uma entrada.');
    }
    if (line.installment) {
      const { number, count } = line.installment;
      if (number === count) {
        return {
          ...row,
          notes: `Parcela ${number}/${count}`,
          warnings: [
            `A última parcela entra como um lançamento simples, com "Parcela ${number}/${count}" nas observações.`,
          ],
        };
      }
      const plan = existingPlan(line, description, merchantId, context.plans);
      if (plan) {
        return skip(
          `Já lançada: é a parcela ${number}/${count} do parcelamento "${plan.description}".`,
        );
      }
      // Each installment is due in the month after its own, like this one; a purchase made after
      // the bill closed would be due two months later, more than a plan takes, so it starts a
      // month later instead.
      const firstPeriod =
        monthsBetween(dueMonth, period) > MAX_DUE_MONTH_OFFSET
          ? shiftPeriod(dueMonth, -MAX_DUE_MONTH_OFFSET)
          : period;
      const dueMonthOffset = Math.max(0, monthsBetween(dueMonth, firstPeriod));
      const created = count - number + 1;
      return {
        ...row,
        period: firstPeriod,
        plan: { installments: count, firstNumber: number, dueMonthOffset },
        warnings: [
          `Vai criar um parcelamento: da ${number}/${count} à ${count}/${count}, ${created} parcelas de ${formatCents(line.amountCents)}, a primeira em ${formatPeriod(firstPeriod)}.`,
        ],
      };
    }

    const sameMerchant = (transaction: Transaction) =>
      merchantId
        ? transaction.merchantId === merchantId
        : sameText(transaction.description, description);
    const imported = context.transactions.find(
      (transaction) =>
        transaction.period === period &&
        transaction.type === type &&
        transaction.occurredOn === line.occurredOn &&
        transaction.amountCents === line.amountCents &&
        sameMerchant(transaction),
    );
    if (imported) {
      return skip(
        `Possivelmente já importada: ${formatPeriod(period)} já tem esta compra, no mesmo dia e valor.`,
      );
    }
    const recurring =
      type === 'DEBIT'
        ? context.transactions.find(
            (transaction) =>
              transaction.period === period &&
              transaction.recurrenceId !== null &&
              transaction.type === 'DEBIT' &&
              sameMerchant(transaction) &&
              closeAmount(transaction.amountCents, line.amountCents),
          )
        : undefined;
    if (recurring) {
      const difference =
        recurring.amountCents === line.amountCents
          ? ''
          : ` (${formatCents(recurring.amountCents)} na recorrência; a fatura diz ${formatCents(line.amountCents)})`;
      return skip(
        `Já lançada pela recorrência "${recurring.description}"${difference}. Para o valor real, edite o lançamento da recorrência.`,
      );
    }
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
 * A debit paid by credit card in a month of the statement whose amount is close to the whole
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
      item.type === 'DEBIT' &&
      item.paymentMethod === 'CREDIT_CARD' &&
      item.installment === null &&
      Math.abs(item.amountCents - total) <= total * 0.05,
  );
  return transaction ? { transaction, totalCents: total } : null;
}

/**
 * The choices made on one line of a statement go to the other lines of the same title that do
 * not have them yet (ADR 0055 note): the merchant (and its name as the description, when the
 * description was still the statement's text) and the category.
 */
export function applyToSameTitle(rows: ReviewRow[], fixed: ReviewRow): ReviewRow[] {
  if (!fixed.statementTitle) return rows.map((row) => (row.line === fixed.line ? fixed : row));
  const key = statementTitleKey({ title: fixed.statementTitle });
  return rows.map((row) => {
    if (row.line === fixed.line) return fixed;
    if (!row.statementTitle || row.type !== fixed.type) return row;
    if (statementTitleKey({ title: row.statementTitle }) !== key) return row;
    const takesMerchant = !row.merchantName && Boolean(fixed.merchantName);
    return {
      ...row,
      merchantName: takesMerchant ? fixed.merchantName : row.merchantName,
      description: takesMerchant ? fixed.merchantName : row.description,
      categoryId: row.categoryId ?? fixed.categoryId,
    };
  });
}

/** How many other lines of the statement share this line's title (and so take its choices). */
export function sameTitleCount(rows: ReviewRow[], row: ReviewRow) {
  if (!row.statementTitle) return 0;
  const key = statementTitleKey({ title: row.statementTitle });
  return rows.filter(
    (other) =>
      other.line !== row.line &&
      other.type === row.type &&
      other.statementTitle &&
      statementTitleKey({ title: other.statementTitle }) === key,
  ).length;
}
