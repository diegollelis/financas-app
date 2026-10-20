import {
  PERSON_TRANSACTIONS_LIMIT,
  currentPeriod,
  todayIso,
  type CreatePersonInput,
  type Person,
  type Transaction,
  type UpdatePersonInput,
} from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Person as PersonRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toTransactionResponse, withOrigin } from '../transactions/transactions.service.js';
import { ensureMemberPeople } from './member-people.js';

/** Sorts names as a Brazilian reader expects ("Álvaro" next to "Alice"). */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

const personExists = () =>
  new ConflictException({
    code: 'PERSON_EXISTS',
    message: 'Já existe uma pessoa com esse nome. Se ela estiver arquivada, reative-a.',
  });

/** The person of a member comes and goes with the membership (ensureMemberPeople). */
const personIsMember = () =>
  new ConflictException({
    code: 'PERSON_IS_MEMBER',
    message: 'Esta pessoa é membro do espaço: o nome vem da conta dela, e ela continua na lista.',
  });

type PendingRow = {
  personId: string | null;
  type: 'CREDIT' | 'DEBIT';
  _sum: { amountCents: number | null };
};

/**
 * What a person owes and is owed now (ADR 0042 note): pending, of this competência or an earlier
 * one. Overdue is what is past its due date (transactionStatus). The installments of later
 * months, and the shares of them, come apart; the months of a recurrence already opened ahead
 * are left out. The person's page still lists everything.
 */
function pendingTotals(
  [rows, overdue, future]: [PendingRow[], PendingRow[], PendingRow[]],
  personId: string,
) {
  const sum = (list: PendingRow[], type: 'CREDIT' | 'DEBIT') =>
    list.find((row) => row.personId === personId && row.type === type)?._sum.amountCents ?? 0;
  return {
    receivableCents: sum(rows, 'CREDIT'),
    payableCents: sum(rows, 'DEBIT'),
    overdueReceivableCents: sum(overdue, 'CREDIT'),
    overduePayableCents: sum(overdue, 'DEBIT'),
    futureInstallmentsReceivableCents: sum(future, 'CREDIT'),
    futureInstallmentsPayableCents: sum(future, 'DEBIT'),
  };
}

function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025') {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * People of one workspace (ADR 0042): contacts by name, whether or not they use the app, the
 * other side of "a receber de" and "a pagar para". Same rules as categories: the workspaceId
 * comes from WorkspaceMemberGuard and every query runs through forWorkspace (RLS).
 */
@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All of them, archived too, by name, with what is pending each way. Every member of a shared
   * workspace is among them (ensureMemberPeople).
   */
  async list(workspaceId: string): Promise<Person[]> {
    await this.prisma.$transaction((tx) => ensureMemberPeople(tx, workspaceId));
    const db = this.prisma.forWorkspace(workspaceId);
    const [people, pending, members] = await Promise.all([
      db.person.findMany({ where: { workspaceId } }),
      this.pending(workspaceId, { not: null }),
      this.memberNames(workspaceId),
    ]);
    return people
      .map((person) => ({
        id: person.id,
        name: displayName(person, members),
        memberUserId: person.memberUserId,
        isMember: isMember(person, members),
        archived: person.archivedAt !== null,
        ...pendingTotals(pending, person.id),
      }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }

  async create(workspaceId: string, input: CreatePersonInput): Promise<Person> {
    const memberUserId = await this.memberToLink(workspaceId, input.memberUserId);
    await this.ensureNameIsFree(workspaceId, input.name);
    try {
      const person = await this.prisma
        .forWorkspace(workspaceId)
        .person.create({ data: { workspaceId, name: input.name, memberUserId } });
      return this.toResponse(workspaceId, person);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw personExists();
      throw error;
    }
  }

  async update(workspaceId: string, personId: string, input: UpdatePersonInput): Promise<Person> {
    const current = await this.find(workspaceId, personId);
    if (isMember(current, await this.memberNames(workspaceId))) throw personIsMember();
    if (input.name !== undefined) await this.ensureNameIsFree(workspaceId, input.name, personId);
    const memberUserId =
      input.memberUserId === undefined
        ? undefined
        : await this.memberToLink(workspaceId, input.memberUserId);
    let archivedAt: Date | null | undefined;
    if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
    if (input.archived === false) archivedAt = null;

    try {
      const person = await this.prisma.forWorkspace(workspaceId).person.update({
        where: { id: personId, workspaceId },
        data: { name: input.name, memberUserId, archivedAt },
      });
      return this.toResponse(workspaceId, person);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw personExists();
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * Everything linked to this person, of any competência, newest first (ADR 0042): what they
   * owe and are owed, pending or settled, and the shares of the debits split with them.
   */
  async transactions(workspaceId: string, personId: string): Promise<Transaction[]> {
    await this.find(workspaceId, personId);
    const transactions = await this.prisma.forWorkspace(workspaceId).transaction.findMany({
      where: { workspaceId, personId },
      include: withOrigin,
      orderBy: [{ period: 'desc' }, { id: 'desc' }],
      take: PERSON_TRANSACTIONS_LIMIT,
    });
    return transactions.map(toTransactionResponse);
  }

  /** One with transactions can only be archived: the foreign key refuses the delete. */
  async remove(workspaceId: string, personId: string): Promise<void> {
    const current = await this.find(workspaceId, personId);
    if (isMember(current, await this.memberNames(workspaceId))) throw personIsMember();
    try {
      const { count } = await this.prisma
        .forWorkspace(workspaceId)
        .person.deleteMany({ where: { id: personId, workspaceId } });
      if (count === 0) throw new NotFoundException();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'PERSON_IN_USE',
          message:
            'Esta pessoa tem lançamentos, recorrências ou parcelamentos: ela não pode ser excluída, só arquivada.',
        });
      }
      throw error;
    }
  }

  /** A response for one person: no pending totals are computed for a write. */
  private async toResponse(workspaceId: string, person: PersonRow): Promise<Person> {
    const members = person.memberUserId
      ? await this.memberNames(workspaceId)
      : new Map<string, string>();
    const pending = await this.pending(workspaceId, person.id);
    return {
      id: person.id,
      name: displayName(person, members),
      memberUserId: person.memberUserId,
      isMember: isMember(person, members),
      archived: person.archivedAt !== null,
      ...pendingTotals(pending, person.id),
    };
  }

  /**
   * Pending sums by person and type: up to this competência, the overdue part of them, and the
   * installments of later months (an installment, or the share of one).
   */
  private pending(workspaceId: string, personId: string | { not: null }) {
    const db = this.prisma.forWorkspace(workspaceId);
    const thisMonth = currentPeriod();
    const pending = { workspaceId, personId, settledAt: null };
    const now = { ...pending, period: { lte: thisMonth } };
    const today = new Date(`${todayIso()}T00:00:00Z`);
    const sums = (where: Prisma.TransactionWhereInput) =>
      db.transaction.groupBy({ by: ['personId', 'type'], where, _sum: { amountCents: true } });
    return Promise.all([
      sums(now),
      sums({ ...now, dueDate: { lt: today } }),
      sums({
        ...pending,
        period: { gt: thisMonth },
        OR: [
          { installmentPlanId: { not: null } },
          { splitOf: { installmentPlanId: { not: null } } },
        ],
      }),
    ]);
  }

  /** The names of the workspace's members, by user id. */
  private async memberNames(workspaceId: string): Promise<Map<string, string>> {
    const members = await this.prisma.member.findMany({
      where: { workspaceId },
      select: { userId: true, user: { select: { name: true } } },
    });
    return new Map(members.map((member) => [member.userId, member.user.name]));
  }

  /**
   * Only a member of this very workspace can be linked (ADR 0042, privacy), and only to one
   * person: a member of a shared workspace already has theirs (ensureMemberPeople).
   */
  private async memberToLink(workspaceId: string, userId: string | null | undefined) {
    if (!userId) return null;
    const member = await this.prisma.member.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member) {
      throw new BadRequestException({
        code: 'INVALID_INPUT',
        message: 'Escolha um membro deste espaço.',
      });
    }
    const linked = await this.prisma
      .forWorkspace(workspaceId)
      .person.findFirst({ where: { workspaceId, memberUserId: userId } });
    if (linked) {
      throw new ConflictException({
        code: 'PERSON_EXISTS',
        message: 'Este membro já está na lista de pessoas.',
      });
    }
    return userId;
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, personId: string): Promise<PersonRow> {
    if (!z.uuid().safeParse(personId).success) throw new NotFoundException();
    const person = await this.prisma
      .forWorkspace(workspaceId)
      .person.findFirst({ where: { id: personId, workspaceId } });
    if (!person) throw new NotFoundException();
    return person;
  }

  /** Names are unique per workspace, ignoring case ("ana" = "Ana"). */
  private async ensureNameIsFree(workspaceId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.forWorkspace(workspaceId).person.findFirst({
      where: {
        workspaceId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw personExists();
  }
}

/**
 * A person linked to a member shows the member's account name, while they are a member; a
 * person whose member left keeps the name typed (ADR 0042).
 */
function displayName(person: PersonRow, members: Map<string, string>): string {
  return (person.memberUserId && members.get(person.memberUserId)) || person.name;
}

/** Linked to someone who is still a member: the screen marks them, and they cannot be changed. */
function isMember(person: PersonRow, members: Map<string, string>): boolean {
  return person.memberUserId !== null && members.has(person.memberUserId);
}
