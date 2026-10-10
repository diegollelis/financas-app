import { Link } from 'react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { authErrorMessage } from '@/features/auth/auth-error-message';
import { useCurrentUser } from '@/features/auth/use-me';
import { useDeletionCheck, useRequestDeletion } from './use-account-deletion';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * "Excluir minha conta" (ADR 0041). Owned workspaces shared with someone block it, each with a
 * link to its members page to resolve it. Otherwise it asks once, then e-mails the link that
 * confirms; nothing is deleted before the link is opened.
 */
export function DeleteAccountSection() {
  const user = useCurrentUser();
  const check = useDeletionCheck();
  const request = useRequestDeletion();
  const blockers = check.data?.blockers ?? [];

  return (
    <section aria-labelledby="account-delete" className="grid gap-3">
      <h2 id="account-delete" className="font-medium">
        Excluir conta
      </h2>
      <p>
        Apaga a sua conta, o seu espaço pessoal e os espaços em que só você participa, com todos os
        lançamentos. Dos espaços de outras pessoas, você sai. Não é possível desfazer; baixe os seus
        dados antes, se quiser guardar uma cópia.
      </p>
      {/* Its own error, not QueryState's: a 404 there means a workspace is gone. */}
      {check.isError && (
        <div role="alert" className="grid justify-items-start gap-2">
          <p className="text-destructive">
            Não foi possível conferir agora se a conta pode ser excluída.
          </p>
          <Button
            variant="outline"
            onClick={() => void check.refetch()}
            disabled={check.isFetching}
          >
            {check.isFetching ? 'Tentando…' : 'Tentar de novo'}
          </Button>
        </div>
      )}
      {blockers.length > 0 && (
        // A border, not a gray fill: the links keep the page's contrast (axe).
        <div role="note" className="grid gap-2 rounded-lg border p-3">
          <p>
            Para continuar, abra {blockers.length === 1 ? 'o espaço abaixo' : 'os espaços abaixo'} e
            remova os membros e os convites pendentes, ou exclua{' '}
            {blockers.length === 1 ? 'o espaço' : 'cada espaço'}. Enquanto houver outras pessoas, a
            conta não pode ser excluída.
          </p>
          <ul className="grid gap-1">
            {blockers.map((blocker) => (
              <li key={blocker.id}>
                <Link to={`/espacos/${blocker.id}`} className="text-primary underline">
                  {blocker.name}
                </Link>
                <span className="text-muted-foreground">
                  {' '}
                  (
                  {[
                    blocker.otherMembers > 0 &&
                      plural(blocker.otherMembers, 'outro membro', 'outros membros'),
                    blocker.pendingInvitations > 0 &&
                      plural(blocker.pendingInvitations, 'convite pendente', 'convites pendentes'),
                  ]
                    .filter(Boolean)
                    .join(' e ')}
                  )
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {request.isSuccess ? (
        <p role="status" className="bg-muted rounded-lg p-3">
          Enviamos um link para <strong>{user.email}</strong>. A conta só é excluída quando você
          abrir o link e confirmar; ele vale por 1 hora. Confira também a caixa de spam.
        </p>
      ) : (
        <>
          {request.isError && (
            <p role="alert" className="text-destructive">
              {authErrorMessage(request.error)}
            </p>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="text-destructive justify-self-start"
                disabled={!check.isSuccess || blockers.length > 0 || request.isPending}
              >
                {request.isPending ? 'Enviando…' : 'Excluir minha conta'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vamos enviar um link de confirmação para {user.email}. Ao abri-lo, você confirma
                  mais uma vez, e então a conta e os seus dados são apagados de vez.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => request.mutate()}>
                  Enviar link
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </section>
  );
}
