import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SortDirection } from './sort';

/**
 * A column title that sorts the table: a button inside the header cell, which carries
 * `aria-sort` while it is the column in use.
 */
export function SortableHead({
  label,
  active,
  direction,
  onSort,
  align = 'left',
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  align?: 'left' | 'right';
}) {
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
      // A long title ("Estabelecimento / Meio") breaks into lines instead of running into the next.
      className={cn('whitespace-normal', align === 'right' && 'text-right')}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          'hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-3',
          active ? 'text-foreground' : 'text-muted-foreground',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </TableHead>
  );
}
