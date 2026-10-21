import { describe, expect, it } from 'vitest';
import { matchesAmount, matchesSearch } from './filters';

describe('matchesAmount', () => {
  it('finds part of the amount as the page writes it, with or without the thousands dot', () => {
    for (const typed of ['159', '1.159', '1159', '159,9', '1.159,90', 'R$ 1.159,90', ',90'])
      expect(matchesAmount(typed, 115_990), typed).toBe(true);
    expect(matchesAmount('5,00', 500)).toBe(true);
    expect(matchesAmount('0,05', 5)).toBe(true);
  });

  it('leaves out other amounts and text that is not a number', () => {
    expect(matchesAmount('160', 115_990)).toBe(false);
    expect(matchesAmount('159,00', 115_990)).toBe(false);
    expect(matchesAmount('água 10', 1_000)).toBe(false);
    expect(matchesAmount('', 1_000)).toBe(false);
    expect(matchesAmount('R$', 1_000)).toBe(false);
    expect(matchesAmount('.,', 1_000)).toBe(false);
  });
});

describe('matchesSearch', () => {
  it('ignores case and accents, and skips missing texts', () => {
    expect(matchesSearch('AGUA', null, 'Conta de água')).toBe(true);
    expect(matchesSearch('luz', undefined, 'Conta de água')).toBe(false);
    expect(matchesSearch('  ', 'qualquer')).toBe(true);
  });
});
