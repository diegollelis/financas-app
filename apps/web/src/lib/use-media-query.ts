import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, updated when it changes (rotation, resizing). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** From Tailwind's `md` (768px): a mouse and a wide screen are the usual case (ADR 0036). */
export const DESKTOP_QUERY = '(min-width: 768px)';
