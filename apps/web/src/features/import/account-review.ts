import {
  findMerchantByAlias,
  formatCents,
  formatIsoDate,
  formatPeriod,
  normalizeName,
  shiftPeriod,
  suggestCategory,
  TRANSACTION_DESCRIPTION_MAX_LENGTH,
  type AccountLine,
  type Category,
  type CategoryHints,
  type Merchant,
  type Person,
  type Transaction,
} from '@financas/shared';
import {
  takesMatch,
  takesPart,
  type AccountMatch,
  type AccountPart,
  type ReviewRow,
} from './review';

// The review of an account statement (ADR 0061), kept apart from the screen: each movement is
// first compared with what is already in the app, so nothing comes in twice. A pending
// transaction is settled on the movement's day; only what is not there becomes a new one.

/** What the review needs to know about the workspace, read before it opens. */
export type AccountContext = {
  /** The movements of the file already imported (`POST …/imports/candidates`). */
  known: ReadonlySet<string>;
  /** The transactions without a movement one may be: pending, and settled near the statement. */
  candidates: Transaction[];
  merchants: Merchant[];
  categories: Category[];
  people: Person[];
  hints: CategoryHints | undefined;
  /** The account's name: a movement to or from it is money between the person's accounts. */
  userName: string;
};

/** Days from one ISO date to another, by the calendar (no time zone shift). */
function daysBetween(a: string, b: string): number {
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((day(b) - day(a)) / 86_400_000);
}

/** A settled transaction is the movement when settled within this many days of it. */
const SETTLED_DAYS = 5;
/** A pending one with a due date, when due within this many days of it. */
const DUE_DAYS = 10;

/**
 * Whether a transaction's dates fit the movement's day: settled within 5 days; pending, due
 * within 10 days, or, with no due date, of the movement's month or the one before.
 */
function fitsDay(transaction: Transaction, day: string): boolean {
  if (transaction.settledAt)
    return Math.abs(daysBetween(transaction.settledAt, day)) <= SETTLED_DAYS;
  if (transaction.dueDate) return Math.abs(daysBetween(transaction.dueDate, day)) <= DUE_DAYS;
  const month = day.slice(0, 7);
  return transaction.period === month || transaction.period === shiftPeriod(month, -1);
}

/** How far a transaction is from the movement's day, to pick the closest. */
function distance(transaction: Transaction, day: string): number {
  const date = transaction.settledAt ?? transaction.dueDate ?? `${transaction.period}-15`;
  return Math.abs(daysBetween(date, day));
}

/**
 * "Valor diferente": within 20% (an energy bill varies, a price changed), and only with the same
 * merchant, person or description, which keeps it from taking another transaction.
 */
const closeAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.2;

/** The words of the account's name in the other side's name: a transfer between one's accounts. */
function isOwnName(counterpart: string | null, userName: string): boolean {
  if (!counterpart) return false;
  const words = new Set(normalizeName(counterpart).split(' '));
  const own = normalizeName(userName)
    .split(' ')
    .filter((word) => word.length > 2);
  // The first and the last name are enough: a bank writes the whole name.
  const first = own[0];
  const last = own.at(-1);
  return Boolean(first && last && words.has(first) && words.has(last));
}

/**
 * Rows from an account statement's movements: the ones already imported leave (only counted);
 * each other one is matched with a transaction already in the app, of the same side, or comes
 * in as a new one, settled on its day, in its month. The card bill, savings boxes and money
 * between the person's accounts come unchecked, with the reason, and so do a credit that seems
 * a loan coming back and a bill that seems last month's.
 */
export function startAccountReview(
  lines: AccountLine[],
  context: AccountContext,
): { rows: ReviewRow[]; knownCount: number } {
  const fresh = lines.filter((line) => !context.known.has(line.externalId));
  const used = new Set<string>();
  // What each loan still has, as the movements before take parts of it.
  const left = new Map<string, number>();
  const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b);
  const personOf = (name: string | null) =>
    name ? context.people.find((person) => !person.archived && sameName(person.name, name)) : null;

  const rows = fresh.map((line): ReviewRow => {
    const { type } = line;
    const month = line.occurredOn.slice(0, 7);
    // A company is found among the merchants, by alias or by name; a person, among the people.
    const merchantId =
      line.counterpartIs === 'PERSON'
        ? null
        : findMerchantByAlias(line.counterpart ?? line.description, context.merchants);
    const merchant =
      context.merchants.find((item) => item.id === merchantId) ??
      (line.counterpart && line.counterpartIs !== 'PERSON'
        ? context.merchants.find((item) => sameName(item.name, line.counterpart!))
        : undefined);
    const person = line.counterpartIs === 'PERSON' ? personOf(line.counterpart) : null;
    const description = (merchant?.name ?? line.description).slice(
      0,
      TRANSACTION_DESCRIPTION_MAX_LENGTH,
    );
    const suggested =
      context.hints && line.kind !== 'CARD_BILL' && line.kind !== 'SAVINGS'
        ? suggestCategory(context.hints, { type, description, merchantId: merchant?.id ?? null })
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
      ...(person && { personName: person.name }),
      paymentMethod: line.paymentMethod,
      categoryId,
      amountCents: line.amountCents,
      period: month,
      occurredOn: line.occurredOn,
      dueDate: null,
      settledAt: line.occurredOn,
      warnings: [],
      statementTitle: line.description,
      merchantByAlias: Boolean(merchantId),
      rememberAlias: null,
      externalId: line.externalId,
    };
    const skip = (reason: string): ReviewRow => ({
      ...row,
      included: false,
      skipped: true,
      warnings: [reason],
    });

    if (line.kind === 'CARD_BILL') {
      return skip(
        'As compras do cartão vêm da fatura: importar o pagamento contaria tudo duas vezes.',
      );
    }
    if (line.kind === 'SAVINGS') {
      return skip('Dinheiro que entrou ou saiu de uma caixinha: continua seu.');
    }
    if (isOwnName(line.counterpart, context.userName)) {
      return skip(
        type === 'CREDIT'
          ? 'Entre as suas contas: veio de uma conta no seu nome.'
          : 'Entre as suas contas: foi para uma conta no seu nome.',
      );
    }

    // The same movement already in the app: the same side, and the same amount on a day that
    // fits; else, close in amount with the same merchant, person or description.
    const open = context.candidates.filter(
      (transaction) =>
        !used.has(transaction.id) &&
        transaction.type === type &&
        fitsDay(transaction, line.occurredOn),
    );
    const sameOne = (transaction: Transaction) =>
      (merchant && transaction.merchantId === merchant.id) ||
      (person && transaction.personId === person.id) ||
      sameName(transaction.description, description);
    const closest = (list: Transaction[]) =>
      [...list].sort((a, b) => distance(a, line.occurredOn) - distance(b, line.occurredOn))[0];
    const exact = closest(
      open.filter((transaction) => transaction.amountCents === line.amountCents),
    );
    const near = exact
      ? undefined
      : closest(
          open.filter(
            (transaction) =>
              sameOne(transaction) && closeAmount(transaction.amountCents, line.amountCents),
          ),
        );
    const found = exact ?? near;
    if (found) {
      used.add(found.id);
      const match: AccountMatch = {
        transactionId: found.id,
        description: found.description,
        pending: found.settledAt === null,
        date: found.settledAt ?? found.dueDate,
        amountCents: found.amountCents,
        sameAmount: found.amountCents === line.amountCents,
      };
      return { ...row, match };
    }

    // Money lent coming back, or paid back, with no due date (ADR 0057): a part of the loan,
    // which "Recebimento parcial" records without counting it twice.
    if (person) {
      // Every loan of this person still pending with no due date, in a marked category: a
      // person may have several (one lent with "Emprestado para", older ones launched once).
      const loans = context.candidates.filter(
        (transaction) =>
          transaction.personId === person.id &&
          transaction.type === type &&
          transaction.settledAt === null &&
          transaction.dueDate === null &&
          context.categories.some(
            (category) => category.id === transaction.categoryId && category.neutral,
          ),
      );
      const remainingOf = (loan: Transaction) => left.get(loan.id) ?? loan.amountCents;
      // A part only of one that takes parts (ADR 0057): launched once, not split nor a share.
      const partly = loans.filter(
        (loan) =>
          !loan.splitOfId &&
          !loan.recurrenceId &&
          !loan.installment &&
          !context.candidates.some((transaction) => transaction.splitOfId === loan.id),
      );
      // The one with the most left among those it fits in.
      const loan = partly
        .filter((item) => line.amountCents <= remainingOf(item))
        .sort((a, b) => remainingOf(b) - remainingOf(a))[0];
      if (loan) {
        const remaining = remainingOf(loan);
        left.set(loan.id, remaining - line.amountCents);
        return {
          ...row,
          part: {
            transactionId: loan.id,
            description: loan.description,
            personName: person.name,
            remainingCents: remaining,
          },
        };
      }
      if (loans.length > 0) {
        const total = loans.reduce((sum, item) => sum + remainingOf(item), 0);
        // "Recebimento parcial" only when one of them takes parts.
        const hint =
          partly.length === 0
            ? ''
            : type === 'CREDIT'
              ? ' Nesse caso, em vez de importar, use "Recebimento parcial" no empréstimo.'
              : ' Nesse caso, em vez de importar, use "Pagamento parcial" na dívida.';
        return skip(
          type === 'CREDIT'
            ? `Pode ser a devolução do empréstimo a ${person.name} (faltam ${formatCents(total)}).${hint}`
            : `Pode ser um pagamento da dívida com ${person.name} (faltam ${formatCents(total)}).${hint}`,
        );
      }
    }

    // Early in the month, a bill this month's of a recurrence is due only next month: this one
    // is likely last month's, from before the app (ADR 0038 note).
    if (type === 'DEBIT' && Number(line.occurredOn.slice(8, 10)) <= 15) {
      const bill = context.candidates.find(
        (transaction) =>
          transaction.recurrenceId !== null &&
          transaction.type === 'DEBIT' &&
          transaction.period === month &&
          transaction.dueDate !== null &&
          transaction.dueDate.slice(0, 7) > month &&
          sameOne(transaction) &&
          closeAmount(transaction.amountCents, line.amountCents),
      );
      if (bill) {
        const previous = formatPeriod(shiftPeriod(month, -1));
        return skip(
          `Pode ser a conta de ${previous} de "${bill.description}", que vence no mês seguinte. ${previous.charAt(0).toUpperCase()}${previous.slice(1)} não está no app: marque se quiser lançar.`,
        );
      }
    }

    return line.kind === 'REFUND'
      ? { ...row, warnings: ['Um estorno: entra como uma entrada. Desmarque se não quiser.'] }
      : row;
  });
  return { rows, knownCount: lines.length - fresh.length };
}

/** The four groups of the review's filter (ADR 0061). */
export type AccountGroup = 'NEW' | 'MATCHED' | 'OUT';

/** Which group a row is in: already in the app (also with another amount), out, or new. */
export function accountGroup(row: ReviewRow): AccountGroup {
  if (takesMatch(row) || takesPart(row)) return 'MATCHED';
  if (row.skipped && !row.included) return 'OUT';
  return 'NEW';
}

/** What the review found, for the summary at its top. */
export function accountSummary(rows: ReviewRow[]) {
  const matched = rows.filter(takesMatch);
  return {
    matched: matched.filter((row) => row.match.sameAmount).length,
    settling: matched.filter((row) => row.match.sameAmount && row.match.pending).length,
    different: matched.filter((row) => !row.match.sameAmount).length,
    parts: rows.filter(takesPart).length,
    fresh: rows.filter((row) => accountGroup(row) === 'NEW').length,
    out: rows.filter((row) => accountGroup(row) === 'OUT').length,
  };
}

/** What a part of a loan says on the card: the loan, and what is left after it. */
export function partText(row: ReviewRow & { part: AccountPart }): string {
  const { part } = row;
  const kind = row.type === 'CREDIT' ? 'Recebimento parcial' : 'Pagamento parcial';
  const after = part.remainingCents - (row.amountCents ?? 0);
  return after === 0
    ? `${kind} de "${part.description}", de ${part.personName}: quita o que faltava, e o pendente sai da lista.`
    : `${kind} de "${part.description}", de ${part.personName}: faltam ${formatCents(part.remainingCents)}; depois deste, ${formatCents(after)}.`;
}

/** What a match says on the card: what the app has, and what importing does to it. */
export function matchText(row: ReviewRow & { match: AccountMatch }): string {
  const { match } = row;
  const when = match.date ? formatIsoDate(match.date) : null;
  // A card's line (ADR 0061 note): nothing is settled, the bill's due date goes to it.
  if (match.card) {
    const what = `"${match.description}"${match.recurring ? ', da recorrência' : ''}`;
    return match.sameAmount
      ? `Já está no app: ${what}, com o mesmo valor. Importar só põe nele o vencimento da fatura e a data da compra, sem criar nada.`
      : `Parece ${what}, com ${formatCents(match.amountCents)}. A fatura mostra ${formatCents(row.amountCents ?? 0)}.`;
  }
  if (!match.sameAmount) {
    return `Parece "${match.description}", ${match.pending ? 'pendente' : `pago em ${when}`} com ${formatCents(match.amountCents)}. O banco mostra ${formatCents(row.amountCents ?? 0)}.`;
  }
  const settled = row.type === 'CREDIT' ? 'recebido' : 'pago';
  return match.pending
    ? `O app tinha "${match.description}" pendente${when ? `, vencendo em ${when}` : ''}, com o mesmo valor. Importar marca esse lançamento como ${settled} em ${formatIsoDate(row.occurredOn ?? '')}.`
    : `Já está no app, ${settled} em ${when}, com o mesmo valor. Importar só guarda o vínculo com o extrato, sem criar nada.`;
}
