import { describe, expect, it } from 'vitest';
import { cardBillDueDate, cardFunctionOf, createCardInputSchema } from './card.ts';

describe('cardBillDueDate', () => {
  const card = { closingDay: 27, dueDay: 4 };

  it('puts a purchase up to the closing day in the bill that closes that month', () => {
    expect(cardBillDueDate(card, '2026-10-20')).toBe('2026-11-04');
    expect(cardBillDueDate(card, '2026-10-27')).toBe('2026-11-04');
  });

  it('puts a purchase after the closing day in the next bill', () => {
    expect(cardBillDueDate(card, '2026-10-28')).toBe('2026-12-04');
    expect(cardBillDueDate(card, '2026-12-30')).toBe('2027-02-04');
  });

  it('keeps the due date in the closing month when the due day comes later', () => {
    expect(cardBillDueDate({ closingDay: 2, dueDay: 10 }, '2026-10-01')).toBe('2026-10-10');
    expect(cardBillDueDate({ closingDay: 2, dueDay: 10 }, '2026-10-03')).toBe('2026-11-10');
  });

  it("closes on the month's last day when the closing day is past it", () => {
    expect(cardBillDueDate({ closingDay: 30, dueDay: 7 }, '2026-02-28')).toBe('2026-03-07');
    expect(cardBillDueDate({ closingDay: 30, dueDay: 31 }, '2026-01-31')).toBe('2026-02-28');
  });

  it('gives nothing for a card without a bill', () => {
    expect(cardBillDueDate({ closingDay: null, dueDay: null }, '2026-10-20')).toBeNull();
  });
});

describe('cards', () => {
  it('maps the Crédito and Débito methods to their function', () => {
    expect(cardFunctionOf('CREDIT_CARD')).toBe('CREDIT');
    expect(cardFunctionOf('DEBIT_CARD')).toBe('DEBIT');
    expect(cardFunctionOf('PIX')).toBeNull();
    expect(cardFunctionOf(null)).toBeNull();
  });

  it('asks the days of the bill only of a credit card', () => {
    const parse = (input: object) => createCardInputSchema.safeParse({ name: 'Cartão', ...input });
    expect(parse({ functions: ['CREDIT'], closingDay: 27, dueDay: 4 }).success).toBe(true);
    expect(parse({ functions: ['CREDIT'], closingDay: 27 }).success).toBe(false);
    expect(parse({ functions: ['DEBIT'], dueDay: 4 }).success).toBe(false);
    expect(parse({ functions: ['DEBIT'] }).success).toBe(true);
  });
});
