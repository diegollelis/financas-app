import type { WorkspaceRole } from '@financas/shared';
import { memberListResponseSchema, workspaceSchema } from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';

// WorkspaceMemberGuard and the routes of one workspace (ADRs 0008 and 0025).
// All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

/** Every route under /workspaces/:workspaceId. New ones go here too. */
const workspaceRoutes: WorkspaceRoute[] = [
  { method: 'get', path: (id) => `/api/workspaces/${id}` },
  { method: 'patch', path: (id) => `/api/workspaces/${id}`, body: { name: 'Invadido' } },
  { method: 'get', path: (id) => `/api/workspaces/${id}/members` },
];

describe('workspace guard', () => {
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

  /** Maria's shared workspace "Casa", with João added under `role` (invitations come later). */
  async function sharedWorkspaceWithJoaoAs(role: WorkspaceRole) {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const member = await t.signUp(joao);
    await t.prisma.member.create({ data: { workspaceId, userId: member.userId, role } });
    return { workspaceId, owner, member };
  }

  describe('isolation between workspaces', () => {
    it('answers 404 to a non-member on every route, and changes nothing', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await expectHiddenFromOutsiders(t, personalWorkspaceId, workspaceRoutes);

      const workspace = await t.prisma.workspace.findUniqueOrThrow({
        where: { id: personalWorkspaceId },
      });
      expect(workspace.name).toBe('Pessoal');
    });

    it('answers the same 404 for a workspace that does not exist or an invalid id', async () => {
      const { browser } = await t.signUp(maria);

      await browser.get('/api/workspaces/01920000-0000-7000-8000-000000000000').expect(404);
      await browser.get('/api/workspaces/nao-e-um-uuid').expect(404);
    });

    it('asks for a session before anything else', async () => {
      const { personalWorkspaceId } = await t.signUp(maria);

      await t.http().get(`/api/workspaces/${personalWorkspaceId}`).expect(401);
    });
  });

  describe('roles', () => {
    it('lets any member read the workspace and its members', async () => {
      const { workspaceId, owner, member } = await sharedWorkspaceWithJoaoAs('VIEWER');

      const workspace = await member.browser.get(`/api/workspaces/${workspaceId}`).expect(200);
      const members = await member.browser
        .get(`/api/workspaces/${workspaceId}/members`)
        .expect(200);

      expect(workspaceSchema.parse(workspace.body)).toMatchObject({ name: 'Casa', role: 'VIEWER' });
      expect(memberListResponseSchema.parse(members.body)).toEqual([
        { userId: owner.userId, name: maria.name, email: maria.email, role: 'OWNER' },
        { userId: member.userId, name: joao.name, email: joao.email, role: 'VIEWER' },
      ]);
    });

    it.each(['VIEWER', 'EDITOR'] as const)('forbids a %s from renaming (403)', async (role) => {
      const { workspaceId, member } = await sharedWorkspaceWithJoaoAs(role);

      await member.browser
        .patch(`/api/workspaces/${workspaceId}`)
        .send({ name: 'Outro nome' })
        .expect(403);
    });

    it('lets the OWNER rename, with the shared validation', async () => {
      const { workspaceId, owner } = await sharedWorkspaceWithJoaoAs('VIEWER');

      const renamed = await owner.browser
        .patch(`/api/workspaces/${workspaceId}`)
        .send({ name: '  Casa da praia ' })
        .expect(200);
      await owner.browser.patch(`/api/workspaces/${workspaceId}`).send({ name: '' }).expect(400);

      expect(workspaceSchema.parse(renamed.body)).toMatchObject({
        name: 'Casa da praia',
        role: 'OWNER',
      });
    });
  });
});
