import type { CreateImportInput, Import } from '@financas/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { ensureUsableCategories } from '../categories/ensure-category.js';
import type { TransactionImport } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toDate } from '../transactions/dates.js';

type ImportRow = TransactionImport & { createdBy: { name: string } | null };

function toResponse(row: ImportRow): Import {
  return {
    id: row.id,
    transactionCount: row.transactionCount,
    firstPeriod: row.firstPeriod,
    lastPeriod: row.lastPeriod,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

const withCreator = { createdBy: { select: { name: true } } } as const;

/**
 * Spreadsheet imports of one workspace (ADR 0040). Same rules as the other resources: the
 * workspaceId comes from WorkspaceMemberGuard, every query filters by it and runs through
 * forWorkspace (RLS). Descriptions and amounts are personal data: never log them (ADR 0012).
 */
@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. */
  async list(workspaceId: string): Promise<Import[]> {
    const imports = await this.prisma.forWorkspace(workspaceId).transactionImport.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: withCreator,
    });
    return imports.map(toResponse);
  }

  /**
   * Creates the import and all its transactions in one nested write: all or nothing. Every
   * category is checked first, so a wrong one refuses the batch with a clear message.
   */
  async create(workspaceId: string, userId: string, input: CreateImportInput): Promise<Import> {
    await ensureUsableCategories(this.prisma, workspaceId, input.transactions);
    const periods = input.transactions.map((transaction) => transaction.period).sort();
    const created = await this.prisma.forWorkspace(workspaceId).transactionImport.create({
      data: {
        workspaceId,
        createdById: userId,
        transactionCount: input.transactions.length,
        firstPeriod: periods[0] ?? '',
        lastPeriod: periods.at(-1) ?? '',
        transactions: {
          createMany: {
            data: input.transactions.map((transaction) => ({
              workspaceId,
              type: transaction.type,
              description: transaction.description,
              notes: transaction.notes ?? null,
              categoryId: transaction.categoryId,
              amountCents: transaction.amountCents,
              period: transaction.period,
              dueDate: transaction.dueDate ? toDate(transaction.dueDate) : null,
              settledAt: transaction.settledAt ? toDate(transaction.settledAt) : null,
            })),
          },
        },
      },
      include: withCreator,
    });
    return toResponse(created);
  }

  /**
   * Undoes an import: deleting it cascades to every transaction it brought, also those changed
   * since (the screen says so before asking).
   */
  async undo(workspaceId: string, importId: string): Promise<void> {
    if (!z.uuid().safeParse(importId).success) throw new NotFoundException();
    const { count } = await this.prisma
      .forWorkspace(workspaceId)
      .transactionImport.deleteMany({ where: { id: importId, workspaceId } });
    if (count === 0) throw new NotFoundException();
  }
}
