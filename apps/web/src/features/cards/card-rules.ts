import {
  cardFunctionLabels,
  cardFunctionOf,
  paymentMethodSchema,
  type Card,
  type CardFunction,
} from '@financas/shared';
import { useEffect } from 'react';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import type { z } from 'zod';

/** The slice of a form the card lives in: its method and its card ('' for none). */
export type CardFormFields = { paymentMethod: string; cardId: string };

/** The active cards with that function, and the one already chosen even if archived. */
export function cardsFor(cards: readonly Card[], role: CardFunction, currentId = ''): Card[] {
  return cards.filter(
    (card) => card.functions.includes(role) && (!card.archived || card.id === currentId),
  );
}

/** Crédito and Débito say which card (ADR 0062 note), for a form's `superRefine`. */
export function requireCard(values: CardFormFields, ctx: z.RefinementCtx) {
  const method = paymentMethodSchema.safeParse(values.paymentMethod);
  const role = cardFunctionOf(method.success ? method.data : null);
  if (role && !values.cardId) {
    ctx.addIssue({
      code: 'custom',
      path: ['cardId'],
      message: `Escolha o cartão do ${cardFunctionLabels[role]}.`,
    });
  }
}

/**
 * The card follows the method (ADR 0062): none away from Crédito and Débito; with them, the only
 * card that has the function comes chosen, and one without it is cleared. `currentId` keeps the
 * one already saved even if archived. Gives the function the method asks for, if any.
 */
export function useCardFollowsMethod(
  control: Control<CardFormFields>,
  setValue: UseFormSetValue<CardFormFields>,
  cards: readonly Card[],
  currentId = '',
): CardFunction | null {
  const method = paymentMethodSchema.safeParse(useWatch({ control, name: 'paymentMethod' }));
  const role = cardFunctionOf(method.success ? method.data : null);
  const cardId = useWatch({ control, name: 'cardId' });
  const options = role ? cardsFor(cards, role, currentId) : [];
  const onlyCard = options.length === 1 ? options[0]!.id : '';
  // One just added with "Novo cartão" is not in the list until it is fetched again: kept.
  const known = cards.some((card) => card.id === cardId);
  const fits = options.some((card) => card.id === cardId) || (cardId !== '' && !known);
  useEffect(() => {
    if (!role) {
      if (cardId !== '') setValue('cardId', '');
    } else if (!fits && (cardId !== '' || onlyCard !== '')) {
      setValue('cardId', onlyCard);
    }
  }, [role, cardId, fits, onlyCard, setValue]);
  return role;
}
