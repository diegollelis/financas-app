import { TRANSACTION_NOTES_MAX_LENGTH } from '@financas/shared';
import { useState, type ComponentProps } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** From this many characters on, the count shows: it says how much room is left only when it matters. */
const COUNT_FROM = TRANSACTION_NOTES_MAX_LENGTH - 100;

/**
 * "Observações" in several lines (ADR 0029 note): two lines to start, growing with the text up to
 * about eight, then it scrolls. Enter breaks the line; the form is sent by its button. Takes
 * every prop of a textarea (React Hook Form's `register`, the id and aria attributes from
 * `FormField`); the count of characters appears near the limit, which the field never passes.
 */
export function NotesTextarea({ className, onChange, ...props }: ComponentProps<'textarea'>) {
  const [length, setLength] = useState(0);
  return (
    <div className="grid gap-1">
      <Textarea
        rows={2}
        maxLength={TRANSACTION_NOTES_MAX_LENGTH}
        {...props}
        onChange={(event) => {
          setLength(event.target.value.length);
          onChange?.(event);
        }}
        className={cn('max-h-56 min-h-[4.5rem] overflow-y-auto', className)}
      />
      <p aria-live="polite" className="text-muted-foreground text-right text-xs tabular-nums">
        {length >= COUNT_FROM &&
          `${length.toLocaleString('pt-BR')} de ${TRANSACTION_NOTES_MAX_LENGTH.toLocaleString('pt-BR')}`}
      </p>
    </div>
  );
}
