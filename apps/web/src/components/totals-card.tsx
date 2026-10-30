import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TotalsItem = {
  label: string;
  value: string;
  /** A color for the value: the credit green, or red for a negative balance. */
  tone?: string;
  /** A line under the value, muted; it may carry its own colored parts. */
  sub?: ReactNode;
};

/**
 * What a list adds up to, in one card (ADR 0036 note): Lançamentos' "Resumo do mês", each group
 * of Recorrências and the people's balance. On the phone one line each, the label beside the
 * amount, so a large amount never wraps; columns from sm.
 */
export function TotalsCard({ label, items }: { label: string; items: TotalsItem[] }) {
  return (
    <dl
      aria-label={label}
      className="bg-card grid gap-1.5 rounded-xl border p-3 sm:grid-cols-3 sm:gap-3"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-wrap items-baseline justify-between gap-x-3 sm:grid sm:content-start sm:justify-start sm:gap-0.5"
        >
          <dt className="text-muted-foreground text-sm">{item.label}</dt>
          <dd className={cn('font-semibold whitespace-nowrap tabular-nums', item.tone)}>
            {item.value}
          </dd>
          {item.sub && (
            <dd className="text-muted-foreground basis-full text-right text-xs sm:text-left">
              {item.sub}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
