import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useForgetWorkspace } from './use-workspace';

/** How long the explanation stays before going to the person's own workspace. */
export const WORKSPACE_GONE_REDIRECT_SECONDS = 5;

/**
 * A workspace page answered 404: the workspace was deleted, or the person was removed from it
 * (the API gives the same answer to both, ADR 0025). Explains it, forgets it as the last
 * workspace (or "/" would pick it again) and goes to "/" after a short countdown, or at once
 * with the button: nobody is left stuck on a page that can no longer load.
 */
export function WorkspaceGone() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const forget = useForgetWorkspace(workspaceId);
  const [seconds, setSeconds] = useState(WORKSPACE_GONE_REDIRECT_SECONDS);

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
    <div className="grid justify-items-start gap-3">
      <p role="alert">
        Espaço não encontrado. Ele pode ter sido excluído, ou você não faz mais parte dele.
      </p>
      {/* Not a live region: a number announced every second would only be noise. */}
      <p className="text-muted-foreground">
        Levando você para o seu espaço em {seconds} {seconds === 1 ? 'segundo' : 'segundos'}…
      </p>
      <Button asChild variant="outline">
        <Link to="/" replace>
          Ir para o meu espaço agora
        </Link>
      </Button>
    </div>
  );
}
