import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { testEnv } from './test-env.js';

// Rate limit of the auth routes (ADR 0023): per client IP and route, counters in the database.
// All data here is fictitious (ADR 0019).
const user = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const attacker = '203.0.113.7';

describe('rate limit', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    t.mailer.sent.length = 0;
    // A verified user: the right password signs in (ADR 0022).
    await t.signUp(user);
    t.mailer.sent.length = 0;
  });

  afterAll(async () => {
    await t.app.close();
  });

  const signIn = (ip: string, password: string) =>
    t.http({ ip }).post('/api/auth/sign-in/email').send({ email: user.email, password });

  it('blocks password guessing after 5 attempts per minute, even with the right password', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await signIn(attacker, `chute-${attempt}`).expect(401);
    }

    const blocked = await signIn(attacker, user.password).expect(429);

    expect(Number(blocked.headers['x-retry-after'])).toBeGreaterThan(0);
    // CORS lets the web app read it, to tell the user how long to wait.
    expect(blocked.headers['access-control-expose-headers']).toMatch(/X-Retry-After/i);
  });

  it('counts each client IP separately', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await signIn(attacker, `chute-${attempt}`).expect(401);
    }

    await signIn('203.0.113.8', user.password).expect(200);
  });

  it('keeps the counters in the database, so a restart does not reset them', async () => {
    await signIn(attacker, 'chute').expect(401);

    const counter = await t.prisma.rateLimit.findFirstOrThrow({
      where: { key: { startsWith: attacker } },
    });
    expect(counter).toMatchObject({ count: 1 });
  });

  it('limits password reset e-mails to 3 per 5 minutes', async () => {
    const requestReset = () =>
      t.http({ ip: attacker }).post('/api/auth/request-password-reset').send({ email: user.email });

    for (let attempt = 1; attempt <= 3; attempt++) await requestReset().expect(200);
    await requestReset().expect(429);

    expect(t.mailer.sent).toHaveLength(3);
  });

  it('limits sign-ups to 3 per minute', async () => {
    const signUp = (n: number) =>
      t
        .http({ ip: attacker })
        .post('/api/auth/sign-up/email')
        .send({ ...user, email: `conta${n}@example.com` });

    for (let n = 1; n <= 3; n++) await signUp(n).expect(200);
    await signUp(4).expect(429);
  });

  describe('client IP told by the proxy (ADR 0033)', () => {
    /** A request that claims an IP by itself, without going through our proxy. */
    const forgedSignIn = (ip: string, secret?: string) => {
      const req = request(t.app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('Origin', testEnv.WEB_ORIGIN)
        .set('X-Client-IP', ip);
      return (secret ? req.set('X-Proxy-Secret', secret) : req).send({
        email: user.email,
        password: 'chute',
      });
    };

    it('ignores an IP sent without the proxy secret, so forging one does not dodge the limit', async () => {
      for (let n = 1; n <= 5; n++) await forgedSignIn(`203.0.113.${n}`).expect(401);

      await forgedSignIn('203.0.113.99').expect(429);
    });

    it('ignores an IP sent with the wrong secret', async () => {
      for (let n = 1; n <= 5; n++) {
        await forgedSignIn(`203.0.113.${n}`, 'segredo-errado-'.repeat(3)).expect(401);
      }

      await forgedSignIn('203.0.113.99', 'segredo-errado-'.repeat(3)).expect(429);
      const counters = await t.prisma.rateLimit.findMany();
      expect(counters.some((c) => c.key.startsWith('203.0.113.'))).toBe(false);
    });
  });
});
