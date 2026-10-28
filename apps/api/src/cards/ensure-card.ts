import { cardFunctionLabels, cardFunctionOf, type PaymentMethod } from '@financas/shared';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const invalidCard = (message: string) => new BadRequestException({ code: 'INVALID_CARD', message });

/**
 * Crédito and Débito ask for the card (ADR 0062 note): checked on what is created and on a change
 * of the method or the card, so a transaction from before cards stays valid until then.
 */
export function ensureCardGiven(
  paymentMethod: PaymentMethod | null | undefined,
  cardId: string | null | undefined,
) {
  const role = cardFunctionOf(paymentMethod);
  if (role && !cardId) {
    throw new BadRequestException({
      code: 'CARD_REQUIRED',
      message: `Escolha o cartão do ${cardFunctionLabels[role]}.`,
    });
  }
}

/**
 * A transaction, recurrence or installment plan may name a card (ADR 0062) only with the Crédito
 * or Débito method, and only a card of the same workspace (the composite foreign key also
 * refuses it) with that function. Checked first for a clear pt-BR answer. `changed`: an archived
 * card is refused only when it is being chosen, so an edit may keep one archived later.
 */
export async function ensureUsableCard(
  prisma: PrismaService,
  workspaceId: string,
  cardId: string,
  paymentMethod: PaymentMethod | null | undefined,
  changed = true,
) {
  const role = cardFunctionOf(paymentMethod);
  if (!role) {
    throw invalidCard('Um cartão vai só com o meio Crédito ou Débito.');
  }
  const card = await prisma
    .forWorkspace(workspaceId)
    .card.findFirst({ where: { id: cardId, workspaceId } });
  if (!card) throw invalidCard('Cartão não encontrado neste espaço.');
  if (changed && card.archivedAt) {
    throw invalidCard('Este cartão está arquivado. Reative-o ou escolha outro.');
  }
  if (role === 'CREDIT' ? !card.credit : !card.debit) {
    throw invalidCard(`Este cartão não tem a função ${cardFunctionLabels[role]}.`);
  }
  return card;
}

/** What is created: Crédito and Débito with their card, and the card fitting the method. */
export async function ensureNewCard(
  prisma: PrismaService,
  workspaceId: string,
  input: { cardId?: string | null; paymentMethod?: PaymentMethod | null },
) {
  ensureCardGiven(input.paymentMethod, input.cardId);
  if (input.cardId) {
    await ensureUsableCard(prisma, workspaceId, input.cardId, input.paymentMethod);
  }
}

/**
 * The card and the method after a change, merged with what is stored: checked whenever either
 * is sent, so a method changed away from the card's function is refused too, and so is Crédito
 * or Débito left without a card.
 */
export async function ensureCardFits(
  prisma: PrismaService,
  workspaceId: string,
  current: { cardId: string | null; paymentMethod: PaymentMethod | null },
  input: { cardId?: string | null; paymentMethod?: PaymentMethod | null },
) {
  if (input.cardId === undefined && input.paymentMethod === undefined) return;
  const cardId = input.cardId === undefined ? current.cardId : input.cardId;
  const paymentMethod =
    input.paymentMethod === undefined ? current.paymentMethod : input.paymentMethod;
  ensureCardGiven(paymentMethod, cardId);
  if (!cardId) return;
  if (cardId === current.cardId && paymentMethod === current.paymentMethod) return;
  await ensureUsableCard(prisma, workspaceId, cardId, paymentMethod, cardId !== current.cardId);
}
