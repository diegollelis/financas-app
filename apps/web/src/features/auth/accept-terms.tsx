import { PRIVACY_PATH, SIGN_IN_PATH, TERMS_PATH, type MeResponse } from '@financas/shared';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/error-message';
import { AuthCard } from './auth-card';
import { useAcceptTerms, useSignOut } from './use-auth-mutations';

const inlineLink = 'text-primary underline';

/**
 * Shown instead of the app while the user has not accepted the terms in force (ADR 0041): the
 * accounts from before them, those created with Google (no checkbox) and everyone after a new
 * version. Signing out is the way to decline.
 */
export function AcceptTerms({ user }: { user: MeResponse }) {
  const accept = useAcceptTerms();
  const signOut = useSignOut({ leaveTo: SIGN_IN_PATH });
  const changed = user.termsVersion !== null;
  // Until the sign-in page loads, on success too.
  const leaving = signOut.isPending || signOut.isSuccess;

  return (
    <AuthCard
      title={changed ? 'Os termos de uso mudaram' : 'Termos de uso'}
      description={`Olá, ${user.name}. Para continuar usando o Finanças, leia e aceite os termos.`}
      footer={
        <Button
          variant="ghost"
          onClick={() => signOut.mutate()}
          disabled={leaving || accept.isPending}
        >
          {leaving ? 'Saindo…' : 'Sair sem aceitar'}
        </Button>
      }
    >
      <div className="grid gap-4">
        <p>
          Leia os{' '}
          <Link to={TERMS_PATH} className={inlineLink}>
            Termos de uso
          </Link>{' '}
          e a{' '}
          <Link to={PRIVACY_PATH} className={inlineLink}>
            Política de privacidade
          </Link>
          . Eles explicam o que o app guarda, para quê, e como baixar ou apagar os seus dados.
        </p>
        {accept.isError && (
          <p role="alert" className="text-destructive">
            {apiErrorMessage(accept.error)}
          </p>
        )}
        <Button onClick={() => accept.mutate()} disabled={accept.isPending || leaving}>
          {accept.isPending ? 'Aceitando…' : 'Aceitar e continuar'}
        </Button>
      </div>
    </AuthCard>
  );
}
