import { describe, expect, it } from 'vitest';
import { detectStatement, statementBanks } from './statement-sources.ts';

// Invented headers and lines (ADR 0019).
describe('detectStatement', () => {
  it('tells a Nubank card statement by its header', () => {
    expect(
      detectStatement('date,title,amount\n2026-10-03,Mercado Exemplo,12.34')?.source.kind,
    ).toBe('CARD_STATEMENT');
  });

  it('tells a Nubank account statement by its header, with accents and a BOM', () => {
    const found = detectStatement(
      '\uFEFFData,Valor,Identificador,Descrição\n03/10/2026,-10.00,abc,Pix enviado',
    );
    expect(found?.bank.label).toBe('Nubank');
    expect(found?.source.kind).toBe('ACCOUNT_STATEMENT');
  });

  it('is null for any other file', () => {
    expect(detectStatement('Competência,Tipo,Descrição\n')).toBeNull();
  });
});

describe('statementBanks', () => {
  it('offers the Nubank card statement now, and its account statement next', () => {
    const nubank = statementBanks.find((bank) => bank.bank === 'NUBANK');
    expect(nubank?.sources.map((source) => [source.kind, source.available])).toEqual([
      ['CARD_STATEMENT', true],
      ['ACCOUNT_STATEMENT', false],
    ]);
  });
});
