import {
  formatPeriod,
  MAX_ANALYSIS_MONTHS,
  periodsBetween,
  shiftPeriod,
  type AnalysisFilters,
  type Category,
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
  { value: 'SETTLED', label: 'Efetivado' },
] as const;

const typeOptions = [
  { value: 'BOTH', label: 'Ambos' },
  { value: 'CREDIT', label: 'Créditos' },
  { value: 'DEBIT', label: 'Débitos' },
] as const;

/** A competência picker for the custom range. */
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
                  {category.type === 'CREDIT' ? 'crédito' : 'débito'}
                </span>
              )}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Period, view, type and categories. Every change goes to the address right away. */
export function FiltersPanel({
  settings,
  categories,
  onChange,
}: {
  settings: AnalysisSettings;
  categories: Category[];
  onChange: (change: Partial<AnalysisSettings>) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
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
    </div>
  );
}
