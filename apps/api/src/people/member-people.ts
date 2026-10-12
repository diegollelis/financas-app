import { normalizeName, PERSON_NAME_MAX_LENGTH } from '@financas/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { setWorkspaceContext } from '../prisma/prisma.service.js';

/**
 * Gives every member of a shared workspace a person linked to them (ADR 0042, note of
 * 2026-10-12), so they can be picked in "Dividir com alguém" like any contact. Idempotent: called
 * when an invitation is accepted and before listing people, which also covers the workspaces that
 * had members before this rule, with no data migration.
 *
 * - A person already linked to the member is reused, and reactivated if archived (they left and
 *   came back).
 * - Otherwise, an unlinked person with the account's name (ignoring case and accents) is linked,
 *   keeping their history: the "Ana" typed before Ana joined.
 * - Otherwise, a new one is created with the account's name.
 *
 * The personal workspace, and a shared one with only its OWNER, get none.
 */
export async function ensureMemberPeople(tx: Prisma.TransactionClient, workspaceId: string) {
  await setWorkspaceContext(tx, workspaceId);
  // Two requests at once (two tabs listing people) would both create the same person.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`;
  const members = await tx.member.findMany({
    where: { workspaceId },
    select: { userId: true, user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (members.length < 2) return;

  const people = await tx.person.findMany({ where: { workspaceId } });
  for (const member of members) {
    const linked = people.find((person) => person.memberUserId === member.userId);
    if (linked) {
      if (linked.archivedAt) {
        await tx.person.update({ where: { id: linked.id }, data: { archivedAt: null } });
      }
      continue;
    }

    const wanted = normalizeName(member.user.name);
    const sameName = people.find(
      (person) => person.memberUserId === null && normalizeName(person.name) === wanted,
    );
    if (sameName) {
      sameName.memberUserId = member.userId;
      await tx.person.update({
        where: { id: sameName.id },
        data: { memberUserId: member.userId, archivedAt: null },
      });
      continue;
    }

    people.push(
      await tx.person.create({
        data: {
          workspaceId,
          name: freeName(member.user.name, people),
          memberUserId: member.userId,
        },
      }),
    );
  }
}

/**
 * The account's name, or "Ana (2)" when another person already has it: names are unique in the
 * workspace, ignoring case. The screen shows the account's name anyway, while they are a member.
 */
function freeName(accountName: string, people: { name: string }[]): string {
  const base = accountName.trim().slice(0, PERSON_NAME_MAX_LENGTH) || 'Membro';
  const taken = new Set(people.map((person) => person.name.toLocaleLowerCase('pt-BR')));
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : ` (${n})`;
    const name = `${base.slice(0, PERSON_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(name.toLocaleLowerCase('pt-BR'))) return name;
  }
}
