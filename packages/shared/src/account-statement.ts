import type { TransactionType } from './category.ts';
import type { ImportIssue } from './import-template.ts';
import { normalizeName } from './import-template.ts';
import type { PaymentMethod } from './payment-method.ts';
import { csvFields, readDay } from './statement.ts';

// Extrato da conta (ADR 0061): one reader per bank turns its file into the same lines, as the
// card statement does (ADR 0055). Pure: the web app reads the file and hands over its text. The
// bank writes the other side's CPF or CNPJ, bank, branch and account into each line; the reader
// keeps only the name, and nothing else of the line leaves it (ADR 0012).

/** What a movement of the account is, before the review decides what it becomes. */
export const accountLineKinds = [
  'PIX',
  'TRANSFER',
  'DEBIT_PURCHASE',
  'BOLETO',
  /** The card bill paid: its purchases come with the card statement. */
  'CARD_BILL',
  /** Money into or out of a savings box (RDB): it stays the person's. */
  'SAVINGS',
  'REFUND',
  'OTHER',
] as const;

export type AccountLineKind = (typeof accountLineKinds)[number];

/** One movement of an account statement, whatever the bank. */
export type AccountLine = {
  /** The line in the file (the header is line 1), for the report. */
  line: number;
  /** The bank's identifier of the movement, with the bank: "NUBANK:<id>" (ADR 0061). */
  externalId: string;
  /** The day it happened, which is also the day it was paid or received. */
  occurredOn: string;
  type: TransactionType;
  /** Always positive; `type` says which way it goes. */
  amountCents: number;
  kind: AccountLineKind;
  /** Who is on the other side, by name only; null when the bank names nobody. */
  counterpart: string | null;
  /** A CPF says a person and a CNPJ a company; null when the line has neither. */
  counterpartIs: 'PERSON' | 'COMPANY' | null;
  /** What the transaction is called: the other side, or what the movement is. */
  description: string;
  paymentMethod: PaymentMethod | null;
};

/** The identifier as the bank writes it: letters, digits and dashes, short. */
const IDENTIFIER = /^[\w-]{1,64}$/;

/** "-1234.56", "86.5", "100": signed cents, the account statement's way; null otherwise. */
function readDotAmount(text: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.replace(/\s/g, ''));
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

/** "•••.123.456-••", "***.123.456-**" or a whole one. */
const CPF = /^[•*\d]{3}\.[•*\d]{3}\.[•*\d]{3}-[•*\d]{2}$/;
const CNPJ = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

/** A part of the line that names a bank, a branch or an account: never kept. */
const isBankPart = (part: string) => /ag[eê]ncia|conta:|\(\d{3,4}\)/i.test(part);

const isDocument = (part: string) => CPF.test(part) || CNPJ.test(part);

/** Words kept in lower case when a name in capitals is set right ("JOAO DA SILVA"). */
const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

/** "JOÃO DA SILVA" → "João da Silva"; a name already in mixed case stays as written. */
function readableName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      // "S.A." stays an abbreviation.
      /^[a-z](\.[a-z])+\.?$/.test(word)
        ? word.toUpperCase()
        : index > 0 && PARTICLES.has(word)
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/** How each kind starts, normalized; the first that matches wins. */
const KINDS: readonly [string, AccountLineKind, PaymentMethod | null][] = [
  ['estorno', 'REFUND', null],
  ['reembolso', 'REFUND', null],
  ['transferencia enviada pelo pix', 'PIX', 'PIX'],
  ['transferencia recebida pelo pix', 'PIX', 'PIX'],
  ['transferencia', 'TRANSFER', 'TRANSFER'],
  ['compra no debito', 'DEBIT_PURCHASE', 'DEBIT_CARD'],
  ['pagamento de boleto', 'BOLETO', 'BOLETO'],
  ['pagamento de fatura', 'CARD_BILL', null],
  ['aplicacao rdb', 'SAVINGS', null],
  ['resgate rdb', 'SAVINGS', null],
  ['dinheiro guardado', 'SAVINGS', null],
  ['dinheiro resgatado', 'SAVINGS', null],
];

/** What a movement is called when the bank names nobody on the other side. */
const KIND_DESCRIPTIONS: Record<AccountLineKind, string> = {
  PIX: 'Pix',
  TRANSFER: 'Transferência',
  DEBIT_PURCHASE: 'Compra no débito',
  BOLETO: 'Boleto',
  CARD_BILL: 'Pagamento de fatura',
  SAVINGS: 'Caixinha',
  REFUND: 'Estorno',
  OTHER: 'Movimento da conta',
};

/**
 * The parts of a description: what it is, then who, a document and the bank, joined by " - ".
 * Gives the kind, the name of the other side (never the document or the bank) and the method.
 */
function readDescription(text: string) {
  const parts = text.split(/\s+-\s+/).map((part) => part.trim());
  const head = normalizeName(parts[0] ?? '');
  const [, kind, paymentMethod] = KINDS.find(([start]) => head.startsWith(start)) ?? [
    '',
    'OTHER' as const,
    null,
  ];
  // A refund names what it gives back first ("Estorno - Compra no débito - Loja"): skip it.
  let rest = parts.slice(1);
  while (
    kind === 'REFUND' &&
    rest.length > 0 &&
    KINDS.some(([start]) => normalizeName(rest[0] ?? '').startsWith(start))
  ) {
    rest = rest.slice(1);
  }
  const document = rest.find(isDocument);
  const name = rest.find((part) => part !== '' && !isDocument(part) && !isBankPart(part));
  // A savings box and a card bill have no other side, whatever follows ("Resgate RDB - Viagem").
  const counterpart = kind === 'SAVINGS' || kind === 'CARD_BILL' || !name ? null : name;
  const counterpartIs: AccountLine['counterpartIs'] = !document
    ? null
    : CPF.test(document)
      ? 'PERSON'
      : 'COMPANY';
  // A line the reader does not know keeps its first part, never what may follow it.
  const description = counterpart
    ? readableName(counterpart)
    : kind === 'OTHER'
      ? parts[0] || KIND_DESCRIPTIONS.OTHER
      : KIND_DESCRIPTIONS[kind];
  return {
    kind,
    counterpart: counterpart && readableName(counterpart),
    counterpartIs: counterpart ? counterpartIs : null,
    description: description.slice(0, 200),
    paymentMethod,
  };
}

/**
 * Reads the CSV of a Nubank account statement (`Data,Valor,Identificador,Descrição`: the day as
 * DD/MM/AAAA, the amount with a dot and a sign, negative going out) into account lines plus a
 * report. A line it cannot read is left out with an error, a zero amount skipped, and an
 * identifier repeated in the file is read once. Columns are found by title, whatever the order.
 */
export function parseNubankAccountCsv(text: string): {
  lines: AccountLine[];
  issues: ImportIssue[];
} {
  const issues: ImportIssue[] = [];
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = csvFields(rows[0] ?? '').map(normalizeName);
  const column = (name: string) => header.indexOf(name);
  const [dateAt, amountAt, idAt, descriptionAt] = [
    column('data'),
    column('valor'),
    column('identificador'),
    column('descricao'),
  ];
  if (dateAt < 0 || amountAt < 0 || idAt < 0 || descriptionAt < 0) {
    issues.push({
      line: 1,
      severity: 'error',
      message:
        'Este arquivo não parece o extrato da conta do Nubank: faltam as colunas Data, Valor, ' +
        'Identificador e Descrição.',
    });
    return { lines: [], issues };
  }
  const lines: AccountLine[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    if (row.trim() === '') return;
    const fields = csvFields(row);
    const occurredOn = readDay(fields[dateAt] ?? '');
    const amount = readDotAmount(fields[amountAt] ?? '');
    const identifier = fields[idAt] ?? '';
    const description = (fields[descriptionAt] ?? '').replace(/\s+/g, ' ').trim();
    if (!occurredOn || amount === null || !IDENTIFIER.test(identifier) || !description) {
      issues.push({
        line,
        severity: 'error',
        message: !occurredOn
          ? 'Data inválida nesta linha.'
          : amount === null
            ? 'Valor inválido nesta linha.'
            : !IDENTIFIER.test(identifier)
              ? 'Identificador inválido nesta linha.'
              : 'Linha sem descrição.',
      });
      return;
    }
    if (amount === 0) return;
    const externalId = `NUBANK:${identifier}`;
    if (seen.has(externalId)) return;
    seen.add(externalId);
    lines.push({
      line,
      externalId,
      occurredOn,
      type: amount > 0 ? 'CREDIT' : 'DEBIT',
      amountCents: Math.abs(amount),
      ...readDescription(description),
    });
  });
  if (lines.length === 0 && issues.length === 0) {
    issues.push({ line: null, severity: 'error', message: 'O extrato não tem movimentos.' });
  }
  return { lines, issues };
}
