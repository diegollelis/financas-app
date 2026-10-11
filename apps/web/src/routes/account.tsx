import { formatIsoDate, TERMS_PATH } from '@financas/shared';
import { Download } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { AccountDetails, ConnectedDevices } from '@/features/account/account-security';
import { DeleteAccountSection } from '@/features/account/delete-account-section';
import { useDataExport } from '@/features/account/use-data-export';
import { useCurrentUser } from '@/features/auth/use-me';
import { apiErrorMessage } from '@/lib/error-message';

/**
 * Minha conta (ADRs 0041 and 0049): who is signed in, the name and the password, the devices
 * connected, the terms accepted, the LGPD data export and the deletion. Not a workspace's page,
 * but shown in the frame of the last workspace used, with no section marked (AccountLayout).
 */
export function AccountPage() {
  const user = useCurrentUser();
  const dataExport = useDataExport();
  const download = () =>
    dataExport.mutate(undefined, {
      onSuccess: () => toast.success('Dados baixados'),
      onError: (error) => toast.error(apiErrorMessage(error)),
    });

  // Inside the workspace frame (AccountLayout): its sections are the way back.
  return (
    <>
      <PageHeader title="Minha conta" />

      <section aria-labelledby="account-data" className="grid gap-3">
        <h2 id="account-data" className="font-medium">
          Conta
        </h2>
        {/* The name and the password can change here (ADR 0049). */}
        <AccountDetails>
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
        </AccountDetails>
      </section>

      <ConnectedDevices />

      <section aria-labelledby="account-export" className="grid gap-3">
        <h2 id="account-export" className="font-medium">
          Seus dados
        </h2>
        {/* What it is for first; the format, for whoever needs it, after. */}
        <p>
          Baixe uma cópia dos seus dados, para guardar ou usar em outro programa. Vem tudo o que o
          Finanças guarda sobre você: a conta e, dos espaços de que você é dono, os lançamentos,
          categorias, orçamentos, recorrências, parcelamentos, importações, membros e convites. Dos
          espaços de outras pessoas, vêm só o nome e o seu papel.
        </p>
        <p className="text-muted-foreground text-sm">
          O arquivo é JSON, um formato de texto que outros programas leem; os valores estão em
          centavos.
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
    </>
  );
}
