import {
  categoryRanking,
  categorySeries,
  formatBasisPoints,
  formatCents,
  merchantRanking,
  type Analysis,
  type Category,
  type CategoryShare,
  type Merchant,
  type MonthlyPoint,
} from '@financas/shared';
import { useRef, useState } from 'react';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SectionCard } from '@/components/section-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { describeRange, type AnalysisSettings } from './filters';
import { MonthlyChart, MonthlyTable } from './monthly-chart';
import { notSpendingCategoryIds } from './series';

/** Past this many, the smallest categories fold into one "Outras" line (dataviz: ≤ 8 classes). */
const VISIBLE = 8;

const categoryName = (categories: Category[], id: string) =>
  categories.find((category) => category.id === id)?.name ?? 'Categoria removida';

/**
 * One category in the ranking: name, total, its bar (proportional to the largest) and, below,
 * the share of the total and the monthly average. The whole line opens the month-by-month view.
 */
export function RankingRow({
  share,
  name,
  largest,
  credit,
  muted = false,
  onOpen,
}: {
  share: Pick<CategoryShare, 'totalCents' | 'averageCents' | 'shareBp'>;
  name: string;
  largest: number;
  credit: boolean;
  /** A gray bar: a line that is not one of its own ("Outras", none). */
  muted?: boolean;
  onOpen?: (button: HTMLButtonElement) => void;
}) {
  const content = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{name}</span>
        <span className="font-semibold tabular-nums">{formatCents(share.totalCents)}</span>
      </span>
      <span aria-hidden className="block h-2">
        <span
          className={cn(
            'block h-full rounded-r-full',
            muted ? 'bg-muted-foreground/40' : credit ? 'bg-chart-1' : 'bg-chart-2',
          )}
          style={{ width: `${Math.max((share.totalCents / largest) * 100, 1)}%` }}
        />
      </span>
      <span className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-sm tabular-nums">
        <span>{formatBasisPoints(share.shareBp)} do total</span>
        <span>média de {formatCents(share.averageCents)} por mês</span>
      </span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          onClick={(event) => onOpen(event.currentTarget)}
          className="hover:bg-muted focus-visible:ring-ring/50 grid min-h-14 w-full gap-1.5 rounded-lg px-3 py-3 text-left outline-none focus-visible:ring-3"
        >
          {content}
        </button>
      ) : (
        <div className="grid gap-1.5 px-3 py-3">{content}</div>
      )}
    </li>
  );
}

/** The smallest categories added up, so the list stays readable. */
function others(rest: CategoryShare[]): CategoryShare {
  return {
    categoryId: 'outras',
    totalCents: rest.reduce((sum, share) => sum + share.totalCents, 0),
    averageCents: rest.reduce((sum, share) => sum + share.averageCents, 0),
    shareBp: rest.reduce((sum, share) => sum + share.shareBp, 0),
  };
}

/**
 * Where one category's money went, merchant by merchant (ADR 0053): "quanto foi para cada
 * mercado". What had no merchant comes last; with none at all, a hint says where to give one.
 */
function MerchantBreakdown({
  analysis,
  settings,
  categoryId,
  merchants,
  credit,
}: {
  analysis: Analysis;
  settings: AnalysisSettings;
  categoryId: string;
  merchants: Merchant[];
  credit: boolean;
}) {
  const ranking = merchantRanking(analysis, categoryId, settings.view);
  const named = ranking.filter((share) => share.merchantId !== null);
  const largest = ranking.reduce((max, share) => Math.max(max, share.totalCents), 1);
  return (
    <section aria-labelledby="analysis-merchants-title" className="grid gap-2">
      <h3 id="analysis-merchants-title" className="font-medium">
        Por estabelecimento
      </h3>
      {named.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum lançamento desta categoria tem estabelecimento no período. Escolha um no
          lançamento, em Mais opções, para ver aqui para onde foi o dinheiro.
        </p>
      ) : (
        <ul className="-mx-3 grid">
          {ranking.map((share) => (
            <RankingRow
              key={share.merchantId ?? 'none'}
              share={share}
              name={
                share.merchantId === null
                  ? 'Sem estabelecimento'
                  : (merchants.find((merchant) => merchant.id === share.merchantId)?.name ??
                    'Estabelecimento removido')
              }
              largest={largest}
              credit={credit}
              muted={share.merchantId === null}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One category month by month, with its average as a reference line, the same in a table, and
 * its merchants.
 */
function CategoryDetail({
  analysis,
  settings,
  categoryId,
  merchants,
  credit,
}: {
  analysis: Analysis;
  settings: AnalysisSettings;
  categoryId: string;
  merchants: Merchant[];
  credit: boolean;
}) {
  const { series, averageCents } = categorySeries(analysis, categoryId, settings.view);
  const points: MonthlyPoint[] = series.map(({ period, cents }) => ({
    period,
    creditsCents: credit ? cents : 0,
    debitsCents: credit ? 0 : cents,
    appliedCents: 0,
    neutralCents: 0,
    balanceCents: 0,
    undatedCreditsCents: 0,
    undatedDebitsCents: 0,
  }));
  const type = credit ? 'CREDIT' : 'DEBIT';
  const total = series.reduce((sum, point) => sum + point.cents, 0);
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-3">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-sm">Total</dt>
          <dd className="text-lg font-semibold">{formatCents(total)}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-sm">Média por mês</dt>
          <dd className="text-lg font-semibold">{formatCents(averageCents)}</dd>
        </div>
      </dl>
      <MonthlyChart
        series={points}
        type={type}
        reference={{ cents: averageCents, label: `Média ${formatCents(averageCents)}` }}
      />
      <MonthlyTable series={points} type={type} />
      <MerchantBreakdown
        analysis={analysis}
        settings={settings}
        categoryId={categoryId}
        merchants={merchants}
        credit={credit}
      />
    </div>
  );
}

/**
 * Where the money went in the range (ADR 0037): the debit categories, largest first; with the
 * type filter on credits, where it came from. Tapping one opens it month by month (?categoria=).
 */
export function CategoryRanking({
  analysis,
  settings,
  categories,
  merchants,
  onChange,
}: {
  analysis: Analysis;
  settings: AnalysisSettings;
  categories: Category[];
  /** The workspace's merchants, to name each one of a category (ADR 0053). */
  merchants: Merchant[];
  onChange: (change: Partial<AnalysisSettings>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const credit = settings.type === 'CREDIT';
  // Applications are not spending, nor is a loan: the saving destinations' categories and the
  // ones marked "Nem renda nem gasto" stay out (ADRs 0047, 0056).
  const ranking = categoryRanking(analysis, settings, notSpendingCategoryIds(categories));
  const folded = !showAll && ranking.length > VISIBLE;
  const shown = folded ? ranking.slice(0, VISIBLE - 1) : ranking;
  const largest = ranking[0]?.totalCents ?? 1;
  const title = credit ? 'Entradas por categoria' : 'Gastos por categoria';
  const open = settings.categoryId
    ? categories.find((category) => category.id === settings.categoryId)
    : undefined;

  return (
    <SectionCard
      title={title}
      help={
        <>
          <p>
            {credit
              ? 'De onde veio o dinheiro no período: o total de cada categoria e a média por mês.'
              : 'Para onde foi o dinheiro no período: o total de cada categoria e a média por mês. Guardar nas metas não é gasto e fica de fora.'}
          </p>
          <p>Toque numa categoria para ver o mês a mês dela e os estabelecimentos.</p>
        </>
      }
    >
      {ranking.length === 0 ? (
        <p className="text-muted-foreground">
          {credit ? 'Nenhuma entrada' : 'Nenhum gasto'} no período.
        </p>
      ) : (
        <>
          <ul className="-mx-3 grid">
            {shown.map((share) => (
              <RankingRow
                key={share.categoryId}
                share={share}
                name={categoryName(categories, share.categoryId)}
                largest={largest}
                credit={credit}
                onOpen={(button) => {
                  opener.current = button;
                  onChange({ categoryId: share.categoryId });
                }}
              />
            ))}
            {folded && (
              <RankingRow
                share={others(ranking.slice(VISIBLE - 1))}
                name={`Outras ${ranking.length - VISIBLE + 1} categorias`}
                largest={largest}
                credit={credit}
                muted
              />
            )}
          </ul>
          {folded && (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => setShowAll(true)}
            >
              Ver todas as {ranking.length} categorias
            </Button>
          )}
        </>
      )}
      <ResponsiveDialog
        open={Boolean(open)}
        onOpenChange={(next) => {
          if (!next) onChange({ categoryId: null });
        }}
        returnFocusTo={opener}
        title={open?.name ?? ''}
        description={`${describeRange(settings)}, ${settings.view === 'SETTLED' ? 'realizado' : 'previsto'}.`}
      >
        {open && (
          <CategoryDetail
            analysis={analysis}
            settings={settings}
            categoryId={open.id}
            merchants={merchants}
            credit={open.type === 'CREDIT'}
          />
        )}
      </ResponsiveDialog>
    </SectionCard>
  );
}
