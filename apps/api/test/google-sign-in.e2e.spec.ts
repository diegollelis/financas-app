import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { fakeGoogle, type GoogleProfile } from './fake-google.js';
import { testEnv } from './test-env.js';

// Google sign-in, end to end, with Google's token endpoint faked (ADR 0026).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const mariaOnGoogle: GoogleProfile = { sub: 'google-maria', email: maria.email, name: maria.name };

describe('Google sign-in', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let restoreFetch: (() => void) | undefined;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  afterAll(async () => {
    await t.app.close();
  });

  /**
   * The whole round trip in one browser: ask the API for Google's URL, "come back" from Google
   * to the callback with the state Better Auth generated, and follow the redirect.
   */
  async function signInWithGoogle(profile: GoogleProfile, browser = t.http()) {
    const start = await browser
      .post('/api/auth/sign-in/social')
      .send({ provider: 'google', callbackURL: `${testEnv.WEB_ORIGIN}/` })
      .expect(200);
    const googleUrl = new URL((start.body as { url: string }).url);
    restoreFetch = fakeGoogle(profile);

    const callback = await browser
      .get('/api/auth/callback/google')
      .query({ code: 'fake-code', state: googleUrl.searchParams.get('state') })
      .expect(302);
    return { browser, googleUrl, location: callback.headers.location as string };
  }

  it('sends the browser to Google with our callback', async () => {
    const start = await t
      .http()
      .post('/api/auth/sign-in/social')
      .send({ provider: 'google', callbackURL: `${testEnv.WEB_ORIGIN}/` })
      .expect(200);

    const url = new URL((start.body as { url: string }).url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${testEnv.BETTER_AUTH_URL}/api/auth/callback/google`,
    );
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('creates the user, with a verified e-mail and a personal workspace, and signs in', async () => {
    const { browser, location } = await signInWithGoogle(mariaOnGoogle);

    expect(location).toBe(`${testEnv.WEB_ORIGIN}/`);
    const me = await browser.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ email: maria.email, emailVerified: true });
    const workspaces = await browser.get('/api/workspaces').expect(200);
    expect(workspaces.body).toMatchObject([{ name: 'Pessoal', isPersonal: true, role: 'OWNER' }]);
  });

  it('links Google to a verified account and keeps its password', async () => {
    await t.signUp(maria);
    await t.prisma.user.updateMany({ data: { emailVerified: true } });

    await signInWithGoogle(mariaOnGoogle);

    expect(await t.prisma.user.count()).toBe(1);
    await t
      .http()
      .post('/api/auth/sign-in/email')
      .send({ email: maria.email, password: maria.password })
      .expect(200);
  });

  it('removes the password and sessions of an unverified account taken over by Google (pre-hijacking)', async () => {
    // Someone signs up with Maria's e-mail and a password of their own, without verifying it.
    const intruder = await t.signUp({ ...maria, password: 'senha-de-teste-000' });

    const { browser } = await signInWithGoogle(mariaOnGoogle);

    // Maria gets in through Google...
    await browser.get('/api/me').expect(200);
    // ...and the intruder is out: the old session is gone and the password no longer works.
    await intruder.browser.get('/api/me').expect(401);
    await t
      .http()
      .post('/api/auth/sign-in/email')
      .send({ email: maria.email, password: 'senha-de-teste-000' })
      .expect(401);
    const accounts = await t.prisma.account.findMany({ select: { providerId: true } });
    expect(accounts).toEqual([{ providerId: 'google' }]);
  });

  it('rejects a callback whose state was not issued to this browser', async () => {
    const { googleUrl } = await signInWithGoogle(mariaOnGoogle);
    restoreFetch?.();
    restoreFetch = fakeGoogle({ ...mariaOnGoogle, sub: 'google-outro' });

    const callback = await t
      .http()
      .get('/api/auth/callback/google')
      .query({ code: 'fake-code', state: googleUrl.searchParams.get('state') })
      .expect(302);

    expect(callback.headers.location).toMatch(/error=/);
  });
});
