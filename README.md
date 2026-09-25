# LocalCrop

A client-side tool for cropping, resizing, compressing and retouching images. Everything runs in your browser, and images never leave your device.

**Live:** https://rkorsakov1.github.io/image-tool/

- Drop, pick or paste images (or paste an image URL). Folders work too.
- Presets for common sizes (YouTube thumbnail, Open Graph, 1080 square…), plus your own. Export and import them as JSON.
- Crop with a locked aspect ratio, rotate/flip, or fit-and-pad ("contain").
- The preview is the real encoded file: the size shown is the exact size you download.
- High-quality encoders compiled to WebAssembly: MozJPEG, libwebp, libavif (AVIF), OxiPNG.
- Target-size mode finds the highest quality that fits under e.g. 200 KB.
- Output never carries EXIF/GPS metadata; it's rebuilt from decoded pixels.

See [SCOPE.md](SCOPE.md) for the full specification and [VENDOR.md](VENDOR.md) for vendored runtime assets.

## Development

Requires the Node version in `.nvmrc`.

```sh
npm ci
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ at http://localhost:4173/image-tool/
```

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`. In the repository settings, **Pages → Build and deployment → Source** must be set to **GitHub Actions**.

### Dependencies

The runtime dependencies are React and React DOM only. The build uses Vite, TypeScript, Tailwind CSS v4 and Vitest. Versions are pinned exactly (`.npmrc` has `save-exact=true`), and CI installs with `npm ci`.

WASM codecs are **vendored** into `src/vendor/` rather than installed from npm, so a rebuild months from now produces the same app. To upgrade one, edit the versions in `scripts/vendor.mjs` and run:

```sh
npm run vendor     # re-copies the files and regenerates VENDOR.md (with SHA-256 hashes)
```

### Layout

```
src/lib/        pure logic (crop math, presets, filename templates, quality search…) + tests
src/worker/     encode pipeline, runs in a Web Worker with OffscreenCanvas
src/state/      reducer, context, persistence, input handling
src/components/ UI (native elements + Tailwind)
src/vendor/     vendored jSquash codec glue + .wasm
```

## Hosting notes

GitHub Pages can't set response headers, so there is no cross-origin isolation and no `SharedArrayBuffer`. All WASM runs single-threaded. The Content-Security-Policy is a `<meta>` tag in `index.html`.
