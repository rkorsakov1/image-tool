// Small inline SVG icons (stroke-based, 20×20), so we don't need an icon package.

const paths = {
  rotateLeft: 'M4 8V4m0 4h4M4.5 8A6.5 6.5 0 1 1 3.5 12',
  rotateRight: 'M16 8V4m0 4h-4m3.5 0A6.5 6.5 0 1 0 16.5 12',
  flipH: 'M10 3v14M7 6 3 10l4 4V6Zm6 0 4 4-4 4V6Z',
  flipV: 'M3 10h14M6 7l4-4 4 4H6Zm0 6 4 4 4-4H6Z',
  grid: 'M3 3h14v14H3zM7.67 3v14M12.33 3v14M3 7.67h14M3 12.33h14',
  reset: 'M3 10a7 7 0 1 0 2.05-4.95L3 7m0-4v4h4',
  download: 'M10 3v10m0 0-4-4m4 4 4-4M4 15v2h12v-2',
  copy: 'M7 7V4h9v9h-3M4 7h9v9H4z',
  upload: 'M10 13V3m0 0L6 7m4-4 4 4M4 15v2h12v-2',
  folder: 'M3 5h5l2 2h7v9H3z',
  link: 'M8.5 11.5l3-3M7 9l-2 2a2.83 2.83 0 0 0 4 4l2-2m-2-6 2-2a2.83 2.83 0 0 1 4 4l-2 2',
  close: 'M5 5l10 10M15 5 5 15',
  info: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-4V9m0-3h.01',
  keyboard: 'M2 5h16v10H2zM5 8h1m3 0h1m3 0h1M5 11h1m3 0h2m3 0h1',
  up: 'M10 15V5m0 0-4 4m4-4 4 4',
  down: 'M10 5v10m0 0-4-4m4 4 4-4',
  trash: 'M4 6h12M8 6V4h4v2m-6 0 1 11h6l1-11',
  plus: 'M10 4v12M4 10h12',
  zip: 'M5 2h7l4 4v12H5zM9 4h1M9 6h1M9 8h1M9 10h1v3H9z',
} as const;

export type IconName = keyof typeof paths;

export const Icon = ({ name, className = 'size-4' }: { name: IconName; className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d={paths[name]} />
  </svg>
);
