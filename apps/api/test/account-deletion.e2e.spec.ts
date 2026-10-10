import {
  accountDeletionSchema,
  categoryListResponseSchema,
  currentPeriod,
  invitationListResponseSchema,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';
import { testEnv } from './test-env.js';

// Account deletion (ADR 0041). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

describe('account deletion', () => {
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

  type Browser = ReturnType<typeof t.http>;

  async function blockers(browser: Browser) {
    const response = await browser.get('/api/me/deletion').expect(200);
    return accountDeletionSchema.parse(response.body).blockers;
  }

  async function createWorkspace(browser: Browser, name: string) {
    const created = await browser.post('/api/workspaces').send({ name }).expect(201);
    return workspaceSchema.parse(created.body).id;
  }

  /** Asks for the link and returns its token, as the web page reads it from the address. */
  async function requestDeletion(browser: Browser, email: string) {
    t.mailer.sent.length = 0;
    await browser.post('/api/auth/delete-user').send({}).expect(200);
    const link = t.mailer.lastLinkTo(email);
    expect(`${link.origin}${link.pathname}`).toBe(`${testEnv.WEB_ORIGIN}/conta/excluir`);
    return link.searchParams.get('token') ?? '';
  }

  it('is not blocked by workspaces only the person is in', async () => {
    const { browser } = await t.signUp(maria);
    await createWorkspace(browser, 'Só meu');

    expect(await blockers(browser)).toEqual([]);
  });

  it('is blocked by an owned workspace with other members or pending invitations', async () => {
    const { browser } = await t.signUp(maria);
    const casa = await createWorkspace(browser, 'Casa');
    const viagem = await createWorkspace(browser, 'Viagem');
    const other = await t.signUp(joao);
    await t.prisma.member.create({
      data: { workspaceId: casa, userId: other.userId, role: 'VIEWER' },
    });
    await browser
      .post(`/api/workspaces/${viagem}/invitations`)
      .send({ email: 'convidada@example.com', role: 'EDITOR' })
      .expect(201);

    expect(await blockers(browser)).toEqual([
      { id: casa, name: 'Casa', otherMembers: 1, pendingInvitations: 0 },
      { id: viagem, name: 'Viagem', otherMembers: 0, pendingInvitations: 1 },
    ]);
    t.mailer.sent.length = 0;
    const response = await browser.post('/api/auth/delete-user').send({}).expect(409);
    expect(response.body).toMatchObject({
      code: 'OWNS_SHARED_WORKSPACES',
      message: expect.stringContaining('"Casa", "Viagem"') as string,
    });
    expect(t.mailer.sent).toHaveLength(0);
  });

  it('e-mails a link and deletes nothing until it is used', async () => {
    const { browser, userId } = await t.signUp(maria);

    await requestDeletion(browser, maria.email);

    expect(t.mailer.sent[0]?.subject).toBe('Confirme a exclusão da sua conta');
    expect(await t.prisma.user.count({ where: { id: userId } })).toBe(1);
  });

  it('deletes the account and everything only it owned when the link is used', async () => {
    const { browser, userId, personalWorkspaceId } = await t.signUp(maria);
    const base = `/api/workspaces/${personalWorkspaceId}`;
    const categories = categoryListResponseSchema.parse(
      (await browser.get(`${base}/categories`).expect(200)).body,
    );
    await browser
      .post(`${base}/transactions`)
      .send({
        type: 'DEBIT',
        description: 'Compra de exemplo',
        categoryId: categories.find((category) => category.type === 'DEBIT')!.id,
        amountCents: 1_000,
        period: currentPeriod(),
      })
      .expect(201);
    const soloWorkspace = await createWorkspace(browser, 'Só meu');
    // Maria is also in João's workspace, invited and accepted, and has an invitation pending
    // from another of his.
    const owner = await t.signUp(joao);
    const casa = await createWorkspace(owner.browser, 'Casa');
    const viagem = await createWorkspace(owner.browser, 'Viagem');
    t.mailer.sent.length = 0;
    await owner.browser
      .post(`/api/workspaces/${casa}/invitations`)
      .send({ email: maria.email, role: 'EDITOR' })
      .expect(201);
    const inviteToken = t.mailer.lastLinkTo(maria.email).pathname.split('/').at(-1);
    await browser.post(`/api/invitations/${inviteToken}/accept`).expect(200);
    await owner.browser
      .post(`/api/workspaces/${viagem}/invitations`)
      .send({ email: maria.email, role: 'VIEWER' })
      .expect(201);

    const token = await requestDeletion(browser, maria.email);
    await browser.post('/api/auth/delete-user').send({ token }).expect(200);

    await browser.get('/api/me').expect(401);
    const db = ownerClient();
    const left = await Promise.all([
      db.user.count({ where: { id: userId } }),
      db.session.count({ where: { userId } }),
      db.account.count({ where: { userId } }),
      db.member.count({ where: { userId } }),
      db.workspace.count({ where: { id: { in: [personalWorkspaceId, soloWorkspace] } } }),
      db.transaction.count({ where: { workspaceId: personalWorkspaceId } }),
      db.category.count({ where: { workspaceId: personalWorkspaceId } }),
      db.invitation.count({ where: { email: maria.email, acceptedAt: null } }),
    ]);
    await db.$disconnect();
    expect(left).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // João's workspace stays, and shows that Maria left.
    const invitations = invitationListResponseSchema.parse(
      (await owner.browser.get(`/api/workspaces/${casa}/invitations`).expect(200)).body,
    );
    expect(invitations).toMatchObject([{ email: maria.email, status: 'LEFT' }]);
  });

  it('does not delete with a link sent to someone else', async () => {
    const mariaIn = await t.signUp(maria);
    const joaoIn = await t.signUp(joao);
    const token = await requestDeletion(joaoIn.browser, joao.email);

    await mariaIn.browser.post('/api/auth/delete-user').send({ token }).expect(404);

    expect(await t.prisma.user.count()).toBe(2);
  });

  it('checks again when the link is used: someone may have joined since', async () => {
    const { browser, userId } = await t.signUp(maria);
    const casa = await createWorkspace(browser, 'Casa');
    const token = await requestDeletion(browser, maria.email);
    const other = await t.signUp(joao);
    await t.prisma.member.create({
      data: { workspaceId: casa, userId: other.userId, role: 'VIEWER' },
    });

    const response = await browser.post('/api/auth/delete-user').send({ token }).expect(409);

    expect(response.body).toMatchObject({ code: 'OWNS_SHARED_WORKSPACES' });
    expect(await t.prisma.user.count({ where: { id: userId } })).toBe(1);
    expect(await t.prisma.workspace.count({ where: { id: casa } })).toBe(1);
  });

  it('needs a session', async () => {
    await t.http().get('/api/me/deletion').expect(401);
    await t.http().post('/api/auth/delete-user').send({}).expect(401);
  });
});
