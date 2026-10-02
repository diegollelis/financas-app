import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.ts';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', database: 'up' })).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('accepts a degraded response', () => {
    expect(healthResponseSchema.safeParse({ status: 'degraded', database: 'down' }).success).toBe(
      true,
    );
  });

  it.each([
    { label: 'unknown status', value: { status: 'up', database: 'up' } },
    { label: 'missing database', value: { status: 'ok' } },
    { label: 'not an object', value: 'ok' },
  ])('rejects $label', ({ value }) => {
    expect(healthResponseSchema.safeParse(value).success).toBe(false);
  });
});
