/**
 * Leaves the app for another site (e.g. Google's sign-in page). Kept apart so tests can replace
 * it: jsdom cannot navigate away.
 */
export function navigateAway(url: string) {
  window.location.assign(url);
}
