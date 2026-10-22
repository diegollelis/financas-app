import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { cn } from '@/lib/utils';
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
  wide = false,
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
  /** A longer form that lays its fields in columns from lg: a wider dialog there. */
  wide?: boolean;
  children: ReactNode;
}) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const keyboard = useKeyboardInset();
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Once the keyboard has opened (or grown), keep the field being typed in visible: a long
    // form may not fit in what is left of the screen.
    if (keyboard.inset === 0) return;
    const field = document.activeElement;
    if (field instanceof HTMLElement && sheetRef.current?.contains(field)) {
      field.scrollIntoView({ block: 'nearest' });
    }
  }, [keyboard.inset]);
  const onCloseAutoFocus = (event: Event) => {
    // Read on close, not on render: a ref is filled after the first render.
    const target =
      returnFocusTo && 'current' in returnFocusTo ? returnFocusTo.current : returnFocusTo;
    if (!target?.isConnected) return;
    event.preventDefault();
    target.focus();
  };
  // A toast's action ("Desfazer") is outside the dialog: using it must not close the dialog.
  const onInteractOutside = (event: Event) => {
    if (event.target instanceof Element && event.target.closest('[data-sonner-toaster]')) {
      event.preventDefault();
    }
  };

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn('max-h-[90svh] overflow-y-auto sm:max-w-lg', wide && 'lg:max-w-2xl')}
          onCloseAutoFocus={onCloseAutoFocus}
          onInteractOutside={onInteractOutside}
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
        ref={sheetRef}
        side="bottom"
        onCloseAutoFocus={onCloseAutoFocus}
        onInteractOutside={onInteractOutside}
        className="max-h-[92svh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        // Above the keyboard, and no taller than what it leaves visible (see useKeyboardInset).
        style={
          keyboard.inset > 0
            ? { bottom: keyboard.inset, maxHeight: keyboard.visibleHeight - 16 }
            : undefined
        }
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
