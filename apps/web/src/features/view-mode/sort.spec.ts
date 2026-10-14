import { describe, expect, it } from 'vitest';
import { sortRows } from './sort';

type Row = { name: string; date: string | null; cents: number };

const rows: Row[] = [
  { name: 'Água', date: '2026-10-20', cents: 9_000 },
  { name: 'aluguel', date: null, cents: 150_000 },
  { name: 'Internet', date: '2026-10-05', cents: 9_990 },
  { name: 'Academia', date: '2026-10-05', cents: 9_000 },
];
const names = (sorted: Row[]) => sorted.map((row) => row.name);

describe('sortRows', () => {
  it('orders dates, keeping the given order among equals and empty ones last', () => {
    expect(names(sortRows(rows, (row) => row.date, 'asc'))).toEqual([
      'Internet',
      'Academia',
      'Água',
      'aluguel',
    ]);
    // Inverted, an empty one still goes last.
    expect(names(sortRows(rows, (row) => row.date, 'desc'))).toEqual([
      'Água',
      'Internet',
      'Academia',
      'aluguel',
    ]);
  });

  it('orders text ignoring case and accents', () => {
    expect(names(sortRows(rows, (row) => row.name, 'asc'))).toEqual([
      'Academia',
      'Água',
      'aluguel',
      'Internet',
    ]);
  });

  it('orders amounts as numbers, not as text', () => {
    expect(names(sortRows(rows, (row) => row.cents, 'desc'))).toEqual([
      'aluguel',
      'Internet',
      'Água',
      'Academia',
    ]);
  });

  it('does not change the rows it was given', () => {
    const copy = [...rows];
    sortRows(rows, (row) => row.name, 'asc');
    expect(rows).toEqual(copy);
  });
});
