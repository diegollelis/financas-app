import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { authErrorMessage } from './auth-error-message';
import { useResendVerification } from './use-auth-mutations';

/**
 * Reminder for a session opened before verification became required (ADR 0022): it stays valid
 * until it expires, and the next sign-in with a password will need the e-mail confirmed. The
 * confirmation link comes back with `?error=` when it is invalid or expired.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const resend = useResendVerification();
  const [searchParams] = useSearchParams();

  return (
    <div role="status" className="bg-muted grid gap-2 rounded-lg p-3">
      {searchParams.has('error') ? (
        <p>O link de confirmação é inválido ou expirou. Peça um novo abaixo.</p>
      ) : (
        <p>
          Confirme seu e-mail pelo link que enviamos para <strong>{email}</strong>.
        </p>
      )}
      {resend.isSuccess ? (
        <p>Enviamos um novo link. Confira também a caixa de spam.</p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => resend.mutate(email)}
          disabled={resend.isPending}
        >
          {resend.isPending ? 'Enviando…' : 'Reenviar e-mail'}
        </Button>
      )}
      {resend.isError && <p className="text-destructive">{authErrorMessage(resend.error)}</p>}
    </div>
  );
}
