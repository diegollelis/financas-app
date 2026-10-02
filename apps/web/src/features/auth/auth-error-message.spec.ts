import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { authErrorMessage } from './auth-error-message';

const rateLimited = (retryAfter?: number) => new ApiError(429, 'POST failed', {}, retryAfter);

describe('authErrorMessage', () => {
  it.each([
    { retryAfter: 45, message: 'Muitas tentativas. Tente de novo em 45 segundos.' },
    { retryAfter: 60, message: 'Muitas tentativas. Tente de novo em 1 minuto.' },
    { retryAfter: 241, message: 'Muitas tentativas. Tente de novo em 5 minutos.' },
    { retryAfter: undefined, message: 'Muitas tentativas. Aguarde um pouco e tente de novo.' },
  ])('tells how long to wait when rate-limited ($retryAfter s)', ({ retryAfter, message }) => {
    expect(authErrorMessage(rateLimited(retryAfter))).toBe(message);
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Não foi possível concluir agora. Tente de novo em instantes.',
    );
  });
});
