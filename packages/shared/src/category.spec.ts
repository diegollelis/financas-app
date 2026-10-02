import { describe, expect, it } from 'vitest';
import { createCategoryInputSchema, updateCategoryInputSchema } from './category.ts';

describe('createCategoryInputSchema', () => {
  it('trims the name', () => {
    expect(createCategoryInputSchema.parse({ name: '  Pet  ', type: 'DEBIT' })).toEqual({
      name: 'Pet',
      type: 'DEBIT',
    });
  });

  it('explains a blank or too long name in pt-BR', () => {
    const blank = createCategoryInputSchema.safeParse({ name: '   ', type: 'DEBIT' });
    expect(blank.error?.issues[0]?.message).toBe('Dê um nome à categoria.');
    const long = createCategoryInputSchema.safeParse({ name: 'x'.repeat(51), type: 'CREDIT' });
    expect(long.error?.issues[0]?.message).toBe('Use no máximo 50 caracteres.');
  });

  it('only accepts CREDIT or DEBIT', () => {
    expect(createCategoryInputSchema.safeParse({ name: 'Pet', type: 'OTHER' }).success).toBe(false);
  });
});

describe('updateCategoryInputSchema', () => {
  it('accepts a rename, an archive or both', () => {
    expect(updateCategoryInputSchema.parse({ name: 'Pet' })).toEqual({ name: 'Pet' });
    expect(updateCategoryInputSchema.parse({ archived: true })).toEqual({ archived: true });
  });

  it('refuses an empty change', () => {
    const result = updateCategoryInputSchema.safeParse({});
    expect(result.error?.issues[0]?.message).toBe('Nada para alterar.');
  });

  it('ignores an attempt to change the type', () => {
    expect(updateCategoryInputSchema.parse({ name: 'Pet', type: 'CREDIT' })).toEqual({
      name: 'Pet',
    });
  });
});
