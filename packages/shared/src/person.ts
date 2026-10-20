import { z } from 'zod';

/** Matches the `people.name` column (varchar 100). */
export const PERSON_NAME_MAX_LENGTH = 100;

export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da pessoa.')
  .max(PERSON_NAME_MAX_LENGTH, `Use no máximo ${PERSON_NAME_MAX_LENGTH} caracteres.`);

/**
 * A contact of the workspace (ADR 0042), whether or not they use the app. `memberUserId` links
 * it to a member of the same workspace, whose account name it then shows.
 */
export const createPersonInputSchema = z.object({
  name: personNameSchema,
  memberUserId: z.uuid().nullable().optional(),
});

export type CreatePersonInput = z.infer<typeof createPersonInputSchema>;

/** Renames, links to a member (or unlinks, with null) and/or archives a person. */
export const updatePersonInputSchema = z
  .object({
    name: personNameSchema.optional(),
    memberUserId: z.uuid().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Nada para alterar.',
  });

export type UpdatePersonInput = z.infer<typeof updatePersonInputSchema>;

export const personSchema = z.object({
  id: z.uuid(),
  /** The member's account name when linked to one; the name typed otherwise. */
  name: z.string(),
  memberUserId: z.uuid().nullable(),
  /**
   * Linked to someone who is still a member: every member of a shared workspace has one, created
   * by the API, which cannot be renamed, archived or deleted while they stay. Once they leave, it
   * is a contact like any other, with the name it was saved with.
   */
  isMember: z.boolean(),
  archived: z.boolean(),
  /** Pending credits linked to them: what they owe you. */
  receivableCents: z.number().int().nonnegative(),
  /** Pending debits linked to them: what you owe them. */
  payableCents: z.number().int().nonnegative(),
});

export type Person = z.infer<typeof personSchema>;

/** `GET /workspaces/:workspaceId/people`: all of them, archived too, by name. */
export const personListResponseSchema = z.array(personSchema);

/** How many of a person's transactions their page lists, newest first. */
export const PERSON_TRANSACTIONS_LIMIT = 200;

/** People in one split, besides you. */
export const MAX_SPLIT_PEOPLE = 10;

/**
 * Equal shares of `totalCents` among `parts` people, you included (ADR 0042): every other share
 * is the rounded-down division, and the cents left over stay in yours, the first one returned,
 * as with installments. `splitEvenly(100_000, 3)` → `[33_334, 33_333, 33_333]`.
 */
export function splitEvenly(totalCents: number, parts: number): number[] {
  const share = Math.floor(totalCents / parts);
  return [totalCents - share * (parts - 1), ...Array.from({ length: parts - 1 }, () => share)];
}

/**
 * The description of a share (ADR 0052 note): the same as the split transaction's, plus which
 * installment it is of, "Geladeira (3/10)", within the description limit (200). The person is not
 * in the text: the row shows "A receber de Ana" from the share's person, always by its current
 * name.
 */
export function shareDescription(
  description: string,
  installment?: { number: number; count: number },
  max = 200,
): string {
  const suffix = installment ? ` (${installment.number}/${installment.count})` : '';
  const room = max - suffix.length;
  const text = description.length <= room ? description : `${description.slice(0, room - 1)}…`;
  return text + suffix;
}
