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

/** "Ana: parte de Jantar", within the description limit (200). */
export function shareDescription(personName: string, description: string, max = 200): string {
  const text = `${personName}: parte de ${description}`;
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
