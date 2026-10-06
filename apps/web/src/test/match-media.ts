import { vi } from 'vitest';

/**
 * jsdom has no matchMedia. This one answers whether the device prefers the dark theme and, with
 * `desktop`, whether the screen is at least md (768px); any other query is false. By default
 * tests see a light phone.
 */
export function stubPrefersDark(dark: boolean, { desktop = false }: { desktop?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const answers: Record<string, () => boolean> = {
    '(prefers-color-scheme: dark)': () => dark,
    '(min-width: 768px)': () => desktop,
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return answers[query]?.() ?? false;
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
