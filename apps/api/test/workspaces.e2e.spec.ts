import { workspaceListResponseSchema, workspaceSchema } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WorkspacesService } from '../src/workspaces/workspaces.service.js';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';

// Workspaces and members (ADRs 0008 and 0024). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

describe('workspaces', () => {
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

  /** Signs up and returns a browser holding that user's session. */
  async function signUp(user: typeof maria) {
    const browser = t.http();
    await browser.post('/api/auth/sign-up/email').send(user).expect(200);
    return browser;
  }

  it('creates a personal workspace on sign-up, owned by the new user', async () => {
    const browser = await signUp(maria);

    const response = await browser.get('/workspaces').expect(200);

    expect(workspaceListResponseSchema.parse(response.body)).toMatchObject([
      { name: 'Pessoal', isPersonal: true, role: 'OWNER' },
    ]);
  });

  it('requires a session', async () => {
    await t.http().get('/workspaces').expect(401);
    await t.http().post('/workspaces').send({ name: 'Casa' }).expect(401);
  });

  it("lists only the user's own workspaces", async () => {
    const mariaBrowser = await signUp(maria);
    const joaoBrowser = await signUp(joao);
    await joaoBrowser.post('/workspaces').send({ name: 'Viagem do João' }).expect(201);

    const response = await mariaBrowser.get('/workspaces').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body).not.toContainEqual(expect.objectContaining({ name: 'Viagem do João' }));
  });

  it('creates a shared workspace with the caller as OWNER, listed after the personal one', async () => {
    const browser = await signUp(maria);

    const created = await browser.post('/workspaces').send({ name: '  Casa  ' }).expect(201);

    expect(workspaceSchema.parse(created.body)).toMatchObject({
      name: 'Casa',
      isPersonal: false,
      role: 'OWNER',
    });
    const list = await browser.get('/workspaces').expect(200);
    const names = workspaceListResponseSchema.parse(list.body).map((workspace) => workspace.name);
    expect(names).toEqual(['Pessoal', 'Casa']);
  });

  it('validates the new workspace with the shared schema', async () => {
    const browser = await signUp(maria);

    const response = await browser.post('/workspaces').send({ name: '   ' }).expect(400);

    expect(response.body).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Dê um nome ao espaço.',
    });
  });

  it('recreates a missing personal workspace on listing', async () => {
    const browser = await signUp(maria);
    // Simulates a failed hook after sign-up: the user exists without a personal workspace.
    await t.prisma.workspace.deleteMany({ where: { isPersonal: true } });

    const response = await browser.get('/workspaces').expect(200);

    expect(response.body).toMatchObject([{ name: 'Pessoal', isPersonal: true, role: 'OWNER' }]);
  });

  it('never creates two personal workspaces for the same user, even under concurrent calls', async () => {
    await signUp(maria);
    await t.prisma.workspace.deleteMany({ where: { isPersonal: true } });
    const { id: userId } = await t.prisma.user.findFirstOrThrow();
    const workspaces = t.app.get(WorkspacesService);
    // Opens the pool's connections first. Otherwise the first call finishes while the others are
    // still connecting, the calls never overlap, and the test would pass even without the lock.
    await Promise.all(
      Array.from({ length: 10 }, () => t.prisma.$queryRaw`SELECT pg_sleep(0.05)::text AS warmup`),
    );

    await Promise.all(Array.from({ length: 10 }, () => workspaces.ensurePersonalWorkspace(userId)));

    expect(await t.prisma.workspace.count({ where: { isPersonal: true } })).toBe(1);
  });
});
