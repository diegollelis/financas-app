import { describe, expect, it } from 'vitest';
import { movedDueDate, targetMonthText } from './move-period';

// Fictitious data (ADR 0019).
const card = { closingDay: 28, dueDay: 5 };

describe('movedDueDate', () => {
  it('moves the due date as many months as the competência', () => {
    expect(movedDueDate({ period: '2026-10', dueDate: '2026-10-30' }, '2026-11', null)).toBe(
      '2026-11-30',
    );
    expect(movedDueDate({ period: '2026-10', dueDate: '2026-10-15' }, '2026-08', null)).toBe(
      '2026-08-15',
    );
  });

  it('keeps the last day of a shorter month', () => {
    expect(movedDueDate({ period: '2027-01', dueDate: '2027-01-31' }, '2027-02', null)).toBe(
      '2027-02-28',
    );
  });

  it("takes the card's due day for a purchase in Crédito", () => {
    // The purchase of the 27th that went to the next bill.
    expect(movedDueDate({ period: '2026-10', dueDate: '2026-11-04' }, '2026-11', card)).toBe(
      '2026-12-05',
    );
  });

  it("gives one with no due date the bill of the month, by the card's days", () => {
    expect(movedDueDate({ period: '2026-10', dueDate: null }, '2026-11', card)).toBe('2026-12-05');
    expect(
      movedDueDate({ period: '2026-10', dueDate: null }, '2026-11', { closingDay: 3, dueDay: 10 }),
    ).toBe('2026-11-10');
  });

  it('leaves one with no due date and no bill days without one', () => {
    expect(movedDueDate({ period: '2026-10', dueDate: null }, '2026-11', null)).toBeNull();
    expect(
      movedDueDate({ period: '2026-10', dueDate: null }, '2026-11', {
        closingDay: null,
        dueDay: null,
      }),
    ).toBeNull();
  });
});

describe('targetMonthText', () => {
  it('names the month, with the year only when it changes', () => {
    expect(targetMonthText('2026-10', '2026-11')).toBe('novembro');
    expect(targetMonthText('2026-12', '2027-01')).toBe('janeiro de 2027');
  });
});
