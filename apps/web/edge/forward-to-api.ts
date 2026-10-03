/** Variables of the Pages project (Cloudflare dashboard), never in the repository. */
export interface ProxyEnv {
  /** Where the API runs, e.g. https://financas-api.onrender.com */
  API_ORIGIN?: string;
  /** Shared with the API (its PROXY_SECRET): proves the client IP came from us. */
  PROXY_SECRET?: string;
}

/**
 * Cloudflare Pages Function behind every /api/* request (ADR 0033). The browser only ever talks
 * to the web app's site, so the session cookie stays first-party (SameSite=Lax) on every browser;
 * this function forwards the request to the API on Render and hands back its response untouched.
 *
 * Render would see Cloudflare's IP, not the user's, so the client IP (CF-Connecting-IP, which
 * Cloudflare sets and the client cannot forge) goes along in X-Client-IP, together with the
 * secret that makes the API trust it. Whatever the client sent in those headers is replaced.
 */
export async function forwardToApi({
  request,
  env,
}: {
  request: Request;
  env: ProxyEnv;
}): Promise<Response> {
  if (!env.API_ORIGIN || !env.PROXY_SECRET) {
    return new Response('Proxy not configured', { status: 500 });
  }

  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete('Host');
  headers.delete('X-Client-IP');
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set('X-Client-IP', clientIp);
  headers.set('X-Proxy-Secret', env.PROXY_SECRET);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(new URL(url.pathname + url.search, env.API_ORIGIN), {
    method: request.method,
    headers,
    // API bodies are small JSON: reading them whole is simpler than streaming.
    body: hasBody ? await request.arrayBuffer() : undefined,
    // Redirects (e.g. back from Google, with the session cookie) go to the browser as they are.
    redirect: 'manual',
  });
}
