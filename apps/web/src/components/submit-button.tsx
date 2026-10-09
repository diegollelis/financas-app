import { Loader2 } from 'lucide-react';
import { SLOW_LOADING_MS } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { useElapsed } from '@/lib/use-elapsed';

/** Mounted only while the request runs, so the clock starts with it. */
function SlowServerNotice() {
  const slow = useElapsed(SLOW_LOADING_MS);
  if (!slow) return null;
  return (
    <p className="text-muted-foreground text-center text-sm">
      Aguardando o servidor… isso pode levar até um minuto.
    </p>
  );
}

/**
 * The submit button of a form whose request may meet the API asleep (ADR 0033): while it runs,
 * the button is disabled, turns its label into the pending one and shows a spinner (still for
 * whoever asks for less motion); after a few seconds a line below says why it takes long, as
 * the loading lists do. The line sits in a live region, so screen readers hear it too.
 */
export function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 aria-hidden className="motion-safe:animate-spin" />}
        {pending ? pendingLabel : label}
      </Button>
      <div aria-live="polite" className="empty:hidden">
        {pending && <SlowServerNotice />}
      </div>
    </>
  );
}
