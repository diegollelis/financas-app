import { ApiError } from '@/lib/api';

/** "Tente de novo em 2 minutos", from the seconds the API asked to wait (rate limit, ADR 0023). */
function waitMessage(seconds?: number): string {
  if (!seconds) return 'Aguarde um pouco e tente de novo.';
  if (seconds < 60) return `Tente de novo em ${seconds} segundos.`;
  const minutes = Math.ceil(seconds / 60);
  return `Tente de novo em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
}

/** Turns an error from the auth routes into a message for the user (pt-BR). */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'USER_ALREADY_EXISTS':
      case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
        return 'Já existe uma conta com este e-mail.';
      case 'INVALID_EMAIL_OR_PASSWORD':
        return 'E-mail ou senha incorretos.';
      case 'INVALID_TOKEN':
        return 'Este link é inválido ou expirou. Peça um novo.';
      case 'INVALID_INPUT':
        // Our own validation on the API (shared Zod schema): the message is already pt-BR.
        return error.detail ?? 'Confira os dados informados.';
    }
    if (error.status === 401) return 'E-mail ou senha incorretos.';
    if (error.status === 429) return `Muitas tentativas. ${waitMessage(error.retryAfter)}`;
  }
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}
