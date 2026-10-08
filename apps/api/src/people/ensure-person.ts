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
