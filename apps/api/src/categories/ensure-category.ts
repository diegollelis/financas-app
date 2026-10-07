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

/**
 * The same rule for many transactions at once (a spreadsheet import, ADR 0040): one query for
 * every distinct category, and the first problem found refuses the whole batch.
 */
export async function ensureUsableCategories(
  prisma: PrismaService,
  workspaceId: string,
  uses: { categoryId: string; type: TransactionType }[],
) {
  const ids = [...new Set(uses.map((use) => use.categoryId))];
  const categories = await prisma
    .forWorkspace(workspaceId)
    .category.findMany({ where: { id: { in: ids }, workspaceId } });
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const { categoryId, type } of uses) {
    const category = byId.get(categoryId);
    if (!category) throw invalidCategory('Categoria não encontrada neste espaço.');
    if (category.type !== type) {
      throw invalidCategory(
        `A categoria ${category.name} é de ${category.type === 'CREDIT' ? 'crédito' : 'débito'}.`,
      );
    }
    if (category.archivedAt) {
      throw invalidCategory(
        `A categoria ${category.name} está arquivada. Reative-a ou escolha outra.`,
      );
    }
  }
}
