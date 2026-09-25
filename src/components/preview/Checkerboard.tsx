import { cn } from '../../lib/cn';

/** Classes for a checkerboard background that shows through transparent pixels. */
export const checkerboardClass = cn(
  'bg-[length:16px_16px] bg-[conic-gradient(#e2e8f0_25%,#ffffff_0_50%,#e2e8f0_0_75%,#ffffff_0)]',
  'dark:bg-[conic-gradient(#334155_25%,#1e293b_0_50%,#334155_0_75%,#1e293b_0)]',
);
