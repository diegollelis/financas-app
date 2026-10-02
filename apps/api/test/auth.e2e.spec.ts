import { meResponseSchema } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';

// HTTP test against the real test database: Better Auth, Prisma and the guard together.
// All data here is fictitious (ADR 0019).
const user = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };

describe('authentication (e-mail and password)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  const http = () => t.http();

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('signs up, sets the session cookie and stores only a password hash', async () => {
    const agent = http();

    const response = await agent.post('/api/auth/sign-up/email').send(user).expect(200);

    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/session_token=.+HttpOnly/i)]),
    );
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

  it('rejects a second sign-up with the same e-mail', async () => {
    await http().post('/api/auth/sign-up/email').send(user).expect(200);

    const response = await http().post('/api/auth/sign-up/email').send(user);

    expect(response.status).toBe(422);
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

  it('returns 401 on GET /me without a session', async () => {
    await http().get('/me').expect(401);
  });

  it('signs in and returns the user on GET /me, honoring the shared contract', async () => {
    await http().post('/api/auth/sign-up/email').send(user).expect(200);
    const agent = http();

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: user.email, password: user.password })
      .expect(200);
    const response = await agent.get('/me').expect(200);

    expect(meResponseSchema.strict().parse(response.body)).toMatchObject({
      name: user.name,
      email: user.email,
      emailVerified: false,
    });
  });

  it('signs out and invalidates the session', async () => {
    const agent = http();
    await agent.post('/api/auth/sign-up/email').send(user).expect(200);
    await agent.get('/me').expect(200);

    await agent.post('/api/auth/sign-out').expect(200);

    await agent.get('/me').expect(401);
    expect(await t.prisma.session.count()).toBe(0);
  });
});
