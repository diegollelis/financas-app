import { describe, expect, it } from 'vitest';
import { suggestCategory, type CategoryHints } from './category-hints.ts';

// Fictitious ids (ADR 0019).
const mercado = '01920000-0000-7000-8000-000000000101';
const energia = '01920000-0000-7000-8000-000000000102';
const farmacia = '01920000-0000-7000-8000-000000000103';
const reembolso = '01920000-0000-7000-8000-000000000104';
const bomPreco = '01920000-0000-7000-8000-000000000601';

const hints: CategoryHints = {
  merchants: [{ merchantId: bomPreco, type: 'DEBIT', categoryId: mercado }],
  descriptions: [
    { description: 'conta de luz', type: 'DEBIT', categoryId: energia },
    { description: 'remedios', type: 'DEBIT', categoryId: farmacia },
    { description: 'remedios', type: 'CREDIT', categoryId: reembolso },
  ],
};

describe('suggestCategory', () => {
  it('finds the description ignoring case, accents and extra spaces, of the same type', () => {
    const debit = { type: 'DEBIT' as const, merchantId: null };

    expect(suggestCategory(hints, { ...debit, description: '  Conta  de LUZ ' })).toBe(energia);
    expect(suggestCategory(hints, { ...debit, description: 'Remédios' })).toBe(farmacia);
    expect(
      suggestCategory(hints, { type: 'CREDIT', merchantId: null, description: 'remédios' }),
    ).toBe(reembolso);
  });

  it("prefers the merchant's category to the description's", () => {
    expect(
      suggestCategory(hints, { type: 'DEBIT', merchantId: bomPreco, description: 'Remédios' }),
    ).toBe(mercado);
  });

  it('says nothing for what the history does not know', () => {
    expect(suggestCategory(hints, { type: 'DEBIT', merchantId: null, description: '' })).toBeNull();
    expect(
      suggestCategory(hints, { type: 'DEBIT', merchantId: null, description: 'Cinema' }),
    ).toBeNull();
    expect(
      suggestCategory(hints, { type: 'CREDIT', merchantId: bomPreco, description: 'Cinema' }),
    ).toBeNull();
  });
});
