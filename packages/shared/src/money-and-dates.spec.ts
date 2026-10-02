import { describe, expect, it } from 'vitest';
import {
  currentPeriod,
  formatBasisPoints,
  formatCents,
  formatIsoDate,
  formatPeriod,
  parsePercent,
  parseReais,
  reaisInputSchema,
  shiftPeriod,
  todayIso,
} from './money-and-dates.ts';

// Intl separates "R$" from the number with a non-breaking space.
const nbsp = (text: string) => text.replace(/\u00a0/g, ' ');

describe('formatCents', () => {
  it('formats cents as reais', () => {
    expect(nbsp(formatCents(123_456))).toBe('R$ 1.234,56');
    expect(nbsp(formatCents(5))).toBe('R$ 0,05');
  });
});

describe('parseReais', () => {
  it.each([
    ['1.234,56', 123_456],
    ['1234,56', 123_456],
    ['1234,5', 123_450],
    ['15,', 1_500],
    ['R$ 15', 1_500],
    ['15.90', 1_590],
    ['1.234', 123_400],
    ['1.234.567,89', 123_456_789],
    ['0,01', 1],
  ])('reads %s as %i cents', (text, cents) => {
    expect(parseReais(text)).toBe(cents);
  });

  it.each(['', 'abc', '12,345', '1,2,3', '-5', '12.3456', '1.23.4'])('refuses %j', (text) => {
    expect(parseReais(text)).toBeNull();
  });

  it('never goes through floating point (0,1 + 0,2 problem)', () => {
    expect((parseReais('0,10') ?? 0) + (parseReais('0,20') ?? 0)).toBe(parseReais('0,30'));
  });
});

describe('formatBasisPoints', () => {
  it.each([
    [6_000, '60%'],
    [1_250, '12,5%'],
    [1_255, '12,55%'],
    [0, '0%'],
  ])('formats %i basis points as %s', (basisPoints, text) => {
    expect(formatBasisPoints(basisPoints)).toBe(text);
  });
});

describe('parsePercent', () => {
  it.each([
    ['60', 6_000],
    ['12,5', 1_250],
    ['12.55', 1_255],
    ['5%', 500],
    [' 0 ', 0],
    ['150', 15_000],
  ])('reads %j as %i basis points', (text, basisPoints) => {
    expect(parsePercent(text)).toBe(basisPoints);
  });

  it.each(['', 'abc', '12,555', '-5', '1,2,3', ',5'])('refuses %j', (text) => {
    expect(parsePercent(text)).toBeNull();
  });
});

describe('reaisInputSchema', () => {
  it('turns the text into cents, with messages in pt-BR', () => {
    expect(reaisInputSchema.parse('159,90')).toBe(15_990);
    expect(reaisInputSchema.safeParse('').error?.issues[0]?.message).toBe('Informe o valor.');
    expect(reaisInputSchema.safeParse('abc').error?.issues[0]?.message).toBe(
      'Use um valor como 1.234,56.',
    );
    expect(reaisInputSchema.safeParse('0,00').error?.issues[0]?.message).toBe(
      'O valor precisa ser maior que zero.',
    );
  });
});

describe('shiftPeriod', () => {
  it.each([
    ['2026-10', 1, '2026-11'],
    ['2026-10', -1, '2026-09'],
    ['2026-12', 1, '2027-01'],
    ['2026-01', -1, '2025-12'],
    ['2026-10', -22, '2024-12'],
    ['2026-10', 0, '2026-10'],
  ])('moves %s by %i months to %s', (period, months, shifted) => {
    expect(shiftPeriod(period, months)).toBe(shifted);
  });
});

describe('dates in São Paulo', () => {
  it('uses the São Paulo day, not UTC', () => {
    // 02:00 UTC on Nov 1st is still 23:00 on Oct 31st in São Paulo (UTC-3).
    const now = new Date('2026-11-01T02:00:00Z');
    expect(todayIso(now)).toBe('2026-10-31');
    expect(currentPeriod(now)).toBe('2026-10');
  });

  it('formats dates and competências for people', () => {
    expect(formatIsoDate('2026-10-05')).toBe('05/10/2026');
    expect(formatPeriod('2026-10')).toBe('outubro de 2026');
    expect(formatPeriod('2027-01')).toBe('janeiro de 2027');
  });
});
