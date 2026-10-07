/**
 * Loads a page from scratch: another site (Google's sign-in page) or one of ours after signing
 * out, so nothing of the account stays in memory. Kept apart so tests can replace
 * it: jsdom cannot navigate away.
 */
export function navigateAway(url: string) {
  window.location.assign(url);
}
