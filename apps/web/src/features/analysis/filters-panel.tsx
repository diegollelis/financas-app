import {
  formatPeriod,
  MAX_ANALYSIS_MONTHS,
  paymentMethodFieldLabels,
  paymentMethodLabels,
  paymentMethodSchema,
  periodsBetween,
  shiftPeriod,
  transactionTypeLabels,
  type AnalysisFilters,
  type Category,
  type Merchant,
  type PaymentMethod,
} from '@financas/shared';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
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

function CategoryFilter({
  categories,
  type,
  selected,
  onChange,
}: {
  categories: Category[];
  type: AnalysisFilters['type'];
  selected: string[];
  onChange: (categoryIds: string[]) => void;
}) {
  // Archived categories stay: they hold the history being analysed.
  const offered = categories.filter((category) => type === 'BOTH' || category.type === type);
  const label =
    selected.length === 0
      ? 'Todas as categorias'
      : selected.length === 1
        ? (categories.find((category) => category.id === selected[0])?.name ?? '1 categoria')
        : `${selected.length} categorias`;
  const toggle = (categoryId: string, checked: boolean) =>
    onChange(checked ? [...selected, categoryId] : selected.filter((id) => id !== categoryId));

  return (
    <div className="grid gap-2">
      <Label htmlFor="analysis-categories">Categorias</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="analysis-categories"
            variant="outline"
            className="justify-between font-normal"
          >
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 max-w-[calc(100vw-2rem)]">
          {selected.length > 0 && (
            <>
              <DropdownMenuItem onSelect={() => onChange([])}>Todas as categorias</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {offered.map((category) => (
            <DropdownMenuCheckboxItem
              key={category.id}
              checked={selected.includes(category.id)}
              // Stays open: several categories are usually picked in a row.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) => toggle(category.id, checked)}
            >
              {category.name}
              {type === 'BOTH' && (
                <span className="text-muted-foreground ml-auto pl-2 text-sm">
                  {transactionTypeLabels[category.type].lower}
                </span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The payment methods to keep, as toggles (ADR 0037 note): several at once, "Sem meio" last for
 * what was launched without one. Named "Meio de recebimento" when only credits are on screen.
 */
function MethodFilter({
  type,
  selected,
  onChange,
}: {
  type: AnalysisFilters['type'];
  selected: (PaymentMethod | null)[];
  onChange: (paymentMethods: (PaymentMethod | null)[]) => void;
}) {
  const label = paymentMethodFieldLabels[type === 'CREDIT' ? 'CREDIT' : 'DEBIT'];
  const options: (PaymentMethod | null)[] = [...paymentMethodSchema.options, null];
  const toggle = (method: PaymentMethod | null) =>
    onChange(
      selected.includes(method)
        ? selected.filter((item) => item !== method)
        : [...selected, method],
    );
  return (
    <div className="grid gap-2">
      <p id="analysis-methods-label" className="text-sm font-medium">
        {label}
      </p>
      <div role="group" aria-labelledby="analysis-methods-label" className="flex flex-wrap gap-2">
        {options.map((method) => (
          <Button
            key={method ?? 'none'}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={selected.includes(method)}
            onClick={() => toggle(method)}
            className="aria-pressed:border-primary aria-pressed:bg-primary/10 h-11 rounded-full px-3 font-normal aria-pressed:font-medium md:h-8"
          >
            {method === null ? 'Sem meio' : paymentMethodLabels[method]}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The merchants to keep, like the categories: several at once (ADR 0037 note). */
function MerchantFilter({
  merchants,
  selected,
  onChange,
}: {
  merchants: Merchant[];
  selected: string[];
  onChange: (merchantIds: string[]) => void;
}) {
  const label =
    selected.length === 0
      ? 'Todos os estabelecimentos'
      : selected.length === 1
        ? (merchants.find((merchant) => merchant.id === selected[0])?.name ?? '1 estabelecimento')
        : `${selected.length} estabelecimentos`;
  const toggle = (merchantId: string, checked: boolean) =>
    onChange(checked ? [...selected, merchantId] : selected.filter((id) => id !== merchantId));
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="analysis-merchants">Estabelecimentos</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id="analysis-merchants" variant="outline" className="justify-between font-normal">
            <span className="truncate">{label}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 max-w-[calc(100vw-2rem)]">
          {selected.length > 0 && (
            <>
              <DropdownMenuItem onSelect={() => onChange([])}>
                Todos os estabelecimentos
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {merchants.length === 0 ? (
            <DropdownMenuItem disabled>Nenhum estabelecimento cadastrado</DropdownMenuItem>
          ) : (
            // Archived ones stay: they hold the history being analysed.
            merchants.map((merchant) => (
              <DropdownMenuCheckboxItem
                key={merchant.id}
                checked={selected.includes(merchant.id)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => toggle(merchant.id, checked)}
              >
                {merchant.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Period, view, type and categories, then the payment methods and the merchants (ADR 0037 note).
 * Every change goes to the address right away. As a bar (from md), the first four sit in one row
 * from xl and the other two under "Mais filtros", open while any of them is on; in the phone's
 * sheet, everything in one column.
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
  const moreCount =
    (settings.paymentMethods.length > 0 ? 1 : 0) + (settings.merchantIds.length > 0 ? 1 : 0);
  const [moreOpen, setMoreOpen] = useState(moreCount > 0);
  const more = (
    <div
      className={
        layout === 'bar' ? 'grid gap-4 border-t pt-4 xl:grid-cols-[2fr_1fr]' : 'grid gap-4'
      }
    >
      <MethodFilter
        type={settings.type}
        selected={settings.paymentMethods}
        onChange={(paymentMethods) => onChange({ paymentMethods })}
      />
      <MerchantFilter
        merchants={merchants}
        selected={settings.merchantIds}
        onChange={(merchantIds) => onChange({ merchantIds })}
      />
    </div>
  );
  return (
    <div className="grid gap-4">
      <div
        className={
          layout === 'bar'
            ? 'grid items-start gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_1.2fr_auto]'
            : 'grid gap-4'
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
        {settings.preset === 'personalizado' && (
          <div className="grid grid-cols-2 gap-3 md:col-start-1">
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
        <CategoryFilter
          categories={categories}
          type={settings.type}
          selected={settings.categoryIds}
          onChange={(categoryIds) => onChange({ categoryIds })}
        />
        {layout === 'bar' && (
          <Button
            type="button"
            variant="outline"
            aria-expanded={moreOpen}
            aria-controls="analysis-more-filters"
            onClick={() => setMoreOpen((open) => !open)}
            className="justify-self-start"
          >
            Mais filtros{moreCount > 0 && ` (${moreCount})`}
            <ChevronDown aria-hidden className={moreOpen ? 'rotate-180' : undefined} />
          </Button>
        )}
      </div>
      {(layout === 'sheet' || moreOpen) && <div id="analysis-more-filters">{more}</div>}
    </div>
  );
}
