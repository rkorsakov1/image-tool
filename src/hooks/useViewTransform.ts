import { useEffect, useMemo, useState, type RefObject } from 'react';
import { getViewTransform, type Point, type Size, type ViewTransform } from '../lib/cropMath';

/** Tracks an element's content-box size. */
export const useElementSize = (ref: RefObject<HTMLElement | null>): Size => {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
};

const useDevicePixelRatio = (): number => {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    // Re-subscribe on every change: the media query is specific to the current ratio.
    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    const handleChange = () => setRatio(window.devicePixelRatio || 1);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [ratio]);
  return ratio;
};

type Options = { image: Size; zoom?: 'fit' | number; pan?: Point; padding?: number };

/** Source ↔ screen mapping for the element in `containerRef`. */
export const useViewTransform = (containerRef: RefObject<HTMLElement | null>, { image, zoom = 'fit', pan, padding = 24 }: Options) => {
  const container = useElementSize(containerRef);
  const devicePixelRatio = useDevicePixelRatio();
  const view: ViewTransform | null = useMemo(() => {
    if (container.width === 0 || container.height === 0 || image.width === 0) return null;
    return getViewTransform({ container, image, zoom, pan, devicePixelRatio, padding });
  }, [container, image, zoom, pan, devicePixelRatio, padding]);
  return { view, container, devicePixelRatio };
};
