import { describe, expect, it } from 'vitest';
import {
  rewardDescription,
  settlePersonInputSchema,
  settlementTransferCents,
} from './person-settlement.ts';

const ID = '01920000-0000-7000-8000-000000000001';

describe('settlementTransferCents', () => {
  it('takes the offset and the reward from what was owed', () => {
    expect(
      settlementTransferCents({ debitCents: 50_000, creditCents: 0, rewardCents: 5_000 }),
    ).toBe(45_000);
    expect(
      settlementTransferCents({ debitCents: 50_000, creditCents: 10_000, rewardCents: 5_000 }),
    ).toBe(35_000);
  });

  it('is negative when the person owes more', () => {
    expect(
      settlementTransferCents({ debitCents: 10_000, creditCents: 30_000, rewardCents: 0 }),
    ).toBe(-20_000);
  });
});

describe('rewardDescription', () => {
  it('names the person, within the description limit', () => {
    expect(rewardDescription('Ana Exemplo')).toBe('Recompensa de Ana Exemplo');
    expect(rewardDescription('A'.repeat(300))).toHaveLength(200);
  });
});

describe('settlePersonInputSchema', () => {
  it('takes the transactions, the day and an optional reward', () => {
    expect(
      settlePersonInputSchema.parse({
        transactionIds: [ID],
        settledAt: '2026-10-30',
        reward: { amountCents: 500, categoryId: ID },
      }),
    ).toEqual({
      transactionIds: [ID],
      settledAt: '2026-10-30',
      reward: { amountCents: 500, categoryId: ID },
    });
  });

  it('refuses an empty settlement and a reward of zero', () => {
    expect(
      settlePersonInputSchema.safeParse({ transactionIds: [], settledAt: '2026-10-30' }).success,
    ).toBe(false);
    expect(
      settlePersonInputSchema.safeParse({
        transactionIds: [ID],
        settledAt: '2026-10-30',
        reward: { amountCents: 0, categoryId: ID },
      }).success,
    ).toBe(false);
  });
});
