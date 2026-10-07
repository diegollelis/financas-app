import { describe, expect, it } from 'vitest';
import {
  acceptTermsInputSchema,
  meResponseSchema,
  resetPasswordFormSchema,
  safeReturnTo,
  signInInputSchema,
  signUpInputSchema,
  TERMS_VERSION,
} from './auth.ts';

const validMe = {
  id: '01920000-0000-7000-8000-000000000000',
  name: 'Maria Exemplo',
  email: 'maria@example.com',
  emailVerified: false,
  termsVersion: null,
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
    { label: 'missing termsVersion', value: { ...validMe, termsVersion: undefined } },
  ])('rejects $label', ({ value }) => {
    expect(meResponseSchema.safeParse(value).success).toBe(false);
  });
});

describe('signUpInputSchema', () => {
  const valid = {
    name: 'Maria Exemplo',
    email: 'maria@example.com',
    password: '12345678',
    acceptTerms: true,
  };

  it('accepts valid input and trims the name', () => {
    expect(signUpInputSchema.parse({ ...valid, name: '  Maria Exemplo ' })).toEqual(valid);
  });

  it.each([
    { label: 'blank name', value: { ...valid, name: '   ' }, message: 'Informe seu nome.' },
    {
      label: 'name over 100 characters',
      value: { ...valid, name: 'a'.repeat(101) },
      message: 'Use no máximo 100 caracteres.',
    },
    {
      label: 'invalid e-mail',
      value: { ...valid, email: 'maria' },
      message: 'Informe um e-mail válido.',
    },
    {
      label: 'short password',
      value: { ...valid, password: '1234567' },
      message: 'A senha precisa ter pelo menos 8 caracteres.',
    },
    {
      label: 'long password',
      value: { ...valid, password: 'a'.repeat(129) },
      message: 'A senha pode ter no máximo 128 caracteres.',
    },
    ...[false, undefined].map((acceptTerms) => ({
      label: `terms not accepted (${String(acceptTerms)})`,
      value: { ...valid, acceptTerms },
      message: 'Aceite os Termos de uso e a Política de privacidade para criar a conta.',
    })),
  ])('rejects $label with a pt-BR message', ({ value, message }) => {
    const result = signUpInputSchema.safeParse(value);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe('acceptTermsInputSchema', () => {
  it('accepts only the version in force', () => {
    expect(acceptTermsInputSchema.safeParse({ version: TERMS_VERSION }).success).toBe(true);
    expect(
      acceptTermsInputSchema.safeParse({ version: '1999-01-01' }).error?.issues[0]?.message,
    ).toBe('Estes termos mudaram. Recarregue a página e leia de novo.');
  });
});

describe('signInInputSchema', () => {
  it('requires a password but does not enforce the sign-up rules on it', () => {
    expect(signInInputSchema.safeParse({ email: 'maria@example.com', password: 'x' }).success).toBe(
      true,
    );
    expect(signInInputSchema.safeParse({ email: 'maria@example.com', password: '' }).success).toBe(
      false,
    );
  });
});

describe('resetPasswordFormSchema', () => {
  it('accepts matching passwords', () => {
    expect(
      resetPasswordFormSchema.safeParse({ password: '12345678', confirmPassword: '12345678' })
        .success,
    ).toBe(true);
  });

  it('points the mismatch at the confirmation field', () => {
    const result = resetPasswordFormSchema.safeParse({
      password: '12345678',
      confirmPassword: '87654321',
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['confirmPassword'],
      message: 'As senhas não conferem.',
    });
  });
});

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
