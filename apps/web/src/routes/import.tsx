import { formatPeriod, hasRole, type Import } from '@financas/shared';
import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCategories } from '@/features/categories/use-categories';
import { ImportReview } from '@/features/import/import-review';
import { startReview, type ReviewRow } from '@/features/import/review';
import { useImports, useUndoImport } from '@/features/import/use-imports';
import { downloadTemplate, readTemplate, TemplateReadError } from '@/features/import/workbook';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { apiErrorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';

const PREVIOUS_TITLE_ID = 'previous-imports';

/** "7 de out. de 2026, 09:12", in São Paulo time. */
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const periodsOf = (item: Import) =>
  item.firstPeriod === item.lastPeriod
    ? formatPeriod(item.firstPeriod)
    : `${formatPeriod(item.firstPeriod)} a ${formatPeriod(item.lastPeriod)}`;

function PreviousImport({
  workspaceId,
  item,
  canEdit,
}: {
  workspaceId: string;
  item: Import;
  canEdit: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  const undo = useUndoImport(workspaceId);
  const when = dateTime.format(new Date(item.createdAt));
  // mutateAsync: once undone, this row leaves the list and its callbacks would not run.
  const confirmUndo = () =>
    void undo.mutateAsync(item.id).then(
      () => {
        toast.success('Importação desfeita');
        document.getElementById(PREVIOUS_TITLE_ID)?.focus();
      },
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="grid min-w-0 gap-1">
        <p className="font-medium">
          {item.transactionCount} {item.transactionCount === 1 ? 'lançamento' : 'lançamentos'},{' '}
          {periodsOf(item)}
        </p>
        <p className="text-muted-foreground text-sm">
          {when}
          {item.createdBy && `, por ${item.createdBy.name}`}
        </p>
      </div>
      {canEdit && (
        <>
          <Button
            ref={undoRef}
            variant="outline"
            size="sm"
            aria-label={`Desfazer a importação de ${when}`}
            onClick={() => setConfirming(true)}
          >
            Desfazer
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                undoRef.current?.focus();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Desfazer a importação de {when}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os {item.transactionCount} lançamentos dela saem, inclusive os que foram editados
                  ou efetivados depois. Não é possível desfazer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={confirmUndo}>
                  Desfazer importação
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}

/**
 * Importar planilha (ADR 0040): download the template, choose the filled-in file, review it and
 * import. The file is read here, on the device; only the confirmed transactions go to the API.
 */
export function ImportPage() {
  const workspace = useCurrentWorkspace();
  const categories = useCategories(workspace.id);
  const imports = useImports(workspace.id);
  const navigate = useNavigate();
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [review, setReview] = useState<{ rows: ReviewRow[]; openings: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const ready = categories.isSuccess && imports.isSuccess;

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
      <PageHeader
        title="Importar planilha"
        description="Traga lançamentos de uma planilha. O arquivo é lido aqui, no seu aparelho: só os lançamentos que você confirmar são enviados."
      />
      <QueryState queries={[categories, imports]} />
      {/* The steps, numbered: choosing the file only opens the review, nothing is imported. */}
      {ready && canEdit && !review && (
        <>
          <section aria-labelledby="import-step-template" className="grid gap-2">
            <h2 id="import-step-template" className="font-medium">
              1. Baixe o modelo
            </h2>
            <p>
              Uma linha por lançamento, com competência, tipo, descrição, categoria e valor. A
              planilha já vem com um exemplo e a lista das categorias deste espaço.
            </p>
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
            <h2 id="import-step-file" className="font-medium">
              2. Escolha a planilha preenchida
            </h2>
            <p className="text-muted-foreground text-sm">
              O arquivo não é enviado: só os lançamentos que você confirmar na revisão.
            </p>
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
        </>
      )}
      {ready && !canEdit && (
        <p className="text-muted-foreground">Quem só visualiza o espaço não importa planilhas.</p>
      )}
      {ready && review && <h2 className="font-medium">3. Revise e importe</h2>}
      {ready && review && (
        <ImportReview
          key={review.openings}
          workspaceId={workspace.id}
          initialRows={review.rows}
          categories={categories.data}
          previousImports={imports.data}
          onChooseAnother={() => setReview(null)}
          onImported={(firstPeriod) =>
            void navigate(`/espacos/${workspace.id}/lancamentos?competencia=${firstPeriod}`)
          }
        />
      )}
      {ready && !review && imports.data.length > 0 && (
        <section aria-labelledby={PREVIOUS_TITLE_ID} className="grid gap-2">
          {/* Focusable from script: where focus goes after undoing one. */}
          <h2 id={PREVIOUS_TITLE_ID} tabIndex={-1} className="font-medium outline-none">
            Importações anteriores
          </h2>
          <ul className="divide-y rounded-xl border px-4">
            {imports.data.map((item) => (
              <PreviousImport
                key={item.id}
                workspaceId={workspace.id}
                item={item}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
