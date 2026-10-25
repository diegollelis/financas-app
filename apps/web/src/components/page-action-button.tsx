import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A page's main action (ADR 0036 notes): fixed above the tab bar on the phone, within reach of
 * the thumb, and a plain button where the page puts it from md (beside the title, in
 * `PageHeader`'s `action`). One per page. `data-fab` makes the layout keep room for it below the
 * footer, so nothing at the end of a page is ever under it. `wide` spans the phone's width, for an
 * action that closes a flow ("Importar 12 lançamentos").
 */
export function PageActionButton({
  wide = false,
  className,
  ...props
}: ComponentProps<typeof Button> & { wide?: boolean }) {
  return (
    <Button
      data-fab
      {...props}
      className={cn(
        'fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 shadow-lg md:static md:shadow-none',
        // Floating over the page, it is never see-through: off, a solid muted fill, so the text
        // behind it never shows (on the page from md, the usual faded look).
        'max-md:disabled:bg-muted max-md:disabled:text-muted-foreground max-md:disabled:opacity-100',
        wide && 'left-4',
        className,
      )}
    />
  );
}
