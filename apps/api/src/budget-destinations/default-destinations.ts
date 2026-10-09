import { DEFAULT_BUDGET_DESTINATIONS } from '@financas/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { setWorkspaceContext } from '../prisma/prisma.service.js';

/**
 * Creates the default destinations (ADR 0047) inside the transaction that creates the
 * workspace, after its default categories: Despesas, and each saving one with its debit
 * category of the same name. The migration that created the table did the same for the
 * workspaces that already existed.
 */
export async function createDefaultDestinations(tx: Prisma.TransactionClient, workspaceId: string) {
  await setWorkspaceContext(tx, workspaceId);
  for (const [position, destination] of DEFAULT_BUDGET_DESTINATIONS.entries()) {
    const category =
      destination.kind === 'SAVINGS'
        ? await tx.category.create({
            data: { workspaceId, name: destination.name, type: 'DEBIT' },
          })
        : null;
    await tx.budgetDestination.create({
      data: {
        workspaceId,
        name: destination.name,
        kind: destination.kind,
        position,
        categoryId: category?.id ?? null,
      },
    });
  }
}
