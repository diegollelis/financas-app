import { createContext, useContext, useEffect, useId } from 'react';

/** How a form inside a `ResponsiveDialog` tells it that something was typed. */
export const DialogDirtyContext = createContext<((key: string, dirty: boolean) => void) | null>(
  null,
);

/**
 * A form inside a `ResponsiveDialog` says whether something was typed in it (React Hook Form's
 * `formState.isDirty`): closing the dialog by mistake then asks first. Outside one, nothing.
 */
export function useDialogDirty(dirty: boolean) {
  const report = useContext(DialogDirtyContext);
  const key = useId();
  useEffect(() => {
    report?.(key, dirty);
    return () => report?.(key, false);
  }, [report, key, dirty]);
}
