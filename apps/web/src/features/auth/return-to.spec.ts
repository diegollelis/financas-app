import { describe, expect, it } from 'vitest';
import { withReturnTo } from './return-to';

describe('withReturnTo', () => {
  it('adds the return page, encoded', () => {
    expect(withReturnTo('/entrar', '/convites/a b')).toBe('/entrar?voltar=%2Fconvites%2Fa%20b');
  });

  it('keeps the path clean when returning to the home page', () => {
    expect(withReturnTo('/entrar', '/')).toBe('/entrar');
  });
});
