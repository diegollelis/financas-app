import type { ReactNode } from 'react';

/**
 * The top of a page in the workspace layout: its title, a line about it, the page's main action
 * (beside the title from md) and, e.g., `PeriodNav`.
 */
export function PageHeader({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
