import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetThemeStore } from '@/lib/theme';
import { stubPrefersDark } from './match-media';

// The edge proxy tests (apps/web/edge) run in Node: no window there.
const inBrowser = typeof window !== 'undefined';

// Radix Select and menus call these pointer and scroll APIs, which jsdom lacks.
if (inBrowser) {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  // Radix measures popovers with it; there is no layout in jsdom to observe.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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
