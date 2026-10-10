import { z } from 'zod';

/** Password limits, shared by the sign-up form and the API (Better Auth's defaults). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Web pages the API links to in e-mails (and the router mounts). */
export const SIGN_IN_PATH = '/entrar';
export const FORGOT_PASSWORD_PATH = '/esqueci-senha';

/** Public legal pages (ADRs 0012 and 0041). */
export const PRIVACY_PATH = '/privacidade';
export const TERMS_PATH = '/termos';

/** The signed-in person's account page: data export and account deletion (ADR 0041). */
export const ACCOUNT_PATH = '/conta';

/** Opened from the e-mailed link (`?token=`): asks once more and deletes the account (ADR 0041). */
export const DELETE_ACCOUNT_PATH = '/conta/excluir';

/** Public page shown once the account is gone. */
export const ACCOUNT_DELETED_PATH = '/conta-excluida';

/**
 * The terms of use version in force (ADR 0041): the date of their last relevant change. Changing
 * it asks every user to accept the terms again.
 */
export const TERMS_VERSION = '2026-10-10';

/** Web page that receives the password reset link (the API builds the e-mail link to it). */
export const RESET_PASSWORD_PATH = '/redefinir-senha';

/**
 * A path inside the web app, or '/' (ADR 0027): where to go after signing in or verifying the
 * e-mail. "//site.com" or "/\site.com" would make the browser leave for another site (open
 * redirect), a classic trick in phishing links. The API applies it to the links it e-mails too.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

/** Matches the `users.name` column (varchar 100). */
export const NAME_MAX_LENGTH = 100;

// Messages are UI text (pt-BR, ADR 0011): the web form shows them as they are.

const emailSchema = z.email('Informe um e-mail válido.');

/** Rules for a new password: sign-up and password reset. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(PASSWORD_MAX_LENGTH, `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);

const ACCEPT_TERMS_MESSAGE =
  'Aceite os Termos de uso e a Política de privacidade para criar a conta.';

export const signUpInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe seu nome.')
    .max(NAME_MAX_LENGTH, `Use no máximo ${NAME_MAX_LENGTH} caracteres.`),
  email: emailSchema,
  password: passwordSchema,
  // A boolean (not z.literal(true)), so the form can start unchecked; only true passes.
  acceptTerms: z.boolean(ACCEPT_TERMS_MESSAGE).refine((accepted) => accepted, ACCEPT_TERMS_MESSAGE),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

export const signInInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe sua senha.'),
});

export type SignInInput = z.infer<typeof signInInputSchema>;

export const forgotPasswordInputSchema = z.object({ email: emailSchema });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

/** The web form: the new password typed twice. */
export const resetPasswordFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  });

export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>;

/** Body of `POST /api/auth/reset-password`: the token comes from the e-mail link. */
export const resetPasswordInputSchema = z.object({
  newPassword: passwordSchema,
  token: z.string().min(1),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

/** Body of the auth routes that only confirm the action (reset, resend verification...). */
export const statusResponseSchema = z.object({ status: z.boolean() });

/** The signed-in user, as returned by `GET /me`. Never includes password or session data. */
export const meResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  /** The terms version accepted (ADR 0041); anything but TERMS_VERSION asks for acceptance. */
  termsVersion: z.string().nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/** Body of a successful sign-up or sign-in. Only the user is read; the session is the cookie. */
export const authResponseSchema = z.object({ user: meResponseSchema });

/** Body of `POST /me/terms`: only the version in force can be accepted. */
export const acceptTermsInputSchema = z.object({
  version: z.literal(TERMS_VERSION, 'Estes termos mudaram. Recarregue a página e leia de novo.'),
});

export type AcceptTermsInput = z.infer<typeof acceptTermsInputSchema>;

/** Body of an error from the auth routes (`/api/auth/*`). */
export const authErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
});

/**
 * A workspace that keeps the account from being deleted (ADR 0041): the person owns it and other
 * people are in it, or invited to it. It must be resolved first, so nobody loses data unawares.
 */
export const deletionBlockerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  otherMembers: z.number().int().nonnegative(),
  pendingInvitations: z.number().int().nonnegative(),
});

export type DeletionBlocker = z.infer<typeof deletionBlockerSchema>;

/** `GET /me/deletion`: what deleting the account would need resolved first; empty = nothing. */
export const accountDeletionSchema = z.object({ blockers: z.array(deletionBlockerSchema) });

export type AccountDeletion = z.infer<typeof accountDeletionSchema>;

/** The pt-BR answer when a workspace blocks the deletion (code OWNS_SHARED_WORKSPACES). */
export function deletionBlockedMessage(names: string[]): string {
  const list = names.map((name) => `"${name}"`).join(', ');
  return names.length === 1
    ? `Antes de excluir a conta, resolva o espaço ${list}: remova os membros e os convites, ou exclua o espaço.`
    : `Antes de excluir a conta, resolva os espaços ${list}: remova os membros e os convites, ou exclua os espaços.`;
}

// Managing the account (ADR 0049).

/** Body of `POST /api/auth/update-user`: only the name, with the sign-up's rule. */
export const updateNameInputSchema = signUpInputSchema.pick({ name: true });

export type UpdateNameInput = z.infer<typeof updateNameInputSchema>;

/**
 * Body of `POST /api/auth/change-password`. The API always signs the other devices out
 * (`revokeOtherSessions`), whatever the request says.
 */
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

/** The web form: the current password, and the new one typed twice. */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  });

export type ChangePasswordForm = z.infer<typeof changePasswordFormSchema>;

/** One device the account is signed in on: never its token, never its IP (ADR 0049). */
export const accountSessionSchema = z.object({
  id: z.string(),
  /** "Chrome", "Safari"…; "Navegador desconhecido" when the user-agent says nothing useful. */
  browser: z.string(),
  /** "Windows", "Android", "iOS"…; "Sistema desconhecido" likewise. */
  os: z.string(),
  createdAt: z.iso.datetime(),
  lastActiveAt: z.iso.datetime(),
  /** The session of the request itself: "Este aparelho". */
  current: z.boolean(),
});

export type AccountSession = z.infer<typeof accountSessionSchema>;

/**
 * `GET /me/security`: whether the account has a password (one created with Google has not) and
 * the devices it is signed in on, the current one first, then the most recent.
 */
export const accountSecuritySchema = z.object({
  hasPassword: z.boolean(),
  sessions: z.array(accountSessionSchema),
});

export type AccountSecurity = z.infer<typeof accountSecuritySchema>;

/**
 * Body of `POST /api/auth/change-email` (ADR 0049): the new address gets the confirmation link,
 * and the e-mail changes only once it is opened. `callbackURL` is where the link leads.
 */
export const changeEmailInputSchema = z.object({
  newEmail: emailSchema,
  callbackURL: z.string().optional(),
});

export type ChangeEmailInput = z.infer<typeof changeEmailInputSchema>;
