import { describe, expect, it } from 'vitest';
import {
  currentPeriod,
  formatCents,
  formatIsoDate,
  formatPeriod,
  parseReais,
  reaisInputSchema,
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
