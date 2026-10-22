import * as React from 'react';
import { cn } from 'cn';

/**
 * Date and month fields on an iPhone (every browser there runs WebKit): the native control keeps a
 * minimum width of its own and pushed the sheet sideways. Without the native appearance it fits
 * the column like the other fields, tapping still opens iOS's own picker, and the date sits on
 * the left as typed text does (iOS centers it). Seen on an iPhone in production, 2026-10-22: the
 * three date fields ran past the sheet's edge and stood taller than the others.
 */
const DATE_FIELD =
  'block max-w-full appearance-none [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input-border bg-transparent px-3 py-1 text-base md:h-8 md:px-2.5 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        (type === 'date' || type === 'month') && DATE_FIELD,
        className,
      )}
      {...props}
    />
  );
}

export { Input };
