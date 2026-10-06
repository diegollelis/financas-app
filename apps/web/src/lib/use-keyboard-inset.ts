import { useSyncExternalStore } from 'react';

/**
 * The phone's virtual keyboard (ADR 0036). Chrome on Android (since 108) and Safari on iOS shrink
 * only the *visual* viewport when it opens: `position: fixed; bottom: 0` stays at the bottom of
 * the layout, under the keyboard. The visual viewport tells how much of the screen it covers.
 */
function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  viewport.addEventListener('resize', onChange);
  viewport.addEventListener('scroll', onChange);
  return () => {
    viewport.removeEventListener('resize', onChange);
    viewport.removeEventListener('scroll', onChange);
  };
}

/** Pixels hidden at the bottom of the screen (the keyboard); 0 without a visual viewport. */
function keyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

/** The height left visible above the keyboard. */
function visibleHeight() {
  return Math.round(window.visualViewport?.height ?? window.innerHeight);
}

export function useKeyboardInset() {
  const inset = useSyncExternalStore(subscribe, keyboardInset);
  const visible = useSyncExternalStore(subscribe, visibleHeight);
  return { inset, visibleHeight: visible };
}
