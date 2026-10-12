import type { SplitShareInput } from '@financas/shared';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const invalidPerson = (message: string) =>
  new BadRequestException({ code: 'INVALID_PERSON', message });

/**
 * A transaction may be linked only to a person of the same workspace (the composite foreign key
 * also refuses it) who is not archived (ADR 0042). Checked first for a clear pt-BR answer.
 */
export async function ensureUsablePerson(
  prisma: PrismaService,
  workspaceId: string,
  personId: string,
) {
  const person = await prisma
    .forWorkspace(workspaceId)
    .person.findFirst({ where: { id: personId, workspaceId } });
  if (!person) throw invalidPerson('Pessoa não encontrada neste espaço.');
  if (person.archivedAt) {
    throw invalidPerson('Esta pessoa está arquivada. Reative-a ou escolha outra.');
  }
  return person;
}

/**
 * The person of one share of a split (ADRs 0042, 0052): someone already listed, who must be
 * usable, or a new name, reusing (and reactivating) a person of that name if there is one.
 */
export async function resolveSplitPerson(
  prisma: PrismaService,
  workspaceId: string,
  share: SplitShareInput,
) {
  if (share.personId) return ensureUsablePerson(prisma, workspaceId, share.personId);
  const db = prisma.forWorkspace(workspaceId);
  const name = share.newPersonName!;
  const existing = await db.person.findFirst({
    where: { workspaceId, name: { equals: name, mode: 'insensitive' } },
  });
  if (existing?.archivedAt) {
    return db.person.update({ where: { id: existing.id }, data: { archivedAt: null } });
  }
  return existing ?? db.person.create({ data: { workspaceId, name } });
}
