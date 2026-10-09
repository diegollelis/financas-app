import {
  formatCents,
  formatPeriod,
  monthlySeries,
  periodsBetween,
  previousRange,
  seriesTotals,
  type Analysis,
  type AnalysisFilters,
  type Category,
} from '@financas/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  describeRange,
  useAnalysisSettings,
  type AnalysisSettings,
} from '@/features/analysis/filters';
import { CategoryRanking } from '@/features/analysis/category-ranking';
import { FiltersPanel } from '@/features/analysis/filters-panel';
import { MonthlyChart, MonthlyTable } from '@/features/analysis/monthly-chart';
import { savingCategoryIds, seriesStyles, visibleSeries } from '@/features/analysis/series';
import { useAnalysis } from '@/features/analysis/use-analysis';
import { useCategories } from '@/features/categories/use-categories';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/** "Últimos 6 meses, previsto, só débitos, 2 categorias": what the numbers below are about. */
function describeFilters(settings: AnalysisSettings, categories: Category[]) {
  const parts = [describeRange(settings), settings.view === 'SETTLED' ? 'efetivado' : 'previsto'];
  if (settings.type !== 'BOTH')
    parts.push(settings.type === 'CREDIT' ? 'só créditos' : 'só débitos');
  if (settings.categoryIds.length === 1) {
    parts.push(categories.find((category) => category.id === settings.categoryIds[0])?.name ?? '');
  } else if (settings.categoryIds.length > 1) {
    parts.push(`${settings.categoryIds.length} categorias`);
  }
  return parts.filter(Boolean).join(', ');
}

/** Colored by sign; the minus sign keeps it readable without color. */
function SignedCents({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-destructive')}>{formatCents(cents)}</span>;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 sm:grid sm:justify-start sm:gap-1 sm:rounded-xl sm:border sm:p-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="grid justify-items-end gap-0.5 text-lg font-semibold sm:justify-items-start">
        {children}
      </dd>
    </div>
  );
}

type Totals = ReturnType<typeof seriesTotals>;

/**
 * "R$ 1.240,00 a mais que nos 6 meses anteriores": the same total over the range right before,
 * with the same filters. Nothing when that range had no transactions at all.
 */
function Versus({ cents, before, months }: { cents: number; before?: number; months: number }) {
  if (before === undefined) return null;
  const span = months === 1 ? 'no mês anterior' : `nos ${months} meses anteriores`;
  const diff = cents - before;
  return (
    <span className="text-muted-foreground text-sm font-normal">
      {diff === 0
        ? `O mesmo que ${span}.`
        : `${formatCents(Math.abs(diff))} a ${diff > 0 ? 'mais' : 'menos'} que ${span}.`}
    </span>
  );
}

/**
 * The range's totals; the balance leads when both types are on screen (one hero per view).
 * Spending leaves out applications, shown apart, as on the dashboard (ADR 0047).
 */
function Totals({
  totals,
  previous,
  months,
  type,
}: {
  totals: Totals;
  /** The same totals over the range right before, when it had anything. */
  previous: Totals | null;
  months: number;
  type: AnalysisFilters['type'];
}) {
  if (type !== 'BOTH') {
    const credit = type === 'CREDIT';
    const cents = credit ? totals.creditsCents : totals.expensesCents;
    return (
      <dl className="grid gap-1">
        <dt className="text-muted-foreground">
          {credit ? 'Recebido no período' : 'Gasto no período'}
        </dt>
        <dd className="grid gap-1">
          <span className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {formatCents(cents)}
          </span>
          <Versus
            cents={cents}
            before={
              previous ? (credit ? previous.creditsCents : previous.expensesCents) : undefined
            }
            months={months}
          />
          {!credit && totals.appliedCents > 0 && (
            <span className="text-muted-foreground">
              Além disso, {formatCents(totals.appliedCents)} aplicados nos destinos de guardar.
            </span>
          )}
        </dd>
      </dl>
    );
  }
  // Two lists, not one: a <dl> holds only <dt>/<dd> groups, each in at most one <div>.
  return (
    <div className="grid gap-4">
      <dl className="grid gap-1">
        <dt className="text-muted-foreground">Saldo do período</dt>
        <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">
          <SignedCents cents={totals.balanceCents} />
        </dd>
      </dl>
      <dl className="grid sm:grid-cols-3 sm:gap-3">
        <Stat label="Recebido">
          {formatCents(totals.creditsCents)}
          <Versus cents={totals.creditsCents} before={previous?.creditsCents} months={months} />
        </Stat>
        <Stat label="Gasto">
          {formatCents(totals.expensesCents)}
          <Versus cents={totals.expensesCents} before={previous?.expensesCents} months={months} />
        </Stat>
        <Stat label="Aplicado">{formatCents(totals.appliedCents)}</Stat>
      </dl>
    </div>
  );
}

function Legend({ type }: { type: AnalysisFilters['type'] }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {visibleSeries(type).map((key) => (
        <li key={key} className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'shrink-0',
              seriesStyles[key].swatch,
              key === 'balance' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm',
            )}
          />
          {seriesStyles[key].label}
        </li>
      ))}
    </ul>
  );
}

function AnalysisSkeleton() {
  return (
    <>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-12 w-56" />
      </div>
      <Skeleton className="h-60" />
    </>
  );
}

export function AnalysisPage() {
  const workspace = useCurrentWorkspace();
  const { settings, update } = useAnalysisSettings();
  const analysis = useAnalysis(workspace.id, settings.from, settings.to);
  // The range right before, of the same length, to say if it went up or down.
  const previous = previousRange(settings.from, settings.to);
  const before = useAnalysis(workspace.id, previous.from, previous.to);
  const categories = useCategories(workspace.id);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const ready = analysis.isSuccess && categories.isSuccess;
  const panel = categories.isSuccess && (
    <FiltersPanel settings={settings} categories={categories.data} onChange={update} />
  );

  return (
    <>
      <PageHeader
        title="Análise"
        description={describeFilters(settings, categories.data ?? [])}
        action={
          !desktop && (
            <Button
              ref={filtersButton}
              variant="outline"
              onClick={() => setFiltersOpen(true)}
              disabled={!categories.isSuccess}
            >
              <SlidersHorizontal aria-hidden />
              Filtros
            </Button>
          )
        }
      />
      {desktop ? (
        <section aria-label="Filtros" className="rounded-xl border p-4">
          {panel}
        </section>
      ) : (
        <ResponsiveDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          returnFocusTo={filtersButton}
          title="Filtros"
          description="Os números mudam assim que você escolhe."
        >
          <div className="grid gap-6">
            {panel}
            <Button onClick={() => setFiltersOpen(false)}>Ver resultado</Button>
          </div>
        </ResponsiveDialog>
      )}
      <QueryState queries={[analysis, categories]} skeleton={<AnalysisSkeleton />} />
      {ready &&
        (analysis.data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5">
            <p>
              Nenhum lançamento de {formatPeriod(settings.from)} a {formatPeriod(settings.to)}.
            </p>
          </div>
        ) : (
          <Results
            analysis={analysis.data}
            before={before.isSuccess && before.data.rows.length > 0 ? before.data : null}
            settings={settings}
            categories={categories.data}
            onChange={update}
            asTable={asTable}
            onToggle={() => setAsTable((value) => !value)}
          />
        ))}
    </>
  );
}

function Results({
  analysis,
  before,
  settings,
  categories,
  onChange,
  asTable,
  onToggle,
}: {
  analysis: Analysis;
  /** The range right before, when it had anything; null otherwise or while it loads. */
  before: Analysis | null;
  settings: AnalysisSettings;
  categories: Category[];
  onChange: (change: Partial<AnalysisSettings>) => void;
  asTable: boolean;
  onToggle: () => void;
}) {
  const saving = savingCategoryIds(categories);
  const series = monthlySeries(analysis, settings, saving);
  const previousTotals = before ? seriesTotals(monthlySeries(before, settings, saving)) : null;
  // One column up to xl; from there, month by month beside the categories (ADR 0045).
  return (
    <div className="grid gap-6 xl:grid-cols-2 xl:gap-x-10 xl:gap-y-8">
      <div className="xl:col-span-2">
        <Totals
          totals={seriesTotals(series)}
          previous={previousTotals}
          months={periodsBetween(analysis.from, analysis.to).length}
          type={settings.type}
        />
      </div>
      <section aria-labelledby="analysis-monthly" className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="analysis-monthly" className="font-medium">
            Mês a mês
          </h2>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {asTable ? 'Ver como gráfico' : 'Ver como tabela'}
          </Button>
        </div>
        {asTable ? (
          <MonthlyTable series={series} type={settings.type} />
        ) : (
          <>
            <Legend type={settings.type} />
            <MonthlyChart series={series} type={settings.type} />
            <p className="text-muted-foreground text-sm">Toque num mês para ver os valores.</p>
          </>
        )}
      </section>
      <CategoryRanking
        analysis={analysis}
        settings={settings}
        categories={categories}
        onChange={onChange}
      />
    </div>
  );
}
