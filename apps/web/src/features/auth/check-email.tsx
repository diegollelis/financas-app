import { Button } from '@/components/ui/button';
import { authErrorMessage } from './auth-error-message';
import { useResendVerification } from './use-auth-mutations';

/**
 * After signing up (ADR 0022): the account waits for the e-mail to be verified. The same screen
 * whether the e-mail was new or already had an account, so it reveals nothing; the owner of an
 * existing account gets an e-mail saying so instead of a link.
 */
export function CheckEmail({
  email,
  returnTo,
  onChangeEmail,
}: {
  email: string;
  /** Where the link brings the person back (an invitation, for one). */
  returnTo: string;
  onChangeEmail: () => void;
}) {
  const resend = useResendVerification(returnTo);

  return (
    <div className="grid gap-4">
      <p role="status">
        Enviamos um link de confirmação para <strong className="break-words">{email}</strong>. Abra
        o link para entrar.
      </p>
      <p className="text-muted-foreground">
        Não chegou em alguns minutos? Confira a caixa de spam ou peça outro.
      </p>
      {resend.isSuccess ? (
        <p role="status">Enviamos um novo link.</p>
      ) : (
        <Button variant="outline" onClick={() => resend.mutate(email)} disabled={resend.isPending}>
          {resend.isPending ? 'Enviando…' : 'Reenviar e-mail'}
        </Button>
      )}
      {resend.isError && (
        <p role="alert" className="text-destructive">
          {authErrorMessage(resend.error)}
        </p>
      )}
      <Button variant="ghost" onClick={onChangeEmail}>
        Usar outro e-mail
      </Button>
    </div>
  );
}
