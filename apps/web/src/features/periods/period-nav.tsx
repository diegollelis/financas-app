import { currentPeriod, formatPeriod, shiftPeriod } from '@financas/shared';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { PeriodPicker } from './period-picker';

/**
 * Previous / next competência on the same page, and the month itself opens a picker to jump far
 * (ADR 0036). Only `?competencia=` changes, so the address can be shared and the browser's back
 * button goes to the month seen before. The row never changes shape: "Ir para o mês atual" lives
 * in the picker, and a dot beside the name tells that this is not this month.
 */
export function PeriodNav({ period }: { period: string }) {
  const thisMonth = currentPeriod();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const to = (target: string) => ({ search: `?competencia=${target}` });
  const previous = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);
  const away = period !== thisMonth;

  const trigger = (
    <Button
      ref={triggerRef}
      variant="ghost"
      className="min-w-0 flex-1 gap-2 text-base font-medium sm:w-44 sm:flex-none md:text-sm"
      onClick={desktop ? undefined : () => setOpen(true)}
    >
      {/* The name holds the visible month (WCAG 2.5.3): the rest is screen-reader text. */}
      <span className="sr-only">Escolher competência:</span>{' '}
      <span className="truncate first-letter:uppercase">{formatPeriod(period)}</span>
      {away && <span className="sr-only">, fora do mês atual</span>}
      {away && <span aria-hidden className="bg-primary size-1.5 shrink-0 rounded-full" />}
      <ChevronDown aria-hidden className="text-muted-foreground" />
    </Button>
  );
  const picker = <PeriodPicker period={period} onPick={() => setOpen(false)} />;

  return (
    <nav aria-label="Competência" className="flex items-center gap-2">
      <Button asChild variant="outline" size="icon">
        <Link to={to(previous)} aria-label={`Competência anterior: ${formatPeriod(previous)}`}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      {desktop ? (
        // A small balloon on the desktop: a quick choice that does not dim the page.
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" aria-label="Escolher competência" className="w-72">
            {picker}
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {trigger}
          <ResponsiveDialog
            open={open}
            onOpenChange={setOpen}
            returnFocusTo={triggerRef}
            title="Escolher competência"
            description="Escolha o ano e depois o mês."
          >
            {picker}
          </ResponsiveDialog>
        </>
      )}
      <Button asChild variant="outline" size="icon">
        <Link to={to(next)} aria-label={`Próxima competência: ${formatPeriod(next)}`}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </nav>
  );
}
