import {
  formatCents,
  formatIsoDate,
  formatPeriod,
  type Category,
  type Import,
} from '@financas/shared';
import { TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CategorySelect } from '@/features/categories/category-picker';
import { apiErrorMessage } from '@/lib/error-message';
import { ImportRowForm } from './import-row-form';
import {
  groupByPeriod,
  groupTotals,
  readyTransactions,
  resolveCategory,
  toTransaction,
  unmatchedCategories,
  type ReviewRow,
} from './review';
import { useCreateImport } from './use-imports';

const typeLabel = { CREDIT: 'crédito', DEBIT: 'débito' } as const;

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
  problems,
  onToggle,
  onEdit,
}: {
  row: ReviewRow;
  /** The app's category the row goes to, or null while there is none. */
  categoryName: string | null;
  problems: string[];
  onToggle: (included: boolean) => void;
  onEdit: (trigger: HTMLButtonElement) => void;
}) {
  const label = row.description || `Linha ${row.line}`;
  const blocked = problems.length > 0;
  return (
    <li className="flex items-start gap-3 py-3">
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
        <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
          <span>
            {categoryName ?? `${row.categoryName || 'Sem categoria'} (sem correspondência)`}
          </span>
          {row.dueDate && <span>Vence em {formatIsoDate(row.dueDate)}</span>}
          <span>{row.settledAt ? `Efetivado em ${formatIsoDate(row.settledAt)}` : 'Pendente'}</span>
          <span>Linha {row.line}</span>
        </p>
        {[...problems, ...row.warnings].map((message) => (
          <p
            key={message}
            className={
              problems.includes(message)
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
  previousImports,
  onChooseAnother,
  onImported,
}: {
  workspaceId: string;
  initialRows: ReviewRow[];
  categories: Category[];
  previousImports: Import[];
  onChooseAnother: () => void;
  onImported: (firstPeriod: string) => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [matches, setMatches] = useState<ReadonlyMap<string, string>>(new Map());
  // The line being edited; the button that opened it gets the focus back.
  const [editing, setEditing] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const create = useCreateImport(workspaceId);

  const ready = readyTransactions(rows, categories, matches);
  const unmatched = unmatchedCategories(rows, categories).filter(
    (entry) => !matches.has(entry.key),
  );
  const overlapping = overlapsPrevious(previousImports, rows);
  const nameOf = (id: string | null) =>
    categories.find((category) => category.id === id)?.name ?? null;
  const editingRow = rows.find((row) => row.line === editing);

  const update = (line: number, change: (row: ReviewRow) => ReviewRow) =>
    setRows((current) => current.map((row) => (row.line === line ? change(row) : row)));

  const submit = () =>
    create.mutate(
      { transactions: ready },
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
        <p role="status">
          {rows.length} {rows.length === 1 ? 'linha lida' : 'linhas lidas'} da planilha.{' '}
          {ready.length} {ready.length === 1 ? 'pronta' : 'prontas'} para importar.
        </p>
        <Button variant="outline" onClick={onChooseAnother}>
          Escolher outro arquivo
        </Button>
      </div>

      {overlapping.length > 0 && (
        <p role="note" className="bg-muted rounded-lg p-3">
          Você já importou lançamentos dessas competências (
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

      {groupByPeriod(rows).map(({ period, rows: grouped }) => {
        const totals = groupTotals(grouped);
        const titleId = `import-period-${period ?? 'sem'}`;
        return (
          <section key={period ?? 'sem'} aria-labelledby={titleId} className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id={titleId} className="font-medium first-letter:uppercase">
                {period ? formatPeriod(period) : 'Sem competência válida'}
              </h2>
              <span className="text-muted-foreground text-sm tabular-nums">
                Créditos {formatCents(totals.credits)}, débitos {formatCents(totals.debits)}
              </span>
            </div>
            <ul className="divide-y rounded-xl border px-2 md:px-4">
              {grouped.map((row) => {
                const categoryId = resolveCategory(row, categories, matches);
                const result = toTransaction(row, categoryId);
                // "Escolha a categoria" is answered above, for every row of that name at once.
                const problems = result.ok
                  ? []
                  : result.problems.filter(
                      (problem) => !(problem === 'Escolha a categoria.' && row.type),
                    );
                return (
                  <RowItem
                    key={row.line}
                    row={row}
                    categoryName={nameOf(categoryId)}
                    problems={problems}
                    onToggle={(included) =>
                      update(row.line, (current) => ({ ...current, included }))
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
        {/* Fixed above the tab bar on the phone, within reach of the thumb (ADR 0036). */}
        <Button
          onClick={submit}
          disabled={ready.length === 0 || create.isPending}
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-4 z-20 shadow-lg md:static md:shadow-none"
        >
          {create.isPending
            ? 'Importando…'
            : `Importar ${ready.length} ${ready.length === 1 ? 'lançamento' : 'lançamentos'}`}
        </Button>
        {/* Room at the end, so the fixed button never covers the last row on the phone. */}
        <div aria-hidden className="h-12 md:hidden" />
      </div>

      <ResponsiveDialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditing(null)}
        returnFocusTo={triggerRef}
        title={`Linha ${editingRow?.line ?? ''} da planilha`}
        description="A mudança vale só para esta importação; a planilha não muda."
      >
        {editingRow && (
          <ImportRowForm
            row={editingRow}
            categories={categories}
            categoryId={resolveCategory(editingRow, categories, matches)}
            onSave={(fixed) => {
              update(fixed.line, () => fixed);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
