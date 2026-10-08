import { describe, expect, it } from 'vitest';
import { createPersonInputSchema, shareDescription, splitEvenly } from './person.ts';

describe('splitEvenly', () => {
  it('keeps the leftover cents in your share, the first one', () => {
    expect(splitEvenly(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(splitEvenly(30_000, 2)).toEqual([15_000, 15_000]);
  });

  it('always adds up to the total', () => {
    for (const [total, parts] of [
      [1, 2],
      [99_999, 7],
      [12_345, 4],
    ] as const) {
      expect(splitEvenly(total, parts).reduce((sum, share) => sum + share, 0)).toBe(total);
    }
  });
});

describe('shareDescription', () => {
  it('names whose share it is', () => {
    expect(shareDescription('Ana', 'Jantar de aniversário')).toBe(
      'Ana: parte de Jantar de aniversário',
    );
  });

  it('stays within the description limit', () => {
    const text = shareDescription('Ana', 'x'.repeat(200));
    expect(text).toHaveLength(200);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('createPersonInputSchema', () => {
  it('trims the name and refuses a blank one', () => {
    expect(createPersonInputSchema.parse({ name: '  Ana ' })).toEqual({ name: 'Ana' });
    expect(createPersonInputSchema.safeParse({ name: '   ' }).error?.issues[0]?.message).toBe(
      'Informe o nome da pessoa.',
    );
  });
});
