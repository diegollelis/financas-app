import type { SplitRole, TransactionType } from '@financas/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { setWorkspaceContext } from '../prisma/prisma.service.js';

/**
 * Copied into every new workspace; members can then rename, archive or add others (never
 * Reembolso and Repasse, the marked categories of the shares of a split, ADR 0052 note)
 * (docs/dominio/modelo.md). Generic on purpose: each person adds their own. "Reembolso" is the
 * category of the shares of a split debit (ADR 0042), "Repasse" of a split credit (ADR 0052).
 * "Bônus" is what the employer pays besides the salary (PLR, a bonus); "Renda extra", what comes
 * from elsewhere. "Beleza" (salão, barbeiro, cosméticos) apart from "Saúde". No "Cartão de crédito": how it was paid is the payment method, not a category (ADR 0054).
 * Workspaces created before this list keep the one they got, from the source spreadsheet.
 */
export const DEFAULT_CATEGORIES: Record<TransactionType, readonly string[]> = {
  CREDIT: ['Salário', 'Bônus', 'Renda extra', 'Rendimentos', 'Reembolso', 'Outros'],
  DEBIT: [
    'Moradia',
    'Contas da casa',
    'Mercado',
    'Restaurantes',
    'Transporte',
    'Saúde',
    'Beleza',
    'Educação',
    'Lazer',
    'Compras',
    'Assinaturas',
    'Impostos e taxas',
    'Repasse',
    'Outros',
  ],
};

/** The default categories that receive the shares of a split, marked as such (ADR 0052 note). */
const SPLIT_ROLES: Record<string, SplitRole> = {
  'CREDIT:Reembolso': 'REIMBURSEMENT',
  'DEBIT:Repasse': 'PASS_THROUGH',
};

/**
 * Creates the default categories inside the transaction that creates the workspace, so a
 * workspace never exists without them. Sets the RLS context first: categories is protected.
 */
export async function createDefaultCategories(tx: Prisma.TransactionClient, workspaceId: string) {
  await setWorkspaceContext(tx, workspaceId);
  await tx.category.createMany({
    data: (['CREDIT', 'DEBIT'] as const).flatMap((type) =>
      DEFAULT_CATEGORIES[type].map((name) => ({
        workspaceId,
        type,
        name,
        splitRole: SPLIT_ROLES[`${type}:${name}`] ?? null,
      })),
    ),
  });
}
