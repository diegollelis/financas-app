import { accountSecuritySchema } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';

// Managing the account (ADR 0049): the name, the password, and the devices signed in.
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const newPassword = 'nova-senha-de-teste-456';
const pathOf = (link: URL) => `${link.pathname}${link.search}`;

describe('account security', () => {
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

  type Browser = ReturnType<typeof t.http>;

  async function security(browser: Browser) {
    const response = await browser.get('/api/me/security').expect(200);
    return {
      body: response.body as Record<string, unknown>,
      ...accountSecuritySchema.parse(response.body),
    };
  }

  /** Another device: a new browser signing in to the same account. */
  async function signInElsewhere(password = maria.password) {
    const browser = t.http();
    await browser
      .post('/api/auth/sign-in/email')
      .send({ email: maria.email, password })
      .expect(200);
    return browser;
  }

  it('lists the devices signed in, this one first, without tokens or IPs', async () => {
    const { browser } = await t.signUp(maria);
    await signInElsewhere();

    const { hasPassword, sessions, body } = await security(browser);

    expect(hasPassword).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.current).toBe(true);
    expect(sessions[1]?.current).toBe(false);
    // Only what the page shows: a session's token would sign anyone in.
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/token|ipAddress|userAgent/);
  });

  it('answers 401 without a session', async () => {
    await t.http().get('/api/me/security').expect(401);
  });

  it('changes the name, and nothing else the request sends', async () => {
    const { browser, userId } = await t.signUp(maria);

    await browser
      .post('/api/auth/update-user')
      .send({ name: '  Maria Souza  ', image: 'https://example.com/x.png', termsVersion: 'x' })
      .expect(200);

    const user = await ownerClient().user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ name: 'Maria Souza', image: null });
    expect(user.termsVersion).not.toBe('x');
  });

  it('refuses an empty name with the shared message', async () => {
    const { browser } = await t.signUp(maria);

    const response = await browser.post('/api/auth/update-user').send({ name: '  ' }).expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_INPUT', message: 'Informe seu nome.' });
  });

  it('changes the password and always signs the other devices out', async () => {
    const { browser } = await t.signUp(maria);
    const other = await signInElsewhere();

    await browser
      .post('/api/auth/change-password')
      // The request asks to keep the others: the server signs them out anyway.
      .send({ currentPassword: maria.password, newPassword, revokeOtherSessions: false })
      .expect(200);

    await browser.get('/api/me').expect(200);
    await other.get('/api/me').expect(401);
    await signInElsewhere(newPassword);
  });

  it('refuses a wrong current password', async () => {
    const { browser } = await t.signUp(maria);

    await browser
      .post('/api/auth/change-password')
      .send({ currentPassword: 'senha-errada-000', newPassword })
      .expect(400);
  });

  it('signs the other devices out, keeping this one', async () => {
    const { browser } = await t.signUp(maria);
    const other = await signInElsewhere();

    await browser.post('/api/auth/revoke-other-sessions').send({}).expect(200);

    expect((await security(browser)).sessions).toHaveLength(1);
    await other.get('/api/me').expect(401);
  });

  describe('changing the e-mail', () => {
    const newEmail = 'maria.nova@example.com';

    it('confirms through a link to the new address, telling the old one', async () => {
      const { browser, userId } = await t.signUp(maria);
      t.mailer.sent.length = 0;

      await browser
        .post('/api/auth/change-email')
        .send({ newEmail, callbackURL: '/conta' })
        .expect(200);

      // Nothing changes until the new address confirms.
      expect((await ownerClient().user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(
        maria.email,
      );
      expect(t.mailer.sent.map((message) => [message.to, message.subject])).toEqual([
        [newEmail, 'Confirme seu novo e-mail no Finanças'],
        [maria.email, 'Pedido de troca do e-mail da sua conta no Finanças'],
      ]);
      expect(t.mailer.sent[1]?.text).toContain(newEmail);

      await browser.get(pathOf(t.mailer.lastLinkTo(newEmail))).expect(302);

      expect(await ownerClient().user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
        email: newEmail,
        emailVerified: true,
      });
      // The password signs in with the new address.
      await t
        .http()
        .post('/api/auth/sign-in/email')
        .send({ email: newEmail, password: maria.password })
        .expect(200);
    });

    it("answers the same for another account's address, and sends nothing", async () => {
      const { browser } = await t.signUp(maria);
      await t.signUp({ ...maria, email: newEmail });
      t.mailer.sent.length = 0;

      const response = await browser.post('/api/auth/change-email').send({ newEmail }).expect(200);

      expect(response.body).toMatchObject({ status: true });
      expect(t.mailer.sent).toHaveLength(0);
    });

    it('refuses an invalid address with the shared message', async () => {
      const { browser } = await t.signUp(maria);

      const response = await browser
        .post('/api/auth/change-email')
        .send({ newEmail: 'nao-e-email' })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  it('creates a password for an account without one, through the reset link', async () => {
    const { browser, userId } = await t.signUp(maria);
    // As an account created with Google: no password of its own.
    await ownerClient().account.deleteMany({ where: { userId, providerId: 'credential' } });
    expect((await security(browser)).hasPassword).toBe(false);

    await t
      .http()
      .post('/api/auth/request-password-reset')
      .send({ email: maria.email })
      .expect(200);
    const redirect = await t
      .http()
      .get(pathOf(t.mailer.lastLinkTo(maria.email)))
      .expect(302);
    const token = new URL(redirect.headers.location as string).searchParams.get('token');
    await t.http().post('/api/auth/reset-password').send({ newPassword, token }).expect(200);

    // The reset signs every session out; the new password signs in.
    const again = await signInElsewhere(newPassword);
    expect((await security(again)).hasPassword).toBe(true);
  });
});
