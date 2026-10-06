import type { TransactionType } from '@financas/shared';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const invalidCategory = (message: string) =>
  new BadRequestException({ code: 'INVALID_CATEGORY', message });

/**
 * The category of a new or changed transaction or recurrence must be of this workspace, of its
 * type and not archived. The composite foreign key (ADR 0029) would refuse the first two anyway;
 * checking here gives a clear pt-BR message instead of a database error.
 */
export async function ensureUsableCategory(
  prisma: PrismaService,
  workspaceId: string,
  categoryId: string,
  type: TransactionType,
) {
  const category = await prisma
    .forWorkspace(workspaceId)
    .category.findFirst({ where: { id: categoryId, workspaceId } });
  if (!category) throw invalidCategory('Categoria não encontrada neste espaço.');
  if (category.type !== type) {
    throw invalidCategory(
      type === 'CREDIT' ? 'Escolha uma categoria de crédito.' : 'Escolha uma categoria de débito.',
    );
  }
  if (category.archivedAt) {
    throw invalidCategory('Esta categoria está arquivada. Reative-a ou escolha outra.');
  }
}
