import { hasRole } from '@financas/shared';
import { Download, FileUp } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { InfoTip } from '@/components/info-tip';
import { QueryState } from '@/components/query-state';
import { SectionCard } from '@/components/section-card';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCategories } from '@/features/categories/use-categories';
import { ImportReview } from '@/features/import/import-review';
import { ImportHeader } from '@/features/import/import-tabs';
import { PreviousImports } from '@/features/import/previous-imports';
import { startReview, type ReviewRow } from '@/features/import/review';
import { useImports } from '@/features/import/use-imports';
import { useCards } from '@/features/cards/use-cards';
import { downloadTemplate, readTemplate, TemplateReadError } from '@/features/import/workbook';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { cn } from '@/lib/utils';

/**
 * Importar · Planilha modelo (ADRs 0040 and 0060): download the template with this workspace's
 * categories, fill it in and choose it. The file is read here, on the device; only the
 * confirmed transactions go to the API.
 */
export function TemplateImportPage() {
  const workspace = useCurrentWorkspace();
  const categories = useCategories(workspace.id);
  const imports = useImports(workspace.id);
  // The cards of the lines in Crédito and Débito (ADR 0062 note); the review asks when it must.
  const cards = useCards(workspace.id);
  const navigate = useNavigate();
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [review, setReview] = useState<{ rows: ReviewRow[]; openings: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const ready = categories.isSuccess && imports.isSuccess;
  const imported = (firstPeriod: string) =>
    void navigate(`/espacos/${workspace.id}/lancamentos?competencia=${firstPeriod}`);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const parsed = await readTemplate(file);
      const fatal = parsed.issues.find((issue) => issue.severity === 'error' && issue.line === 1);
      if (fatal) setReadError(fatal.message);
      else if (parsed.rows.length + parsed.drafts.length === 0) {
        setReadError('A planilha não tem lançamentos. Preencha a aba Lançamentos do modelo.');
      } else
        setReview((current) => ({
          rows: startReview(parsed),
          openings: (current?.openings ?? 0) + 1,
        }));
    } catch (error) {
      setReadError(
        error instanceof TemplateReadError ? error.message : 'Não foi possível ler o arquivo.',
      );
    } finally {
      setReading(false);
    }
  };

  const download = () => {
    setFileError(null);
    downloadTemplate(categories.data ?? []).catch(() =>
      setFileError('Não foi possível gerar a planilha modelo. Tente de novo.'),
    );
  };

  return (
    <>
      {/* While a file is reviewed, the review is the page's step (its own title and Cancelar). */}
      {!review && <ImportHeader workspaceId={workspace.id} />}
      <QueryState queries={[categories, imports]} />
      {/* The steps, numbered, in a card of their own. Choosing the file only opens the review. How
          to do each step is behind its "ⓘ". */}
      {ready && canEdit && !review && (
        <SectionCard title="Nova importação">
          <section aria-labelledby="import-step-template" className="grid gap-2">
            <div className="flex items-center">
              <h3 id="import-step-template" className="font-medium">
                1. Baixe o modelo
              </h3>
              <InfoTip term="Baixe o modelo">
                Uma linha por lançamento, com mês de referência, tipo, descrição, categoria e valor.
                O estabelecimento é opcional, e um nome novo vira estabelecimento ao importar. A
                planilha já vem com um exemplo e as categorias deste espaço.
              </InfoTip>
            </div>
            <Button variant="outline" className="justify-self-start" onClick={download}>
              <Download aria-hidden />
              Baixar planilha modelo
            </Button>
            {fileError && (
              <p role="alert" className="text-destructive">
                {fileError}
              </p>
            )}
          </section>
          <section aria-labelledby="import-step-file" className="grid gap-2">
            <h3 id="import-step-file" className="font-medium">
              2. Escolha a planilha preenchida
            </h3>
            {/* The native picker, hidden, behind a button in the app's style: the label opens it,
                and keyboard focus on it shows on the button. */}
            <input
              id="import-file-input"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={reading}
              className="peer sr-only"
              aria-describedby={readError ? 'import-file-error' : undefined}
              onChange={(event) => {
                void chooseFile(event.currentTarget.files?.[0]);
                // The same file can be chosen again after fixing it.
                event.currentTarget.value = '';
              }}
            />
            <label
              htmlFor="import-file-input"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'peer-focus-visible:border-ring peer-focus-visible:ring-ring/50 cursor-pointer justify-self-start peer-focus-visible:ring-3 peer-disabled:cursor-default peer-disabled:opacity-50',
              )}
            >
              <FileUp aria-hidden />
              Escolher planilha (.xlsx)
            </label>
            {readError && (
              <p id="import-file-error" role="alert" className="text-destructive">
                {readError}
              </p>
            )}
            {reading && <p role="status">Lendo a planilha…</p>}
          </section>
        </SectionCard>
      )}
      {ready && !canEdit && (
        <p className="text-muted-foreground">Quem só visualiza o espaço não importa arquivos.</p>
      )}
      {ready && review && (
        <ImportReview
          key={review.openings}
          workspaceId={workspace.id}
          initialRows={review.rows}
          categories={categories.data}
          previousImports={imports.data}
          source={{ kind: 'TEMPLATE', bank: null }}
          cards={{ list: cards.data ?? [] }}
          heading={{
            title: 'Revisar planilha',
            subtitle: `Planilha modelo · ${review.rows.length} ${review.rows.length === 1 ? 'linha' : 'linhas'}`,
          }}
          defaultLabel="Planilha modelo"
          onChooseAnother={() => setReview(null)}
          onImported={imported}
        />
      )}
      {ready && !review && (
        <PreviousImports
          workspaceId={workspace.id}
          items={imports.data.filter((item) => item.kind === 'TEMPLATE')}
          canEdit={canEdit}
          title="Planilhas importadas"
          help="As planilhas importadas neste espaço. Desfazer tira os lançamentos que ela criou; estabelecimentos e pessoas ficam."
        />
      )}
    </>
  );
}
