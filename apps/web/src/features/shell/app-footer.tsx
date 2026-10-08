import { currentPeriod, PRIVACY_PATH, TERMS_PATH } from '@financas/shared';
import { TextLink } from '@/components/text-link';
import { cn } from '@/lib/utils';

export const SOURCE_CODE_URL = 'https://github.com/diegollelis/financas-app';

/**
 * The parent brand's signature at the end of every page (ADR 0044). It keeps the two licenses
 * apart, as LICENSE does: the CodeLélis brand is reserved, the code is open (MIT). A plain
 * "todos os direitos reservados" would contradict the public repository.
 */
export function AppFooter({ className, center = false }: { className?: string; center?: boolean }) {
  const year = currentPeriod().slice(0, 4);
  return (
    <footer
      className={cn(
        'text-muted-foreground grid gap-2 border-t pt-4 text-xs',
        center && 'justify-items-center text-center',
        className,
      )}
    >
      <p>© {year} CodeLélis. A marca é de uso reservado; o código é aberto (licença MIT).</p>
      <nav
        aria-label="Documentos"
        className={cn('flex flex-wrap gap-x-5 gap-y-1', center && 'justify-center')}
      >
        <TextLink to={TERMS_PATH} className="text-muted-foreground">
          Termos de uso
        </TextLink>
        {/* Short, so the three links fit one line on a phone; the full name is still the
            accessible one (the sign-in page must link the privacy policy, as Google asks). */}
        <TextLink
          to={PRIVACY_PATH}
          aria-label="Política de privacidade"
          className="text-muted-foreground"
        >
          Privacidade
        </TextLink>
        <a
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noreferrer"
          className="focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 md:min-h-0"
        >
          Código-fonte<span className="sr-only"> (abre em outra aba)</span>
        </a>
      </nav>
    </footer>
  );
}
