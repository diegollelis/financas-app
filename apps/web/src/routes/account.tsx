import { formatIsoDate, TERMS_PATH } from '@financas/shared';
import { Download } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { AccountDetails, ConnectedDevices } from '@/features/account/account-security';
import { DeleteAccountSection } from '@/features/account/delete-account-section';
import { useDataExport } from '@/features/account/use-data-export';
import { useCurrentUser } from '@/features/auth/use-me';
import { apiErrorMessage } from '@/lib/error-message';
import { themeOptions, useTheme } from '@/lib/theme';

/**
 * Minha conta (ADRs 0041 and 0049): who is signed in, the name and the password, the devices
 * connected, the theme, the terms accepted, the LGPD data export and the deletion, each in a card
 * (ADR 0049 note). Not a workspace's page,
 * but shown in the frame of the last workspace used, with no section marked (AccountLayout).
 */
export function AccountPage() {
  const user = useCurrentUser();
  const dataExport = useDataExport();
  const theme = useTheme();
  const download = () =>
    dataExport.mutate(undefined, {
      onSuccess: () => toast.success('Dados baixados'),
      onError: (error) => toast.error(apiErrorMessage(error)),
    });

  // Inside the workspace frame (AccountLayout): its sections are the way back.
  return (
    <>
      <PageHeader title="Minha conta" />

      <SectionCard title="Conta">
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
      </SectionCard>

      {/* Where people look for settings; the account menu keeps the shortcut. A choice of this
          browser only (lib/theme.ts), and the line under it says so. */}
      <SectionCard title="Aparência">
        <SegmentedControl
          label="Tema"
          options={themeOptions}
          value={theme.preference}
          onChange={theme.setPreference}
          className="sm:justify-self-start"
        />
        <p className="text-muted-foreground text-sm">
          {theme.preference === 'system'
            ? 'Segue o tema claro ou escuro do aparelho.'
            : 'Vale só neste aparelho.'}
        </p>
      </SectionCard>

      <ConnectedDevices />

      {/* What it is for in sight; what comes in the file, and its format, behind the "ⓘ". */}
      <SectionCard
        title="Seus dados"
        help={
          <>
            Vem a conta e, dos espaços de que você é dono, os lançamentos, categorias, orçamentos,
            recorrências, parcelamentos, importações, membros e convites. Dos espaços de outras
            pessoas, só o nome e o seu papel. O arquivo é JSON, um formato de texto que outros
            programas leem, com os valores em centavos.
          </>
        }
      >
        <p>Baixe uma cópia de tudo o que o Finanças guarda sobre você.</p>
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={dataExport.isPending}
          onClick={download}
        >
          <Download aria-hidden />
          {dataExport.isPending ? 'Preparando o arquivo…' : 'Baixar meus dados'}
        </Button>
      </SectionCard>

      <DeleteAccountSection />
    </>
  );
}
