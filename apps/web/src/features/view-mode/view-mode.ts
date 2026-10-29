import { useSyncExternalStore } from 'react';
import { useMediaQuery } from '@/lib/use-media-query';

/** How a page of rows is shown from xl: stacked rows (the default) or a table. */
export type ViewMode = 'LIST' | 'TABLE';

/** The pages that offer a table, as the route's `handle: { table }` names them. */
export type TablePage = 'lancamentos' | 'recorrencias' | 'painel-metas';

/**
 * From Tailwind's `xl` (1280px): beside the sidebar, a narrower screen leaves the description a
 * sliver between the columns, so it keeps the list.
 */
export const TABLE_QUERY = '(min-width: 1280px)';

const storageKey = (page: TablePage) => `financas:visao:${page}`;

// Without storage (a private window, blocked site data), the choice lasts while the page is open.
const memory = new Map<TablePage, ViewMode>();
const listeners = new Set<() => void>();

function readViewMode(page: TablePage): ViewMode {
  try {
    return window.localStorage.getItem(storageKey(page)) === 'TABLE' ? 'TABLE' : 'LIST';
  } catch {
    // Storage unavailable: what was chosen in this visit.
    return memory.get(page) ?? 'LIST';
  }
}

export function setViewMode(page: TablePage, mode: ViewMode) {
  memory.set(page, mode);
  try {
    window.localStorage.setItem(storageKey(page), mode);
  } catch {
    // Kept in memory only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The view picked for a page, remembered in this browser (a per-viewer convenience). */
export function useViewMode(page: TablePage) {
  const mode = useSyncExternalStore(subscribe, () => readViewMode(page));
  return [mode, (next: ViewMode) => setViewMode(page, next)] as const;
}

/** Whether the page shows its table now: picked, and on a screen wide enough for it. */
export function useShowsTable(page: TablePage | undefined) {
  const wide = useMediaQuery(TABLE_QUERY);
  const mode = useSyncExternalStore(subscribe, () => (page ? readViewMode(page) : 'LIST'));
  return wide && mode === 'TABLE';
}
