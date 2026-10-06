import { useEffect, useRef, useState } from 'react';

/**
 * The width of an element, kept up to date (rotation, resizing, the sidebar appearing), so an SVG
 * can be drawn at its real size instead of being stretched, which would distort its text.
 * `fallback` is used until the first measure (and in jsdom, which has no layout).
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const measured = Math.round(element.getBoundingClientRect().width);
      if (measured > 0) setWidth(measured);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
