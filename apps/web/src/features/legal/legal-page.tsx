import type { ReactNode } from 'react';
import { TextLink } from '@/components/text-link';

/**
 * Where data subjects send their requests (LGPD, art. 18). Public on purpose (ADR 0012). Cloudflare
 * Email Routing forwards it to the project's inbox (docs/deploy.md).
 */
export const PRIVACY_CONTACT_EMAIL = 'financas@codelelis.com';

export function ContactLink() {
  return (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-primary underline">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** The public legal pages (privacy policy, terms of use): readable text, no app shell. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** "Última atualização: …" under the title. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 text-sm leading-relaxed">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">Última atualização: {updated}</p>
      </header>
      {children}
      <footer>
        <TextLink to="/">Voltar para o Finanças</TextLink>
      </footer>
    </main>
  );
}
