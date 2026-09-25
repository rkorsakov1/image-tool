import { useEffect } from 'react';

let locks = 0;
let savedScrollY = 0;

/**
 * Stops the page behind a modal from scrolling. `overflow: hidden` alone isn't enough on iOS
 * Safari, so the body is pinned with position: fixed and the scroll position restored afterwards.
 */
export const useScrollLock = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks === 0) {
      savedScrollY = window.scrollY;
      body.style.position = 'fixed';
      body.style.top = `-${savedScrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.overflow = 'hidden';
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks > 0) return;
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      window.scrollTo(0, savedScrollY);
    };
  }, [active]);
};

/**
 * Publishes the height covered by the on-screen keyboard (and collapsing browser chrome) as the
 * CSS variable --kb, so bottom-anchored UI can sit above it. iOS doesn't resize the layout
 * viewport for the keyboard; only visualViewport knows.
 */
export const useKeyboardInset = (): void => {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      root.style.setProperty('--kb', `${Math.round(inset)}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
};
