import { PRIVACY_PATH, TERMS_PATH } from '@financas/shared';
import type { ReactNode } from 'react';
import { TextLink } from '@/components/text-link';

/**
 * Frame of the sign-in, sign-up, password and invitation pages, with the links to the terms
 * of use and the privacy policy (Google asks for the latter). Mobile first (ADR 0036): on the phone the whole screen is the form, with no
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
        <p className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-8" />
          Finanças
        </p>
        <div className="sm:bg-card grid gap-6 sm:rounded-xl sm:border sm:p-6 sm:shadow-sm">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
          <div>{children}</div>
        </div>
        <div className="text-muted-foreground text-center">{footer}</div>
        <nav aria-label="Documentos" className="flex justify-center gap-6">
          <TextLink to={TERMS_PATH} className="text-muted-foreground text-sm">
            Termos de uso
          </TextLink>
          <TextLink to={PRIVACY_PATH} className="text-muted-foreground text-sm">
            Política de privacidade
          </TextLink>
        </nav>
      </div>
    </main>
  );
}
