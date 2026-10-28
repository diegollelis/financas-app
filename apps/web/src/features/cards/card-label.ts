import {
  paymentMethodLabels,
  statementBanks,
  type Card,
  type PaymentMethod,
} from '@financas/shared';

/** The bank's name, or "Outro banco" for one the app does not read. */
export const bankLabel = (card: Pick<Card, 'bank'>) =>
  statementBanks.find((item) => item.bank === card.bank)?.label ?? 'Outro banco';

/**
 * How it was paid, with the card's name when it has one (ADR 0062): "Crédito no Cartão Exemplo".
 * A card not in the list (not loaded yet) leaves only the method.
 */
export function paymentMethodText(
  paymentMethod: PaymentMethod,
  cardId: string | null,
  cards: readonly Card[],
): string {
  const card = cardId ? cards.find((item) => item.id === cardId) : undefined;
  return card
    ? `${paymentMethodLabels[paymentMethod]} no ${card.name}`
    : paymentMethodLabels[paymentMethod];
}
