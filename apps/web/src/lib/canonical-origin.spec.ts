import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from './canonical-origin';

const canonical = 'https://financas.example.com';

describe('canonicalRedirect', () => {
  it('keeps path, search and hash at the canonical origin', () => {
    expect(
      canonicalRedirect(
        'https://financas-app.pages.dev/espacos/1/lancamentos?competencia=2026-10#topo',
        canonical,
      ),
    ).toBe('https://financas.example.com/espacos/1/lancamentos?competencia=2026-10#topo');
  });

  it('stays when already at the canonical origin', () => {
    expect(canonicalRedirect('https://financas.example.com/entrar', canonical)).toBeNull();
  });

  it('stays when no canonical origin is set (previews, development, tests)', () => {
    expect(canonicalRedirect('https://abc123.financas-app.pages.dev/', undefined)).toBeNull();
    expect(canonicalRedirect('http://localhost:5173/', '')).toBeNull();
  });
});
