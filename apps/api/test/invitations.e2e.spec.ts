import {
  invitationListResponseSchema,
  invitationPreviewSchema,
  invitationSchema,
  MAX_PENDING_INVITATIONS,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { resetDatabase } from './db.js';
import { expectHiddenFromOutsiders, type WorkspaceRoute } from './isolation.js';
import { testEnv } from './test-env.js';

// Invitations to a workspace (ADR 0027). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };
const ana = { name: 'Ana Exemplo', email: 'ana@example.com', password: 'senha-de-teste-789' };

const invitationRoutes: WorkspaceRoute[] = [
  {
    method: 'post',
    path: (id) => `/workspaces/${id}/invitations`,
    body: { email: 'de-fora@example.com', role: 'EDITOR' },
  },
  { method: 'get', path: (id) => `/workspaces/${id}/invitations` },
  {
    method: 'delete',
    path: (id) => `/workspaces/${id}/invitations/01920000-0000-7000-8000-000000000000`,
  },
];

describe('invitations', () => {
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

  /** Maria (OWNER) with a shared workspace "Casa". */
  async function mariaWithHouse() {
    const owner = await t.signUp(maria);
    const created = await owner.browser.post('/workspaces').send({ name: 'Casa' }).expect(201);
    return { owner, workspaceId: workspaceSchema.parse(created.body).id };
  }

  async function invite(
    browser: Awaited<ReturnType<typeof mariaWithHouse>>['owner']['browser'],
    workspaceId: string,
    email: string,
    role: 'EDITOR' | 'VIEWER' = 'EDITOR',
  ) {
    t.mailer.sent.length = 0;
    const response = await browser
      .post(`/workspaces/${workspaceId}/invitations`)
      .send({ email, role })
      .expect(201);
    const token = t.mailer.lastLinkTo(email.toLowerCase()).pathname.split('/').at(-1) ?? '';
    return { invitation: invitationSchema.parse(response.body), token };
  }

  describe('inviting', () => {
    it('e-mails a link to the web app and stores only a hash of the token', async () => {
      const { owner, workspaceId } = await mariaWithHouse();

      const { invitation, token } = await invite(owner.browser, workspaceId, 'Joao@Example.com');

      expect(invitation).toMatchObject({ email: 'joao@example.com', role: 'EDITOR' });
      const link = t.mailer.lastLinkTo('joao@example.com');
      expect(`${link.origin}${link.pathname}`).toBe(`${testEnv.WEB_ORIGIN}/convites/${token}`);
      expect(t.mailer.sent[0]?.subject).toBe('Maria Exemplo convidou você para "Casa" no Finanças');
      const stored = await t.prisma.invitation.findFirstOrThrow();
      expect(stored.tokenHash).not.toContain(token);
    });

    it('lists and cancels pending invitations; a cancelled link stops working', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { invitation, token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');

      const list = await owner.browser.get(`/workspaces/${workspaceId}/invitations`).expect(200);
      expect(invitationListResponseSchema.parse(list.body)).toEqual([invitation]);

      await owner.browser
        .delete(`/workspaces/${workspaceId}/invitations/${invitation.id}`)
        .expect(204);
      await t.http().get(`/invitations/${token}`).expect(404);
    });

    it('replaces the previous invitation to the same e-mail', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const first = await invite(owner.browser, workspaceId, joao.email);

      await invite(owner.browser, workspaceId, joao.email);

      await t.http().get(`/invitations/${first.token}`).expect(404);
      expect(await t.prisma.invitation.count()).toBe(1);
    });

    it('refuses the personal workspace, current members and the OWNER role', async () => {
      const { owner, workspaceId } = await mariaWithHouse();

      const personal = await owner.browser
        .post(`/workspaces/${owner.personalWorkspaceId}/invitations`)
        .send({ email: joao.email, role: 'EDITOR' })
        .expect(409);
      const member = await owner.browser
        .post(`/workspaces/${workspaceId}/invitations`)
        .send({ email: maria.email, role: 'EDITOR' })
        .expect(409);
      await owner.browser
        .post(`/workspaces/${workspaceId}/invitations`)
        .send({ email: joao.email, role: 'OWNER' })
        .expect(400);

      expect(personal.body).toMatchObject({ code: 'PERSONAL_WORKSPACE' });
      expect(member.body).toMatchObject({ code: 'ALREADY_MEMBER' });
    });

    it(`allows at most ${MAX_PENDING_INVITATIONS} pending invitations per workspace`, async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      await t.prisma.invitation.createMany({
        data: Array.from({ length: MAX_PENDING_INVITATIONS }, (_, n) => ({
          workspaceId,
          email: `pessoa${n}@example.com`,
          role: 'VIEWER' as const,
          tokenHash: `hash-${n}`,
          expiresAt: new Date(Date.now() + 60_000),
        })),
      });

      const response = await owner.browser
        .post(`/workspaces/${workspaceId}/invitations`)
        .send({ email: joao.email, role: 'EDITOR' })
        .expect(409);

      expect(response.body).toMatchObject({ code: 'TOO_MANY_INVITATIONS' });
    });
  });

  describe('isolation and roles', () => {
    it('hides the invitations of a workspace from outsiders', async () => {
      const { workspaceId } = await mariaWithHouse();

      await expectHiddenFromOutsiders(t, workspaceId, invitationRoutes);
    });

    it('only lets the OWNER manage invitations', async () => {
      const { workspaceId } = await mariaWithHouse();
      const editor = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId, userId: editor.userId, role: 'EDITOR' },
      });

      await editor.browser.get(`/workspaces/${workspaceId}/invitations`).expect(403);
      await editor.browser
        .post(`/workspaces/${workspaceId}/invitations`)
        .send({ email: ana.email, role: 'VIEWER' })
        .expect(403);
    });

    it('does not cancel an invitation of another workspace through your own', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { invitation, token } = await invite(owner.browser, workspaceId, joao.email);
      const other = await t.signUp(ana);
      const created = await other.browser.post('/workspaces').send({ name: 'Da Ana' }).expect(201);
      const anasWorkspaceId = workspaceSchema.parse(created.body).id;

      await other.browser
        .delete(`/workspaces/${anasWorkspaceId}/invitations/${invitation.id}`)
        .expect(404);

      await t.http().get(`/invitations/${token}`).expect(200);
    });
  });

  describe('accepting', () => {
    it('shows the invitation before signing in', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');

      const preview = await t.http().get(`/invitations/${token}`).expect(200);

      expect(invitationPreviewSchema.parse(preview.body)).toMatchObject({
        workspaceName: 'Casa',
        invitedByName: 'Maria Exemplo',
        email: joao.email,
        role: 'VIEWER',
      });
    });

    it('joins the workspace with the invited role and verifies the e-mail', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');
      const invited = await t.signUp(joao);

      const accepted = await invited.browser.post(`/invitations/${token}/accept`).expect(200);

      expect(workspaceSchema.parse(accepted.body)).toMatchObject({
        id: workspaceId,
        name: 'Casa',
        role: 'VIEWER',
      });
      await invited.browser.get(`/workspaces/${workspaceId}`).expect(200);
      expect(
        await t.prisma.user.findUniqueOrThrow({ where: { id: invited.userId } }),
      ).toMatchObject({ emailVerified: true });
      // Used once: the link is gone and no longer listed.
      await t.http().get(`/invitations/${token}`).expect(404);
      const list = await owner.browser.get(`/workspaces/${workspaceId}/invitations`).expect(200);
      expect(list.body).toEqual([]);
    });

    it('requires a session', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email);

      await t.http().post(`/invitations/${token}/accept`).expect(401);
    });

    it('refuses someone signed in with another e-mail (a forwarded link)', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email);
      const someoneElse = await t.signUp(ana);

      const response = await someoneElse.browser.post(`/invitations/${token}/accept`).expect(403);

      expect(response.body).toMatchObject({ code: 'EMAIL_MISMATCH' });
      await someoneElse.browser.get(`/workspaces/${workspaceId}`).expect(404);
    });

    it('refuses expired links and accepts each link only once', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email);
      const invited = await t.signUp(joao);
      await invited.browser.post(`/invitations/${token}/accept`).expect(200);
      await invited.browser.post(`/invitations/${token}/accept`).expect(404);

      const expired = await invite(owner.browser, workspaceId, ana.email);
      await t.prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const late = await t.signUp(ana);
      await late.browser.post(`/invitations/${expired.token}/accept`).expect(404);
    });

    it('never downgrades someone who is already a member', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');
      const invited = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId, userId: invited.userId, role: 'EDITOR' },
      });

      const accepted = await invited.browser.post(`/invitations/${token}/accept`).expect(200);

      expect(accepted.body).toMatchObject({ role: 'EDITOR' });
    });
  });
});
