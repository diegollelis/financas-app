import { Loader2 } from 'lucide-react';
import { useServerWaitMessage } from '@/lib/use-server-wait';
import { Button } from '@/components/ui/button';

/** Mounted only while the request runs, so the clock starts with it. The words only: the
 * button already turns. */
function SlowServerNotice() {
  const message = useServerWaitMessage();
  if (!message) return null;
  return <p className="text-muted-foreground text-center text-sm">{message}</p>;
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
