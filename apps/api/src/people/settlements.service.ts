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
import type { Prisma } from '../generated/prisma/client.js';
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

/** A settlement checked and ready to write (`SettlementsService.prepare`). */
export type PreparedSettlement = {
  personId: string;
  ids: string[];
  debitCents: number;
  creditCents: number;
  settledAt: string;
  reward: { amountCents: number; categoryId: string; description: string } | null;
  /** The competências it touches: the transactions' and the reward's. */
  periods: string[];
};

/** Where a settlement came from, when an account statement's Pix made it (ADR 0065 note). */
export type SettlementOrigin = { externalId: string; importId: string };

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
    const prepared = await this.prepare(workspaceId, personId, input);
    const created = await this.prisma.$transaction(async (tx) => {
      await setWorkspaceContext(tx, workspaceId);
      return this.write(tx, workspaceId, userId, prepared);
    });
    return {
      id: created.settlementId,
      personId,
      settledAt: input.settledAt,
      debitCents: prepared.debitCents,
      creditCents: prepared.creditCents,
      reward: created.rewardRow ? toTransactionResponse(created.rewardRow) : null,
      transactionIds: prepared.ids,
    };
  }

  /**
   * Everything checked before the interactive transaction (which never calls ensureOpenPeriods):
   * the person, the day, each transaction pending and of the person, at least one debit, the
   * reward within the debits in an active credit category, and every month open (ADR 0063).
   * An account statement's import calls it too (ADR 0065 note).
   */
  async prepare(
    workspaceId: string,
    personId: string,
    input: SettlePersonInput,
  ): Promise<PreparedSettlement> {
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
    const periods = [...rows.map((row) => row.period), ...(reward ? [rewardPeriod] : [])];
    await ensureOpenPeriods(this.prisma, workspaceId, periods);

    return {
      personId,
      ids,
      debitCents,
      creditCents,
      settledAt: input.settledAt,
      // Read before the interactive transaction, which holds a connection of its own.
      reward: reward
        ? {
            amountCents: reward.amountCents,
            categoryId: reward.categoryId,
            description: reward.description ?? rewardDescription(await this.shownName(person)),
          }
        : null,
      periods,
    };
  }

  /**
   * Writes a prepared settlement inside the caller's interactive transaction, which already has
   * the RLS context: the reward, the settlement and its transactions settled on its day. Throws
   * SETTLEMENT_CHANGED when one of them is no longer pending, so the whole transaction rolls back.
   */
  async write(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
    prepared: PreparedSettlement,
    origin?: SettlementOrigin,
  ) {
    const { personId, ids, reward } = prepared;
    const day = toDate(prepared.settledAt);
    const rewardRow = reward
      ? await tx.transaction.create({
          data: {
            workspaceId,
            type: 'CREDIT',
            description: reward.description,
            categoryId: reward.categoryId,
            amountCents: reward.amountCents,
            period: prepared.settledAt.slice(0, 7),
            settledAt: day,
            occurredOn: day,
            personId,
          },
          include: withOrigin,
        })
      : null;
    const settlement = await tx.personSettlement.create({
      data: {
        workspaceId,
        personId,
        settledAt: day,
        debitCents: prepared.debitCents,
        creditCents: prepared.creditCents,
        rewardTransactionId: rewardRow ? rewardRow.id : null,
        createdById: userId,
        externalId: origin?.externalId ?? null,
        importId: origin?.importId ?? null,
      },
    });
    // Pending and of this person still, now that the transaction holds them.
    const { count } = await tx.transaction.updateMany({
      where: { workspaceId, id: { in: ids }, personId, settledAt: null },
      // Settling confirms an estimated amount (ADR 0038), as "Pagar fatura" does.
      data: { settledAt: day, amountEstimated: false, settlementId: settlement.id },
    });
    if (count !== ids.length) throw settlementChanged();
    return { settlementId: settlement.id, rewardRow };
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
      await this.undoIn(tx, workspaceId, settlement);
    });
  }

  /**
   * Undoes a settlement inside the caller's interactive transaction (with the RLS context): what
   * it still settles on its day back to pending, the reward and the settlement deleted. Undoing
   * the import that made it from a Pix calls it too (ADR 0065 note).
   */
  async undoIn(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    settlement: { id: string; settledAt: Date; rewardTransactionId: string | null },
  ) {
    await tx.transaction.updateMany({
      where: { workspaceId, settlementId: settlement.id, settledAt: settlement.settledAt },
      data: { settledAt: null, settlementId: null },
    });
    if (settlement.rewardTransactionId) {
      await tx.transaction.deleteMany({
        where: { workspaceId, id: settlement.rewardTransactionId },
      });
    }
    // What is left linked (settled on another day) is unlinked by the foreign key.
    await tx.personSettlement.deleteMany({ where: { workspaceId, id: settlement.id } });
  }

  /**
   * The reward's category remembered: the one of the person's last reward, while still active;
   * otherwise "Bônus", when the workspace has it active.
   */
  async rewardCategoryId(workspaceId: string, personId: string): Promise<string | null> {
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
