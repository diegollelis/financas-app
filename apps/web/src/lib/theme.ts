import { useCallback, useSyncExternalStore } from 'react';

/**
 * Light or dark theme (ADR 0036). "system" follows the device, and is the default. The choice is a
 * convenience of this browser only: it lives in localStorage and never goes to the API.
 *
 * `public/theme-init.js` repeats the minimum of this file to apply the theme before the first
 * paint; keep the two in step.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'financas-tema';

/** The `--background` of each theme, for the browser bar (`<meta name="theme-color">`). */
const themeColors: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#0a0a0a' };

const darkQuery = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Storage can be missing or throw (private windows, blocked site data): then "system". */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeColors[resolved]);
  return resolved;
}

// A tiny store: the preference changes from the menu, the resolved theme also with the device.
const listeners = new Set<() => void>();
let preference: ThemePreference | undefined;

function currentPreference() {
  preference ??= readThemePreference();
  return preference;
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Not saved: the choice still holds until the page is closed.
  }
  applyTheme(next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia(darkQuery);
  const onSystemChange = () => {
    if (currentPreference() === 'system') applyTheme('system');
    listener();
  };
  media.addEventListener('change', onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
  };
}

/** Forgets the cached preference; for tests, which reset localStorage between cases. */
export function resetThemeStore() {
  preference = undefined;
}

export function useTheme() {
  const current = useSyncExternalStore(subscribe, currentPreference);
  const resolved = useSyncExternalStore(subscribe, () => resolveTheme(currentPreference()));
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference: current, resolved, setPreference };
}
