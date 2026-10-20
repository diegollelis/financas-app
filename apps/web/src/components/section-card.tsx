import type { ReactNode } from 'react';
import { InfoTip } from '@/components/info-tip';
import { cn } from '@/lib/utils';

/** A block of a page of figures (Painel, Análise; ADR 0045 notes): a card on the page. */
export const CARD_CLASS = 'bg-card grid content-start gap-4 rounded-xl border p-4 md:p-6';

/**
 * A titled card: what the title means behind an "ⓘ" beside it (InfoTip), out of the heading's
 * name, and an optional action at the right of the title ("Ver como tabela").
 */
export function SectionCard({
  title,
  help,
  action,
  className,
  children,
}: {
  title: string;
  help?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = `card-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={cn(CARD_CLASS, className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          {help && <InfoTip term={title}>{help}</InfoTip>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
