import { describe, expect, it } from 'vitest';
import { meResponseSchema } from './auth.ts';

const validMe = {
  id: '01920000-0000-7000-8000-000000000000',
  name: 'Maria Exemplo',
  email: 'maria@example.com',
  emailVerified: false,
};

describe('meResponseSchema', () => {
  it('accepts a signed-in user', () => {
    expect(meResponseSchema.parse(validMe)).toEqual(validMe);
  });

  it('drops fields outside the contract', () => {
    expect(meResponseSchema.parse({ ...validMe, image: null })).toEqual(validMe);
  });

  it.each([
    { label: 'id that is not a UUID', value: { ...validMe, id: '123' } },
    { label: 'invalid e-mail', value: { ...validMe, email: 'maria' } },
    { label: 'missing emailVerified', value: { ...validMe, emailVerified: undefined } },
  ])('rejects $label', ({ value }) => {
    expect(meResponseSchema.safeParse(value).success).toBe(false);
  });
});
