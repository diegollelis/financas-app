import {
  currentPeriod,
  formatCents,
  rewardDescription,
  todayIso,
  type PersonSettlement,
  type PersonSettlementDraft,
  type SettlePersonInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategory } from '../categories/ensure-category.js';
import { ensureOpenPeriods } from '../periods/period-lock.js';
import { PrismaService, setWorkspaceContext } from '../prisma/prisma.service.js';
import { toDate } from '../transactions/dates.js';
import { toTransactionResponse, withOrigin } from '../transactions/transactions.service.js';

/** The reward's category the first time, when the workspace has it (a default category). */
const FIRST_REWARD_CATEGORY = 'Bônus';

const settlementChanged = () =>
  new ConflictException({
    code: 'SETTLEMENT_CHANGED',
    message: 'Algum lançamento do acerto mudou ou já foi quitado. Abra o acerto de novo.',
  });

/**
 * Acerto com uma pessoa (ADR 0065): what you owe a person settled at once on one day, offsetting
 * what they owe you when chosen, with the reward they gave back launched as a credit received.
 * Settling the debits is the payment: nothing else is launched for it, as with a card's bill.
 * Every query runs through forWorkspace (RLS); amounts and descriptions are never logged.
 */
@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What may go in: the person's pending debits and credits, of any competência, oldest first.
   * The months of a recurrence ahead wait for their month, as in the person's totals.
   */
  async draft(workspaceId: string, personId: string): Promise<PersonSettlementDraft> {
    await this.findPerson(workspaceId, personId);
    const db = this.prisma.forWorkspace(workspaceId);
    const pending = await db.transaction.findMany({
      where: {
        workspaceId,
        personId,
        settledAt: null,
        NOT: {
          period: { gt: currentPeriod() },
          OR: [{ occurrence: { isNot: null } }, { splitOf: { occurrence: { isNot: null } } }],
        },
      },
      include: withOrigin,
      orderBy: [
        { period: 'asc' },
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { occurredOn: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ],
    });
    const transactions = pending.map(toTransactionResponse);
    return {
      debits: transactions.filter((transaction) => transaction.type === 'DEBIT'),
      credits: transactions.filter((transaction) => transaction.type === 'CREDIT'),
      rewardCategoryId: await this.rewardCategoryId(workspaceId, personId),
    };
  }

  /**
   * Settles the chosen pending transactions of the person on that day and launches the reward,
   * in one interactive transaction with the RLS context: all or nothing.
   */
  async settle(
    workspaceId: string,
    personId: string,
    userId: string,
    input: SettlePersonInput,
  ): Promise<PersonSettlement> {
    const person = await this.findPerson(workspaceId, personId);
    const invalid = (message: string) =>
      new BadRequestException({ code: 'INVALID_INPUT', message });
    if (input.settledAt > todayIso()) throw invalid('O acerto não pode ser numa data futura.');

    const ids = [...new Set(input.transactionIds)];
    const rows = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
      where: { workspaceId, id: { in: ids } },
      select: {
        id: true,
        type: true,
        amountCents: true,
        period: true,
        personId: true,
        settledAt: true,
      },
    });
    if (
      rows.length !== ids.length ||
      rows.some((row) => row.personId !== personId || row.settledAt !== null)
    ) {
      throw settlementChanged();
    }
    const sum = (type: 'CREDIT' | 'DEBIT') =>
      rows.filter((row) => row.type === type).reduce((total, row) => total + row.amountCents, 0);
    const debitCents = sum('DEBIT');
    const creditCents = sum('CREDIT');
    if (debitCents === 0) {
      throw new ConflictException({
        code: 'NOTHING_TO_PAY',
        message: 'Escolha pelo menos um lançamento a pagar para a pessoa.',
      });
    }

    const { reward } = input;
    const rewardPeriod = input.settledAt.slice(0, 7);
    if (reward) {
      if (reward.amountCents > debitCents) {
        throw invalid(`A recompensa passa do total das compras (${formatCents(debitCents)}).`);
      }
      await ensureUsableCategory(this.prisma, workspaceId, reward.categoryId, 'CREDIT');
    }
    await ensureOpenPeriods(this.prisma, workspaceId, [
      ...rows.map((row) => row.period),
      ...(reward ? [rewardPeriod] : []),
    ]);

    // Read before the interactive transaction, which holds a connection of its own.
    const rewardText =
      reward && (reward.description ?? rewardDescription(await this.shownName(person)));
    const day = toDate(input.settledAt);
    const created = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      const rewardRow =
        reward &&
        (await tx.transaction.create({
          data: {
            workspaceId,
            type: 'CREDIT',
            description: rewardText ?? rewardDescription(person.name),
            categoryId: reward.categoryId,
            amountCents: reward.amountCents,
            period: rewardPeriod,
            settledAt: day,
            occurredOn: day,
            personId,
          },
          include: withOrigin,
        }));
      const settlement = await tx.personSettlement.create({
        data: {
          workspaceId,
          personId,
          settledAt: day,
          debitCents,
          creditCents,
          rewardTransactionId: rewardRow ? rewardRow.id : null,
          createdById: userId,
        },
      });
      // Pending and of this person still, now that the transaction holds them.
      const { count } = await tx.transaction.updateMany({
        where: { workspaceId, id: { in: ids }, personId, settledAt: null },
        // Settling confirms an estimated amount (ADR 0038), as "Pagar fatura" does.
        data: { settledAt: day, amountEstimated: false, settlementId: settlement.id },
      });
      if (count !== ids.length) throw settlementChanged();
      return { settlement, rewardRow };
    });

    return {
      id: created.settlement.id,
      personId,
      settledAt: input.settledAt,
      debitCents,
      creditCents,
      reward: created.rewardRow ? toTransactionResponse(created.rewardRow) : null,
      transactionIds: ids,
    };
  }

  /**
   * Undoes a settlement: back to pending what it still settles on its day, the reward deleted
   * with it. A transaction settled again on another day since keeps that day and only leaves it.
   */
  async undo(workspaceId: string, personId: string, settlementId: string): Promise<void> {
    await this.findPerson(workspaceId, personId);
    if (!z.uuid().safeParse(settlementId).success) throw new NotFoundException();
    const db = this.prisma.forWorkspace(workspaceId);
    const settlement = await db.personSettlement.findFirst({
      where: { id: settlementId, workspaceId, personId },
      include: {
        transactions: { select: { period: true } },
        rewardTransaction: { select: { period: true } },
      },
    });
    if (!settlement) throw new NotFoundException();
    await ensureOpenPeriods(this.prisma, workspaceId, [
      ...settlement.transactions.map((row) => row.period),
      ...(settlement.rewardTransaction ? [settlement.rewardTransaction.period] : []),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      await tx.transaction.updateMany({
        where: { workspaceId, settlementId, settledAt: settlement.settledAt },
        data: { settledAt: null, settlementId: null },
      });
      if (settlement.rewardTransactionId) {
        await tx.transaction.deleteMany({
          where: { workspaceId, id: settlement.rewardTransactionId },
        });
      }
      // What is left linked (settled on another day) is unlinked by the foreign key.
      await tx.personSettlement.deleteMany({ where: { workspaceId, id: settlementId } });
    });
  }

  /**
   * The reward's category remembered: the one of the person's last reward, while still active;
   * otherwise "Bônus", when the workspace has it active.
   */
  private async rewardCategoryId(workspaceId: string, personId: string): Promise<string | null> {
    const db = this.prisma.forWorkspace(workspaceId);
    const last = await db.personSettlement.findFirst({
      where: {
        workspaceId,
        personId,
        rewardTransaction: { category: { archivedAt: null } },
      },
      orderBy: [{ settledAt: 'desc' }, { createdAt: 'desc' }],
      select: { rewardTransaction: { select: { categoryId: true } } },
    });
    if (last?.rewardTransaction) return last.rewardTransaction.categoryId;
    const first = await db.category.findFirst({
      where: { workspaceId, type: 'CREDIT', name: FIRST_REWARD_CATEGORY, archivedAt: null },
      select: { id: true },
    });
    return first?.id ?? null;
  }

  /** The name the page shows: a member's account name while they are a member (ADR 0042). */
  private async shownName(person: {
    workspaceId: string;
    name: string;
    memberUserId: string | null;
  }) {
    if (!person.memberUserId) return person.name;
    const member = await this.prisma.member.findUnique({
      where: {
        workspaceId_userId: { workspaceId: person.workspaceId, userId: person.memberUserId },
      },
      select: { user: { select: { name: true } } },
    });
    return member?.user.name ?? person.name;
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async findPerson(workspaceId: string, personId: string) {
    if (!z.uuid().safeParse(personId).success) throw new NotFoundException();
    const person = await this.prisma
      .forWorkspace(workspaceId)
      .person.findFirst({ where: { id: personId, workspaceId } });
    if (!person) throw new NotFoundException();
    return person;
  }
}
