import { vi } from 'vitest';

/**
 * jsdom has no matchMedia. This one answers whether the device prefers the dark theme; every
 * other query (e.g. `(min-width: 768px)`) is false, so tests see the phone layout.
 */
export function stubPrefersDark(dark: boolean) {
  const listeners = new Set<() => void>();
  const darkQuery = '(prefers-color-scheme: dark)';
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return query === darkQuery && dark;
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    /** The device switches theme, as a phone does at night. */
    change(next: boolean) {
      dark = next;
      listeners.forEach((listener) => listener());
    },
  };
}
