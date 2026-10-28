import {
  cardFunctionOf,
  type Card,
  type CardFunction,
  type ImportTransactionInput,
  type StatementBank,
} from '@financas/shared';
import { cardsFor } from '@/features/cards/card-rules';

/** The card chosen for each function, for the whole file (ADR 0062 note); '' for none yet. */
export type ImportCards = Partial<Record<CardFunction, string>>;

/** How many of what goes in use each card function: what the file asks a card for. */
export function cardLinesByFunction(
  items: readonly Pick<ImportTransactionInput, 'paymentMethod'>[],
): Partial<Record<CardFunction, number>> {
  const counts: Partial<Record<CardFunction, number>> = {};
  for (const item of items) {
    const role = cardFunctionOf(item.paymentMethod);
    if (role) counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

/**
 * The card a file's lines of that function start with: the only active card with it of the
 * statement's bank, else the only one with it at all; '' when there is a choice to make.
 */
export function defaultImportCard(
  cards: readonly Card[],
  role: CardFunction,
  bank: StatementBank | null,
): string {
  const options = cardsFor(cards, role);
  const ofBank = bank ? options.filter((card) => card.bank === bank) : [];
  if (ofBank.length === 1) return ofBank[0]!.id;
  return options.length === 1 ? options[0]!.id : '';
}

/** Each line in Crédito or Débito with the card chosen for its function. */
export function withImportCards<T extends Pick<ImportTransactionInput, 'paymentMethod'>>(
  items: readonly T[],
  chosen: ImportCards,
): (T & { cardId?: string })[] {
  return items.map((item) => {
    const role = cardFunctionOf(item.paymentMethod);
    const cardId = role ? chosen[role] : undefined;
    return cardId ? { ...item, cardId } : item;
  });
}
