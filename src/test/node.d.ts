// The one Node API the tests use. Declared by hand so we don't need @types/node.
declare module 'node:fs/promises' {
  export const readFile: (path: URL) => Promise<Uint8Array>;
}
