import {
  parsePercent,
  parseReais,
  settlementTransferCents,
  type PersonSettlementDraft,
  type Transaction,
} from '@financas/shared';

/** How the reward is typed (ADR 0065): a percentage of the purchases chosen, or an amount. */
export type RewardUnit = 'PERCENT' | 'AMOUNT';

/**
 * What comes checked when the settlement opens: the debits of this competência and earlier ones,
 * as the person's "Você deve"; never a credit, since offsetting is a choice.
 */
export function initiallyChosen(draft: PersonSettlementDraft, thisPeriod: string): string[] {
  return draft.debits
    .filter((transaction) => transaction.period <= thisPeriod)
    .map((transaction) => transaction.id);
}

/**
 * The reward typed, in cents: a percentage of the purchases chosen (rounded to the cent) or an
 * amount. Empty is no reward; anything else not readable, zero or over the purchases is an error.
 */
export function rewardOf(
  text: string,
  unit: RewardUnit,
  debitCents: number,
): { cents: number; error?: string } {
  if (text.trim() === '') return { cents: 0 };
  if (unit === 'PERCENT') {
    const basisPoints = parsePercent(text);
    if (basisPoints === null) return { cents: 0, error: 'Use um percentual como 10 ou 2,5.' };
    if (basisPoints === 0) return { cents: 0, error: 'Informe um percentual maior que zero.' };
    if (basisPoints > 10_000) return { cents: 0, error: 'A recompensa passa de 100% das compras.' };
    return { cents: Math.round((debitCents * basisPoints) / 10_000) };
  }
  const cents = parseReais(text);
  if (cents === null) return { cents: 0, error: 'Use um valor como 1.234,56.' };
  if (cents === 0) return { cents: 0, error: 'Informe um valor maior que zero.' };
  if (cents > debitCents) {
    return { cents: 0, error: 'A recompensa passa do total das compras.' };
  }
  return { cents };
}

/** The sums of what is chosen and what changes hands. */
export function settlementSums(
  draft: PersonSettlementDraft,
  chosen: ReadonlySet<string>,
  rewardCents: number,
) {
  const sum = (items: Transaction[]) =>
    items
      .filter((item) => chosen.has(item.id))
      .reduce((total, item) => total + item.amountCents, 0);
  const debitCents = sum(draft.debits);
  const creditCents = sum(draft.credits);
  return {
    debitCents,
    creditCents,
    transferCents: settlementTransferCents({ debitCents, creditCents, rewardCents }),
  };
}
