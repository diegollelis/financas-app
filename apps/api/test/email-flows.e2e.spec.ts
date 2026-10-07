import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { testEnv } from './test-env.js';

// E-mail verification and password reset, end to end: the e-mail is captured by FakeMailer and
// the test opens its link like the user would. All data here is fictitious (ADR 0019).
const user = {
  name: 'Maria Exemplo',
  email: 'maria@example.com',
  password: 'senha-de-teste-123',
  acceptTerms: true,
};

/** Path and query of a link, for supertest (which already targets the test server). */
const pathOf = (link: URL) => `${link.pathname}${link.search}`;

describe('e-mail flows', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    t.mailer.sent.length = 0;
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('e-mail verification', () => {
    it('sends the verification e-mail on sign-up, with a link back to the web app', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);

      const link = t.mailer.lastLinkTo(user.email);
      expect(t.mailer.sent[0]?.subject).toBe('Confirme seu e-mail no Finanças');
      expect(link.pathname).toBe('/api/auth/verify-email');
      expect(link.searchParams.get('callbackURL')).toBe(`${testEnv.WEB_ORIGIN}/`);
    });

    it('verifies the e-mail and signs in when the link is opened', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      const browser = t.http();

      const response = await browser.get(pathOf(t.mailer.lastLinkTo(user.email))).expect(302);

      expect(response.headers.location).toBe(`${testEnv.WEB_ORIGIN}/`);
      expect(await t.prisma.user.findFirstOrThrow()).toMatchObject({ emailVerified: true });
      const me = await browser.get('/api/me').expect(200);
      expect(me.body).toMatchObject({ emailVerified: true });
    });

    it('rejects a tampered link', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      const link = t.mailer.lastLinkTo(user.email);
      link.searchParams.set('token', 'token-adulterado');

      const response = await t.http().get(pathOf(link)).expect(302);

      expect(response.headers.location).toMatch(/[?&]error=/);
      expect(await t.prisma.user.findFirstOrThrow()).toMatchObject({ emailVerified: false });
    });

    it('brings the person back to the page they were heading to, if it is ours', async () => {
      await t
        .http()
        .post('/api/auth/sign-up/email')
        .send({ ...user, callbackURL: '/convites/abc' })
        .expect(200);
      const browser = t.http();

      const response = await browser.get(pathOf(t.mailer.lastLinkTo(user.email))).expect(302);

      expect(response.headers.location).toBe(`${testEnv.WEB_ORIGIN}/convites/abc`);
    });

    it.each(['//site-malicioso.com', '/\\site-malicioso.com'])(
      'sends the link to the home page when the return page is not ours (%s)',
      async (callbackURL) => {
        await t
          .http()
          .post('/api/auth/sign-up/email')
          .send({ ...user, callbackURL })
          .expect(200);

        const link = t.mailer.lastLinkTo(user.email);
        expect(link.searchParams.get('callbackURL')).toBe(`${testEnv.WEB_ORIGIN}/`);
      },
    );

    it('sends a new link when someone signs in with the right password but unverified', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      t.mailer.sent.length = 0;

      await t
        .http()
        .post('/api/auth/sign-in/email')
        .send({ email: user.email, password: user.password, callbackURL: '/convites/abc' })
        .expect(403);

      expect(t.mailer.sent[0]?.subject).toBe('Confirme seu e-mail no Finanças');
      const link = t.mailer.lastLinkTo(user.email);
      expect(link.searchParams.get('callbackURL')).toBe(`${testEnv.WEB_ORIGIN}/convites/abc`);
    });

    it('sends nothing on a sign-in with a wrong password', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      t.mailer.sent.length = 0;

      await t
        .http()
        .post('/api/auth/sign-in/email')
        .send({ email: user.email, password: 'senha-errada-123' })
        .expect(401);

      expect(t.mailer.sent).toHaveLength(0);
    });

    it('tells the owner, not the requester, about a sign-up with an existing e-mail', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      t.mailer.sent.length = 0;

      await t
        .http()
        .post('/api/auth/sign-up/email')
        .send({ ...user, password: 'senha-de-teste-999' })
        .expect(200);

      expect(t.mailer.sent).toHaveLength(1);
      expect(t.mailer.sent[0]).toMatchObject({
        to: user.email,
        subject: 'Você já tem uma conta no Finanças',
      });
      expect(t.mailer.lastLinkTo(user.email).toString()).toBe(`${testEnv.WEB_ORIGIN}/entrar`);
      expect(t.mailer.sent[0]?.text).toContain(`${testEnv.WEB_ORIGIN}/esqueci-senha`);
    });

    it('resends the verification e-mail on request', async () => {
      const browser = t.http();
      await browser.post('/api/auth/sign-up/email').send(user).expect(200);

      await browser
        .post('/api/auth/send-verification-email')
        .send({ email: user.email })
        .expect(200);

      expect(t.mailer.sent).toHaveLength(2);
    });
  });

  describe('password reset', () => {
    const newPassword = 'nova-senha-de-teste-456';

    async function requestReset(email: string) {
      return t.http().post('/api/auth/request-password-reset').send({ email }).expect(200);
    }

    it('answers the same for an unknown e-mail and sends nothing', async () => {
      const response = await requestReset('ninguem@example.com');

      expect(response.body).toMatchObject({ status: true });
      expect(t.mailer.sent).toHaveLength(0);
    });

    it('resets the password through the e-mail link and signs out every session', async () => {
      const { browser: oldBrowser } = await t.signUp(user);
      await oldBrowser.get('/api/me').expect(200);
      await requestReset(user.email);

      // The e-mail link goes to the API, which checks the token and redirects to the web page.
      const link = t.mailer.lastLinkTo(user.email);
      expect(t.mailer.sent.at(-1)?.subject).toBe('Redefina sua senha no Finanças');
      const redirect = await t.http().get(pathOf(link)).expect(302);
      const page = new URL(redirect.headers.location as string);
      expect(`${page.origin}${page.pathname}`).toBe(`${testEnv.WEB_ORIGIN}/redefinir-senha`);
      const token = page.searchParams.get('token');

      await t.http().post('/api/auth/reset-password').send({ newPassword, token }).expect(200);

      await oldBrowser.get('/api/me').expect(401);
      await t
        .http()
        .post('/api/auth/sign-in/email')
        .send({ email: user.email, password: user.password })
        .expect(401);
      await t
        .http()
        .post('/api/auth/sign-in/email')
        .send({ email: user.email, password: newPassword })
        .expect(200);
    });

    it('verifies the e-mail of whoever resets the password through it', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      await requestReset(user.email);
      const token = t.mailer.lastLinkTo(user.email).pathname.split('/').at(-1);
      t.mailer.sent.length = 0;

      await t.http().post('/api/auth/reset-password').send({ newPassword, token }).expect(200);

      expect(await t.prisma.user.findFirstOrThrow()).toMatchObject({ emailVerified: true });
      await t
        .http()
        .post('/api/auth/sign-in/email')
        .send({ email: user.email, password: newPassword })
        .expect(200);
      // Signed in straight away: no second e-mail to verify.
      expect(t.mailer.sent).toHaveLength(0);
    });

    it('accepts each token only once', async () => {
      await t.http().post('/api/auth/sign-up/email').send(user).expect(200);
      await requestReset(user.email);
      const token = t.mailer.lastLinkTo(user.email).pathname.split('/').at(-1);

      await t.http().post('/api/auth/reset-password').send({ newPassword, token }).expect(200);
      await t.http().post('/api/auth/reset-password').send({ newPassword, token }).expect(400);
    });

    it('applies the shared password rules', async () => {
      const response = await t
        .http()
        .post('/api/auth/reset-password')
        .send({ newPassword: '1234567', token: 'qualquer' })
        .expect(400);

      expect(response.body).toMatchObject({
        code: 'INVALID_INPUT',
        message: 'A senha precisa ter pelo menos 8 caracteres.',
      });
    });
  });
});
