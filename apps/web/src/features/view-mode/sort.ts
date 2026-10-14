import { useState } from 'react';

export type SortDirection = 'asc' | 'desc';

/** What a column sorts by: text, a number (cents) or an ISO date; null when there is none. */
export type SortValue = string | number | null;

/**
 * The rows ordered by one column, keeping the given order among equals. Empty values go last
 * in either direction; text ignores case and accents.
 */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: SortDirection,
): T[] {
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((a, b) => {
      if (a.key === null || b.key === null) {
        if (a.key === b.key) return a.index - b.index;
        return a.key === null ? 1 : -1;
      }
      const compared =
        typeof a.key === 'number' && typeof b.key === 'number'
          ? a.key - b.key
          : String(a.key).localeCompare(String(b.key), 'pt-BR', { sensitivity: 'base' });
      if (compared === 0) return a.index - b.index;
      return direction === 'asc' ? compared : -compared;
    })
    .map(({ row }) => row);
}

/** Which column a table is sorted by: a new column starts ascending, the same one flips. */
export function useSort<K extends string>(initial: K) {
  const [sort, setSort] = useState<{ key: K; direction: SortDirection }>({
    key: initial,
    direction: 'asc',
  });
  const toggle = (key: K) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  return { ...sort, toggle };
}
