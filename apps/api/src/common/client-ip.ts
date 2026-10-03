import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** The client IP, as the web app's proxy saw it (Cloudflare's CF-Connecting-IP, ADR 0033). */
export const CLIENT_IP_HEADER = 'x-client-ip';

/** Proves that a request came through our proxy: only the proxy and the API know it. */
export const PROXY_SECRET_HEADER = 'x-proxy-secret';

function sameSecret(given: string, expected: string): boolean {
  // Comparing digests keeps the lengths equal and the comparison constant-time, so the response
  // time reveals nothing about the secret.
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Anyone can send an X-Client-IP header, so it is kept only when the request also carries the
 * proxy's secret; otherwise it is dropped. Better Auth's rate limit (ADR 0023) reads the IP from
 * it. Without a trusted IP, a request falls into a counter shared by every such request (or
 * 127.0.0.1 in development and tests), so a forged IP cannot dodge the limit. The secret is
 * removed either way, so nothing after this point can see or log it.
 */
export function trustProxiedClientIp(proxySecret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const given = req.headers[PROXY_SECRET_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];
    if (!proxySecret || typeof given !== 'string' || !sameSecret(given, proxySecret)) {
      delete req.headers[CLIENT_IP_HEADER];
    }
    next();
  };
}
