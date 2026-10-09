import { BrandLogo } from '@/components/brand-logo';
import { SLOW_LOADING_MS } from '@/components/query-state';
import { useElapsed } from '@/lib/use-elapsed';

/**
 * A whole page loading (opening the app, the invitation): the official CL symbol, never redrawn
 * (ADR 0043), breathing slowly, and still for whoever asks for less motion. After a few seconds it
 * says why: on Render's free plan the API takes up to a minute to answer (ADR 0033). Lists and
 * blocks inside a page keep their skeletons, shaped like what is coming.
 */
export function BrandLoader() {
  const slow = useElapsed(SLOW_LOADING_MS);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <BrandLogo variant="symbol" alt="" className="motion-safe:animate-breathe h-14" />
      <div role="status" className="text-muted-foreground min-h-10 max-w-xs">
        <span className="sr-only">Carregando…</span>
        {slow && <p>Aguardando o servidor… isso pode levar até um minuto.</p>}
      </div>
    </main>
  );
}
