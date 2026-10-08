import { Button } from '@/components/ui/button';
import { authErrorMessage } from './auth-error-message';
import { GoogleLogo } from './google-logo';
import { useReturnTo } from './return-to';
import { useGoogleSignIn } from './use-auth-mutations';

/** "Continuar com Google", below the e-mail form, on the sign-in and sign-up pages. */
export function GoogleButton() {
  const googleSignIn = useGoogleSignIn(useReturnTo());

  return (
    <div className="mt-4 grid gap-4">
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="bg-border h-px flex-1" />
        ou
        <span className="bg-border h-px flex-1" />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => googleSignIn.mutate()}
        // Stays disabled after success, while the browser leaves for Google.
        disabled={googleSignIn.isPending || googleSignIn.isSuccess}
      >
        <GoogleLogo className="size-5 md:size-4" />
        Continuar com Google
      </Button>
      {googleSignIn.isError && (
        <p role="alert" className="text-destructive text-sm">
          {authErrorMessage(googleSignIn.error)}
        </p>
      )}
    </div>
  );
}
