import { z } from 'zod';

/** Password limits, shared by the sign-up form and the API (Better Auth's defaults). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Matches the `users.name` column (varchar 100). */
export const NAME_MAX_LENGTH = 100;

// Messages are UI text (pt-BR, ADR 0011): the web form shows them as they are.
export const signUpInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe seu nome.')
    .max(NAME_MAX_LENGTH, `Use no máximo ${NAME_MAX_LENGTH} caracteres.`),
  email: z.email('Informe um e-mail válido.'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
    .max(PASSWORD_MAX_LENGTH, `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export type SignInInput = z.infer<typeof signInInputSchema>;

/** The signed-in user, as returned by `GET /me`. Never includes password or session data. */
export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/** Body of a successful sign-up or sign-in. Only the user is read; the session is the cookie. */
export const authResponseSchema = z.object({ user: meResponseSchema });

/** Body of an error from the auth routes (`/api/auth/*`). */
export const authErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
});
