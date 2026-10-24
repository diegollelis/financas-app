import {
  detectStatement,
  formatCents,
  formatPeriod,
  hasRole,
  parseNubankCsv,
  statementBanks,
  type Import,
  type StatementBank,
  type StatementLine,
} from '@financas/shared';
import { FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { InfoTip } from '@/components/info-tip';
import { QueryState } from '@/components/query-state';
import { SectionCard } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategories, useCategoryHints } from '@/features/categories/use-categories';
import { ImportReview } from '@/features/import/import-review';
import { ImportHeader } from '@/features/import/import-tabs';
import { PreviousImports } from '@/features/import/previous-imports';
import type { ReviewRow } from '@/features/import/review';
import {
  startStatementReview,
  suggestedPeriod,
  wholeBillAlreadyLaunched,
} from '@/features/import/statement-review';
import { useImports } from '@/features/import/use-imports';
import { useInstallmentPlans } from '@/features/installments/use-installments';
import { useMerchants } from '@/features/merchants/use-merchants';
import { useTransactions } from '@/features/transactions/use-transactions';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { cn } from '@/lib/utils';

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
  bank,
  statement,
  previousImports,
  onChooseAnother,
  onImported,
}: {
  workspaceId: string;
  bank: { bank: StatementBank; label: string };
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
      source={{ kind: 'CARD_STATEMENT', bank: bank.bank }}
      defaultLabel={`Fatura ${bank.label}`}
      onChooseAnother={onChooseAnother}
      onImported={onImported}
    />
  );
}

/**
 * Importar · Extrato do banco (ADR 0060): the bank, then the kind of statement it offers, then the
 * file, read here on the device; only the confirmed transactions go to the API. The banks and
 * their kinds come from `statementBanks`.
 */
export function StatementImportPage() {
  const workspace = useCurrentWorkspace();
  const categories = useCategories(workspace.id);
  const imports = useImports(workspace.id);
  const navigate = useNavigate();
  const canEdit = hasRole(workspace.role, 'EDITOR');
  const [bankId, setBankId] = useState<StatementBank>(statementBanks[0]!.bank);
  const bank = statementBanks.find((item) => item.bank === bankId) ?? statementBanks[0]!;
  const [kind, setKind] = useState(bank.sources.find((source) => source.available)!.kind);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [statement, setStatement] = useState<StatementFile | null>(null);
  const ready = categories.isSuccess && imports.isSuccess;
  const unavailable = bank.sources.filter((source) => !source.available);
  const imported = (firstPeriod: string) =>
    void navigate(`/espacos/${workspace.id}/lancamentos?competencia=${firstPeriod}`);

  const chooseStatement = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const text = await file.text();
      const parsed = parseNubankCsv(text);
      const fatal = parsed.issues.find((issue) => issue.line === 1 || issue.line === null);
      if (fatal) {
        // Another statement, not an unreadable file: say which (ADR 0060).
        const other = detectStatement(text);
        setReadError(
          other && other.source.kind !== kind
            ? `Este arquivo parece o extrato de ${other.source.label.toLowerCase()} do ${other.bank.label}${other.source.available ? `: escolha "${other.source.short}" em "Qual extrato?".` : ', que o app ainda não lê.'}`
            : fatal.message,
        );
      } else {
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

  const statements = imports.data?.filter((item) => item.kind !== 'TEMPLATE') ?? [];

  return (
    <>
      <ImportHeader workspaceId={workspace.id} />
      <QueryState queries={[categories, imports]} />
      {ready && canEdit && !statement && (
        <SectionCard title="Nova importação">
          <div className="grid gap-1.5 sm:max-w-xs">
            <label htmlFor="import-bank" className="text-sm font-medium">
              Banco
            </label>
            <Select
              value={bankId}
              onValueChange={(next) => {
                setBankId(next as StatementBank);
                setReadError(null);
              }}
            >
              <SelectTrigger
                id="import-bank"
                aria-describedby="import-bank-note"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {statementBanks.map((item) => (
                  <SelectItem key={item.bank} value={item.bank}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="import-bank-note" className="text-muted-foreground text-sm">
              Por enquanto, só o Nubank. Outros bancos virão.
            </p>
          </div>
          <div className="grid gap-1.5">
            <p aria-hidden className="text-sm font-medium">
              Qual extrato?
            </p>
            <SegmentedControl
              label="Qual extrato?"
              options={bank.sources.map((source) => ({
                value: source.kind,
                label: source.short,
                disabled: !source.available,
              }))}
              value={kind}
              onChange={(next) => {
                setKind(next);
                setReadError(null);
              }}
              describedBy={unavailable.length > 0 ? 'import-kind-note' : undefined}
              className="sm:justify-self-start"
            />
            {unavailable.length > 0 && (
              <p id="import-kind-note" className="text-muted-foreground text-sm">
                {unavailable.map((source) => `"${source.short}"`).join(', ')} chega no próximo
                passo.
              </p>
            )}
          </div>
          <section aria-labelledby="import-step-statement" className="grid gap-2">
            <div className="flex items-center">
              <h3 id="import-step-statement" className="font-medium">
                1. Baixe a fatura em CSV
              </h3>
              <InfoTip term="Baixe a fatura em CSV">
                No app ou no site do {bank.label}, abra a fatura do cartão e exporte em CSV. Na
                revisão, você confirma o mês da fatura e o vencimento, e as compras parceladas viram
                parcelamentos.
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
        </SectionCard>
      )}
      {ready && !canEdit && (
        <p className="text-muted-foreground">Quem só visualiza o espaço não importa arquivos.</p>
      )}
      {ready && statement && (
        <StatementReview
          workspaceId={workspace.id}
          bank={bank}
          statement={statement}
          previousImports={imports.data}
          onChooseAnother={() => setStatement(null)}
          onImported={imported}
        />
      )}
      {ready && !statement && (
        <PreviousImports
          workspaceId={workspace.id}
          items={statements}
          canEdit={canEdit}
          title="Extratos importados"
          help="Os extratos de banco importados neste espaço. Desfazer tira os lançamentos e os parcelamentos que ele criou; estabelecimentos e apelidos ficam."
        />
      )}
    </>
  );
}
