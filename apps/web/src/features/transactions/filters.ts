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
  // The address keeps "efetivados", the word before ADR 0051: links and bookmarks still work.
  { value: 'efetivados', label: 'Pagos e recebidos' },
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
 * Whether what was typed is in one of the texts (description, category, person, merchant, method,
 * notes), ignoring case and accents ("agua" finds "Água").
 */
export function matchesSearch(search: string, ...texts: (string | null | undefined)[]) {
  const wanted = normalizeName(search);
  if (wanted === '') return true;
  return texts.some((text) => text && normalizeName(text).includes(wanted));
}

/**
 * Whether what was typed is part of the amount as the page writes it, without "R$" and with or
 * without the thousands dot: "159", "1.159" and "159,9" all find R$ 1.159,90. Only text that
 * looks like a number counts, so "água" is never compared with amounts.
 */
export function matchesAmount(search: string, cents: number) {
  const typed = search.replace(/R\$/i, '').replace(/\s/g, '');
  if (!/^[\d.,]*\d[\d.,]*$/.test(typed)) return false;
  const reais = String(Math.floor(cents / 100));
  const decimals = String(cents % 100).padStart(2, '0');
  const grouped = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return [`${grouped},${decimals}`, `${reais},${decimals}`].some((text) => text.includes(typed));
}
