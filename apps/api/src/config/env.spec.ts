import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://test:test@localhost:5434/test',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('defaults to Mailpit in development', () => {
    expect(validateEnv(base)).toMatchObject({ MAIL_TRANSPORT: 'mailpit' });
  });

  it('requires the Resend key when sending with Resend', () => {
    expect(() => validateEnv({ ...base, MAIL_TRANSPORT: 'resend' })).toThrow(/RESEND_API_KEY/);
  });

  it('refuses to start in production without Resend', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/MAIL_TRANSPORT/);
  });

  it('refuses a short auth secret', () => {
    expect(() => validateEnv({ ...base, BETTER_AUTH_SECRET: 'curto' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
});

describe('validateEnv (Google)', () => {
  it('accepts neither or both Google credentials', () => {
    expect(validateEnv(base).GOOGLE_CLIENT_ID).toBeUndefined();
    expect(
      validateEnv({ ...base, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }),
    ).toMatchObject({ GOOGLE_CLIENT_ID: 'id' });
  });

  it('refuses only one of them', () => {
    expect(() => validateEnv({ ...base, GOOGLE_CLIENT_ID: 'id' })).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});
