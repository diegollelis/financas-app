import type { ReactElement, ReactNode } from 'react';
import { cloneElement } from 'react';
import { InfoTip } from '@/components/info-tip';
import { Label } from '@/components/ui/label';

/**
 * Label + input + error message, wired for screen readers: the input gets the id,
 * `aria-invalid` and `aria-describedby` pointing at the message, and at the hint when there is
 * one (a short line under the field). `help` puts what the field means behind an "ⓘ" beside the
 * label instead (InfoTip, ADR 0036 note).
 */
export function FormField({
  id,
  label,
  error,
  hint,
  help,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  help?: ReactNode;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ');
  return (
    <div className="grid gap-2">
      {help ? (
        <div className="flex items-center">
          <Label htmlFor={id}>{label}</Label>
          <InfoTip term={label}>{help}</InfoTip>
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
