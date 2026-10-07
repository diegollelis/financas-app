import { ApiError } from './api';

/** Codes whose message our API writes in pt-BR (shared schemas and business rules). */
const ptBrCodes = new Set([
  'INVALID_INPUT',
  'PERSONAL_WORKSPACE',
  'OWNER_STAYS',
  'ALREADY_MEMBER',
  'TOO_MANY_INVITATIONS',
  'EMAIL_MISMATCH',
  'CATEGORY_EXISTS',
  'CATEGORY_IN_USE',
  'INVALID_CATEGORY',
]);

/** Turns an error from our own API routes (not /api/auth) into a message for the user. */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && ptBrCodes.has(error.code) && error.detail) return error.detail;
    if (error.status === 403) return 'Você não tem permissão para fazer isso.';
    if (error.status === 404) return 'Não encontrado. Talvez tenha sido removido.';
  }
  return 'Não foi possível concluir agora. Tente de novo em instantes.';
}
