import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { apiErrorMessage } from './error-message';

const conflict = (code: string, message: string) =>
  new ApiError(409, '/api/workspaces/w1/people/p1', message, { code, message });

describe('apiErrorMessage', () => {
  it.each([
    'CATEGORY_OF_DESTINATION',
    'DESTINATION_EXISTS',
    'DESTINATION_FIXED',
    'DESTINATION_IN_USE',
    'PERSON_EXISTS',
    'PERSON_IN_USE',
    'INVALID_PERSON',
  ])('shows the pt-BR message the API sends with %s', (code) => {
    expect(apiErrorMessage(conflict(code, 'Mensagem da regra.'))).toBe('Mensagem da regra.');
  });

  it('keeps an unknown code behind the generic message', () => {
    expect(apiErrorMessage(conflict('SOMETHING_ELSE', 'internal detail'))).toBe(
      'Não foi possível concluir agora. Tente de novo em instantes.',
    );
  });

  it('explains a 403 without a known code', () => {
    expect(apiErrorMessage(new ApiError(403, '/api/workspaces/w1', 'Forbidden'))).toBe(
      'Você não tem permissão para fazer isso.',
    );
  });
});
