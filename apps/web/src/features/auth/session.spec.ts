import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { isSessionLost } from './session';

const error = (status: number, path: string) => new ApiError(status, path, 'failed');

describe('isSessionLost', () => {
  it('is a 401 from our own routes', () => {
    expect(isSessionLost(error(401, '/api/workspaces/01920000-0000-7000-8000-000000000001'))).toBe(
      true,
    );
    expect(isSessionLost(error(401, '/api/me/security'))).toBe(true);
  });

  it('is not a 401 from Better Auth (a wrong password at sign-in)', () => {
    expect(isSessionLost(error(401, '/api/auth/sign-in/email'))).toBe(false);
  });

  it('is not any other failure', () => {
    expect(isSessionLost(error(403, '/api/workspaces'))).toBe(false);
    expect(isSessionLost(error(500, '/api/workspaces'))).toBe(false);
    expect(isSessionLost(new TypeError('Failed to fetch'))).toBe(false);
  });
});
