// Applies the saved theme before the first paint, so a dark screen never flashes white (ADR 0036).
// Loaded synchronously from <head>; an external file, so it never needs an inline-script CSP
// exception. Keep in step with src/lib/theme.ts (same storage key, same colors).
/* global window, document */
(function () {
  var preference = 'system';
  try {
    var stored = window.localStorage.getItem('financas-tema');
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch {
    // Storage blocked: follow the device.
  }
  var dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  if (dark) root.classList.add('dark');
  root.style.colorScheme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0a0a0a' : '#ffffff');
})();
