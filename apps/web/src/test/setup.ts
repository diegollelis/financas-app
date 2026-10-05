import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetThemeStore } from '@/lib/theme';
import { stubPrefersDark } from './match-media';

// The edge proxy tests (apps/web/edge) run in Node: no window there.
const inBrowser = typeof window !== 'undefined';

beforeEach(() => {
  // The device prefers light unless a test says otherwise.
  if (inBrowser) stubPrefersDark(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (!inBrowser) return;
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  resetThemeStore();
});
