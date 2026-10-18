import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  occurredOnRowLabels,
  paymentMethodLabels,
  PENDING_LABEL,
  settledLabels,
  type Category,
  type Import,
  type Merchant,
} from '@financas/shared';
import { cn } from 'cn';
import { TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CategorySelect } from '@/features/categories/category-picker';
import { CARD_LIST, CARD_ROW } from '@/features/view-mode/row-styles';
import { apiErrorMessage } from '@/lib/error-message';
import { ImportRowForm } from './import-row-form';
import {
  groupByPeriod,
  groupTotals,
  readyImport,
  resolveCategory,
  rowProblems,
  unmatchedCategories,
  type ReviewRow,
} from './review';
import { applyToSameTitle, sameTitleCount } from './statement-review';
import { useCreateImport } from './use-imports';

const typeLabel = { CREDIT: 'entrada', DEBIT: 'saída' } as const;

/** "2026-08 a 2026-09" of a previous import overlaps what is about to be imported. */
function overlapsPrevious(imports: Import[], rows: ReviewRow[]) {
  const periods = rows.filter((row) => row.included && row.period).map((row) => row.period ?? '');
  return imports.filter((previous) =>
    periods.some((period) => period >= previous.firstPeriod && period <= previous.lastPeriod),
  );
}

function RowItem({
  row,
  categoryName,
  categoryOptions,
  problems,
  onToggle,
  onCategory,
  onEdit,
}: {
  row: ReviewRow;
  /** The app's category the row goes to, or null while there is none. */
  categoryName: string | null;
  /** The categories of its type, to pick one on the card. */
  categoryOptions: Category[];
  problems: string[];
  onToggle: (included: boolean) => void;
  onCategory: (categoryId: string) => void;
  onEdit: (trigger: HTMLButtonElement) => void;
}) {
  const label = row.description || `Linha ${row.line}`;
  // A statement's line without a category picks it right on the card, as most lines of a first
  // statement have none yet (ADR 0055 note).
  const picksCategory = Boolean(row.statementTitle) && !categoryName && row.type !== null;
  // A statement's line unchecked by a rule says only why; checking it shows what it lacks.
  const shown = row.statementTitle && !row.included ? [] : problems;
  const visibleProblems = picksCategory
    ? shown.filter((problem) => problem !== 'Escolha a categoria.')
    : shown;
  const blocked = problems.length > 0 && !row.statementTitle;
  return (
    // The box beside the checkbox has its own 44px target: 8px of side room on the phone.
    <li className={cn(CARD_ROW, 'flex items-start gap-3 px-2 md:px-4')}>
      {/* A 44px target on the phone (ADR 0036): the label around the box toggles it too. */}
      <label
        htmlFor={`import-row-${row.line}`}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center md:size-8"
      >
        <Checkbox
          id={`import-row-${row.line}`}
          checked={row.included && !blocked}
          disabled={blocked}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`Importar ${label}`}
        />
      </label>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-medium break-words">{label}</p>
        {/* The bank's text, to check against the statement (ADR 0055 note). */}
        {row.statementTitle && row.statementTitle !== row.description && (
          <p className="text-muted-foreground text-sm break-words">
            No extrato: {row.statementTitle}
          </p>
        )}
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
          <span>
            {categoryName ??
              (row.statementTitle
                ? 'Sem categoria'
                : `${row.categoryName || 'Sem categoria'} (sem correspondência)`)}
          </span>
          {row.merchantName && <span>{row.merchantName}</span>}
          {row.paymentMethod && <span>{paymentMethodLabels[row.paymentMethod]}</span>}
          {row.occurredOn && (
            <span>
              {row.type ? occurredOnRowLabels[row.type] : 'Em'} {formatIsoDate(row.occurredOn)}
            </span>
          )}
          {row.dueDate && <span>Vence em {formatIsoDate(row.dueDate)}</span>}
          <span>
            {row.settledAt
              ? `${row.type ? settledLabels[row.type] : 'Pago ou recebido'} em ${formatIsoDate(row.settledAt)}`
              : PENDING_LABEL}
          </span>
          <span>Linha {row.line}</span>
        </p>
        {picksCategory && row.included && (
          <div className="mt-1 grid max-w-xs gap-1">
            <FormField id={`import-row-${row.line}-category`} label={`Categoria de ${label}`}>
              <CategorySelect value="" onChange={onCategory} options={categoryOptions} />
            </FormField>
          </div>
        )}
        {/* Optional: a hint, not a problem (ADR 0055 note), once what is required is there. */}
        {row.statementTitle &&
          row.included &&
          categoryName &&
          !row.merchantName &&
          row.type === 'DEBIT' && (
            <p className="text-muted-foreground text-sm">
              Sem estabelecimento (opcional). Escolha um em "Editar" para a próxima fatura já vir
              com ele.
            </p>
          )}
        {[...visibleProblems, ...row.warnings].map((message) => (
          <p
            key={message}
            className={
              visibleProblems.includes(message)
                ? 'text-destructive flex gap-1.5 text-sm'
                : 'text-muted-foreground flex gap-1.5 text-sm'
            }
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        ))}
      </div>
      <div className="grid shrink-0 justify-items-end gap-2">
        <span className="text-base font-semibold tabular-nums">
          {row.amountCents && row.amountCents > 0 ? formatCents(row.amountCents) : 'Sem valor'}
        </span>
        <Button
          variant={blocked ? 'secondary' : 'ghost'}
          size="sm"
          aria-label={`${blocked ? 'Corrigir' : 'Editar'} ${label}`}
          onClick={(event) => onEdit(event.currentTarget)}
        >
          {blocked ? 'Corrigir' : 'Editar'}
        </Button>
      </div>
    </li>
  );
}

/**
 * The preview before importing (ADR 0040): the rows by competência with their totals, each one
 * checked or not, editable in a form; rows with errors are fixed here or left out; spreadsheet
 * categories the app does not have are matched to one of its own. Nothing reaches the API until
 * "Importar".
 */
export function ImportReview({
  workspaceId,
  initialRows,
  categories,
  merchants,
  previousImports,
  statement,
  defaultLabel,
  onChooseAnother,
  onImported,
}: {
  workspaceId: string;
  initialRows: ReviewRow[];
  categories: Category[];
  /** Offered when choosing a row's merchant (a card statement's review, ADR 0055). */
  merchants?: Merchant[];
  previousImports: Import[];
  /** A card statement (ADR 0055): its due date and what the review found before opening. */
  statement?: { dueDate: string; notices: string[] };
  /** The "Origem" it starts with ("Fatura Nubank", "Planilha modelo"). */
  defaultLabel: string;
  onChooseAnother: () => void;
  onImported: (firstPeriod: string) => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [label, setLabel] = useState(defaultLabel);
  const [matches, setMatches] = useState<ReadonlyMap<string, string>>(new Map());
  // The line being edited; the button that opened it gets the focus back.
  const [editing, setEditing] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const create = useCreateImport(workspaceId);

  const ready = readyImport(rows, categories, matches);
  const readyCount = ready.transactions.length + ready.plans.length;
  const unmatched = unmatchedCategories(rows, categories).filter(
    (entry) => !matches.has(entry.key),
  );
  // A statement may be imported again on purpose: what is already in comes unchecked instead.
  const overlapping = statement ? [] : overlapsPrevious(previousImports, rows);
  const nameOf = (id: string | null) =>
    categories.find((category) => category.id === id)?.name ?? null;
  const editingRow = rows.find((row) => row.line === editing);
  /** What keeps a row out, if anything. A spreadsheet category's "Escolha a categoria" is
   * answered above, for every row of that name at once, so it is not repeated on each row. */
  const check = (row: ReviewRow) => {
    const categoryId = resolveCategory(row, categories, matches);
    const problems = rowProblems(row, categoryId).filter(
      (problem) => !(problem === 'Escolha a categoria.' && row.type && row.categoryName),
    );
    return { categoryId, problems };
  };
  // The check before importing (avaliação externa): what goes in, adding up, and what does not.
  // A plan counts its first installment, the one of this statement.
  const goingIn = [...ready.transactions, ...ready.plans];
  const credits = goingIn
    .filter((transaction) => transaction.type === 'CREDIT')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const debits = goingIn
    .filter((transaction) => transaction.type === 'DEBIT')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const withProblems = rows.filter((row) => check(row).problems.length > 0);
  const waitingForCategory = unmatched.reduce((sum, entry) => sum + entry.rowCount, 0);
  // Hides rows from the view only: nothing leaves the import because of it.
  const [onlyProblems, setOnlyProblems] = useState(false);
  const filtering = onlyProblems && withProblems.length > 0;
  const visible = filtering ? withProblems : rows;

  const update = (line: number, change: (row: ReviewRow) => ReviewRow) =>
    setRows((current) => current.map((row) => (row.line === line ? change(row) : row)));

  const submit = () =>
    create.mutate(
      {
        transactions: ready.transactions,
        ...(ready.plans.length > 0 && { plans: ready.plans }),
        ...(ready.aliases.length > 0 && { aliases: ready.aliases }),
        label,
        ...(statement && { statementDueDate: statement.dueDate }),
      },
      {
        onSuccess: (created) => {
          toast.success(
            `${created.transactionCount} ${created.transactionCount === 1 ? 'lançamento importado' : 'lançamentos importados'}`,
          );
          onImported(created.firstPeriod);
        },
      },
    );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="tabular-nums">
          {readyCount} de {rows.length} {rows.length === 1 ? 'linha pronta' : 'linhas prontas'} para
          importar: entradas {formatCents(credits)}, saídas {formatCents(debits)}
          {ready.plans.length > 0 &&
            `, ${ready.plans.length} ${ready.plans.length === 1 ? 'parcelamento novo' : 'parcelamentos novos'}`}
          .
          {withProblems.length > 0 &&
            ` ${withProblems.length} ${withProblems.length === 1 ? 'linha com problema' : 'linhas com problema'}.`}
          {waitingForCategory > 0 &&
            ` ${waitingForCategory} ${waitingForCategory === 1 ? 'linha espera' : 'linhas esperam'} a associação de uma categoria.`}
        </p>
        <Button variant="outline" onClick={onChooseAnother}>
          Escolher outro arquivo
        </Button>
      </div>

      {/* What tells this import apart later, in "Importações anteriores" (ADR 0055 note). */}
      <div className="grid gap-4 sm:grid-cols-2">
        {statement && (
          <div className="grid gap-1">
            <p className="text-sm font-medium">Vencimento da fatura</p>
            <p className="tabular-nums">{formatIsoDate(statement.dueDate)}</p>
            <p className="text-muted-foreground text-sm">
              Cada compra entra no mês em que foi feita, e todas vencem nesse dia.
            </p>
          </div>
        )}
        <FormField
          id="import-label"
          label="Origem (opcional)"
          hint="Como esta importação aparece depois. Ex.: Cartão Nubank do Diego."
        >
          <Input
            autoComplete="off"
            maxLength={100}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </FormField>
      </div>

      {statement?.notices.map((notice) => (
        <p key={notice} role="note" className="bg-muted rounded-lg p-3">
          {notice}
        </p>
      ))}

      {overlapping.length > 0 && (
        <p role="note" className="bg-muted rounded-lg p-3">
          Você já importou lançamentos desses meses (
          {overlapping
            .map((previous) =>
              previous.firstPeriod === previous.lastPeriod
                ? formatPeriod(previous.firstPeriod)
                : `${formatPeriod(previous.firstPeriod)} a ${formatPeriod(previous.lastPeriod)}`,
            )
            .join('; ')}
          ). Importar de novo duplica os lançamentos; se quiser trocar, desfaça a importação
          anterior primeiro.
        </p>
      )}

      {unmatched.length > 0 && (
        <section aria-labelledby="import-categories" className="grid gap-3">
          <h2 id="import-categories" className="font-medium">
            Categorias
          </h2>
          <p className="text-muted-foreground">
            Estas categorias da planilha não existem no espaço. Escolha a correspondente de cada
            uma, ou crie a categoria em Categorias e escolha o arquivo de novo.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {unmatched.map((entry) => (
              <FormField
                key={entry.key}
                id={`match-${entry.key}`}
                label={`${entry.name} (${typeLabel[entry.type]}, ${entry.rowCount} ${entry.rowCount === 1 ? 'linha' : 'linhas'})`}
              >
                <CategorySelect
                  value=""
                  onChange={(categoryId) =>
                    setMatches((current) => new Map(current).set(entry.key, categoryId))
                  }
                  options={categories.filter(
                    (category) => category.type === entry.type && !category.archived,
                  )}
                />
              </FormField>
            ))}
          </div>
        </section>
      )}

      {withProblems.length > 0 && (
        <SegmentedControl
          label="Mostrar"
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'problems', label: 'Com problemas' },
          ]}
          value={onlyProblems ? 'problems' : 'all'}
          onChange={(value) => setOnlyProblems(value === 'problems')}
          className="sm:justify-self-start"
        />
      )}

      {groupByPeriod(visible).map(({ period, rows: grouped }) => {
        const totals = groupTotals(grouped);
        const titleId = `import-period-${period ?? 'sem'}`;
        return (
          <section key={period ?? 'sem'} aria-labelledby={titleId} className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id={titleId} className="font-medium first-letter:uppercase">
                {period ? formatPeriod(period) : 'Sem mês de referência válido'}
              </h2>
              <span className="text-muted-foreground text-sm tabular-nums">
                Entradas {formatCents(totals.credits)}, saídas {formatCents(totals.debits)}
              </span>
            </div>
            {/* One card per row, like Lançamentos (ADR 0036 note). */}
            <ul className={CARD_LIST}>
              {grouped.map((row) => {
                const { categoryId, problems } = check(row);
                return (
                  <RowItem
                    key={row.line}
                    row={row}
                    categoryName={nameOf(categoryId)}
                    categoryOptions={categories.filter(
                      (category) => category.type === row.type && !category.archived,
                    )}
                    problems={problems}
                    onToggle={(included) =>
                      update(row.line, (current) => ({ ...current, included }))
                    }
                    // The same choice goes to the lines of the same title (ADR 0055 note).
                    onCategory={(chosen) =>
                      setRows((current) =>
                        applyToSameTitle(current, { ...row, categoryId: chosen }),
                      )
                    }
                    onEdit={(trigger) => {
                      triggerRef.current = trigger;
                      setEditing(row.line);
                    }}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {create.isError && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(create.error)}
        </p>
      )}
      <div className="grid gap-1 md:justify-items-start">
        {unmatched.length > 0 && (
          <p className="text-muted-foreground text-sm">
            As linhas das categorias sem correspondência só entram depois de escolher uma.
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Tudo ou nada: se algum lançamento falhar, nenhum entra. Dá para desfazer a importação
          depois.
        </p>
        {/* Fixed above the tab bar on the phone, within reach of the thumb (ADR 0036). */}
        <Button
          // The layout keeps room for it below the footer (data-fab).
          data-fab
          onClick={submit}
          disabled={readyCount === 0 || create.isPending}
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-20 shadow-lg md:static md:shadow-none"
        >
          {create.isPending
            ? 'Importando…'
            : `Importar ${ready.transactions.length} ${ready.transactions.length === 1 ? 'lançamento' : 'lançamentos'}${
                ready.plans.length > 0
                  ? ` e ${ready.plans.length} ${ready.plans.length === 1 ? 'parcelamento' : 'parcelamentos'}`
                  : ''
              }`}
        </Button>
      </div>

      <ResponsiveDialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditing(null)}
        returnFocusTo={triggerRef}
        title={`Linha ${editingRow?.line ?? ''} da ${statement ? 'fatura' : 'planilha'}`}
        description="A mudança vale só para esta importação; o arquivo não muda."
      >
        {editingRow && (
          <ImportRowForm
            row={editingRow}
            categories={categories}
            merchants={merchants}
            sameTitle={sameTitleCount(rows, editingRow)}
            categoryId={resolveCategory(editingRow, categories, matches)}
            onSave={(fixed) => {
              // On a statement, the choices go to the other lines of the same title too.
              setRows((current) => applyToSameTitle(current, fixed));
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
