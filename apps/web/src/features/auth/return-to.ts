import { safeReturnTo } from '@financas/shared';
import { useSearchParams } from 'react-router';

/** Query parameter with the page to go back to after signing in: `/entrar?voltar=/convites/...`. */
export const RETURN_TO_PARAM = 'voltar';

/** Where to go after signing in, read from `?voltar=` (only paths inside this app). */
export function useReturnTo(): string {
  const [searchParams] = useSearchParams();
  return safeReturnTo(searchParams.get(RETURN_TO_PARAM));
}

/** `path` carrying the return page along (sign-in ↔ sign-up links, invitation page). */
export function withReturnTo(path: string, returnTo: string): string {
  return returnTo === '/' ? path : `${path}?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`;
}
