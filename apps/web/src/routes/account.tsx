import { formatIsoDate, TERMS_PATH } from '@financas/shared';
import { ArrowLeft, Download } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { TextLink } from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { DeleteAccountSection } from '@/features/account/delete-account-section';
import { useDataExport } from '@/features/account/use-data-export';
import { useCurrentUser } from '@/features/auth/use-me';
import { AppFooter } from '@/features/shell/app-footer';
import { AppHeader, SkipLink } from '@/features/shell/app-header';
import { apiErrorMessage } from '@/lib/error-message';

/**
 * Minha conta (ADR 0041): who is signed in, the terms accepted and the LGPD data export. Outside
 * any workspace, so it has the header without the workspace nav.
 */
export function AccountPage() {
  const user = useCurrentUser();
  const dataExport = useDataExport();
  const download = () =>
    dataExport.mutate(undefined, {
      onSuccess: () => toast.success('Dados baixados'),
      onError: (error) => toast.error(apiErrorMessage(error)),
    });

  return (
    <div className="min-h-svh">
      <SkipLink />
      <AppHeader />
      <main
        id="conteudo"
        tabIndex={-1}
        className="px-4 pt-3 pb-8 text-base outline-none sm:px-6 md:pt-6 md:text-sm"
      >
        <div className="grid max-w-3xl gap-6">
          <TextLink to="/" className="text-muted-foreground -ml-1 gap-1 justify-self-start">
            <ArrowLeft aria-hidden className="size-4" />
            Voltar aos espaços
          </TextLink>
          <PageHeader title="Minha conta" />

          <section aria-labelledby="account-data" className="grid gap-3">
            <h2 id="account-data" className="font-medium">
              Conta
            </h2>
            <dl className="grid gap-3 rounded-xl border p-4">
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground text-sm">Nome</dt>
                <dd className="break-words">{user.name}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-muted-foreground text-sm">E-mail</dt>
                <dd className="break-words">{user.email}</dd>
              </div>
              {user.termsVersion && (
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground text-sm">Termos de uso</dt>
                  <dd>
                    Versão de {formatIsoDate(user.termsVersion)}, aceita.{' '}
                    <Link to={TERMS_PATH} className="text-primary underline">
                      Ler os termos
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section aria-labelledby="account-export" className="grid gap-3">
            <h2 id="account-export" className="font-medium">
              Seus dados
            </h2>
            <p>
              Baixe uma cópia de tudo o que o Finanças guarda sobre você: a conta e, dos espaços de
              que você é dono, os lançamentos, categorias, orçamentos, recorrências, parcelamentos,
              importações, membros e convites. Dos espaços de outras pessoas, vêm só o nome e o seu
              papel.
            </p>
            <p className="text-muted-foreground">
              O arquivo é um JSON, um formato de texto que outros programas conseguem ler. Valores
              estão em centavos.
            </p>
            <Button
              variant="outline"
              className="justify-self-start"
              disabled={dataExport.isPending}
              onClick={download}
            >
              <Download aria-hidden />
              {dataExport.isPending ? 'Preparando o arquivo…' : 'Baixar meus dados'}
            </Button>
          </section>

          <DeleteAccountSection />
        </div>
      </main>
      <AppFooter className="mx-4 mt-6 mb-8 max-w-3xl sm:mx-6" />
    </div>
  );
}
