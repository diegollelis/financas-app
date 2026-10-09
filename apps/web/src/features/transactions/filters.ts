import { normalizeName, transactionStatus, type Transaction } from '@financas/shared';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

/**
 * The status filter of the transactions page, in the address (`?situacao=`), so the dashboard can
 * link straight to the overdue ones. "Pendentes" is everything not settled yet, overdue included.
 */
export const statusFilterSchema = z.enum(['todos', 'pendentes', 'vencidos', 'efetivados']);

export type StatusFilter = z.infer<typeof statusFilterSchema>;

export const statusFilterOptions: readonly { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendentes', label: 'Pendentes' },
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'efetivados', label: 'Efetivados' },
];

/** The filter in the address, and a way to change it without stacking history entries. */
export function useStatusFilter(): [StatusFilter, (next: StatusFilter) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const parsed = statusFilterSchema.safeParse(searchParams.get('situacao'));
  const filter = parsed.success ? parsed.data : 'todos';
  const setFilter = (next: StatusFilter) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === 'todos') params.delete('situacao');
        else params.set('situacao', next);
        return params;
      },
      { replace: true },
    );
  return [filter, setFilter];
}

export function matchesStatus(transaction: Transaction, filter: StatusFilter, today: string) {
  if (filter === 'todos') return true;
  const status = transactionStatus(transaction, today);
  if (filter === 'efetivados') return status === 'SETTLED';
  if (filter === 'vencidos') return status === 'OVERDUE';
  return status !== 'SETTLED';
}

/**
 * Whether what was typed is in the description, the category or the person, ignoring case and
 * accents ("agua" finds "Água").
 */
export function matchesSearch(search: string, ...texts: (string | null | undefined)[]) {
  const wanted = normalizeName(search);
  if (wanted === '') return true;
  return texts.some((text) => text && normalizeName(text).includes(wanted));
}
