import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A transaction's "Observações" in a list (ADR 0029 note): with its line breaks, up to `lines`
 * lines (two on a card, one in a table) and "…"; only when there is more, "Ver tudo" opens the
 * whole text right there ("Ver menos" closes it). Reading is not editing, so it never opens the
 * form. The button is a 44px target on the phone.
 */
export function NotesText({
  text,
  lines,
  className,
}: {
  text: string;
  lines: 1 | 2;
  className?: string;
}) {
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const element = box.current;
    if (!element || open) return;
    // Measured where there is layout; more lines than shown also counts (and is all jsdom has).
    const measure = () =>
      setClipped(
        element.scrollHeight > element.clientHeight + 1 || text.split('\n').length > lines,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, lines, open]);

  return (
    <span className={cn('grid justify-items-start', className)}>
      <span
        ref={box}
        id={id}
        className={cn(
          'break-words whitespace-pre-line',
          !open && (lines === 1 ? 'line-clamp-1' : 'line-clamp-2'),
        )}
      >
        {text}
      </span>
      {(clipped || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((current) => !current)}
          // The text's color, underlined: blue fell short on the table's stripes in the dark theme.
          className="text-foreground focus-visible:ring-ring/50 -my-2 inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-4 outline-none focus-visible:ring-3 md:my-0 md:min-h-0"
        >
          {open ? 'Ver menos' : 'Ver tudo'}
        </button>
      )}
    </span>
  );
}
