import { describe, expect, it } from 'vitest';
import { findMerchantByAlias, normalizeStatementTitle } from './merchant-alias.ts';

// Fictitious titles and merchants only (ADR 0019).
const pizzaria = { id: 'pizzaria', aliases: [{ alias: 'Ifd*Pizzaria Exemplo' }] };
const loja = { id: 'loja', aliases: [{ alias: 'Loja.Exemplo' }] };
const lojaOnline = { id: 'loja-online', aliases: [{ alias: 'Loja.Exemplo Online' }] };

describe('normalizeStatementTitle', () => {
  it('drops case, accents, extra spaces and the installment at the end', () => {
    expect(normalizeStatementTitle('  IFD*Pizzaria   Éxemplo - Parcela 3/10 ')).toBe(
      'ifd*pizzaria exemplo',
    );
    expect(normalizeStatementTitle('Loja Exemplo Parcela 1/2')).toBe('loja exemplo');
  });
});

describe('findMerchantByAlias', () => {
  it('finds the merchant whose alias begins the title, whatever comes after it', () => {
    expect(findMerchantByAlias('Loja.Exemplo* H2m9u1', [pizzaria, loja])).toBe('loja');
    expect(findMerchantByAlias('IFD*PIZZARIA EXEMPLO - Parcela 2/3', [pizzaria, loja])).toBe(
      'pizzaria',
    );
  });

  it('takes the longest alias when more than one begins the title', () => {
    expect(findMerchantByAlias('Loja.Exemplo Online 123', [loja, lojaOnline])).toBe('loja-online');
    expect(findMerchantByAlias('Loja.Exemplo Centro', [lojaOnline, loja])).toBe('loja');
  });

  it('finds none when no alias begins the title', () => {
    expect(findMerchantByAlias('Mercado Exemplo', [pizzaria, loja])).toBeNull();
    expect(findMerchantByAlias('Exemplo Ifd*Pizzaria', [pizzaria])).toBeNull();
  });
});
