import type { PersonSettlementDraft, Transaction } from '@financas/shared';
import { describe, expect, it } from 'vitest';
import { initiallyChosen, rewardOf, settlementSums } from './settlement';

const row = (id: string, fields: Partial<Transaction>): Transaction => ({
  id,
  type: 'DEBIT',
  description: 'Mercado Exemplo',
  notes: null,
  categoryId: '01920000-0000-7000-8000-000000000001',
  amountCents: 10_000,
  period: '2026-10',
  dueDate: null,
  settledAt: null,
  occurredOn: null,
  recurrenceId: null,
  recurrenceIntervalMonths: null,
  amountEstimated: false,
  installment: null,
  personId: '01920000-0000-7000-8000-000000000002',
  merchantId: null,
  paymentMethod: 'MEAL_VOUCHER',
  cardId: null,
  splitOfId: null,
  settlementId: null,
  ...fields,
});

const draft: PersonSettlementDraft = {
  debits: [
    row('d1', { amountCents: 30_000, period: '2026-09' }),
    row('d2', { amountCents: 20_000 }),
    row('d3', { amountCents: 5_000, period: '2026-11' }),
  ],
  credits: [row('c1', { type: 'CREDIT', amountCents: 10_000 })],
  rewardCategoryId: null,
};

describe('initiallyChosen', () => {
  it('checks the debits up to this month, never a credit', () => {
    expect(initiallyChosen(draft, '2026-10')).toEqual(['d1', 'd2']);
  });
});

describe('rewardOf', () => {
  it('reads a percentage of the purchases, rounded to the cent', () => {
    expect(rewardOf('10', 'PERCENT', 50_000)).toEqual({ cents: 5_000 });
    expect(rewardOf('2,5', 'PERCENT', 33_333)).toEqual({ cents: 833 });
  });

  it('reads an amount', () => {
    expect(rewardOf('50,00', 'AMOUNT', 50_000)).toEqual({ cents: 5_000 });
  });

  it('is no reward when empty', () => {
    expect(rewardOf('  ', 'AMOUNT', 50_000)).toEqual({ cents: 0 });
  });

  it('refuses what is not readable, zero or over the purchases', () => {
    expect(rewardOf('dez', 'PERCENT', 50_000).error).toBeDefined();
    expect(rewardOf('0', 'PERCENT', 50_000).error).toBeDefined();
    expect(rewardOf('101', 'PERCENT', 50_000).error).toBeDefined();
    expect(rewardOf('500,01', 'AMOUNT', 50_000).error).toBeDefined();
  });
});

describe('settlementSums', () => {
  it('adds what is chosen and takes the offset and the reward from it', () => {
    expect(settlementSums(draft, new Set(['d1', 'd2', 'c1']), 5_000)).toEqual({
      debitCents: 50_000,
      creditCents: 10_000,
      transferCents: 35_000,
    });
  });
});
