import { useSearchParams } from 'react-router';

/** Query parameter with the page to go back to after signing in: `/entrar?voltar=/convites/...`. */
export const RETURN_TO_PARAM = 'voltar';

/**
 * Only paths inside this app. "//site.com" or "/\site.com" would make the browser leave for
 * another site after a sign-in on ours (open redirect), a classic trick in phishing links.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

/** Where to go after signing in, read from `?voltar=`. */
export function useReturnTo(): string {
  const [searchParams] = useSearchParams();
  return safeReturnTo(searchParams.get(RETURN_TO_PARAM));
}

/** `path` carrying the return page along (sign-in ↔ sign-up links, invitation page). */
export function withReturnTo(path: string, returnTo: string): string {
  return returnTo === '/' ? path : `${path}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`;
}
