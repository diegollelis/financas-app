import { describe, expect, it } from 'vitest';
import { amountCentsSchema, periodSchema } from './money-and-dates.ts';
import {
  createTransactionInputSchema,
  transactionStatus,
  updateTransactionInputSchema,
} from './transaction.ts';

// Fictitious data (ADR 0019).
const valid = {
  type: 'DEBIT',
  description: '  Conta de luz  ',
  categoryId: '01920000-0000-7000-8000-000000000101',
  amountCents: 15_990,
  period: '2026-10',
  dueDate: '2026-10-10',
};

describe('periodSchema', () => {
  it('accepts YYYY-MM with a real month', () => {
    expect(periodSchema.safeParse('2026-01').success).toBe(true);
    expect(periodSchema.safeParse('2026-12').success).toBe(true);
  });

  it('refuses other shapes and month 13', () => {
    for (const period of ['2026-13', '2026-00', '2026-1', '10/2026', '2026-10-01']) {
      expect(periodSchema.safeParse(period).success, period).toBe(false);
    }
  });
});

describe('amountCentsSchema', () => {
  it('only accepts positive whole cents', () => {
    expect(amountCentsSchema.safeParse(1).success).toBe(true);
    expect(amountCentsSchema.safeParse(0).error?.issues[0]?.message).toBe(
      'O valor precisa ser maior que zero.',
    );
    expect(amountCentsSchema.safeParse(-500).success).toBe(false);
    expect(amountCentsSchema.safeParse(10.5).error?.issues[0]?.message).toBe(
      'O valor precisa estar em centavos inteiros.',
    );
  });
});

describe('createTransactionInputSchema', () => {
  it('trims the description and turns blank notes into null', () => {
    expect(createTransactionInputSchema.parse({ ...valid, notes: '   ' })).toMatchObject({
      description: 'Conta de luz',
      notes: null,
    });
  });

  it('accepts a transaction without due date and still pending', () => {
    expect(createTransactionInputSchema.safeParse({ ...valid, dueDate: undefined }).success).toBe(
      true,
    );
  });

  it('refuses an invalid date', () => {
    const result = createTransactionInputSchema.safeParse({ ...valid, settledAt: '2026-02-30' });
    expect(result.error?.issues[0]?.message).toBe('Informe uma data válida.');
  });
});

describe('updateTransactionInputSchema', () => {
  it('settles in one click and undoes it', () => {
    expect(updateTransactionInputSchema.parse({ settledAt: '2026-10-02' })).toEqual({
      settledAt: '2026-10-02',
    });
    expect(updateTransactionInputSchema.parse({ settledAt: null })).toEqual({ settledAt: null });
  });

  it('refuses an empty change', () => {
    expect(updateTransactionInputSchema.safeParse({}).error?.issues[0]?.message).toBe(
      'Nada para alterar.',
    );
  });
});

describe('transactionStatus', () => {
  const today = '2026-10-15';

  it('is SETTLED once there is a settlement date, even after the due date', () => {
    expect(transactionStatus({ dueDate: '2026-10-01', settledAt: '2026-10-02' }, today)).toBe(
      'SETTLED',
    );
  });

  it('is OVERDUE only when pending after the due date', () => {
    expect(transactionStatus({ dueDate: '2026-10-14', settledAt: null }, today)).toBe('OVERDUE');
    expect(transactionStatus({ dueDate: '2026-10-15', settledAt: null }, today)).toBe('PENDING');
  });

  it('without a due date, a pending transaction is never overdue', () => {
    expect(transactionStatus({ dueDate: null, settledAt: null }, today)).toBe('PENDING');
  });
});
