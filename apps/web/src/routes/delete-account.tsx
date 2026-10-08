import { ACCOUNT_DELETED_PATH, ACCOUNT_PATH } from '@financas/shared';
import { Navigate, useSearchParams } from 'react-router';
import { TextLink } from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { useConfirmDeletion } from '@/features/account/use-account-deletion';
import { AuthCard } from '@/features/auth/auth-card';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useCurrentUser } from '@/features/auth/use-me';
import { navigateAway } from '@/lib/browser';

/**
 * Opened from the e-mailed link (`?token=`), behind RequireAuth: whoever opens it signed out
 * signs in and comes back. Asks once more, so holding an unlocked device is not enough to
 * delete the account in one tap (ADR 0041).
 */
export function DeleteAccountPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const user = useCurrentUser();
  const confirm = useConfirmDeletion(token);
  const footer = <TextLink to={ACCOUNT_PATH}>Voltar para Minha conta</TextLink>;

  if (!token) return <Navigate to={ACCOUNT_PATH} replace />;
  return (
    <AuthCard title="Excluir sua conta?" footer={footer}>
      <div className="grid gap-4">
        <p>
          A conta <strong>{user.email}</strong>, o seu espaço pessoal e os espaços em que só você
          participa serão apagados, com todos os lançamentos. Dos espaços de outras pessoas, você
          sai. <strong>Não é possível desfazer.</strong>
        </p>
        {confirm.isError && (
          <p role="alert" className="text-destructive">
            {authErrorMessage(confirm.error)}
          </p>
        )}
        <Button
          variant="destructive"
          disabled={confirm.isPending}
          onClick={() =>
            confirm.mutate(undefined, { onSuccess: () => navigateAway(ACCOUNT_DELETED_PATH) })
          }
        >
          {confirm.isPending ? 'Excluindo…' : 'Excluir minha conta'}
        </Button>
      </div>
    </AuthCard>
  );
}
