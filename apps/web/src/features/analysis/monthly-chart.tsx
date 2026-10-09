import {
  formatCents,
  formatPeriod,
  type AnalysisFilters,
  type MonthlyPoint,
} from '@financas/shared';
import { useState } from 'react';
import { useElementWidth } from '@/lib/use-element-width';
import { cn } from '@/lib/utils';
import { formatCentsCompact, formatPeriodShort } from './format';
import { seriesStyles, valueOf, visibleSeries } from './series';

// The plot (ADR 0037): one axis in reais, credits and debits as columns side by side, the balance
// as a line. Colors follow the validated order of ADR 0032: credits, debits, balance.
const HEIGHT = 240;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 64 };
/** Below this, a month's columns get too thin to tap: the chart scrolls inside its box instead. */
const MIN_BAND = 44;

/** A round step for about 4 gridlines: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(range: number) {
  const rough = range / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((factor) => factor * power >= rough) ?? 10;
  return step * power;
}

/** A column with rounded top corners, anchored to the baseline (dataviz skill). */
function columnPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

export function MonthlyChart({
  series,
  type,
  reference,
}: {
  series: MonthlyPoint[];
  type: AnalysisFilters['type'];
  /** A dashed line across the months, e.g. the monthly average of one category. */
  reference?: { cents: number; label: string };
}) {
  const { ref, width: boxWidth } = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const keys = visibleSeries(type);
  const columns = keys.filter((key) => key !== 'balance');

  const width = Math.max(boxWidth, MARGIN.left + MARGIN.right + series.length * MIN_BAND);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotWidth / series.length;

  const values = [
    ...series.flatMap((point) => keys.map((key) => valueOf(point, key))),
    ...(reference ? [reference.cents] : []),
  ];
  const step = niceStep(Math.max(...values, 0) - Math.min(...values, 0) || 100_00);
  const top = Math.ceil(Math.max(...values, 1) / step) * step;
  const bottom = Math.floor(Math.min(...values, 0) / step) * step;
  const y = (cents: number) => MARGIN.top + ((top - cents) / (top - bottom)) * plotHeight;
  const ticks = Array.from(
    { length: Math.round((top - bottom) / step) + 1 },
    (_, i) => bottom + i * step,
  );

  const gap = 2;
  const barWidth = Math.min(18, (band - 14 - gap * (columns.length - 1)) / columns.length);
  const groupWidth = barWidth * columns.length + gap * (columns.length - 1);
  const center = (index: number) => MARGIN.left + band * index + band / 2;
  // With narrow months, every other label, so they never collide.
  const labelEvery = band < 40 ? 2 : 1;
  const activePoint = active === null ? undefined : series[active];
  // The month tapped against the one before: the balance with both types, else the one shown.
  const compared = keys.includes('balance') ? 'balance' : keys[0];
  const beforeActive = active === null || active === 0 ? undefined : series[active - 1];
  const change =
    activePoint && beforeActive && compared
      ? valueOf(activePoint, compared) - valueOf(beforeActive, compared)
      : null;

  return (
    <div ref={ref} className="overflow-x-auto">
      <div className="relative" style={{ width }}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${keys.map((key) => seriesStyles[key].label).join(', ')} de ${formatPeriod(series[0]?.period ?? '')} a ${formatPeriod(series.at(-1)?.period ?? '')}. Os valores estão na tabela.`}
          // Hover follows the mouse; a finger "leaves" right after every tap, so touch ignores it.
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') setActive(null);
          }}
          className="block touch-pan-x"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? 'stroke-muted-foreground' : 'stroke-border'}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {formatCentsCompact(tick)}
              </text>
            </g>
          ))}
          {series.map((point, index) => (
            <g key={point.period}>
              {active === index && (
                <rect
                  x={MARGIN.left + band * index}
                  y={MARGIN.top}
                  width={band}
                  height={plotHeight}
                  className="fill-muted"
                />
              )}
              {columns.map((key, column) => {
                const cents = valueOf(point, key);
                const x = center(index) - groupWidth / 2 + column * (barWidth + gap);
                return cents > 0 ? (
                  <path
                    key={key}
                    d={columnPath(x, y(cents), barWidth, y(0) - y(cents))}
                    className={seriesStyles[key].fill}
                  />
                ) : null;
              })}
              {index % labelEvery === 0 && (
                <text
                  x={center(index)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatPeriodShort(point.period)}
                </text>
              )}
            </g>
          ))}
          {reference && (
            // Recessive on purpose: a guide to read the columns against, in text colors.
            <g>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(reference.cents)}
                y2={y(reference.cents)}
                strokeDasharray="4 4"
                className="stroke-muted-foreground"
              />
              <text
                x={width - MARGIN.right}
                y={y(reference.cents) - 6}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {reference.label}
              </text>
            </g>
          )}
          {keys.includes('balance') && (
            <>
              <polyline
                points={series.map((point, i) => `${center(i)},${y(point.balanceCents)}`).join(' ')}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                className="stroke-chart-3"
              />
              {series.map((point, i) => (
                // A ring of the surface around each dot keeps it apart from the columns.
                <circle
                  key={point.period}
                  cx={center(i)}
                  cy={y(point.balanceCents)}
                  r={4}
                  strokeWidth={2}
                  className="fill-chart-3 stroke-background"
                />
              ))}
            </>
          )}
          {/* Tap targets: the whole height of each month, larger than any mark. */}
          {series.map((point, index) => (
            <rect
              key={point.period}
              x={MARGIN.left + band * index}
              y={0}
              width={band}
              height={HEIGHT}
              fill="transparent"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setActive(index);
              }}
              // A tap shows the month; tapping it again hides it. (With a mouse, hover already did.)
              onPointerUp={(event) => {
                if (event.pointerType === 'mouse') return;
                setActive((current) => (current === index ? null : index));
              }}
            />
          ))}
        </svg>
        {activePoint && active !== null && (
          <div
            aria-hidden
            className="bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 grid w-48 gap-1 rounded-lg border p-3 text-sm shadow-md"
            style={{ left: Math.min(Math.max(center(active) - 96, 0), width - 192) }}
          >
            <p className="font-medium first-letter:uppercase">{formatPeriod(activePoint.period)}</p>
            {keys.map((key) => (
              <p key={key} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn('size-2.5 shrink-0 rounded-full', seriesStyles[key].swatch)}
                />
                <span className="text-muted-foreground">{seriesStyles[key].label}</span>
                <span className="ml-auto tabular-nums">
                  {formatCents(valueOf(activePoint, key))}
                </span>
              </p>
            ))}
            {change !== null && beforeActive && compared && (
              <p className="text-muted-foreground border-t pt-1">
                {seriesStyles[compared].label}:{' '}
                {change === 0
                  ? `igual a ${formatPeriod(beforeActive.period).split(' ')[0]}`
                  : `${formatCents(Math.abs(change))} a ${change > 0 ? 'mais' : 'menos'} que em ${formatPeriod(beforeActive.period).split(' ')[0]}`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The same numbers as the chart, for screen readers, keyboards and anyone who prefers them. */
export function MonthlyTable({
  series,
  type,
}: {
  series: MonthlyPoint[];
  type: AnalysisFilters['type'];
}) {
  const keys = visibleSeries(type);
  return (
    <div className="overflow-x-auto">
      <table className="w-full tabular-nums">
        <caption className="sr-only">Valores por competência</caption>
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 text-left font-normal">
              Competência
            </th>
            {keys.map((key) => (
              <th key={key} scope="col" className="py-2 text-right font-normal">
                {seriesStyles[key].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.period} className="border-b last:border-b-0">
              <th scope="row" className="py-2 text-left font-normal first-letter:uppercase">
                {formatPeriod(point.period)}
              </th>
              {keys.map((key) => (
                <td
                  key={key}
                  className={cn('py-2 text-right', valueOf(point, key) < 0 && 'text-destructive')}
                >
                  {formatCents(valueOf(point, key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
