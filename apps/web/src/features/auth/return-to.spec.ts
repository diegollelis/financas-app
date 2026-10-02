import { describe, expect, it } from 'vitest';
import { safeReturnTo, withReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each([
    ['/convites/abc', '/convites/abc'],
    ['/espacos/1?aba=membros', '/espacos/1?aba=membros'],
    [null, '/'],
    ['', '/'],
    ['https://site-malicioso.com', '/'],
    ['//site-malicioso.com', '/'],
    ['/\\site-malicioso.com', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s -> %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });
});

describe('withReturnTo', () => {
  it('adds the return page, encoded', () => {
    expect(withReturnTo('/entrar', '/convites/a b')).toBe('/entrar?voltar=%2Fconvites%2Fa%20b');
  });

  it('keeps the path clean when returning to the home page', () => {
    expect(withReturnTo('/entrar', '/')).toBe('/entrar');
  });
});
