import { currentPeriod, formatPeriod } from '@financas/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });

/** "jan" … "dez": the grid labels; each month's full name is its accessible name. */
const monthLabels = Array.from({ length: 12 }, (_, index) =>
  monthShort.format(new Date(Date.UTC(2026, index, 1))).replace('.', ''),
);

/**
 * Jump straight to any competência (ADR 0036): a year with its own arrows, and its 12 months.
 * The months are links (`?competencia=`), so the browser's back button returns to the month seen
 * before. Changing the year only changes the grid. Outside this month, "Ir para o mês atual".
 */
export function PeriodPicker({ period, onPick }: { period: string; onPick: () => void }) {
  const thisMonth = currentPeriod();
  // Opens on the year of the competência on screen, not on this year.
  const [year, setYear] = useState(Number(period.slice(0, 4)));
  const to = (target: string) => ({ search: `?competencia=${target}` });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={`Ano anterior: ${year - 1}`}
          onClick={() => setYear(year - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <p aria-live="polite" className="text-lg font-semibold tabular-nums">
          {year}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Próximo ano: ${year + 1}`}
          onClick={() => setYear(year + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <ul className="grid grid-cols-4 gap-2" aria-label={`Meses de ${year}`}>
        {monthLabels.map((label, index) => {
          const target = `${year}-${String(index + 1).padStart(2, '0')}`;
          const open = target === period;
          const today = target === thisMonth;
          return (
            <li key={target}>
              <Link
                to={to(target)}
                onClick={onPick}
                aria-current={open ? 'true' : undefined}
                aria-label={`${formatPeriod(target)}${today ? ', mês atual' : ''}`}
                className={cn(
                  'focus-visible:ring-ring/50 flex h-11 items-center justify-center rounded-lg text-base font-medium outline-none focus-visible:ring-3 md:h-9 md:text-sm',
                  open ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  today && !open && 'border-primary border',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      {period !== thisMonth && (
        <Button asChild variant="outline">
          <Link to={to(thisMonth)} onClick={onPick}>
            Ir para o mês atual
          </Link>
        </Button>
      )}
    </div>
  );
}
