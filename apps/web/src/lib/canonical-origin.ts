/**
 * Where to send someone who opened the app at an old address (ADR 0039): the same path, search
 * and hash at the canonical origin, or null to stay. Only production sets the canonical origin,
 * so previews, development and tests never move. After the switch the API accepts sign-ins only
 * from its WEB_ORIGIN, so staying at the old address would break them.
 */
export function canonicalRedirect(currentHref: string, canonicalOrigin?: string): string | null {
  if (!canonicalOrigin) return null;
  const current = new URL(currentHref);
  const canonical = new URL(canonicalOrigin);
  if (current.origin === canonical.origin) return null;
  return new URL(`${current.pathname}${current.search}${current.hash}`, canonical.origin).href;
}
