import type { TransactionType } from '@financas/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { setWorkspaceContext } from '../prisma/prisma.service.js';

/**
 * Copied into every new workspace; members can then rename, archive or add others
 * (docs/dominio/modelo.md). The migration that created the table holds the same list, for the
 * workspaces that already existed.
 */
export const DEFAULT_CATEGORIES: Record<TransactionType, readonly string[]> = {
  CREDIT: [
    'Salário',
    'PLR',
    '13º salário',
    'Férias',
    'Benefício',
    'Cashback',
    'Freelance',
    'Vendas',
    'Empréstimo',
    'Consórcio',
    'Saque-aniversário FGTS',
    'Restituição IRPF',
    'Outros',
  ],
  DEBIT: [
    'Cartão de crédito',
    'Energia',
    'Internet',
    'Celular',
    'Streaming',
    'Mercado',
    'Vale-alimentação',
    'Combustível',
    'Carro',
    'Seguro do carro',
    'IPVA',
    'Lote',
    'Consórcio',
    'Empréstimo',
    'Faculdade',
    'Pós-graduação',
    'Curso',
    'Inglês',
    'Concurso',
    'Saúde',
    'Farmácia',
    'Suplemento',
    'Roupas',
    'Lazer',
    'Viagem',
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
