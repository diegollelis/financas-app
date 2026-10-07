/**
 * Loads a page from scratch: another site (Google's sign-in page) or one of ours after signing
 * out, so nothing of the account stays in memory. Kept apart so tests can replace
 * it: jsdom cannot navigate away.
 */
export function navigateAway(url: string) {
  window.location.assign(url);
}

/** Saves a file made in the page (a download), under `filename`. jsdom cannot, as above. */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
