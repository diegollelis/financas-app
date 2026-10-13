import { normalizeName, type Category, type TransactionType } from '@financas/shared';
import { useCreateCategory, useUpdateCategory } from './use-categories';

/**
 * A category picked by "Adicionar 'Nome'" is not created at once: the field holds this prefix
 * and the name, and the form creates it on save, like a new person or merchant (ADRs 0052, 0053).
 * Cancelling the form leaves nothing behind.
 */
const NEW_PREFIX = 'nova:';

export const newCategoryValue = (name: string) => `${NEW_PREFIX}${name.trim()}`;

/** The name of a category still to be created; null for an existing one's id. */
export function newCategoryName(value: string): string | null {
  return value.startsWith(NEW_PREFIX) ? value.slice(NEW_PREFIX.length) : null;
}

/**
 * The id of the category picked in a form: an existing one as it is; a new name becomes the
 * category of that type with the same name (ignoring case and accents), reactivated if archived,
 * or a new one created now.
 */
export function useResolveCategory(workspaceId: string, categories: Category[]) {
  const create = useCreateCategory(workspaceId);
  const update = useUpdateCategory(workspaceId);
  const resolve = async (value: string, type: TransactionType): Promise<string> => {
    const name = newCategoryName(value);
    if (name === null) return value;
    const existing = categories.find(
      (category) => category.type === type && normalizeName(category.name) === normalizeName(name),
    );
    if (!existing) return (await create.mutateAsync({ name, type })).id;
    if (existing.archived) await update.mutateAsync({ id: existing.id, archived: false });
    return existing.id;
  };
  return {
    resolve,
    error: create.error ?? update.error,
    isPending: create.isPending || update.isPending,
  };
}
