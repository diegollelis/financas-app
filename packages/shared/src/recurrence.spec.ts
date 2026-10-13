import { describe, expect, it } from 'vitest';
import {
  createRecurrenceInputSchema,
  dueDateIn,
  estimateAmount,
  shareOfAmount,
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

describe('estimateAmount', () => {
  it('uses the amount typed while there is no settled month yet', () => {
    expect(estimateAmount([], 18_000)).toBe(18_000);
  });

  it('averages the settled months it has, up to the last three, to the cent', () => {
    expect(estimateAmount([20_000], 18_000)).toBe(20_000);
    expect(estimateAmount([20_000, 15_001], 18_000)).toBe(17_501);
    // Newest first: only the three most recent count.
    expect(estimateAmount([21_000, 19_000, 20_000, 99_000], 18_000)).toBe(20_000);
    expect(estimateAmount([10_000, 10_000, 10_001], 0)).toBe(10_000);
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

describe('split recurrences (ADR 0052)', () => {
  // Fictitious ids (ADR 0019).
  const valid = {
    type: 'DEBIT',
    description: 'Conta de luz',
    categoryId: '01920000-0000-7000-8000-000000000101',
    amountCents: 20_000,
    startPeriod: '2026-10',
  };
  const ana = '01920000-0000-7000-8000-000000000301';
  const message = (input: object) =>
    createRecurrenceInputSchema.safeParse({ ...valid, ...input }).error?.issues[0]?.message;

  it('takes shares in reais or in percentages, each person once', () => {
    expect(message({ split: [{ personId: ana, amountCents: 10_000 }] })).toBeUndefined();
    expect(message({ split: [{ newPersonName: 'Bia', basisPoints: 5_000 }] })).toBeUndefined();
    expect(
      message({
        split: [
          { newPersonName: 'Bia', basisPoints: 100 },
          { newPersonName: 'bia', basisPoints: 100 },
        ],
      }),
    ).toBe('A mesma pessoa aparece duas vezes.');
    expect(message({ split: [{ personId: ana }] })).toBe(
      'Informe a parte em reais ou em percentual.',
    );
  });

  it('takes only percentages when the amount varies, and never both kinds at once', () => {
    expect(message({ variableAmount: true, split: [{ personId: ana, amountCents: 1_000 }] })).toBe(
      'Num valor que varia, divida em percentual.',
    );
    expect(
      message({
        split: [
          { personId: ana, amountCents: 1_000 },
          { newPersonName: 'Bia', basisPoints: 1_000 },
        ],
      }),
    ).toBe('Use só reais ou só percentual nas partes.');
  });

  it('refuses shares bigger than the amount', () => {
    expect(message({ split: [{ personId: ana, amountCents: 20_001 }] })).toBe(
      'As partes dos outros passam do valor do lançamento.',
    );
    expect(
      message({
        split: [
          { personId: ana, basisPoints: 6_000 },
          { newPersonName: 'Bia', basisPoints: 5_000 },
        ],
      }),
    ).toBe('As partes dos outros passam do valor do lançamento.');
  });

  it('computes a share of a month: a fixed amount as it is, a percentage to the cent', () => {
    expect(shareOfAmount(24_000, { amountCents: 5_000, basisPoints: null })).toBe(5_000);
    expect(shareOfAmount(24_001, { amountCents: null, basisPoints: 5_000 })).toBe(12_001);
  });
});
