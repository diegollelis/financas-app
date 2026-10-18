import type { ImportIssue } from './import-template.ts';
import { normalizeName } from './import-template.ts';
import { normalizeStatementTitle } from './merchant-alias.ts';
import { isoDateSchema, parseReais } from './money-and-dates.ts';

// Fatura do cartão (ADR 0055): one reader per bank turns its file into the same lines, and
// everything after (aliases, installments, the review) is the same for every bank. Pure: the web
// app reads the file and hands over its text, so the rules are tested without a file.

/** What a line of a card statement is, before the review decides what it becomes. */
export const statementLineKinds = ['PURCHASE', 'PAYMENT', 'REFUND'] as const;

export type StatementLineKind = (typeof statementLineKinds)[number];

/** One line of a card statement, whatever the bank. */
export type StatementLine = {
  /** The line in the file (the header is line 1), for the report. */
  line: number;
  /** The day of the purchase (ADR 0055). */
  occurredOn: string;
  /** As the bank writes it, "Ifd*Pizzaria Exemplo - Parcela 3/10". */
  title: string;
  /** The title cleaned for aliases and for a description (no installment at the end). */
  cleanTitle: string;
  /** Always positive; `kind` says which way it goes. */
  amountCents: number;
  /** "Parcela 3/10" in the title; null for a purchase paid at once. */
  installment: { number: number; count: number } | null;
  /**
   * PURCHASE: a debit. PAYMENT: the last bill paid ("Pagamento recebido"), not an inflow.
   * REFUND: a negative amount that is not a payment (an IOF given back, a purchase undone).
   */
  kind: StatementLineKind;
};

/** " - Parcela 3/10" (or without the dash) at the end of a title. */
const INSTALLMENT = /\s*-?\s*parcela\s+(\d+)\s*\/\s*(\d+)\s*$/i;

/** The bill's payment: an amount out of the card, not money that came in. */
const PAYMENT_TITLES = ['pagamento recebido', 'pagamento em'];

/** Splits one CSV line, keeping quoted fields whole ("5.150,01" has a comma inside). */
function csvFields(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

/** "2026-10-16" or "16/10/2026" → "2026-10-16"; null when it is not a day. */
function readDay(text: string): string | null {
  const dayMonthYear = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const iso = dayMonthYear
    ? `${dayMonthYear[3]}-${dayMonthYear[2]?.padStart(2, '0')}-${dayMonthYear[1]?.padStart(2, '0')}`
    : text;
  return isoDateSchema.safeParse(iso).success ? iso : null;
}

/** "31,90", "5.150,01", "- 1,64", "-1.64": signed cents; null when it is not an amount. */
function readSignedAmount(text: string): number | null {
  const cleaned = text.replace(/\s/g, '');
  const negative = cleaned.startsWith('-');
  const cents = parseReais(negative ? cleaned.slice(1) : cleaned);
  if (cents === null) return null;
  return negative ? -cents : cents;
}

/**
 * Reads the CSV of a Nubank card statement (`date,title,amount`, the amount as Brazilian text)
 * into statement lines plus a report. A line it cannot read is left out with an error; a zero
 * amount is skipped. Columns are found by their title, whatever the order.
 */
export function parseNubankCsv(text: string): { lines: StatementLine[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = csvFields(rows[0] ?? '').map(normalizeName);
  const column = (name: string) => header.indexOf(name);
  const [dateAt, titleAt, amountAt] = [column('date'), column('title'), column('amount')];
  if (dateAt < 0 || titleAt < 0 || amountAt < 0) {
    issues.push({
      line: 1,
      severity: 'error',
      message:
        'Este arquivo não parece a fatura do Nubank: faltam as colunas date, title e amount.',
    });
    return { lines: [], issues };
  }
  const lines: StatementLine[] = [];
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    if (row.trim() === '') return;
    const fields = csvFields(row);
    const occurredOn = readDay(fields[dateAt] ?? '');
    const title = (fields[titleAt] ?? '').replace(/\s+/g, ' ').trim();
    const amount = readSignedAmount(fields[amountAt] ?? '');
    if (!occurredOn || !title || amount === null) {
      issues.push({
        line,
        severity: 'error',
        message: !occurredOn
          ? 'Data inválida nesta linha.'
          : !title
            ? 'Linha sem descrição.'
            : 'Valor inválido nesta linha.',
      });
      return;
    }
    if (amount === 0) return;
    const parcel = INSTALLMENT.exec(title);
    const number = Number(parcel?.[1]);
    const count = Number(parcel?.[2]);
    const installment =
      parcel && number >= 1 && count >= 2 && number <= count ? { number, count } : null;
    const normalized = normalizeName(title);
    const kind: StatementLineKind =
      amount > 0
        ? 'PURCHASE'
        : PAYMENT_TITLES.some((payment) => normalized.startsWith(payment))
          ? 'PAYMENT'
          : 'REFUND';
    lines.push({
      line,
      occurredOn,
      title,
      cleanTitle: title.replace(INSTALLMENT, '').trim() || title,
      amountCents: Math.abs(amount),
      installment,
      kind,
    });
  });
  if (lines.length === 0 && issues.length === 0) {
    issues.push({ line: null, severity: 'error', message: 'A fatura não tem lançamentos.' });
  }
  return { lines, issues };
}

/** "Nubank_2026-11-04.csv" → "2026-11-04", the bill's due date; null when the name lacks it. */
export function statementDueDateFromFileName(fileName: string): string | null {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(fileName);
  return match && isoDateSchema.safeParse(match[1]).success ? match[1]! : null;
}

/** The key that groups lines of the same merchant in a statement (ADR 0055 note). */
export const statementTitleKey = (line: Pick<StatementLine, 'title'>) =>
  normalizeStatementTitle(line.title);
