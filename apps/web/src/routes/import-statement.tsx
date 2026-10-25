import {
  detectStatement,
  formatCents,
  formatPeriod,
  hasRole,
  parseNubankAccountCsv,
  parseNubankCsv,
  statementBanks,
  type AccountLine,
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
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/features/auth/use-me';
import { useCategories, useCategoryHints } from '@/features/categories/use-categories';
import { startAccountReview } from '@/features/import/account-review';
import { ImportReview } from '@/features/import/import-review';
import { ImportHeader } from '@/features/import/import-tabs';
import { PreviousImports } from '@/features/import/previous-imports';
import type { ReviewRow } from '@/features/import/review';
import {
  startStatementReview,
  suggestedPeriod,
  wholeBillAlreadyLaunched,
} from '@/features/import/statement-review';
import { useImportCandidates, useImports } from '@/features/import/use-imports';
import { useInstallmentPlans } from '@/features/installments/use-installments';
import { useMerchants } from '@/features/merchants/use-merchants';
import { usePeople } from '@/features/people/use-people';
import { useTransactions } from '@/features/transactions/use-transactions';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { cn } from '@/lib/utils';

/** A statement read. */
type StatementFile = { lines: StatementLine[]; unread: string[] };

/** An account statement read (ADR 0061). */
type AccountFile = { lines: AccountLine[]; unread: string[] };

/** What the file was, by the kind chosen. */
type ReadFile =
  ({ kind: 'CARD_STATEMENT' } & StatementFile) | ({ kind: 'ACCOUNT_STATEMENT' } & AccountFile);

/**
 * The review of an account statement (ADR 0061), opened once what it compares with is loaded:
 * the movements already imported and the transactions one may be, asked of the API for the
 * statement's days, with the merchants, the people and the history.
 */
function AccountReview({
  workspaceId,
  bank,
  file,
  previousImports,
  onChooseAnother,
  onImported,
}: {
  workspaceId: string;
  bank: { bank: StatementBank; label: string };
  file: AccountFile;
  previousImports: Import[];
  onChooseAnother: () => void;
  onImported: (firstPeriod: string) => void;
}) {
  const user = useCurrentUser();
  const categories = useCategories(workspaceId);
  const merchants = useMerchants(workspaceId);
  const people = usePeople(workspaceId);
  const hints = useCategoryHints(workspaceId);
  const range = useMemo(() => {
    const days = file.lines.map((line) => line.occurredOn).sort();
    return {
      from: days[0] ?? '',
      to: days.at(-1) ?? '',
      externalIds: file.lines.map((line) => line.externalId),
    };
  }, [file.lines]);
  const candidates = useImportCandidates(workspaceId, range);
  // The review opens once, with what was read; later loads do not reset the person's choices.
  const [review, setReview] = useState<ReturnType<typeof startAccountReview> | null>(null);
  if (
    !review &&
    categories.data &&
    merchants.data &&
    people.data &&
    candidates.data &&
    !hints.isPending
  ) {
    setReview(
      startAccountReview(file.lines, {
        known: new Set(candidates.data.known.map((item) => item.externalId)),
        candidates: candidates.data.transactions,
        merchants: merchants.data,
        categories: categories.data,
        people: people.data,
        hints: hints.data,
        userName: user.name,
      }),
    );
  }
  if (!review || !categories.data || !merchants.data) {
    return <QueryState queries={[categories, merchants, people, candidates]} />;
  }
  if (review.rows.length === 0) {
    return (
      <SectionCard title="Nada novo neste extrato">
        <p>
          {review.knownCount === 1
            ? 'O único movimento deste extrato já foi importado antes.'
            : `Os ${review.knownCount} movimentos deste extrato já foram importados antes.`}
        </p>
        <Button variant="outline" className="justify-self-start" onClick={onChooseAnother}>
          Escolher outro arquivo
        </Button>
      </SectionCard>
    );
  }
  return (
    <ImportReview
      workspaceId={workspaceId}
      initialRows={review.rows}
      categories={categories.data}
      merchants={merchants.data}
      previousImports={previousImports}
      account={{
        knownCount: review.knownCount,
        notices:
          file.unread.length > 0
            ? [
                `Algumas linhas do arquivo não puderam ser lidas e ficam de fora: ${file.unread.join('; ')}.`,
              ]
            : [],
      }}
      source={{ kind: 'ACCOUNT_STATEMENT', bank: bank.bank }}
      heading={{
        title: 'Revisar extrato da conta',
        subtitle: `${bank.label} · ${file.lines.length} ${file.lines.length === 1 ? 'movimento' : 'movimentos'}`,
      }}
      defaultLabel={`Conta ${bank.label}`}
      onChooseAnother={onChooseAnother}
      onImported={onImported}
    />
  );
}

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
      heading={{
        title: 'Revisar fatura do cartão',
        subtitle: `${bank.label} · ${statement.lines.length} ${statement.lines.length === 1 ? 'linha' : 'linhas'}`,
      }}
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
  const [statement, setStatement] = useState<ReadFile | null>(null);
  const account = kind === 'ACCOUNT_STATEMENT';
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
      const parsed =
        kind === 'ACCOUNT_STATEMENT'
          ? { kind, ...parseNubankAccountCsv(text) }
          : { kind, ...parseNubankCsv(text) };
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
        const unread = parsed.issues.map((issue) => `linha ${issue.line} (${issue.message})`);
        setStatement(
          parsed.kind === 'ACCOUNT_STATEMENT'
            ? { kind: parsed.kind, lines: parsed.lines, unread }
            : { kind: parsed.kind, lines: parsed.lines, unread },
        );
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
      {/* While a file is reviewed, the review is the page's step (its own title and Cancelar). */}
      {!statement && <ImportHeader workspaceId={workspace.id} />}
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
                1. Baixe {account ? 'o extrato' : 'a fatura'} em CSV
              </h3>
              <InfoTip term={`Baixe ${account ? 'o extrato' : 'a fatura'} em CSV`}>
                {account
                  ? `No app do ${bank.label}, abra o extrato da conta, escolha o período e exporte em CSV. Na revisão, cada movimento é conferido com o que já está lançado, e o que já existe não entra de novo. Do Pix e da transferência, o app guarda só o nome da outra parte: CPF, CNPJ, banco, agência e conta ficam de fora.`
                  : `No app ou no site do ${bank.label}, abra a fatura do cartão e exporte em CSV. Na revisão, você confirma o mês da fatura e o vencimento, e as compras parceladas viram parcelamentos.`}
              </InfoTip>
            </div>
          </section>
          <section aria-labelledby="import-step-statement-file" className="grid gap-2">
            <h3 id="import-step-statement-file" className="font-medium">
              2. Escolha o arquivo {account ? 'do extrato' : 'da fatura'}
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
              Escolher {account ? 'extrato' : 'fatura'} (.csv)
            </label>
            {readError && (
              <p id="import-file-error" role="alert" className="text-destructive">
                {readError}
              </p>
            )}
            {reading && <p role="status">Lendo {account ? 'o extrato' : 'a fatura'}…</p>}
          </section>
        </SectionCard>
      )}
      {ready && !canEdit && (
        <p className="text-muted-foreground">Quem só visualiza o espaço não importa arquivos.</p>
      )}
      {ready && statement?.kind === 'ACCOUNT_STATEMENT' && (
        <AccountReview
          workspaceId={workspace.id}
          bank={bank}
          file={statement}
          previousImports={imports.data}
          onChooseAnother={() => setStatement(null)}
          onImported={imported}
        />
      )}
      {ready && statement?.kind === 'CARD_STATEMENT' && (
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
