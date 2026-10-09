import {
  analysisQuerySchema,
  currentPeriod,
  formatPeriod,
  shiftPeriod,
  type AnalysisFilters,
} from '@financas/shared';
import { useSearchParams } from 'react-router';

/**
 * The analysis filters live in the address (ADR 0037), in pt-BR like the page URLs (ADR 0021):
 * ?periodo=3|6|12|ano, or ?de=AAAA-MM&ate=AAAA-MM for a range of one's own; ?visao=efetivado;
 * ?tipo=creditos|debitos; ?categorias=id,id; ?categoria=id, the one open in detail. A link can
 * be shared, and the browser's back button undoes a change (or closes the category). Anything
 * invalid falls back to the default: the last 6 months, planned, all.
 */
export const periodPresets = [
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Últimos 12 meses' },
  { value: 'ano', label: 'Este ano' },
  { value: 'personalizado', label: 'Personalizado' },
] as const;

export type PeriodPreset = (typeof periodPresets)[number]['value'];

const DEFAULT_PRESET = '6';

function presetRange(preset: Exclude<PeriodPreset, 'personalizado'>) {
  const to = currentPeriod();
  if (preset === 'ano') return { from: `${to.slice(0, 4)}-01`, to };
  return { from: shiftPeriod(to, 1 - Number(preset)), to };
}

export interface AnalysisSettings extends AnalysisFilters {
  preset: PeriodPreset;
  from: string;
  to: string;
  /** The category open in detail (?categoria=), or null. */
  categoryId: string | null;
}

function readSettings(params: URLSearchParams): AnalysisSettings {
  const custom = analysisQuerySchema.safeParse({ from: params.get('de'), to: params.get('ate') });
  const asked = periodPresets.find((preset) => preset.value === params.get('periodo'))?.value;
  const preset: PeriodPreset = custom.success
    ? 'personalizado'
    : asked && asked !== 'personalizado'
      ? asked
      : DEFAULT_PRESET;
  const range = custom.success
    ? custom.data
    : presetRange(preset === 'personalizado' ? DEFAULT_PRESET : preset);
  const type = params.get('tipo');
  return {
    preset,
    ...range,
    view: params.get('visao') === 'efetivado' ? 'SETTLED' : 'PLANNED',
    type: type === 'creditos' ? 'CREDIT' : type === 'debitos' ? 'DEBIT' : 'BOTH',
    categoryIds: (params.get('categorias') ?? '').split(',').filter(Boolean),
    categoryId: params.get('categoria'),
  };
}

function writeSettings(settings: AnalysisSettings): URLSearchParams {
  const params = new URLSearchParams();
  if (settings.preset === 'personalizado') {
    params.set('de', settings.from);
    params.set('ate', settings.to);
  } else if (settings.preset !== DEFAULT_PRESET) {
    params.set('periodo', settings.preset);
  }
  if (settings.view === 'SETTLED') params.set('visao', 'efetivado');
  if (settings.type !== 'BOTH')
    params.set('tipo', settings.type === 'CREDIT' ? 'creditos' : 'debitos');
  if (settings.categoryIds.length > 0) params.set('categorias', settings.categoryIds.join(','));
  if (settings.categoryId) params.set('categoria', settings.categoryId);
  return params;
}

/** How many filters differ from the default, shown on the phone's "Filtros" button. */
export function activeFilterCount(settings: AnalysisSettings): number {
  return [
    settings.preset !== DEFAULT_PRESET,
    settings.view !== 'PLANNED',
    settings.type !== 'BOTH',
    settings.categoryIds.length > 0,
  ].filter(Boolean).length;
}

export function useAnalysisSettings() {
  const [params, setParams] = useSearchParams();
  const settings = readSettings(params);
  const update = (change: Partial<AnalysisSettings>) => {
    const next = { ...settings, ...change };
    // Choosing a preset sets its range; "Personalizado" starts from the range on screen.
    if (change.preset && change.preset !== 'personalizado') {
      Object.assign(next, presetRange(change.preset));
    }
    setParams(writeSettings(next));
  };
  return { settings, update };
}

/** Every competência offered in the custom range: three years back and one ahead. */
export function selectablePeriods(): string[] {
  const now = currentPeriod();
  return Array.from({ length: 48 }, (_, index) => shiftPeriod(now, 12 - index));
}

/** "Últimos 6 meses", or "de maio de 2026 a outubro de 2026" for a range of one's own. */
export function describeRange(settings: AnalysisSettings) {
  if (settings.preset !== 'personalizado') {
    return periodPresets.find((preset) => preset.value === settings.preset)?.label ?? '';
  }
  return `De ${formatPeriod(settings.from)} a ${formatPeriod(settings.to)}`;
}
