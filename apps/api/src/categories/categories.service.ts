import type {
  Category,
  CreateCategoryInput,
  TransactionType,
  UpdateCategoryInput,
} from '@financas/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type Category as CategoryRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

function toResponse(category: CategoryRow): Category {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    archived: category.archivedAt !== null,
  };
}

/** Sorts names as a Brazilian reader expects ("Água" next to "Aluguel", not after "Viagem"). */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
const typeOrder: Record<TransactionType, number> = { CREDIT: 0, DEBIT: 1 };

const categoryExists = () =>
  new ConflictException({
    code: 'CATEGORY_EXISTS',
    message: 'Já existe uma categoria com esse nome. Se ela estiver arquivada, reative-a.',
  });

/**
 * Prisma error codes: P2002 = unique constraint violated, P2003 = foreign key violated,
 * P2025 = record to update not found.
 */
function isPrismaError(error: unknown, code: 'P2002' | 'P2003' | 'P2025') {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Categories of one workspace. The workspaceId comes from WorkspaceMemberGuard; every query
 * filters by it and runs through forWorkspace, so RLS backs the filter up (ADRs 0008 and 0028).
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All of them, archived too: credits first, then debits, each by name. */
  async list(workspaceId: string): Promise<Category[]> {
    const categories = await this.prisma
      .forWorkspace(workspaceId)
      .category.findMany({ where: { workspaceId } });
    return categories
      .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || collator.compare(a.name, b.name))
      .map(toResponse);
  }

  async create(workspaceId: string, input: CreateCategoryInput): Promise<Category> {
    await this.ensureNameIsFree(workspaceId, input.type, input.name);
    try {
      const category = await this.prisma
        .forWorkspace(workspaceId)
        .category.create({ data: { workspaceId, name: input.name, type: input.type } });
      return toResponse(category);
    } catch (error) {
      // Two simultaneous requests with the same name: the unique index decides.
      if (isPrismaError(error, 'P2002')) throw categoryExists();
      throw error;
    }
  }

  async update(
    workspaceId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    const current = await this.find(workspaceId, categoryId);
    if (input.name !== undefined) {
      await this.ensureNameIsFree(workspaceId, current.type, input.name, categoryId);
    }
    let archivedAt: Date | null | undefined;
    if (input.archived === true) archivedAt = current.archivedAt ?? new Date();
    if (input.archived === false) archivedAt = null;

    try {
      const category = await this.prisma.forWorkspace(workspaceId).category.update({
        where: { id: categoryId, workspaceId },
        data: { name: input.name, archivedAt },
      });
      return toResponse(category);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw categoryExists();
      // Deleted by someone else between the read and the update.
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * Deletes a category. One in use can only be archived: the foreign key of transactions
   * (ADR 0029) refuses the delete, which becomes a 409.
   */
  async remove(workspaceId: string, categoryId: string): Promise<void> {
    if (!z.uuid().safeParse(categoryId).success) throw new NotFoundException();
    try {
      const { count } = await this.prisma
        .forWorkspace(workspaceId)
        .category.deleteMany({ where: { id: categoryId, workspaceId } });
      if (count === 0) throw new NotFoundException();
    } catch (error) {
      if (isPrismaError(error, 'P2003')) {
        throw new ConflictException({
          code: 'CATEGORY_IN_USE',
          message: 'Esta categoria tem lançamentos: ela não pode ser excluída, só arquivada.',
        });
      }
      throw error;
    }
  }

  /** An id that is not a uuid, or that belongs to another workspace, is simply not found. */
  private async find(workspaceId: string, categoryId: string): Promise<CategoryRow> {
    if (!z.uuid().safeParse(categoryId).success) throw new NotFoundException();
    const category = await this.prisma
      .forWorkspace(workspaceId)
      .category.findFirst({ where: { id: categoryId, workspaceId } });
    if (!category) throw new NotFoundException();
    return category;
  }

  /** Names are unique per workspace and type, ignoring case ("mercado" = "Mercado"). */
  private async ensureNameIsFree(
    workspaceId: string,
    type: TransactionType,
    name: string,
    exceptId?: string,
  ) {
    const clash = await this.prisma.forWorkspace(workspaceId).category.findFirst({
      where: {
        workspaceId,
        type,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId && { id: { not: exceptId } }),
      },
    });
    if (clash) throw categoryExists();
  }
}
