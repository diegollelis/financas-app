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
    path: (id) => `/api/workspaces/${id}/invitations`,
    body: { email: 'de-fora@example.com', role: 'EDITOR' },
  },
  { method: 'get', path: (id) => `/api/workspaces/${id}/invitations` },
  {
    method: 'delete',
    path: (id) => `/api/workspaces/${id}/invitations/01920000-0000-7000-8000-000000000000`,
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
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
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
      .post(`/api/workspaces/${workspaceId}/invitations`)
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
      expect(t.mailer.sent[0]?.subject).toBe('Maria Exemplo convidou você para "Casa"');
      const stored = await t.prisma.invitation.findFirstOrThrow();
      expect(stored.tokenHash).not.toContain(token);
    });

    it('lists and cancels pending invitations; a cancelled link stops working', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { invitation, token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');

      const list = await owner.browser
        .get(`/api/workspaces/${workspaceId}/invitations`)
        .expect(200);
      expect(invitationListResponseSchema.parse(list.body)).toEqual([invitation]);

      await owner.browser
        .delete(`/api/workspaces/${workspaceId}/invitations/${invitation.id}`)
        .expect(204);
      await t.http().get(`/api/invitations/${token}`).expect(404);
    });

    it('shows what came of each invitation: pending, accepted or expired', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const base = `/api/workspaces/${workspaceId}/invitations`;
      const accepted = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');
      const invited = await t.signUp(joao);
      await invited.browser.post(`/api/invitations/${accepted.token}/accept`).expect(200);
      const expired = await invite(owner.browser, workspaceId, 'pedro@example.com', 'EDITOR');
      await t.prisma.invitation.update({
        where: { id: expired.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const pending = await invite(owner.browser, workspaceId, ana.email, 'EDITOR');

      const list = invitationListResponseSchema.parse(
        (await owner.browser.get(base).expect(200)).body,
      );

      expect(list.map(({ email, status }) => [email, status])).toEqual([
        [ana.email, 'PENDING'],
        ['pedro@example.com', 'EXPIRED'],
        [joao.email, 'ACCEPTED'],
      ]);
      expect(list[2]!.acceptedAt).not.toBeNull();
      expect(list[0]).toMatchObject({ id: pending.invitation.id, acceptedAt: null });
      // An expired one can be cleared from the list; an accepted one stays as the record.
      await owner.browser.delete(`${base}/${expired.invitation.id}`).expect(204);
      await owner.browser.delete(`${base}/${accepted.invitation.id}`).expect(404);
    });

    it("records when an accepted invitation's member was removed, or left", async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const base = `/api/workspaces/${workspaceId}`;
      const forJoao = await invite(owner.browser, workspaceId, joao.email, 'EDITOR');
      const joaoIn = await t.signUp(joao);
      await joaoIn.browser.post(`/api/invitations/${forJoao.token}/accept`).expect(200);
      const forAna = await invite(owner.browser, workspaceId, ana.email, 'VIEWER');
      const anaIn = await t.signUp(ana);
      await anaIn.browser.post(`/api/invitations/${forAna.token}/accept`).expect(200);
      const before = new Date();

      await owner.browser.delete(`${base}/members/${joaoIn.userId}`).expect(204);
      await anaIn.browser.delete(`${base}/members/${anaIn.userId}`).expect(204);

      const list = invitationListResponseSchema.parse(
        (await owner.browser.get(`${base}/invitations`).expect(200)).body,
      );
      expect(list.map(({ email, status }) => [email, status])).toEqual([
        [ana.email, 'LEFT'],
        [joao.email, 'REMOVED'],
      ]);
      for (const invitation of list) {
        expect(invitation.acceptedAt).not.toBeNull();
        expect(new Date(invitation.removedAt!).getTime()).toBeGreaterThanOrEqual(before.getTime());
      }
      // A record, not something to cancel.
      await owner.browser.delete(`${base}/invitations/${forJoao.invitation.id}`).expect(404);
    });

    it('replaces the previous invitation to the same e-mail', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const first = await invite(owner.browser, workspaceId, joao.email);

      await invite(owner.browser, workspaceId, joao.email);

      await t.http().get(`/api/invitations/${first.token}`).expect(404);
      expect(await t.prisma.invitation.count()).toBe(1);
    });

    it('refuses the personal workspace, current members and the OWNER role', async () => {
      const { owner, workspaceId } = await mariaWithHouse();

      const personal = await owner.browser
        .post(`/api/workspaces/${owner.personalWorkspaceId}/invitations`)
        .send({ email: joao.email, role: 'EDITOR' })
        .expect(409);
      const member = await owner.browser
        .post(`/api/workspaces/${workspaceId}/invitations`)
        .send({ email: maria.email, role: 'EDITOR' })
        .expect(409);
      await owner.browser
        .post(`/api/workspaces/${workspaceId}/invitations`)
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
        .post(`/api/workspaces/${workspaceId}/invitations`)
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

      await editor.browser.get(`/api/workspaces/${workspaceId}/invitations`).expect(403);
      await editor.browser
        .post(`/api/workspaces/${workspaceId}/invitations`)
        .send({ email: ana.email, role: 'VIEWER' })
        .expect(403);
    });

    it('does not cancel an invitation of another workspace through your own', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { invitation, token } = await invite(owner.browser, workspaceId, joao.email);
      const other = await t.signUp(ana);
      const created = await other.browser
        .post('/api/workspaces')
        .send({ name: 'Da Ana' })
        .expect(201);
      const anasWorkspaceId = workspaceSchema.parse(created.body).id;

      await other.browser
        .delete(`/api/workspaces/${anasWorkspaceId}/invitations/${invitation.id}`)
        .expect(404);

      await t.http().get(`/api/invitations/${token}`).expect(200);
    });
  });

  describe('accepting', () => {
    it('shows the invitation before signing in', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');

      const preview = await t.http().get(`/api/invitations/${token}`).expect(200);

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

      const accepted = await invited.browser.post(`/api/invitations/${token}/accept`).expect(200);

      expect(workspaceSchema.parse(accepted.body)).toMatchObject({
        id: workspaceId,
        name: 'Casa',
        role: 'VIEWER',
      });
      await invited.browser.get(`/api/workspaces/${workspaceId}`).expect(200);
      expect(
        await t.prisma.user.findUniqueOrThrow({ where: { id: invited.userId } }),
      ).toMatchObject({ emailVerified: true });
      // Used once: the link no longer works, and the list shows it as accepted.
      await t.http().get(`/api/invitations/${token}`).expect(404);
      const list = await owner.browser
        .get(`/api/workspaces/${workspaceId}/invitations`)
        .expect(200);
      expect(list.body).toMatchObject([{ email: joao.email, status: 'ACCEPTED' }]);
    });

    it('requires a session', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email);

      await t.http().post(`/api/invitations/${token}/accept`).expect(401);
    });

    it('refuses someone signed in with another e-mail (a forwarded link)', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email);
      const someoneElse = await t.signUp(ana);

      const response = await someoneElse.browser
        .post(`/api/invitations/${token}/accept`)
        .expect(403);

      expect(response.body).toMatchObject({ code: 'EMAIL_MISMATCH' });
      await someoneElse.browser.get(`/api/workspaces/${workspaceId}`).expect(404);
    });

    it('refuses expired links and accepts each link only once', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email);
      const invited = await t.signUp(joao);
      await invited.browser.post(`/api/invitations/${token}/accept`).expect(200);
      await invited.browser.post(`/api/invitations/${token}/accept`).expect(404);

      const expired = await invite(owner.browser, workspaceId, ana.email);
      await t.prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const late = await t.signUp(ana);
      await late.browser.post(`/api/invitations/${expired.token}/accept`).expect(404);
    });

    it('never downgrades someone who is already a member', async () => {
      const { owner, workspaceId } = await mariaWithHouse();
      const { token } = await invite(owner.browser, workspaceId, joao.email, 'VIEWER');
      const invited = await t.signUp(joao);
      await t.prisma.member.create({
        data: { workspaceId, userId: invited.userId, role: 'EDITOR' },
      });

      const accepted = await invited.browser.post(`/api/invitations/${token}/accept`).expect(200);

      expect(accepted.body).toMatchObject({ role: 'EDITOR' });
    });
  });
});
