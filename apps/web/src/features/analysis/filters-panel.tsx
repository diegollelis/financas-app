import {
  formatPeriod,
  MAX_ANALYSIS_MONTHS,
  paymentMethodFieldLabels,
  paymentMethodLabels,
  paymentMethodSchema,
  periodsBetween,
  shiftPeriod,
  transactionTypeLabels,
  type Category,
  type Merchant,
  type PaymentMethod,
} from '@financas/shared';
import { ChevronDown } from 'lucide-react';
import { SegmentedControl } from '@/components/segmented-control';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  periodPresets,
  selectablePeriods,
  type AnalysisSettings,
  type PeriodPreset,
} from './filters';

const viewOptions = [
  { value: 'PLANNED', label: 'Previsto' },
  { value: 'SETTLED', label: 'Realizado' },
] as const;

const typeOptions = [
  { value: 'BOTH', label: 'Todas' },
  { value: 'CREDIT', label: 'Entradas' },
  { value: 'DEBIT', label: 'Saídas' },
] as const;

/** A month picker for the custom range. */
function PeriodSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (period: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {selectablePeriods().map((period) => (
            <SelectItem key={period} value={period}>
              <span className="first-letter:uppercase">{formatPeriod(period)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Keeps a custom range in order and within the limit, moving the other end when needed. */
function fitRange(from: string, to: string, moved: 'from' | 'to') {
  if (from > to) return moved === 'from' ? { from, to: from } : { from: to, to };
  if (periodsBetween(from, to).length <= MAX_ANALYSIS_MONTHS) return { from, to };
  return moved === 'from'
    ? { from, to: shiftPeriod(from, MAX_ANALYSIS_MONTHS - 1) }
    : { from: shiftPeriod(to, 1 - MAX_ANALYSIS_MONTHS), to };
}

interface FilterOption<T> {
  value: T;
  label: string;
  /** Said after the label, muted: "entrada" or "saída" beside a category. */
  hint?: string;
}

/**
 * Several values of one list at once (ADR 0037 note): categories, payment methods, merchants, all
 * in the same menu of checkboxes. The button says what is on ("Todos os meios", "Crédito", "2
 * meios"); the menu stays open while values are picked in a row.
 */
function MultiSelectFilter<T extends string | null>({
  id,
  label,
  allLabel,
  plural,
  options,
  selected,
  empty,
  onChange,
}: {
  id: string;
  label: string;
  /** With nothing picked, and the item that clears the choice: "Todas as categorias". */
  allLabel: string;
  /** "2 categorias". */
  plural: string;
  options: FilterOption<T>[];
  selected: T[];
  /** Said in the menu when the list is empty. */
  empty?: string;
  onChange: (values: T[]) => void;
}) {
  const shown =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((option) => option.value === selected[0])?.label ?? `1 de ${plural}`)
        : `${selected.length} ${plural}`;
  const toggle = (value: T, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id={id} variant="outline" className="justify-between font-normal">
            <span className="truncate">{shown}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 max-w-[calc(100vw-2rem)]">
          {selected.length > 0 && (
            <>
              <DropdownMenuItem onSelect={() => onChange([])}>{allLabel}</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {options.length === 0 && empty ? (
            <DropdownMenuItem disabled>{empty}</DropdownMenuItem>
          ) : (
            options.map((option) => (
              <DropdownMenuCheckboxItem
                key={String(option.value)}
                checked={selected.includes(option.value)}
                // Stays open: several values are usually picked in a row.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => toggle(option.value, checked)}
              >
                {option.label}
                {option.hint && (
                  <span className="text-muted-foreground ml-auto pl-2 text-sm">{option.hint}</span>
                )}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Every payment method of the list, then "Sem meio" for what was launched without one. */
const methodOptions: FilterOption<PaymentMethod | null>[] = [
  ...paymentMethodSchema.options.map((method) => ({
    value: method,
    label: paymentMethodLabels[method],
  })),
  { value: null, label: 'Sem meio' },
];

/**
 * The six filters, every one in sight (ADR 0037 note): period, view and type, then categories,
 * payment methods and merchants, the three lists in the same menu. Every change goes to the
 * address right away. As a bar (from md), two columns, three from xl; in the phone's sheet, one.
 */
export function FiltersPanel({
  settings,
  categories,
  merchants,
  layout,
  onChange,
}: {
  settings: AnalysisSettings;
  categories: Category[];
  merchants: Merchant[];
  layout: 'bar' | 'sheet';
  onChange: (change: Partial<AnalysisSettings>) => void;
}) {
  // Archived categories and merchants stay: they hold the history being analysed.
  const categoryOptions = categories
    .filter((category) => settings.type === 'BOTH' || category.type === settings.type)
    .map((category) => ({
      value: category.id,
      label: category.name,
      hint: settings.type === 'BOTH' ? transactionTypeLabels[category.type].lower : undefined,
    }));
  return (
    <div
      className={
        layout === 'bar' ? 'grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-4'
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="analysis-period">Período</Label>
        <Select
          value={settings.preset}
          onValueChange={(preset) => onChange({ preset: preset as PeriodPreset })}
        >
          <SelectTrigger id="analysis-period" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {periodPresets.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Visão
        </p>
        <SegmentedControl
          label="Visão"
          options={viewOptions}
          value={settings.view}
          onChange={(view) => onChange({ view })}
        />
      </div>
      <div className="grid gap-2">
        <p aria-hidden className="text-sm font-medium">
          Tipo
        </p>
        <SegmentedControl
          label="Tipo"
          options={typeOptions}
          value={settings.type}
          onChange={(type) =>
            onChange({
              type,
              // Categories of the other type would silently show nothing.
              categoryIds: settings.categoryIds.filter((id) => {
                const category = categories.find((item) => item.id === id);
                return type === 'BOTH' || category?.type === type;
              }),
            })
          }
        />
      </div>
      {settings.preset === 'personalizado' && (
        <div className="grid grid-cols-2 gap-3 md:col-span-2 xl:col-span-3">
          <PeriodSelect
            id="analysis-from"
            label="De"
            value={settings.from}
            onChange={(from) => onChange(fitRange(from, settings.to, 'from'))}
          />
          <PeriodSelect
            id="analysis-to"
            label="Até"
            value={settings.to}
            onChange={(to) => onChange(fitRange(settings.from, to, 'to'))}
          />
        </div>
      )}
      <MultiSelectFilter
        id="analysis-categories"
        label="Categorias"
        allLabel="Todas as categorias"
        plural="categorias"
        options={categoryOptions}
        selected={settings.categoryIds}
        onChange={(categoryIds) => onChange({ categoryIds })}
      />
      <MultiSelectFilter
        id="analysis-methods"
        // "Meio de recebimento" when only credits are on screen (ADR 0054).
        label={paymentMethodFieldLabels[settings.type === 'CREDIT' ? 'CREDIT' : 'DEBIT']}
        allLabel="Todos os meios"
        plural="meios"
        options={methodOptions}
        selected={settings.paymentMethods}
        onChange={(paymentMethods) => onChange({ paymentMethods })}
      />
      <MultiSelectFilter
        id="analysis-merchants"
        label="Estabelecimentos"
        allLabel="Todos os estabelecimentos"
        plural="estabelecimentos"
        options={merchants.map((merchant) => ({ value: merchant.id, label: merchant.name }))}
        selected={settings.merchantIds}
        empty="Nenhum estabelecimento cadastrado"
        onChange={(merchantIds) => onChange({ merchantIds })}
      />
    </div>
  );
}
