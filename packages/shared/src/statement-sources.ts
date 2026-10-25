import { normalizeName } from './import-template.ts';
import type { ImportKind, StatementBank } from './import.ts';

/** A statement a bank offers (ADR 0060): its kind, as the screen names it, and its CSV header. */
export interface StatementSource {
  kind: Exclude<ImportKind, 'TEMPLATE'>;
  label: string;
  /** Its name on the segmented control, short enough for the phone ("Fatura", "Conta"). */
  short: string;
  /** False while its reader is not written: shown, not chosen. */
  available: boolean;
  /** The columns of its header, normalized (`normalizeName`), whatever their order. */
  columns: readonly string[];
}

/** A bank and the statements it offers. */
export interface StatementBankSource {
  bank: StatementBank;
  label: string;
  sources: readonly StatementSource[];
}

/**
 * The banks whose statements can be imported, and their kinds (ADR 0060). Adding a bank, or a
 * kind of one, is adding it here with its reader and tests (with invented lines, ADR 0019): the
 * screen is built from this list.
 */
export const statementBanks: readonly StatementBankSource[] = [
  {
    bank: 'NUBANK',
    label: 'Nubank',
    sources: [
      {
        kind: 'CARD_STATEMENT',
        label: 'Fatura do cartão',
        short: 'Fatura',
        available: true,
        columns: ['date', 'title', 'amount'],
      },
      {
        kind: 'ACCOUNT_STATEMENT',
        label: 'Conta',
        short: 'Conta',
        available: true,
        columns: ['data', 'valor', 'identificador', 'descricao'],
      },
    ],
  },
];

/**
 * Which statement a file is, by its header: so a file of the wrong kind is told apart from an
 * unreadable one ("Este arquivo parece o extrato da conta"). Null when no source matches.
 */
export function detectStatement(
  text: string,
): { bank: StatementBankSource; source: StatementSource } | null {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/)[0] ?? '';
  const header = new Set(
    firstLine.split(',').map((field) => normalizeName(field.replace(/"/g, ''))),
  );
  for (const bank of statementBanks) {
    for (const source of bank.sources) {
      if (source.columns.every((column) => header.has(column))) return { bank, source };
    }
  }
  return null;
}
