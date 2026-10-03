// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardToApi } from './forward-to-api';

// Fictitious values only (ADR 0019).
const env = {
  API_ORIGIN: 'https://api.example.com',
  PROXY_SECRET: 'proxy-secret-only-for-automated-tests',
};

/** Replaces fetch and returns what the function sent to the API. */
function captureFetch(response = new Response('{}')) {
  const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return () => {
    const [url, init] = fetchMock.mock.calls[0]!;
    return { url: url.toString(), init, headers: new Headers(init.headers) };
  };
}

describe('forwardToApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards path, query, method and body to the API', async () => {
    const sent = captureFetch();
    const request = new Request('https://financas.example.com/api/auth/sign-in/email?x=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'session=abc' },
      body: JSON.stringify({ email: 'maria@example.com' }),
    });

    await forwardToApi({ request, env });

    const { url, init, headers } = sent();
    expect(url).toBe('https://api.example.com/api/auth/sign-in/email?x=1');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(
      '{"email":"maria@example.com"}',
    );
    expect(headers.get('Cookie')).toBe('session=abc');
  });

  it("tells the API Cloudflare's client IP, with the secret", async () => {
    const sent = captureFetch();
    const request = new Request('https://financas.example.com/api/me', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });

    await forwardToApi({ request, env });

    const { init, headers } = sent();
    expect(init.body).toBeUndefined();
    expect(headers.get('X-Client-IP')).toBe('203.0.113.7');
    expect(headers.get('X-Proxy-Secret')).toBe(env.PROXY_SECRET);
  });

  it('replaces the IP and secret a client tries to send', async () => {
    const sent = captureFetch();
    const request = new Request('https://financas.example.com/api/me', {
      headers: { 'X-Client-IP': '198.51.100.1', 'X-Proxy-Secret': 'forjado' },
    });

    await forwardToApi({ request, env });

    const { headers } = sent();
    expect(headers.get('X-Client-IP')).toBeNull();
    expect(headers.get('X-Proxy-Secret')).toBe(env.PROXY_SECRET);
  });

  it("returns the API's response as it is, redirects included", async () => {
    captureFetch(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://financas.example.com/', 'Set-Cookie': 'session=xyz' },
      }),
    );

    const response = await forwardToApi({
      request: new Request('https://financas.example.com/api/auth/callback/google'),
      env,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Set-Cookie')).toBe('session=xyz');
  });

  it('fails clearly when the Pages project lacks its variables', async () => {
    const response = await forwardToApi({
      request: new Request('https://financas.example.com/api/me'),
      env: {},
    });

    expect(response.status).toBe(500);
  });
});
