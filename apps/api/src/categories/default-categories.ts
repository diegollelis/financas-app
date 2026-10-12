import type { TransactionType } from '@financas/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { setWorkspaceContext } from '../prisma/prisma.service.js';

/**
 * Copied into every new workspace; members can then rename, archive or add others
 * (docs/dominio/modelo.md). Generic on purpose: each person adds their own. "Reembolso" is the
 * category of the shares of a split debit (ADR 0042), "Repasse" of a split credit (ADR 0052).
 * Workspaces created before this list keep the one they got, from the source spreadsheet.
 */
export const DEFAULT_CATEGORIES: Record<TransactionType, readonly string[]> = {
  CREDIT: ['Salário', 'Renda extra', 'Rendimentos', 'Reembolso', 'Outros'],
  DEBIT: [
    'Moradia',
    'Contas da casa',
    'Mercado',
    'Restaurantes',
    'Transporte',
    'Saúde',
    'Educação',
    'Lazer',
    'Compras',
    'Assinaturas',
    'Cartão de crédito',
    'Impostos e taxas',
    'Repasse',
    'Outros',
  ],
};

/**
 * Creates the default categories inside the transaction that creates the workspace, so a
 * workspace never exists without them. Sets the RLS context first: categories is protected.
 */
export async function createDefaultCategories(tx: Prisma.TransactionClient, workspaceId: string) {
  await setWorkspaceContext(tx, workspaceId);
  await tx.category.createMany({
    data: (['CREDIT', 'DEBIT'] as const).flatMap((type) =>
      DEFAULT_CATEGORIES[type].map((name) => ({ workspaceId, type, name })),
    ),
  });
}
