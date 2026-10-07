import { meResponseSchema } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';

// HTTP test against the real test database: Better Auth, Prisma and the guard together.
// All data here is fictitious (ADR 0019).
const user = {
  name: 'Maria Exemplo',
  email: 'maria@example.com',
  password: 'senha-de-teste-123',
  acceptTerms: true,
};

describe('authentication (e-mail and password)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const http = () => t.http();

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('signs up without a session (the e-mail comes first) and stores only a password hash', async () => {
    const agent = http();

    const response = await agent.post('/api/auth/sign-up/email').send(user).expect(200);

    // A password needs a verified e-mail (ADR 0022): no session until the link is opened.
    expect(response.body).toMatchObject({ token: null });
    expect(String(response.headers['set-cookie'] ?? '')).not.toMatch(/session_token=/);
    await agent.get('/api/me').expect(401);
    const account = await t.prisma.account.findFirstOrThrow({
      where: { providerId: 'credential' },
    });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(user.password);
  });

  it('generates UUIDv7 ids', async () => {
    await http().post('/api/auth/sign-up/email').send(user).expect(200);

    const stored = await t.prisma.user.findUniqueOrThrow({ where: { email: user.email } });
    expect(stored.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('answers a repeated sign-up like a new one, without creating a second user', async () => {
    const first = await http().post('/api/auth/sign-up/email').send(user).expect(200);

    // Same status and shape: the answer does not reveal that the e-mail has an account.
    const second = await http()
      .post('/api/auth/sign-up/email')
      .send({ ...user, password: 'senha-de-teste-999' })
      .expect(200);

    expect(Object.keys(second.body as object).sort()).toEqual(
      Object.keys(first.body as object).sort(),
    );
    expect(second.body).toMatchObject({ token: null, user: { email: user.email } });
    expect(await t.prisma.user.count()).toBe(1);
  });

  it('validates sign-up with the shared schema', async () => {
    const response = await http()
      .post('/api/auth/sign-up/email')
      .send({ ...user, name: 'a'.repeat(101) })
      .expect(400);

    expect(response.body).toMatchObject({ message: 'Use no máximo 100 caracteres.' });
    expect(await t.prisma.user.count()).toBe(0);
  });

  it('stores the name trimmed', async () => {
    await http()
      .post('/api/auth/sign-up/email')
      .send({ ...user, name: '  Maria Exemplo  ' })
      .expect(200);

    expect(await t.prisma.user.findFirstOrThrow()).toMatchObject({ name: 'Maria Exemplo' });
  });

  it('rejects sign-in with a wrong password', async () => {
    await http().post('/api/auth/sign-up/email').send(user).expect(200);

    await http()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: 'senha-errada-123' })
      .expect(401);
  });

  it('returns 401 on GET /api/me without a session', async () => {
    await http().get('/api/me').expect(401);
  });

  it('refuses to sign in before the e-mail is verified', async () => {
    await http().post('/api/auth/sign-up/email').send(user).expect(200);

    const response = await http()
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password })
      .expect(403);

    expect(response.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('signs in and returns the user on GET /api/me, honoring the shared contract', async () => {
    await http().post('/api/auth/sign-up/email').send(user).expect(200);
    await t.prisma.user.update({ where: { email: user.email }, data: { emailVerified: true } });
    const agent = http();

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const response = await agent.get('/api/me').expect(200);

    expect(meResponseSchema.strict().parse(response.body)).toMatchObject({
      name: user.name,
      email: user.email,
      emailVerified: true,
    });
  });

  it('signs out and invalidates the session', async () => {
    const { browser: agent } = await t.signUp(user);
    await agent.get('/api/me').expect(200);

    await agent.post('/api/auth/sign-out').expect(200);

    await agent.get('/api/me').expect(401);
    expect(await t.prisma.session.count()).toBe(0);
  });
});
