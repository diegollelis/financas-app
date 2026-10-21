import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  hasRole,
  parseNubankCsv,
  type Import,
  type StatementLine,
} from '@financas/shared';
import { Download, FileUp } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
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
import { InfoTip } from '@/components/info-tip';
import { CARD_CLASS, SectionCard } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCategories, useCategoryHints } from '@/features/categories/use-categories';
import { ImportReview } from '@/features/import/import-review';
import { startReview, type ReviewRow } from '@/features/import/review';
import {
  startStatementReview,
  suggestedPeriod,
  wholeBillAlreadyLaunched,
} from '@/features/import/statement-review';
import { useInstallmentPlans } from '@/features/installments/use-installments';
import { useMerchants } from '@/features/merchants/use-merchants';
import { useTransactions } from '@/features/transactions/use-transactions';
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

  const counts = `${item.transactionCount} ${item.transactionCount === 1 ? 'lançamento' : 'lançamentos'}${
    item.planCount > 0
      ? ` e ${item.planCount} ${item.planCount === 1 ? 'parcelamento' : 'parcelamentos'}`
      : ''
  }, ${periodsOf(item)}`;
  // Its "Origem" and the statement's due date tell it apart (ADR 0055 note); an import made
  // before them shows what it brought, as it always did.
  const name = item.label
    ? `${item.label}${item.statementDueDate ? ` · vence ${formatIsoDate(item.statementDueDate)}` : ''}`
    : null;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="grid min-w-0 gap-1">
        {/* Where it came from: only a statement records a due date (ADR 0055 note). */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium break-words">
          <Badge variant={item.statementDueDate ? 'secondary' : 'outline'}>
            {item.statementDueDate ? 'Fatura' : 'Planilha'}
          </Badge>
          {name ?? counts}
        </p>
        <p className="text-muted-foreground text-sm">
          {name && `${counts} · `}
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
                  Os {item.transactionCount} lançamentos dela saem
                  {item.planCount > 0 && ', com os parcelamentos que ela criou'}, inclusive os que
                  foram editados ou marcados como pagos ou recebidos depois. Estabelecimentos e
                  apelidos ficam. Não é possível desfazer.
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

/** Where the transactions come from (ADR 0055): the app's template, or a bank's card statement. */
type Origin = 'TEMPLATE' | 'NUBANK';

const originOptions = [
  { value: 'TEMPLATE', label: 'Planilha modelo' },
  { value: 'NUBANK', label: 'Fatura Nubank' },
] as const;

/** A statement read. */
type StatementFile = { lines: StatementLine[]; unread: string[] };

/**
 * The review of a card statement (ADR 0055), opened once what it compares with is loaded: the
 * workspace's merchants, plans and history, and the transactions of the reference month. The
 * month (suggested) and the due date (typed) are chosen in the review, and changing the month
 * reads that month's transactions again (ADR 0055 note).
 */
function StatementReview({
  workspaceId,
  statement,
  previousImports,
  onChooseAnother,
  onImported,
}: {
  workspaceId: string;
  statement: StatementFile;
  previousImports: Import[];
  onChooseAnother: () => void;
  onImported: (firstPeriod: string) => void;
}) {
  const categories = useCategories(workspaceId);
  const merchants = useMerchants(workspaceId);
  const plans = useInstallmentPlans(workspaceId);
  const hints = useCategoryHints(workspaceId);
  const [period, setPeriod] = useState(() => suggestedPeriod(statement.lines));
  const [dueDate, setDueDate] = useState<string | null>(null);
  const transactions = useTransactions(workspaceId, period);
  // The history only suggests: a failure there does not hold the review.
  const context = useMemo(
    () =>
      categories.data && merchants.data && plans.data && transactions.data && !hints.isPending
        ? {
            period,
            dueDate,
            merchants: merchants.data,
            categories: categories.data,
            hints: hints.data,
            plans: plans.data,
            transactions: transactions.data,
          }
        : null,
    [
      period,
      dueDate,
      categories.data,
      merchants.data,
      plans.data,
      transactions.data,
      hints.data,
      hints.isPending,
    ],
  );
  const baseRows = useMemo(
    () => (context ? startStatementReview(statement.lines, context) : null),
    [context, statement.lines],
  );
  // The review opens with the first rows; later ones are merged into it.
  const [initialRows, setInitialRows] = useState<ReviewRow[] | null>(null);
  if (!initialRows && baseRows) setInitialRows(baseRows);
  if (!initialRows || !categories.data || !merchants.data) {
    return <QueryState queries={[categories, merchants, plans, transactions]} />;
  }
  const wholeBill = context && wholeBillAlreadyLaunched(statement.lines, context);
  const notices = [
    ...(wholeBill
      ? [
          `${formatPeriod(wholeBill.transaction.period)} já tem a saída "${wholeBill.transaction.description}" de ${formatCents(wholeBill.transaction.amountCents)} no Crédito, perto do total desta fatura (${formatCents(wholeBill.totalCents)}). Se ela é esta fatura lançada inteira, importar as compras conta duas vezes: exclua aquela saída ou desmarque as compras.`,
        ]
      : []),
    ...(statement.unread.length > 0
      ? [
          `Algumas linhas do arquivo não puderam ser lidas e ficam de fora: ${statement.unread.join('; ')}.`,
        ]
      : []),
  ];
  return (
    <ImportReview
      workspaceId={workspaceId}
      initialRows={initialRows}
      categories={categories.data}
      merchants={merchants.data}
      previousImports={previousImports}
      statement={{
        period,
        dueDate,
        onPeriodChange: setPeriod,
        onDueDateChange: setDueDate,
        baseRows,
        notices,
      }}
      defaultLabel="Fatura Nubank"
      onChooseAnother={onChooseAnother}
      onImported={onImported}
    />
  );
}

/**
 * Importar (ADRs 0040 and 0055): the app's template, or a card statement. The file is read here,
 * on the device; only the confirmed transactions go to the API.
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
  const [origin, setOrigin] = useState<Origin>('TEMPLATE');
  // A card statement read: its review opens right away (ADR 0055 note).
  const [statement, setStatement] = useState<StatementFile | null>(null);
  const ready = categories.isSuccess && imports.isSuccess;
  const reviewing = Boolean(review) || Boolean(statement);
  const chooseAnother = () => {
    setReview(null);
    setStatement(null);
  };
  const imported = (firstPeriod: string) =>
    void navigate(`/espacos/${workspace.id}/lancamentos?competencia=${firstPeriod}`);

  const chooseStatement = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const parsed = parseNubankCsv(await file.text());
      const fatal = parsed.issues.find((issue) => issue.line === 1 || issue.line === null);
      if (fatal) setReadError(fatal.message);
      else {
        setStatement({
          lines: parsed.lines,
          unread: parsed.issues.map((issue) => `linha ${issue.line} (${issue.message})`),
        });
      }
    } catch {
      setReadError('Não foi possível ler o arquivo.');
    } finally {
      setReading(false);
    }
  };

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
        title="Importar"
        description="Traga lançamentos de uma planilha ou da fatura do cartão."
      />
      <QueryState queries={[categories, imports]} />
      {/* The steps, numbered, in a card of their own: the origin changes only this card, never the
          history below (ADR 0040 note). Choosing the file only opens the review. How to do each
          step is behind its "ⓘ"; the privacy promise stays in sight. */}
      {ready && canEdit && !reviewing && (
        <SectionCard title="Nova importação">
          <div className="grid gap-2">
            <p aria-hidden className="text-sm font-medium">
              De onde vêm os lançamentos?
            </p>
            <SegmentedControl
              label="De onde vêm os lançamentos?"
              options={originOptions}
              value={origin}
              onChange={(value) => {
                setOrigin(value);
                setReadError(null);
                setStatement(null);
              }}
              className="sm:justify-self-start"
            />
          </div>
          {origin === 'NUBANK' ? (
            <>
              <section aria-labelledby="import-step-statement" className="grid gap-2">
                <div className="flex items-center">
                  <h3 id="import-step-statement" className="font-medium">
                    1. Baixe a fatura em CSV
                  </h3>
                  <InfoTip term="Baixe a fatura em CSV">
                    No app ou no site do Nubank, abra a fatura do cartão e exporte em CSV. Na
                    revisão, você confirma o mês da fatura e o vencimento, e as compras parceladas
                    viram parcelamentos.
                  </InfoTip>
                </div>
              </section>
              <section aria-labelledby="import-step-statement-file" className="grid gap-2">
                <h3 id="import-step-statement-file" className="font-medium">
                  2. Escolha o arquivo da fatura
                </h3>
                <input
                  id="import-statement-input"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={reading}
                  className="peer sr-only"
                  aria-describedby={readError ? 'import-file-error' : undefined}
                  onChange={(event) => {
                    void chooseStatement(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
                <label
                  htmlFor="import-statement-input"
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'peer-focus-visible:border-ring peer-focus-visible:ring-ring/50 cursor-pointer justify-self-start peer-focus-visible:ring-3 peer-disabled:cursor-default peer-disabled:opacity-50',
                  )}
                >
                  <FileUp aria-hidden />
                  Escolher fatura (.csv)
                </label>
                {readError && (
                  <p id="import-file-error" role="alert" className="text-destructive">
                    {readError}
                  </p>
                )}
                {reading && <p role="status">Lendo a fatura…</p>}
              </section>
            </>
          ) : (
            <>
              <section aria-labelledby="import-step-template" className="grid gap-2">
                <div className="flex items-center">
                  <h3 id="import-step-template" className="font-medium">
                    1. Baixe o modelo
                  </h3>
                  <InfoTip term="Baixe o modelo">
                    Uma linha por lançamento, com mês de referência, tipo, descrição, categoria e
                    valor. O estabelecimento é opcional, e um nome novo vira estabelecimento ao
                    importar. A planilha já vem com um exemplo e as categorias deste espaço.
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
                {/* The native picker, hidden, behind a button in the app's style: the label opens
                    it, and keyboard focus on it shows on the button. */}
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
          <p className="text-muted-foreground text-sm">
            O arquivo é lido no seu aparelho: só os lançamentos que você confirmar são enviados.
          </p>
        </SectionCard>
      )}
      {ready && !canEdit && (
        <p className="text-muted-foreground">Quem só visualiza o espaço não importa arquivos.</p>
      )}
      {ready && reviewing && <h2 className="font-medium">3. Revise e importe</h2>}
      {ready && review && (
        <ImportReview
          key={review.openings}
          workspaceId={workspace.id}
          initialRows={review.rows}
          categories={categories.data}
          previousImports={imports.data}
          defaultLabel="Planilha modelo"
          onChooseAnother={chooseAnother}
          onImported={imported}
        />
      )}
      {ready && statement && (
        <StatementReview
          workspaceId={workspace.id}
          statement={statement}
          previousImports={imports.data}
          onChooseAnother={chooseAnother}
          onImported={imported}
        />
      )}
      {ready && !reviewing && imports.data.length > 0 && (
        // Its own card, apart from the new import: the history is of the whole workspace.
        <section aria-labelledby={PREVIOUS_TITLE_ID} className={CARD_CLASS}>
          <div className="flex items-center">
            {/* Focusable from script: where focus goes after undoing one. */}
            <h2 id={PREVIOUS_TITLE_ID} tabIndex={-1} className="font-semibold outline-none">
              Importações anteriores
            </h2>
            <InfoTip term="Importações anteriores">
              Todas as importações deste espaço, de planilha e de fatura. Desfazer tira os
              lançamentos e os parcelamentos que ela criou; estabelecimentos e apelidos ficam.
            </InfoTip>
          </div>
          <ul className="divide-y">
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
