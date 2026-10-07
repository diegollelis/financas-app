import { authResponseSchema, TERMS_VERSION } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';

// Terms of use acceptance (ADR 0041). All data here is fictitious (ADR 0019).
const user = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

describe('terms of use acceptance', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('refuses an e-mail sign-up without the terms accepted', async () => {
    for (const acceptTerms of [undefined, false]) {
      const response = await t
        .http()
        .post('/api/auth/sign-up/email')
        .send({ ...user, acceptTerms })
        .expect(400);
      expect(response.body).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'Aceite os Termos de uso e a Política de privacidade para criar a conta.',
      });
    }
    expect(await t.prisma.user.count()).toBe(0);
  });

  it('records the version in force with an e-mail sign-up', async () => {
    const before = new Date();
    await t
      .http()
      .post('/api/auth/sign-up/email')
      .send({ ...user, acceptTerms: true })
      .expect(200);

    const stored = await t.prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect(stored.termsVersion).toBe(TERMS_VERSION);
    expect(stored.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('refuses a sign-up that sets the terms version itself', async () => {
    await t
      .http()
      .post('/api/auth/sign-up/email')
      .send({ ...user, acceptTerms: true, termsVersion: '1999-01-01' })
      .expect(400);

    expect(await t.prisma.user.count()).toBe(0);
  });

  it('shows the accepted version in /me', async () => {
    const { browser } = await t.signUp(user);

    const me = await browser.get('/api/me').expect(200);

    expect(me.body).toMatchObject({ email: user.email, termsVersion: TERMS_VERSION });
    expect(me.body).not.toHaveProperty('termsAcceptedAt');
  });

  it('returns the accepted version on sign-in, which the web app keeps as the session', async () => {
    await t.signUp(user);

    const signIn = await t
      .http()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(authResponseSchema.parse(signIn.body).user.termsVersion).toBe(TERMS_VERSION);
  });

  it('records the acceptance of an account that never accepted', async () => {
    const { browser, userId } = await t.signUp(user);
    await t.prisma.user.update({
      where: { id: userId },
      data: { termsVersion: null, termsAcceptedAt: null },
    });
    expect((await browser.get('/api/me').expect(200)).body).toMatchObject({ termsVersion: null });

    const accepted = await browser
      .post('/api/me/terms')
      .send({ version: TERMS_VERSION })
      .expect(200);

    expect(accepted.body).toMatchObject({ id: userId, termsVersion: TERMS_VERSION });
    expect((await browser.get('/api/me').expect(200)).body).toMatchObject({
      termsVersion: TERMS_VERSION,
    });
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.termsAcceptedAt).not.toBeNull();
  });

  it('accepts only the version in force', async () => {
    const { browser } = await t.signUp(user);

    const response = await browser
      .post('/api/me/terms')
      .send({ version: '1999-01-01' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('needs a session to accept', async () => {
    await t.http().post('/api/me/terms').send({ version: TERMS_VERSION }).expect(401);
  });
});
