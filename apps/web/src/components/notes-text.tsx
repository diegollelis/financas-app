import { useEffect, useRef, useState } from 'react';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { cn } from '@/lib/utils';

/**
 * A transaction's "Observações" in a list (ADR 0029 notes): with its line breaks, up to `lines`
 * lines (two on a card, one in a table) and "…"; only when there is more, "Ver tudo" opens the
 * whole text in a dialog of its own, read-only and scrolling inside, so the list never grows or
 * jumps. Reading is not editing: the transaction's ⋯ menu stays beside it. `about` names the
 * transaction (its description), in the dialog and in the button's name, since a list has many.
 */
export function NotesText({
  text,
  lines,
  about,
  className,
}: {
  text: string;
  lines: 1 | 2;
  about: string;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    // Measured where there is layout; more lines than shown also counts (and is all jsdom has).
    const measure = () =>
      setClipped(
        element.scrollHeight > element.clientHeight + 1 || text.split('\n').length > lines,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, lines]);

  return (
    <span className={cn('grid justify-items-start', className)}>
      <span
        ref={box}
        className={cn(
          'break-words whitespace-pre-line',
          lines === 1 ? 'line-clamp-1' : 'line-clamp-2',
        )}
      >
        {text}
      </span>
      {clipped && (
        <>
          <button
            ref={trigger}
            type="button"
            // Starts with the visible text, so a voice command finds it (WCAG 2.5.3).
            aria-label={`Ver tudo: observações de ${about}`}
            onClick={() => setOpen(true)}
            // The text's color, underlined: blue fell short on the table's stripes in the dark theme.
            className="text-foreground focus-visible:ring-ring/50 -my-2 inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-3 md:my-0 md:min-h-0"
          >
            Ver tudo
          </button>
          <ResponsiveDialog
            open={open}
            onOpenChange={setOpen}
            returnFocusTo={trigger}
            title="Observações"
            description={about}
          >
            {/* Scrolls inside when long; focusable so the arrow keys scroll it too (axe). The
                dialog's own X (named "Fechar"), Esc or a tap outside close it: no second button
                with the same name. */}
            <div
              tabIndex={0}
              className="text-foreground focus-visible:ring-ring/50 max-h-[60svh] overflow-y-auto rounded-sm pb-2 text-base break-words whitespace-pre-line outline-none focus-visible:ring-3 md:text-sm"
            >
              {text}
            </div>
          </ResponsiveDialog>
        </>
      )}
    </span>
  );
}
