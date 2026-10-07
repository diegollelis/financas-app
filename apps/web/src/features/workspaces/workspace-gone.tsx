import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useForgetWorkspace } from './use-workspace';

/** How long the explanation stays before going to the person's own workspace. */
export const WORKSPACE_GONE_REDIRECT_SECONDS = 5;

/**
 * A workspace page answered 404: the workspace was deleted, or the person was removed from it
 * (the API gives the same answer to both, ADR 0025). A modal that cannot be dismissed explains
 * it and blocks the page behind, which can no longer load; it forgets the workspace as the last
 * one (or "/" would pick it again) and goes to "/" after a short countdown, or at once with the
 * button.
 */
export function WorkspaceGone() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const forget = useForgetWorkspace(workspaceId);
  const [seconds, setSeconds] = useState(WORKSPACE_GONE_REDIRECT_SECONDS);
  const leave = () => void navigate('/', { replace: true });

  useEffect(() => {
    forget.beforeLeaving();
  }, [forget]);
  useEffect(() => {
    if (seconds === 0) {
      void navigate('/', { replace: true });
      return;
    }
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, navigate]);

  return (
    // Always open; closing it is leaving. Escape does nothing: there is nowhere to stay.
    <AlertDialog open>
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Espaço não encontrado</AlertDialogTitle>
          <AlertDialogDescription>
            Ele pode ter sido excluído, ou você não faz mais parte dele.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Not a live region: a number announced every second would only be noise. */}
        <p className="text-muted-foreground text-center text-sm">
          Levando você para o seu espaço em {seconds} {seconds === 1 ? 'segundo' : 'segundos'}…
        </p>
        <AlertDialogFooter>
          <Button onClick={leave} autoFocus>
            Ir para o meu espaço agora
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
