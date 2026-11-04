import { z } from 'zod';
import { amountCentsSchema, isoDateSchema } from './money-and-dates.ts';
import { transactionDescriptionSchema, transactionSchema } from './transaction.ts';

/** At most this many transactions in one settlement, like a bill. */
export const MAX_SETTLEMENT_TRANSACTIONS = 2000;

/**
 * `GET /workspaces/:workspaceId/people/:personId/settlement` (ADR 0065): what may go into a
 * settlement with this person. The debits are what you owe them, the credits what they owe you
 * (offered unchecked, to offset); both pending, of any competência, oldest first.
 */
export const personSettlementDraftSchema = z.object({
  debits: z.array(transactionSchema),
  credits: z.array(transactionSchema),
  /** The category of the last reward from this person, or "Bônus" when there is none yet. */
  rewardCategoryId: z.uuid().nullable(),
});

export type PersonSettlementDraft = z.infer<typeof personSettlementDraftSchema>;

/**
 * `POST /workspaces/:workspaceId/people/:personId/settlements`: settles these pending
 * transactions of the person on that day, never ahead; at least one debit. The reward, when
 * given, is launched as a credit received that day, at most the debits' total.
 */
export const settlePersonInputSchema = z.object({
  transactionIds: z
    .array(z.uuid())
    .min(1, 'Escolha o que entra no acerto.')
    .max(MAX_SETTLEMENT_TRANSACTIONS),
  settledAt: isoDateSchema,
  reward: z
    .object({
      amountCents: amountCentsSchema,
      categoryId: z.uuid(),
      description: transactionDescriptionSchema.optional(),
    })
    .optional(),
});

export type SettlePersonInput = z.infer<typeof settlePersonInputSchema>;

/** One settlement with a person, as it was on its day. */
export const personSettlementSchema = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  settledAt: isoDateSchema,
  /** The debits settled: what was owed. */
  debitCents: z.number().int().nonnegative(),
  /** The credits settled with them: what was offset. */
  creditCents: z.number().int().nonnegative(),
  /** The credit launched for the reward; null without one. */
  reward: transactionSchema.nullable(),
  /** What it settled: what undoing takes back while still settled by it. */
  transactionIds: z.array(z.uuid()),
});

export type PersonSettlement = z.infer<typeof personSettlementSchema>;

/**
 * What changes hands (ADR 0065): the debits less the credits offset and the reward. Positive is
 * what you transfer to the person; negative, what they transfer to you.
 */
export function settlementTransferCents(
  settlement: Pick<PersonSettlement, 'debitCents' | 'creditCents'> & { rewardCents: number },
): number {
  return settlement.debitCents - settlement.creditCents - settlement.rewardCents;
}

/** The default description of a reward: "Recompensa de Ana". */
export function rewardDescription(personName: string, max = 200): string {
  const text = `Recompensa de ${personName}`;
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
