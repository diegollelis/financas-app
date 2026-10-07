import {
  categoryListResponseSchema,
  currentPeriod,
  memberListResponseSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';
import { expectHiddenFromOutsiders } from './isolation.js';

// Removing members and deleting a shared workspace. All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };
const ana = { name: 'Ana Exemplo', email: 'ana@example.com', password: 'senha-de-teste-789' };

const SOME_ID = '01920000-0000-7000-8000-000000000000';

describe('workspace members and deletion', () => {
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

  /** Maria owns "Casa"; João edits it and Ana views it. */
  async function house() {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const workspaceId = workspaceSchema.parse(created.body).id;
    const editor = await t.signUp(joao);
    const viewer = await t.signUp(ana);
    await t.prisma.member.createMany({
      data: [
        { workspaceId, userId: editor.userId, role: 'EDITOR' },
        { workspaceId, userId: viewer.userId, role: 'VIEWER' },
      ],
    });
    return { owner, editor, viewer, workspaceId, base: `/api/workspaces/${workspaceId}` };
  }

  async function memberIds(browser: ReturnType<typeof t.http>, base: string) {
    const response = await browser.get(`${base}/members`).expect(200);
    return memberListResponseSchema.parse(response.body).map((member) => member.userId);
  }

  describe('removing a member', () => {
    it('lets the OWNER remove someone, who loses access at once', async () => {
      const { owner, editor, viewer, base } = await house();

      await owner.browser.delete(`${base}/members/${editor.userId}`).expect(204);

      expect(await memberIds(owner.browser, base)).toEqual([owner.userId, viewer.userId]);
      await editor.browser.get(base).expect(404);
    });

    it('lets any other member leave on their own', async () => {
      const { owner, viewer, base } = await house();

      await viewer.browser.delete(`${base}/members/${viewer.userId}`).expect(204);

      expect(await memberIds(owner.browser, base)).not.toContain(viewer.userId);
      await viewer.browser.get(base).expect(404);
    });

    it('does not let a member remove someone else', async () => {
      const { editor, viewer, base } = await house();

      const response = await editor.browser.delete(`${base}/members/${viewer.userId}`).expect(403);

      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('never removes the OWNER, not even by themselves', async () => {
      const { owner, editor, base } = await house();

      const response = await owner.browser.delete(`${base}/members/${owner.userId}`).expect(409);

      expect(response.body).toMatchObject({ code: 'OWNER_STAYS' });
      await editor.browser.delete(`${base}/members/${owner.userId}`).expect(403);
    });

    it('answers 404 for someone who is not a member, or an id that is not one', async () => {
      const { owner, base } = await house();

      await owner.browser.delete(`${base}/members/${SOME_ID}`).expect(404);
      await owner.browser.delete(`${base}/members/not-an-id`).expect(404);
    });
  });

  describe('deleting a workspace', () => {
    it('deletes a shared workspace with everything in it', async () => {
      const { owner, editor, workspaceId, base } = await house();
      const categories = categoryListResponseSchema.parse(
        (await owner.browser.get(`${base}/categories`).expect(200)).body,
      );
      const mercado = categories.find((category) => category.name === 'Mercado')!;
      const period = currentPeriod();
      await owner.browser
        .post(`${base}/transactions`)
        .send({
          type: 'DEBIT',
          description: 'Compra de exemplo',
          categoryId: mercado.id,
          amountCents: 1_000,
          period,
        })
        .expect(201);
      await owner.browser
        .post(`${base}/recurrences`)
        .send({
          type: 'DEBIT',
          description: 'Internet de exemplo',
          categoryId: mercado.id,
          amountCents: 9_990,
          startPeriod: period,
        })
        .expect(201);
      await owner.browser
        .post(`${base}/invitations`)
        .send({ email: 'convidada@example.com', role: 'VIEWER' })
        .expect(201);

      await owner.browser.delete(base).expect(204);

      await owner.browser.get(base).expect(404);
      await editor.browser.get(base).expect(404);
      // Counted as the database owner, past RLS: nothing of it is left in any table.
      const db = ownerClient();
      const where = { workspaceId };
      const left = await Promise.all([
        db.workspace.count({ where: { id: workspaceId } }),
        db.member.count({ where }),
        db.invitation.count({ where }),
        db.category.count({ where }),
        db.transaction.count({ where }),
        db.recurrence.count({ where }),
        db.recurrenceOccurrence.count({ where }),
      ]);
      await db.$disconnect();
      expect(left).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('never deletes the personal workspace', async () => {
      const { browser, personalWorkspaceId } = await t.signUp(maria);

      const response = await browser.delete(`/api/workspaces/${personalWorkspaceId}`).expect(409);

      expect(response.body).toMatchObject({ code: 'PERSONAL_WORKSPACE' });
    });

    it('is only for the OWNER', async () => {
      const { editor, base } = await house();

      await editor.browser.delete(base).expect(403);
    });
  });

  it('hides both routes from outsiders', async () => {
    const { owner, workspaceId } = await house();

    await expectHiddenFromOutsiders(t, workspaceId, [
      { method: 'delete', path: (id) => `/api/workspaces/${id}/members/${owner.userId}` },
      { method: 'delete', path: (id) => `/api/workspaces/${id}` },
    ]);
  });
});
