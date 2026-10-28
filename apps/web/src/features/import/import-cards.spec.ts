import type { Card } from '@financas/shared';
import { describe, expect, it } from 'vitest';
import { cardLinesByFunction, defaultImportCard, withImportCards } from './import-cards';

// Invented cards (ADR 0019).
const card = (n: number, fields: Partial<Card>): Card => ({
  id: `01920000-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`,
  name: `Cartão ${n}`,
  bank: 'NUBANK',
  functions: ['CREDIT', 'DEBIT'],
  closingDay: 27,
  dueDay: 4,
  archived: false,
  inUse: false,
  ...fields,
});

describe('the cards of an import (ADR 0062 note)', () => {
  it('counts the lines of each card function', () => {
    expect(
      cardLinesByFunction([
        { paymentMethod: 'CREDIT_CARD' },
        { paymentMethod: 'CREDIT_CARD' },
        { paymentMethod: 'DEBIT_CARD' },
        { paymentMethod: 'PIX' },
        { paymentMethod: null },
      ]),
    ).toEqual({ CREDIT: 2, DEBIT: 1 });
  });

  it("starts with the only card of the statement's bank, else the only one at all", () => {
    const nubank = card(1, {});
    const other = card(2, { bank: null, functions: ['DEBIT'], closingDay: null, dueDay: null });
    expect(defaultImportCard([nubank, other], 'DEBIT', 'NUBANK')).toBe(nubank.id);
    // The template has no bank: two cards with Débito are a choice to make.
    expect(defaultImportCard([nubank, other], 'DEBIT', null)).toBe('');
    expect(defaultImportCard([nubank, other], 'CREDIT', null)).toBe(nubank.id);
    expect(defaultImportCard([card(3, { archived: true })], 'CREDIT', 'NUBANK')).toBe('');
  });

  it('gives each line in Crédito or Débito the card of its function', () => {
    expect(
      withImportCards(
        [
          { paymentMethod: 'CREDIT_CARD' },
          { paymentMethod: 'DEBIT_CARD' },
          { paymentMethod: 'PIX' },
        ],
        { CREDIT: 'c', DEBIT: '' },
      ),
    ).toEqual([
      { paymentMethod: 'CREDIT_CARD', cardId: 'c' },
      { paymentMethod: 'DEBIT_CARD' },
      { paymentMethod: 'PIX' },
    ]);
  });
});
