import { vi } from 'vitest';

/** jsdom has no matchMedia: this one answers whether the device prefers the dark theme. */
export function stubPrefersDark(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  return {
    /** The device switches theme, as a phone does at night. */
    change(next: boolean) {
      dark = next;
      listeners.forEach((listener) => listener());
    },
  };
}
