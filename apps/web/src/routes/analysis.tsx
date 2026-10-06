import {
  formatCents,
  formatPeriod,
  monthlySeries,
  seriesTotals,
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
import { FiltersPanel } from '@/features/analysis/filters-panel';
import { MonthlyChart, MonthlyTable } from '@/features/analysis/monthly-chart';
import { seriesStyles, visibleSeries } from '@/features/analysis/series';
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
      <dd className="text-lg font-semibold">{children}</dd>
    </div>
  );
}

/** The range's totals; the balance leads when both types are on screen (one hero per view). */
function Totals({
  totals,
  type,
}: {
  totals: ReturnType<typeof seriesTotals>;
  type: AnalysisFilters['type'];
}) {
  if (type !== 'BOTH') {
    const credit = type === 'CREDIT';
    return (
      <dl className="grid gap-1">
        <dt className="text-muted-foreground">
          {credit ? 'Recebido no período' : 'Gasto no período'}
        </dt>
        <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatCents(credit ? totals.creditsCents : totals.debitsCents)}
        </dd>
      </dl>
    );
  }
  return (
    <dl className="grid gap-4">
      <div className="grid gap-1">
        <dt className="text-muted-foreground">Saldo do período</dt>
        <dd className="text-4xl font-semibold tracking-tight sm:text-5xl">
          <SignedCents cents={totals.balanceCents} />
        </dd>
      </div>
      <div className="grid sm:grid-cols-2 sm:gap-3">
        <Stat label="Recebido">{formatCents(totals.creditsCents)}</Stat>
        <Stat label="Gasto">{formatCents(totals.debitsCents)}</Stat>
      </div>
    </dl>
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
            settings={settings}
            asTable={asTable}
            onToggle={() => setAsTable((value) => !value)}
          />
        ))}
    </>
  );
}

function Results({
  analysis,
  settings,
  asTable,
  onToggle,
}: {
  analysis: Parameters<typeof monthlySeries>[0];
  settings: AnalysisSettings;
  asTable: boolean;
  onToggle: () => void;
}) {
  const series = monthlySeries(analysis, settings);
  return (
    <>
      <Totals totals={seriesTotals(series)} type={settings.type} />
      <section aria-labelledby="analysis-monthly" className="grid gap-3">
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
    </>
  );
}
