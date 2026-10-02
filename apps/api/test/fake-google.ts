import { vi } from 'vitest';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  emailVerified?: boolean;
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Answers for Google's token endpoint, the only call Better Auth makes to Google during the
 * callback. It reads the user from the returned id_token without checking its signature (the
 * token comes straight from Google over TLS), so an unsigned token is enough here.
 * Returns a function that restores the real fetch.
 */
export function fakeGoogle(profile: GoogleProfile) {
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (!url.startsWith('https://oauth2.googleapis.com/token')) return realFetch(input, init);

    const idToken = [
      base64url({ alg: 'none', typ: 'JWT' }),
      base64url({
        iss: 'https://accounts.google.com',
        aud: 'test-client-id.apps.googleusercontent.com',
        sub: profile.sub,
        email: profile.email,
        email_verified: profile.emailVerified ?? true,
        name: profile.name,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      '',
    ].join('.');
    return Promise.resolve(
      Response.json({
        access_token: 'fake-access-token',
        id_token: idToken,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }),
    );
  });
  return () => spy.mockRestore();
}
