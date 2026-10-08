import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand-logo';
import { AppFooter } from '@/features/shell/app-footer';

/**
 * Frame of the sign-in, sign-up, password and invitation pages, ending with the footer: the
 * links to the terms of use and the privacy policy (Google asks for the latter) and the brand's
 * signature (ADR 0044). Mobile first (ADR 0036): on the phone the whole screen is the form, with no
 * card around it; from sm, a centered card.
 */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8 text-base sm:items-center sm:justify-center sm:px-6 md:text-sm">
      <div className="mx-auto grid w-full max-w-sm gap-6">
        {/* The logo is the only name on these pages: its alt says it (ADR 0043). Large enough
            for the art's "FINANÇAS" to be read (an eighth of the logo's height). */}
        <BrandLogo variant="horizontal" className="h-14 justify-self-center py-1 sm:h-16" />
        <div className="sm:bg-card grid gap-6 sm:rounded-xl sm:border sm:p-6 sm:shadow-sm">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
          <div>{children}</div>
        </div>
        <div className="text-muted-foreground text-center">{footer}</div>
        <AppFooter center className="mt-4" />
      </div>
    </main>
  );
}
