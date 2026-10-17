// How rows of money read (ADR 0036 notes): the list shows one card per row, the table alternating
// stripes. Shared by the pages that show rows with an amount and actions (Lançamentos,
// Recorrências, the import review), so they look alike.

/** A list of rows: one column of cards, 8px apart. */
export const CARD_LIST = 'grid gap-2';

/** One row of such a list, as a card of its own. */
export const CARD_ROW = 'bg-card rounded-xl border px-4 py-3.5';

/** The box around a table of rows: the card background, no lines inside. */
export const TABLE_BOX = 'bg-card rounded-xl border px-2 py-1';

/**
 * A table row: stripes instead of lines, and a stronger fill under the pointer, to follow a wide
 * row to its actions. Opacity on existing tokens, no new color: muted in light, secondary in dark,
 * where muted is the card's own color.
 */
export const STRIPED_ROW =
  'border-0 odd:bg-muted/70 hover:bg-border/70 dark:odd:bg-secondary/40 dark:hover:bg-secondary';

/**
 * A list of short names (categories, merchants, people, members): one card with dividers, on the
 * card background like the cards of money, so the pages look alike.
 */
export const DIVIDED_LIST = 'bg-card divide-y rounded-xl border px-4';

/**
 * A catalog of names (categories, merchants): compact cards, one column on the phone, two from lg,
 * in alphabetical order. No amounts to compare, so a grid reads well here (ADR 0036 note).
 */
export const TILE_LIST = 'grid gap-2 lg:grid-cols-2';

/** One name of such a catalog, with its badge and menu. */
export const TILE_ROW =
  'bg-card flex min-h-14 items-center justify-between gap-3 rounded-xl border py-1.5 pr-2 pl-4 md:min-h-12';
