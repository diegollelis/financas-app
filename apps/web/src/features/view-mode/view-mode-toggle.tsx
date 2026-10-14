import { SegmentedControl } from '@/components/segmented-control';
import { useMediaQuery } from '@/lib/use-media-query';
import { TABLE_QUERY, useViewMode, type TablePage } from './view-mode';

const options = [
  { value: 'LIST', label: 'Lista' },
  { value: 'TABLE', label: 'Tabela' },
] as const;

/** "Ver como: Lista | Tabela", only where a table fits (xl and up). */
export function ViewModeToggle({ page }: { page: TablePage }) {
  const wide = useMediaQuery(TABLE_QUERY);
  const [mode, setMode] = useViewMode(page);
  if (!wide) return null;
  return (
    <SegmentedControl
      label="Ver como"
      options={options}
      value={mode}
      onChange={setMode}
      className="w-48 justify-self-start"
    />
  );
}
