import type { ReactNode } from 'react';

/** The top of a page in the workspace layout: its title, a line about it and, e.g., `PeriodNav`. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
