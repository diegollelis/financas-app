import { describe, expect, it } from 'vitest';
import {
  createRecurrenceInputSchema,
  dueDateIn,
  updateRecurrenceInputSchema,
} from './recurrence.ts';

describe('dueDateIn', () => {
  it('puts the due day in the competência', () => {
    expect(dueDateIn('2026-10', 10)).toBe('2026-10-10');
    expect(dueDateIn('2026-10', 1)).toBe('2026-10-01');
  });

  it('falls on the last day when the month is shorter', () => {
    expect(dueDateIn('2026-02', 31)).toBe('2026-02-28');
    expect(dueDateIn('2028-02', 30)).toBe('2028-02-29');
    expect(dueDateIn('2026-04', 31)).toBe('2026-04-30');
  });
});

describe('recurrence schemas', () => {
  // Fictitious ids (ADR 0019).
  const valid = {
    type: 'DEBIT',
    description: 'Internet',
    categoryId: '01920000-0000-7000-8000-000000000101',
    amountCents: 9_990,
    dueDay: 15,
    startPeriod: '2026-10',
  };

  it('accepts a recurrence, with or without a due day', () => {
    expect(createRecurrenceInputSchema.safeParse(valid).success).toBe(true);
    expect(createRecurrenceInputSchema.safeParse({ ...valid, dueDay: null }).success).toBe(true);
  });

  it('refuses a day the calendar does not have', () => {
    const result = createRecurrenceInputSchema.safeParse({ ...valid, dueDay: 32 });
    expect(result.error?.issues[0]?.message).toBe('Use um dia entre 1 e 31.');
  });

  it('changes neither the type nor the start, and needs something to change', () => {
    expect(updateRecurrenceInputSchema.safeParse({ amountCents: 10_990 }).success).toBe(true);
    expect(updateRecurrenceInputSchema.safeParse({}).success).toBe(false);
    expect(updateRecurrenceInputSchema.parse({ amountCents: 1, type: 'CREDIT' })).toEqual({
      amountCents: 1,
    });
  });
});
