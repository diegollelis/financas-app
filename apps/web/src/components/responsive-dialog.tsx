import type { ReactNode, RefObject } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';

/**
 * A form's container (ADR 0036): a sheet rising from the bottom on the phone, within reach of the
 * thumb, and a centered dialog from md. Both trap focus and give it back to the trigger on close.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  returnFocusTo,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /**
   * Where focus goes on close. Radix returns it to a Trigger; a dialog opened from a menu item
   * or a button outside it has none, and focus would fall to the page.
   */
  returnFocusTo?: HTMLElement | null | RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const onCloseAutoFocus = (event: Event) => {
    // Read on close, not on render: a ref is filled after the first render.
    const target =
      returnFocusTo && 'current' in returnFocusTo ? returnFocusTo.current : returnFocusTo;
    if (!target?.isConnected) return;
    event.preventDefault();
    target.focus();
  };

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[92svh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
