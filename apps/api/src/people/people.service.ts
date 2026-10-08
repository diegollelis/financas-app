import type { CreatePersonInput, Person, UpdatePersonInput } from '@financas/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Person as PersonRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Sorts names as a Brazilian reader expects ("Álvaro" next to "Alice"). */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

const personExists = () =>
  new ConflictException({
    code: 'PERSON_EXISTS',
    message: 'Já existe uma pessoa com esse nome. Se ela estiver arquivada, reative-a.',
  });

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

  /** All of them, archived too, by name, with what is pending each way. */
  async list(workspaceId: string): Promise<Person[]> {
    const db = this.prisma.forWorkspace(workspaceId);
    const [people, pending, members] = await Promise.all([
      db.person.findMany({ where: { workspaceId } }),
      db.transaction.groupBy({
        by: ['personId', 'type'],
        where: { workspaceId, personId: { not: null }, settledAt: null },
        _sum: { amountCents: true },
      }),
      this.memberNames(workspaceId),
    ]);
    const owed = (personId: string, type: 'CREDIT' | 'DEBIT') =>
      pending.find((row) => row.personId === personId && row.type === type)?._sum.amountCents ?? 0;
    return people
      .map((person) => ({
        id: person.id,
        name: displayName(person, members),
        memberUserId: person.memberUserId,
        archived: person.archivedAt !== null,
        receivableCents: owed(person.id, 'CREDIT'),
        payableCents: owed(person.id, 'DEBIT'),
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

  /** One with transactions can only be archived: the foreign key refuses the delete. */
  async remove(workspaceId: string, personId: string): Promise<void> {
    if (!z.uuid().safeParse(personId).success) throw new NotFoundException();
    try {
      const { count } = await this.prisma
        .forWorkspace(workspaceId)
        .person.deleteMany({ where: { id: personId, workspaceId } });
      if (count === 0) throw new NotFoundException();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'PERSON_IN_USE',
          message: 'Esta pessoa tem lançamentos: ela não pode ser excluída, só arquivada.',
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
    const pending = await this.prisma.forWorkspace(workspaceId).transaction.groupBy({
      by: ['type'],
      where: { workspaceId, personId: person.id, settledAt: null },
      _sum: { amountCents: true },
    });
    const sum = (type: 'CREDIT' | 'DEBIT') =>
      pending.find((row) => row.type === type)?._sum.amountCents ?? 0;
    return {
      id: person.id,
      name: displayName(person, members),
      memberUserId: person.memberUserId,
      archived: person.archivedAt !== null,
      receivableCents: sum('CREDIT'),
      payableCents: sum('DEBIT'),
    };
  }

  /** The names of the workspace's members, by user id. */
  private async memberNames(workspaceId: string): Promise<Map<string, string>> {
    const members = await this.prisma.member.findMany({
      where: { workspaceId },
      select: { userId: true, user: { select: { name: true } } },
    });
    return new Map(members.map((member) => [member.userId, member.user.name]));
  }

  /** Only a member of this very workspace can be linked (ADR 0042, privacy). */
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
