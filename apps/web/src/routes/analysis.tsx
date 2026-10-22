import {
  formatCents,
  formatPeriod,
  monthlySeries,
  paymentMethodLabels,
  periodsBetween,
  previousRange,
  seriesTotals,
  type Analysis,
  type AnalysisFilters,
  type Category,
  type Merchant,
} from '@financas/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { InfoTip } from '@/components/info-tip';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { CARD_CLASS, SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  activeFilterCount,
  clearedFilters,
  describeRange,
  narrowsDown,
  useAnalysisSettings,
  type AnalysisSettings,
} from '@/features/analysis/filters';
import { CategoryRanking } from '@/features/analysis/category-ranking';
import { PaymentMethodRanking } from '@/features/analysis/payment-method-ranking';
import { FiltersPanel } from '@/features/analysis/filters-panel';
import { MonthlyChart, MonthlyTable } from '@/features/analysis/monthly-chart';
import {
  neutralCategoryIds,
  notSpendingCategoryIds,
  savingCategoryIds,
  seriesStyles,
  visibleSeries,
} from '@/features/analysis/series';
import { useAnalysis } from '@/features/analysis/use-analysis';
import { useCategories } from '@/features/categories/use-categories';
import { useMerchants } from '@/features/merchants/use-merchants';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/** One name, or how many: "Crédito", "2 categorias". */
function oneOrCount(names: string[], plural: string) {
  return names.length === 1 ? (names[0] ?? '') : `${names.length} ${plural}`;
}

/**
 * "Últimos 6 meses, previsto, só saídas, Crédito, Mercado Bom Preço": what the numbers below are
 * about, every filter on included (ADR 0037 note).
 */
function describeFilters(
  settings: AnalysisSettings,
  categories: Category[],
  merchants: Merchant[],
) {
  const parts = [describeRange(settings), settings.view === 'SETTLED' ? 'realizado' : 'previsto'];
  if (settings.type !== 'BOTH')
    parts.push(settings.type === 'CREDIT' ? 'só entradas' : 'só saídas');
  if (settings.categoryIds.length > 0) {
    const names = settings.categoryIds.map(
      (id) => categories.find((category) => category.id === id)?.name ?? '',
    );
    parts.push(oneOrCount(names, 'categorias'));
  }
  if (settings.paymentMethods.length > 0) {
    const names = settings.paymentMethods.map((method) =>
      method === null ? 'sem meio' : paymentMethodLabels[method],
    );
    parts.push(oneOrCount(names, 'meios'));
  }
  if (settings.merchantIds.length > 0) {
    const names = settings.merchantIds.map(
      (id) => merchants.find((merchant) => merchant.id === id)?.name ?? '',
    );
    parts.push(oneOrCount(names, 'estabelecimentos'));
  }
  return parts.filter(Boolean).join(', ');
}

/** Colored by sign; the minus sign keeps it readable without color. */
function SignedCents({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-destructive')}>{formatCents(cents)}</span>;
}

type Totals = ReturnType<typeof seriesTotals>;

/**
 * "+ R$ 1.240,00 sobre o período anterior": the same total over the range right before, with the
 * same filters, in one short line (ADR 0037 note). Nothing when that range had no transactions.
 */
function Versus({ cents, before }: { cents: number; before?: number }) {
  if (before === undefined) return null;
  const diff = cents - before;
  return (
    <span className="text-muted-foreground text-sm font-normal">
      {diff === 0
        ? 'Igual ao período anterior'
        : `${diff > 0 ? '+' : '−'} ${formatCents(Math.abs(diff))} sobre o período anterior`}
    </span>
  );
}

/** A labelled total with its comparison under it. */
function Figure({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 content-start gap-0.5">
      <dt className="text-muted-foreground flex items-center text-sm">
        {label}
        {help && <InfoTip term={label}>{help}</InfoTip>}
      </dt>
      <dd className="grid gap-0.5 text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** What the comparison is: the same filters, the months right before. */
const comparisonHelp = (months: number) =>
  months === 1
    ? 'As comparações usam os mesmos filtros no mês anterior.'
    : `As comparações usam os mesmos filtros nos ${months} meses logo antes deste período.`;

const spendingHelp = (
  <p>
    As saídas fora das metas e das categorias "Nem renda nem gasto", pagas ou não. Guardar nas metas
    não é gasto e fica à parte.
  </p>
);

/**
 * The range's totals, in a card; the balance leads when both types are on screen (one hero per
 * view). Spending leaves out applications, shown apart, as on the dashboard (ADR 0047).
 */
function Totals({
  totals,
  previous,
  months,
  type,
  view,
}: {
  totals: Totals;
  /** The same totals over the range right before, when it had anything. */
  previous: Totals | null;
  months: number;
  type: AnalysisFilters['type'];
  view: AnalysisSettings['view'];
}) {
  if (type !== 'BOTH') {
    const credit = type === 'CREDIT';
    const cents = credit ? totals.creditsCents : totals.expensesCents;
    const label = credit ? 'Entradas no período' : 'Gastos no período';
    return (
      <div className={CARD_CLASS}>
        <dl className="grid gap-1">
          <dt className="text-muted-foreground flex items-center">
            {label}
            <InfoTip term={label}>
              {!credit && spendingHelp}
              <p>{comparisonHelp(months)}</p>
            </InfoTip>
          </dt>
          <dd className="grid gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
              {formatCents(cents)}
            </span>
            <Versus
              cents={cents}
              before={
                previous ? (credit ? previous.creditsCents : previous.expensesCents) : undefined
              }
            />
            {!credit && totals.appliedCents > 0 && (
              <span className="text-muted-foreground">
                Além disso, {formatCents(totals.appliedCents)} foram para as metas.
              </span>
            )}
          </dd>
        </dl>
      </div>
    );
  }
  // Planned counts what is still to be put aside too: not "guardado" yet (ADR 0051).
  const applied = view === 'SETTLED' ? 'Guardado' : 'Para guardar';
  return (
    <div className={CARD_CLASS}>
      <dl className="grid gap-1">
        <dt className="text-muted-foreground flex items-center">
          Saldo do período
          <InfoTip term="Saldo do período">
            <p>Entradas menos tudo o que saiu no período: gastos e o que foi para as metas.</p>
            <p>{comparisonHelp(months)}</p>
          </InfoTip>
        </dt>
        <dd className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
          <SignedCents cents={totals.balanceCents} />
        </dd>
      </dl>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Figure label="Entradas">
          {formatCents(totals.creditsCents)}
          <Versus cents={totals.creditsCents} before={previous?.creditsCents} />
        </Figure>
        <Figure label="Gastos" help={spendingHelp}>
          {formatCents(totals.expensesCents)}
          <Versus cents={totals.expensesCents} before={previous?.expensesCents} />
        </Figure>
        <Figure
          label={applied}
          help={
            <p>
              {view === 'SETTLED'
                ? 'O que já foi pago nas metas no período.'
                : 'O que foi lançado para as metas no período, pago ou não.'}
            </p>
          }
        >
          {formatCents(totals.appliedCents)}
          <Versus cents={totals.appliedCents} before={previous?.appliedCents} />
        </Figure>
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
    <div className="grid gap-4">
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
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
  // To name the merchants of a category and to filter by them: the page does not wait for them.
  const merchants = useMerchants(workspace.id);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [asTable, setAsTable] = useState(false);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const ready = analysis.isSuccess && categories.isSuccess;
  const panel = (layout: 'bar' | 'sheet') =>
    categories.isSuccess && (
      <FiltersPanel
        settings={settings}
        categories={categories.data}
        merchants={merchants.data ?? []}
        layout={layout}
        onChange={update}
      />
    );

  return (
    <>
      <PageHeader
        title="Análise"
        description={
          <>
            {describeFilters(settings, categories.data ?? [], merchants.data ?? [])}
            {narrowsDown(settings) && (
              <>
                {' '}
                <button
                  type="button"
                  className="text-primary focus-visible:ring-ring/50 min-h-11 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 md:min-h-0"
                  onClick={() => update(clearedFilters)}
                >
                  Limpar filtros
                </button>
              </>
            )}
          </>
        }
        action={
          !desktop && (
            <Button
              ref={filtersButton}
              variant="outline"
              onClick={() => setFiltersOpen(true)}
              disabled={!categories.isSuccess}
            >
              <SlidersHorizontal aria-hidden />
              {/* Says a filter is on before the sheet is opened. */}
              Filtros
              {activeFilterCount(settings) > 0 && ` (${activeFilterCount(settings)})`}
            </Button>
          )
        }
      />
      {desktop ? (
        <section aria-label="Filtros" className="bg-card rounded-xl border p-4">
          {panel('bar')}
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
            {panel('sheet')}
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
            merchants={merchants.data ?? []}
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
  merchants,
  onChange,
  asTable,
  onToggle,
}: {
  analysis: Analysis;
  /** The range right before, when it had anything; null otherwise or while it loads. */
  before: Analysis | null;
  settings: AnalysisSettings;
  categories: Category[];
  merchants: Merchant[];
  onChange: (change: Partial<AnalysisSettings>) => void;
  asTable: boolean;
  onToggle: () => void;
}) {
  const saving = savingCategoryIds(categories);
  const neutral = neutralCategoryIds(categories);
  const series = monthlySeries(analysis, settings, saving, neutral);
  const previousTotals = before
    ? seriesTotals(monthlySeries(before, settings, saving, neutral))
    : null;
  // One payment method chosen: its ranking would be a single bar (ADR 0037 note).
  const byMethod = settings.paymentMethods.length !== 1;
  // In cards (ADR 0037 note): the totals, month by month across, and the two rankings side by
  // side from xl, so the chart has the width for its months and no column is left half empty.
  return (
    <div className="grid gap-4 xl:gap-6">
      <Totals
        totals={seriesTotals(series)}
        previous={previousTotals}
        months={periodsBetween(analysis.from, analysis.to).length}
        type={settings.type}
        view={settings.view}
      />
      <SectionCard
        title="Mês a mês"
        help={
          <>
            {settings.type === 'BOTH' && (
              <p>
                Saídas: gastos e o que foi guardado. Saldo do mês: entradas menos saídas de cada
                mês.
              </p>
            )}
            <p>Toque num mês para ver os valores e a diferença para o mês anterior.</p>
          </>
        }
        action={
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {asTable ? 'Ver como gráfico' : 'Ver como tabela'}
          </Button>
        }
      >
        {asTable ? (
          <MonthlyTable series={series} type={settings.type} />
        ) : (
          <>
            <Legend type={settings.type} />
            {/* On the phone, to the card's edges: its axis is its own margin, and six months fit. */}
            <div className="-mx-4 min-w-0 md:mx-0">
              <MonthlyChart series={series} type={settings.type} />
            </div>
          </>
        )}
      </SectionCard>
      {/* The categories and how the money went out (ADR 0054). */}
      <div className={cn('grid items-start gap-4 xl:gap-6', byMethod && 'xl:grid-cols-2')}>
        <CategoryRanking
          analysis={analysis}
          settings={settings}
          categories={categories}
          merchants={merchants}
          onChange={onChange}
        />
        {byMethod && (
          <PaymentMethodRanking
            analysis={analysis}
            settings={settings}
            notSpending={notSpendingCategoryIds(categories)}
          />
        )}
      </div>
    </div>
  );
}
