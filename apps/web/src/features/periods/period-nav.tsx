import { currentPeriod, formatPeriod, shiftPeriod } from '@financas/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/**
 * Previous / next competência on the same page. Only `?competencia=` changes, so the address can
 * be shared and the browser's back button goes to the month seen before. They are links styled as
 * buttons: they navigate, and 44px touch targets on the phone (ADR 0036).
 */
export function PeriodNav({ period }: { period: string }) {
  const thisMonth = currentPeriod();
  const to = (target: string) => ({ search: `?competencia=${target}` });
  const previous = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <nav aria-label="Competência" className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon">
        <Link to={to(previous)} aria-label={`Competência anterior: ${formatPeriod(previous)}`}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <p className="min-w-0 flex-1 text-center font-medium first-letter:uppercase sm:w-44 sm:flex-none">
        {formatPeriod(period)}
      </p>
      <Button asChild variant="outline" size="icon">
        <Link to={to(next)} aria-label={`Próxima competência: ${formatPeriod(next)}`}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>
      {period !== thisMonth && (
        <Button asChild variant="ghost">
          <Link to={to(thisMonth)}>Mês atual</Link>
        </Button>
      )}
    </nav>
  );
}
