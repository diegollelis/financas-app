import { currentPeriod, formatPeriod, shiftPeriod } from '@financas/shared';
import { Link } from 'react-router';

const linkClassName = 'text-muted-foreground hover:text-foreground hover:underline';

/**
 * Previous / next competência on the same page. Only `?competencia=` changes, so the address can
 * be shared and the browser's back button goes to the month seen before.
 */
export function PeriodNav({ period }: { period: string }) {
  const thisMonth = currentPeriod();
  const to = (target: string) => ({ search: `?competencia=${target}` });
  const previous = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <nav aria-label="Competência" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <Link
        to={to(previous)}
        aria-label={`Competência anterior: ${formatPeriod(previous)}`}
        className={linkClassName}
      >
        ← Anterior
      </Link>
      <span className="font-medium">Competência: {formatPeriod(period)}</span>
      <Link
        to={to(next)}
        aria-label={`Próxima competência: ${formatPeriod(next)}`}
        className={linkClassName}
      >
        Próxima →
      </Link>
      {period !== thisMonth && (
        <Link to={to(thisMonth)} className={linkClassName}>
          Mês atual
        </Link>
      )}
    </nav>
  );
}
