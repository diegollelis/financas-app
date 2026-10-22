import { settleActionLabels, type TransactionType } from '@financas/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Settling a pending transaction in one tap (ADR 0036 notes), chosen in a preview: a soft button
 * with the verb and an arrow for the money's way, "↓ Receber" (in) or "↑ Pagar" (out). The arrow
 * and the word tell them apart, never color alone. Receber takes the credit green; Pagar a light
 * blue, and red only when overdue, the one that asks for attention. The colors are the palette's
 * soft fills with their dark text (4.5:1); the name starts with the visible text, "Pagar: Aluguel"
 * (WCAG 2.5.3). A 44px target on the phone.
 */
export function SettleButton({
  type,
  overdue,
  description,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'children' | 'type'> & {
  type: TransactionType;
  overdue: boolean;
  /** The transaction's description, for the button's name. */
  description: string;
}) {
  const verb = settleActionLabels[type].short;
  const Arrow = type === 'CREDIT' ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      aria-label={`${verb}: ${description}`}
      {...props}
      className={cn(
        'focus-visible:ring-ring/50 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-[filter] outline-none hover:brightness-95 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 md:h-8 md:px-3 dark:hover:brightness-110',
        type === 'CREDIT'
          ? 'bg-credit-muted text-credit-foreground'
          : overdue
            ? 'bg-debit-muted text-destructive'
            : 'bg-primary/10 text-foreground [&>svg]:text-primary',
        className,
      )}
    >
      <Arrow aria-hidden className="size-4" strokeWidth={2.5} />
      {verb}
    </button>
  );
}
