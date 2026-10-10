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
      // Right password, e-mail not verified yet: the API has just e-mailed a new link (ADR 0022).
      case 'EMAIL_NOT_VERIFIED':
        return 'Confirme seu e-mail para entrar. Enviamos um novo link; confira também a caixa de spam.';
      case 'INVALID_EMAIL_OR_PASSWORD':
        return 'E-mail ou senha incorretos.';
      case 'PROVIDER_NOT_FOUND':
        return 'O login com Google não está disponível no momento.';
      // Changing the password (ADR 0049).
      case 'INVALID_PASSWORD':
        return 'A senha atual não confere.';
      case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
        return 'Esta conta ainda não tem senha. Use "Criar senha".';
      case 'INVALID_TOKEN':
        return 'Este link é inválido ou expirou. Peça um novo.';
      case 'OWNS_SHARED_WORKSPACES':
        // Our own check before deleting an account (ADR 0041): pt-BR, naming the workspaces.
        return error.detail ?? 'Antes de excluir a conta, resolva os espaços compartilhados.';
      case 'INVALID_INPUT':
        // Our own validation on the API (shared Zod schema): the message is already pt-BR.
        return error.detail ?? 'Confira os dados informados.';
    }
    if (error.status === 401) return 'E-mail ou senha incorretos.';
    if (error.status === 429) return `Muitas tentativas. ${waitMessage(error.retryAfter)}`;
  }
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}
