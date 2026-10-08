import { describe, expect, it } from 'vitest';
import { evenShareValues, myShareCents, shareCents } from './split';

describe('shareCents', () => {
  it('reads reais typed the Brazilian way', () => {
    expect(shareCents(30_000, '150,00', 'REAIS')).toBe(15_000);
    expect(shareCents(null, '1.234,5', 'REAIS')).toBe(123_450);
  });

  it('takes a percentage of the total, rounded to the cent', () => {
    expect(shareCents(30_000, '50', 'PERCENT')).toBe(15_000);
    expect(shareCents(100_000, '33,33', 'PERCENT')).toBe(33_330);
    expect(shareCents(1_001, '50%', 'PERCENT')).toBe(501);
  });

  it('is null for what is not a share yet', () => {
    expect(shareCents(30_000, '', 'REAIS')).toBeNull();
    expect(shareCents(30_000, '0', 'REAIS')).toBeNull();
    expect(shareCents(30_000, '120', 'PERCENT')).toBeNull();
    expect(shareCents(null, '50', 'PERCENT')).toBeNull();
  });
});

describe('myShareCents', () => {
  it('is the total minus the others, once they are all valid', () => {
    expect(myShareCents(30_000, [15_000])).toBe(15_000);
    expect(myShareCents(30_000, [15_000, null])).toBeNull();
    expect(myShareCents(null, [100])).toBeNull();
  });
});

describe('evenShareValues', () => {
  it('splits equally with you, the leftover staying in your share', () => {
    expect(evenShareValues(100_000, 2, 'REAIS')).toEqual(['333,33', '333,33']);
    expect(evenShareValues(30_000, 1, 'REAIS')).toEqual(['150,00']);
    expect(evenShareValues(30_000, 2, 'PERCENT')).toEqual(['33,33', '33,33']);
  });
});
