import type { Category } from '@financas/shared';

/** How many categories the "Mais usadas" group shows. */
const MOST_USED = 5;
/** Below this, the whole list fits on the screen and the group would only repeat it. */
const MOST_USED_FROM = 9;

/** The most used of `options` (Category.recentUses), most used first; archived ones never. */
export function mostUsed(options: Category[]): Category[] {
  if (options.length < MOST_USED_FROM) return [];
  return options
    .filter((category) => category.recentUses > 0 && !category.archived)
    .sort((a, b) => b.recentUses - a.recentUses)
    .slice(0, MOST_USED);
}
