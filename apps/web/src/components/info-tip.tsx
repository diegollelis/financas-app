import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * What a term means, behind a small "ⓘ" beside it (ADR 0036 note): opened by a tap or a click,
 * never by hover, which a phone does not have. The glyph is small, the target 44px on the phone
 * and 32px from md; Esc or a tap outside closes it, and focus goes back to the icon.
 *
 * Only definitions go here. What is true of the month (overdue, estimates, "Passou do limite")
 * stays as text in sight.
 */
export function InfoTip({
  term,
  children,
  className,
}: {
  /** The term explained: the icon's name is "Sobre <term>", and the bubble starts with it. */
  term: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Sobre ${term}`}
          className={cn(
            'text-muted-foreground hover:text-primary data-[state=open]:text-primary focus-visible:ring-ring/50 -my-3 inline-grid size-11 shrink-0 place-items-center rounded-full align-middle outline-none focus-visible:ring-3 md:-my-1.5 md:size-8',
            className,
          )}
        >
          <Info aria-hidden className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        aria-label={term}
        className="gap-1.5 p-3 leading-snug"
      >
        <p className="font-medium">{term}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}
