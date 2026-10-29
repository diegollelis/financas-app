import {
  cardBillTotal,
  cardFunctionLabels,
  normalizeName,
  todayIso,
  type CardBill,
  type Card,
  type CardFunction,
  type CreateCardInput,
  type LinkCardInput,
  type LinkCardResponse,
  type PayCardBillInput,
  type PayCardBillResponse,
  type UndoCardBillInput,
  type UnlinkedCardTransactions,
  type UpdateCardInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Card as CardRow } from '../generated/prisma/client.js';
import { allClosedPeriods } from '../periods/period-lock.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { toDate } from '../transactions/dates.js';
import { toTransactionResponse, withOrigin } from '../transactions/transactions.service.js';

/** Sorts names as a Brazilian reader expects. */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

const cardExists = () =>
  new ConflictException({
    code: 'CARD_EXISTS',
    message: 'Já existe um cartão com esse nome. Se ele estiver arquivado, reative-o.',
  });

/** What tells whether a card is used, counted with it. */
const withUses = {
  _count: {
    select: { transactions: true, recurrences: true, installmentPlans: true, imports: true },
  },
} as const;

type CardWithUses = CardRow & {
  _count: { transactions: number; recurrences: number; installmentPlans: number; imports: number };
};

/** The payment method of each function, to find what uses it. */
const METHOD_OF = { CREDIT: 'CREDIT_CARD', DEBIT: 'DEBIT_CARD' } as const;

/**
 * No card yet, in the method of the function: the Crédito ones only while still to pay. Those of
 * a closed month stay as they are (ADR 0063).
 */
const unlinkedWhere = (workspaceId: string, role: CardFunction, closed: string[]) => ({
  workspaceId,
  cardId: null,
  paymentMethod: METHOD_OF[role],
  ...(role === 'CREDIT' && { settledAt: null }),
  ...(closed.length > 0 && { period: { notIn: closed } }),
});

/** What a bill holds: pending, in Crédito, never a share of a split (shares have no card). */
const billWhere = (workspaceId: string) => ({
  workspaceId,
  paymentMethod: 'CREDIT_CARD' as const,
  settledAt: null,
});

function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025') {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function functionsOf(card: Pick<CardRow, 'credit' | 'debit'>): CardFunction[] {
  return [...(card.credit ? ['CREDIT' as const] : []), ...(card.debit ? ['DEBIT' as const] : [])];
}

function toResponse(card: CardWithUses): Card {
  const uses = card._count;
  return {
    id: card.id,
    name: card.name,
    bank: card.bank,
    functions: functionsOf(card),
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    archived: card.archivedAt !== null,
    inUse: uses.transactions + uses.recurrences + uses.installmentPlans + uses.imports > 0,
  };
}

/**
 * Cards of one workspace (ADR 0062): a detail of the Crédito and Débito methods, with no limit and
 * no balance. Same rules as merchants: the workspaceId comes from WorkspaceMemberGuard and every
 * query runs through forWorkspace (RLS).
 */
@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of them, archived too, by name. */
  async list(workspaceId: string): Promise<Card[]> {
    const cards = await this.prisma
      .forWorkspace(workspaceId)
      .card.findMany({ where: { workspaceId }, include: withUses });
    return cards.map(toResponse).sort((a, b) => collator.compare(a.name, b.name));
  }

  async create(workspaceId: string, input: CreateCardInput): Promise<Card> {
    await this.ensureNameIsFree(workspaceId, input.name);
    const credit = input.functions.includes('CREDIT');
    try {
      const card = await this.prisma.forWorkspace(workspaceId).card.create({
        data: {
          workspaceId,
          name: input.name,
          bank: input.bank ?? null,
          credit,
          debit: input.functions.includes('DEBIT'),
          closingDay: credit ? (input.closingDay ?? null) : null,
          dueDay: credit ? (input.dueDay ?? null) : null,
        },
        include: withUses,
      });
      return toResponse(card);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw cardExists();
      throw error;
    }
  }

  /**
   * Taking a function away is refused while something uses the card with it; taking the credit
   * away clears the days of the bill, and giving it needs them.
   */
  async update(workspaceId: string, cardId: string, input: UpdateCardInput): Promise<Card> {
    const current = await this.find(workspaceId, cardId);
    if (input.name !== undefined) await this.ensureNameIsFree(workspaceId, input.name, cardId);
    const functions = input.functions ?? functionsOf(current);
    const credit = functions.includes('CREDIT');
    const debit = functions.includes('DEBIT');
    for (const role of functionsOf(current).filter((role) => !functions.includes(role))) {
      await this.ensureFunctionUnused(workspaceId, cardId, role);
    }
    const closingDay = credit
      ? input.closingDay === undefined
        ? current.closingDay
        : input.closingDay
      : null;
    const dueDay = credit ? (input.dueDay === undefined ? current.dueDay : input.dueDay) : null;
    if (credit && (closingDay === null || dueDay === null)) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Um cartão com a função Crédito precisa do dia do fechamento e do vencimento.',
      });
    }
    if (!credit && (input.closingDay != null || input.dueDay != null)) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Só um cartão com a função Crédito tem fatura.',
      });
    }
    let archivedAt: Date | null | undefined;
    if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
    if (input.archived === false) archivedAt = null;
    try {
      const card = await this.prisma.forWorkspace(workspaceId).card.update({
        where: { id: cardId, workspaceId },
        data: { name: input.name, bank: input.bank, credit, debit, closingDay, dueDay, archivedAt },
        include: withUses,
      });
      return toResponse(card);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw cardExists();
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * The transactions with no card the first card offers to take (ADR 0062 note): the Crédito ones
   * still to pay, and every Débito one.
   */
  async unlinked(workspaceId: string): Promise<UnlinkedCardTransactions> {
    const db = this.prisma.forWorkspace(workspaceId);
    const closed = await allClosedPeriods(this.prisma, workspaceId);
    const [credit, debit] = await Promise.all([
      db.transaction.count({ where: unlinkedWhere(workspaceId, 'CREDIT', closed) }),
      db.transaction.count({ where: unlinkedWhere(workspaceId, 'DEBIT', closed) }),
    ]);
    return { credit, debit };
  }

  /**
   * Gives the card to those transactions, and to the running recurrences and installment plans of
   * those methods with no card, so their next months come with it. Only functions the card has.
   */
  async link(workspaceId: string, cardId: string, input: LinkCardInput): Promise<LinkCardResponse> {
    const card = await this.find(workspaceId, cardId);
    if (card.archivedAt) {
      throw new BadRequestException({
        code: 'INVALID_CARD',
        message: 'Este cartão está arquivado. Reative-o antes de ligar lançamentos a ele.',
      });
    }
    for (const role of input.functions) {
      if (!functionsOf(card).includes(role)) {
        throw new BadRequestException({
          code: 'INVALID_CARD',
          message: `Este cartão não tem a função ${cardFunctionLabels[role]}.`,
        });
      }
    }
    const closed = await allClosedPeriods(this.prisma, workspaceId);
    const linked = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      let count = 0;
      for (const role of input.functions) {
        const paymentMethod = METHOD_OF[role];
        const result = await tx.transaction.updateMany({
          where: unlinkedWhere(workspaceId, role, closed),
          data: { cardId },
        });
        count += result.count;
        await tx.recurrence.updateMany({
          where: { workspaceId, paymentMethod, cardId: null, endPeriod: null },
          data: { cardId },
        });
        await tx.installmentPlan.updateMany({
          where: { workspaceId, paymentMethod, cardId: null, endedAt: null },
          data: { cardId },
        });
      }
      return count;
    });
    return { linked };
  }

  /**
   * Every bill still to pay (ADR 0062): the pending transactions in Crédito with a card and a due
   * date, by card and due date, oldest first. A bill is not a table: it is these.
   */
  async bills(workspaceId: string): Promise<CardBill[]> {
    const pending = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
      where: { ...billWhere(workspaceId), cardId: { not: null }, dueDate: { not: null } },
      include: withOrigin,
      orderBy: [{ dueDate: 'asc' }, { occurredOn: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    const bills = new Map<string, CardBill>();
    for (const row of pending) {
      const transaction = toTransactionResponse(row);
      const key = `${row.cardId}|${transaction.dueDate}`;
      const bill = bills.get(key) ?? {
        cardId: row.cardId!,
        dueDate: transaction.dueDate!,
        totalCents: 0,
        transactions: [],
      };
      bill.transactions.push(transaction);
      bills.set(key, bill);
    }
    return [...bills.values()].map((bill) => ({
      ...bill,
      totalCents: cardBillTotal(bill.transactions),
    }));
  }

  /**
   * "Pagar fatura": settles every pending transaction of that bill on that day, in one
   * transaction, and says which, for "Desfazer". Paying confirms an estimated amount (ADR 0038).
   */
  async payBill(
    workspaceId: string,
    cardId: string,
    input: PayCardBillInput,
  ): Promise<PayCardBillResponse> {
    await this.find(workspaceId, cardId);
    if (input.settledAt > todayIso()) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'O pagamento não pode ser numa data futura.',
      });
    }
    const where = { ...billWhere(workspaceId), cardId, dueDate: toDate(input.dueDate) };
    const paid = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      const rows = await tx.transaction.findMany({
        where,
        select: { id: true, type: true, amountCents: true },
      });
      if (rows.length === 0) return rows;
      await tx.transaction.updateMany({
        where: { workspaceId, id: { in: rows.map((row) => row.id) }, settledAt: null },
        data: { settledAt: toDate(input.settledAt), amountEstimated: false },
      });
      return rows;
    });
    if (paid.length === 0) {
      throw new ConflictException({
        code: 'NOTHING_TO_PAY',
        message: 'Esta fatura não tem lançamentos pendentes.',
      });
    }
    return { transactionIds: paid.map((row) => row.id), totalCents: cardBillTotal(paid) };
  }

  /**
   * "Desfazer" of a payment: back to pending, only the transactions of this card it settled that
   * are still settled on that day (one settled again since keeps the new day).
   */
  async undoBill(workspaceId: string, cardId: string, input: UndoCardBillInput): Promise<void> {
    await this.find(workspaceId, cardId);
    await this.prisma.forWorkspace(workspaceId).transaction.updateMany({
      where: {
        workspaceId,
        cardId,
        id: { in: input.transactionIds },
        settledAt: toDate(input.settledAt),
      },
      data: { settledAt: null },
    });
  }

  /** One that is used can only be archived: the foreign keys refuse the delete. */
  async remove(workspaceId: string, cardId: string): Promise<void> {
    await this.find(workspaceId, cardId);
    try {
      const { count } = await this.prisma
        .forWorkspace(workspaceId)
        .card.deleteMany({ where: { id: cardId, workspaceId } });
      if (count === 0) throw new NotFoundException();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'CARD_IN_USE',
          message:
            'Este cartão tem lançamentos, recorrências, parcelamentos ou importações: ele não pode ser excluído, só arquivado.',
        });
      }
      throw error;
    }
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, cardId: string): Promise<CardRow> {
    if (!z.uuid().safeParse(cardId).success) throw new NotFoundException();
    const card = await this.prisma
      .forWorkspace(workspaceId)
      .card.findFirst({ where: { id: cardId, workspaceId } });
    if (!card) throw new NotFoundException();
    return card;
  }

  /** Something paid or received with the card in that function keeps the function on. */
  private async ensureFunctionUnused(workspaceId: string, cardId: string, role: CardFunction) {
    const db = this.prisma.forWorkspace(workspaceId);
    const where = { workspaceId, cardId, paymentMethod: METHOD_OF[role] };
    const [transactions, recurrences, plans] = await Promise.all([
      db.transaction.count({ where }),
      db.recurrence.count({ where }),
      db.installmentPlan.count({ where }),
    ]);
    if (transactions + recurrences + plans > 0) {
      throw new ConflictException({
        code: 'CARD_FUNCTION_IN_USE',
        message: `Há lançamentos no ${cardFunctionLabels[role]} com este cartão: a função não pode sair.`,
      });
    }
  }

  /** Names are unique per workspace, ignoring case and accents. */
  private async ensureNameIsFree(workspaceId: string, name: string, exceptId?: string) {
    const others = await this.prisma.forWorkspace(workspaceId).card.findMany({
      where: { workspaceId, ...(exceptId && { id: { not: exceptId } }) },
      select: { name: true },
    });
    const wanted = normalizeName(name);
    if (others.some((other) => normalizeName(other.name) === wanted)) throw cardExists();
  }
}
