import {
  categoryListResponseSchema,
  currentPeriod,
  dataExportSchema,
  shiftPeriod,
  todayIso,
  workspaceSchema,
} from '@financas/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EXPORTED_TABLES } from '../src/account/data-export.service.js';
import { createTestApp } from './app.js';
import { ownerClient, resetDatabase } from './db.js';

// The LGPD data export (ADR 0041). All data here is fictitious (ADR 0019).
const maria = { name: 'Maria Exemplo', email: 'maria@example.com', password: 'senha-de-teste-123' };
const joao = { name: 'João Exemplo', email: 'joao@example.com', password: 'senha-de-teste-456' };

describe('data export', () => {
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

  async function debitCategory(browser: ReturnType<typeof t.http>, workspaceId: string) {
    const response = await browser.get(`/api/workspaces/${workspaceId}/categories`).expect(200);
    return categoryListResponseSchema
      .parse(response.body)
      .find((category) => category.name === 'Mercado')!;
  }

  it('downloads everything of the workspaces the person owns, as a JSON file', async () => {
    const { browser, userId, personalWorkspaceId } = await t.signUp(maria);
    const base = `/api/workspaces/${personalWorkspaceId}`;
    const mercado = await debitCategory(browser, personalWorkspaceId);
    const period = currentPeriod();
    await browser
      .post(`${base}/transactions`)
      .send({
        type: 'DEBIT',
        description: 'Feira de exemplo',
        notes: 'Observação de exemplo',
        categoryId: mercado.id,
        amountCents: 8_550,
        period,
        dueDate: `${period}-10`,
      })
      .expect(201);
    await browser
      .put(`${base}/budget/${period}`)
      .send({
        netIncomeCents: 500_000,
        grossIncomeCents: null,
        expensesBp: 5_000,
        investmentsBp: 2_000,
        emergencyReserveBp: 1_000,
        travelBp: 1_000,
      })
      .expect(200);
    await browser
      .post(`${base}/recurrences`)
      .send({
        type: 'DEBIT',
        description: 'Internet de exemplo',
        categoryId: mercado.id,
        amountCents: 9_990,
        startPeriod: period,
      })
      .expect(201);
    await browser
      .post(`${base}/installments`)
      .send({
        type: 'DEBIT',
        description: 'Geladeira de exemplo',
        categoryId: mercado.id,
        installments: 3,
        amountCents: 300_000,
        amountIs: 'TOTAL',
        firstPeriod: shiftPeriod(period, 1),
      })
      .expect(201);
    // The personal workspace is never shared: invitations go out from another one.
    const created = await browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const casa = workspaceSchema.parse(created.body);
    await browser
      .post(`/api/workspaces/${casa.id}/invitations`)
      .send({ email: 'convidada@example.com', role: 'VIEWER' })
      .expect(201);

    const response = await browser.get('/api/me/export').expect(200);

    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="financas-dados-${todayIso()}.json"`,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    const data = dataExportSchema.parse(JSON.parse(response.text));
    expect(data.account).toMatchObject({ id: userId, email: maria.email, emailVerified: true });
    expect(data.account.logins).toMatchObject([{ provider: 'credential' }]);
    expect(data.account.sessions).toHaveLength(1);
    expect(data.sharedWorkspaces).toEqual([]);
    expect(data.ownedWorkspaces.map((workspace) => workspace.id).sort()).toEqual(
      [personalWorkspaceId, casa.id].sort(),
    );
    const personal = data.ownedWorkspaces.find((workspace) => workspace.isPersonal);
    expect(personal).toMatchObject({ id: personalWorkspaceId, role: 'OWNER', invitations: [] });
    expect(personal!.members).toHaveLength(1);
    expect(personal!.members).toMatchObject([
      { name: maria.name, email: maria.email, role: 'OWNER' },
    ]);
    expect(data.ownedWorkspaces.find((workspace) => workspace.id === casa.id)).toMatchObject({
      name: 'Casa',
      invitations: [{ email: 'convidada@example.com', role: 'VIEWER', acceptedAt: null }],
    });
    expect(personal!.transactions).toContainEqual(
      expect.objectContaining({
        description: 'Feira de exemplo',
        notes: 'Observação de exemplo',
        amountCents: 8_550,
        period,
        dueDate: `${period}-10`,
        settledAt: null,
      }),
    );
    // The recurrence's first month and the three installments are transactions too.
    expect(personal!.transactions).toHaveLength(5);
    expect(personal!.recurrences).toMatchObject([
      { description: 'Internet de exemplo', generatedPeriods: [period] },
    ]);
    expect(personal!.installmentPlans).toMatchObject([{ totalCents: 300_000, installments: 3 }]);
    expect(personal!.budgets).toMatchObject([{ period, netIncomeCents: 500_000 }]);
    expect(personal!.categories.length).toBeGreaterThan(0);
  });

  it('never carries secrets: password hash, session tokens or invitation token hashes', async () => {
    const { browser } = await t.signUp(maria);
    const created = await browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    await browser
      .post(`/api/workspaces/${workspaceSchema.parse(created.body).id}/invitations`)
      .send({ email: 'convidada@example.com', role: 'EDITOR' })
      .expect(201);

    const text = (await browser.get('/api/me/export').expect(200)).text;

    const owner = ownerClient();
    const [account, session, invitation] = await Promise.all([
      owner.account.findFirstOrThrow({ where: { providerId: 'credential' } }),
      owner.session.findFirstOrThrow(),
      owner.invitation.findFirstOrThrow(),
    ]);
    await owner.$disconnect();
    expect(text).not.toContain(account.password!);
    expect(text).not.toContain(session.token);
    expect(text).not.toContain(invitation.tokenHash);
    expect(text).not.toMatch(/"(password|token|tokenHash)"/);
  });

  it('lists someone else’s workspace only by name and role, without its data', async () => {
    const owner = await t.signUp(joao);
    const created = await owner.browser.post('/api/workspaces').send({ name: 'Casa' }).expect(201);
    const casa = workspaceSchema.parse(created.body);
    const mercado = await debitCategory(owner.browser, casa.id);
    await owner.browser
      .post(`/api/workspaces/${casa.id}/transactions`)
      .send({
        type: 'DEBIT',
        description: 'Compra do João',
        categoryId: mercado.id,
        amountCents: 1_000,
        period: currentPeriod(),
      })
      .expect(201);
    const member = await t.signUp(maria);
    await t.prisma.member.create({
      data: { workspaceId: casa.id, userId: member.userId, role: 'VIEWER' },
    });

    const response = await member.browser.get('/api/me/export').expect(200);

    const data = dataExportSchema.parse(JSON.parse(response.text));
    expect(data.sharedWorkspaces).toHaveLength(1);
    expect(data.sharedWorkspaces).toMatchObject([{ id: casa.id, name: 'Casa', role: 'VIEWER' }]);
    expect(data.ownedWorkspaces.map((workspace) => workspace.isPersonal)).toEqual([true]);
    expect(response.text).not.toContain('Compra do João');
    expect(response.text).not.toContain(joao.email);
  });

  it('needs a session', async () => {
    await t.http().get('/api/me/export').expect(401);
  });

  it('covers every table that belongs to a workspace', async () => {
    const owner = ownerClient();
    const tables = await owner.$queryRaw<{ table: string }[]>`
      SELECT DISTINCT c.table_name AS "table"
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'workspace_id'
      ORDER BY 1
    `;
    await owner.$disconnect();

    // A new table with a workspace_id must be added to the export (ADR 0041).
    expect(tables.map(({ table }) => table).sort()).toEqual(Object.keys(EXPORTED_TABLES).sort());
  });
});
