import { useSyncExternalStore } from 'react';

const subscribers = new Map<string, (onChange: () => void) => () => void>();

// One stable subscribe function per query, so React doesn't resubscribe on every render.
const subscribe = (query: string) => {
  let existing = subscribers.get(query);
  if (!existing) {
    existing = (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    };
    subscribers.set(query, existing);
  }
  return existing;
};

export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(subscribe(query), () => window.matchMedia(query).matches);

/** The breakpoint where the three-column layout starts (Tailwind `lg`). */
export const useIsDesktop = (): boolean => useMediaQuery('(min-width: 1024px)');
