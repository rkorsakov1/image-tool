# LocalCrop

A client-side tool for cropping, resizing, compressing and retouching images. Everything runs in your browser, and images never leave your device.

**Live:** https://rkorsakov1.github.io/image-tool/

- **Input:** drop files or whole folders, pick files or a folder, paste an image (or an image URL) with Ctrl/Cmd+V, or fetch a URL.
- **Presets:** YouTube thumbnail, Open Graph, 1080 square and more, plus your own. They're saved in the browser, export/import as JSON, and can be shared as a link (`#preset=…`).
- **Crop:** aspect-locked crop box (mouse or keyboard), rule of thirds, rotate/flip, fit-and-pad ("contain"), and an upscale guard.
- **Honest preview:** the output card shows the real encoded file, so the size you see is exactly what you download. Compare view has a before/after slider, zoom and pan.
- **Encoders:** MozJPEG, libwebp, AVIF (libaom) and OxiPNG compiled to WebAssembly. Target-size mode finds the highest quality under e.g. 200 KB. An optional unsharp mask is applied after downscaling.
- **Batch:** a queue with N/P navigation, "apply preset to all", export everything as a ZIP or straight into a folder (Chromium).
- **Retouch:** paint over an object and fill it, either with a flat color or with a smooth (harmonic) fill that recreates gradients and soft shadows.
- **Background removal:** an on-device model (ISNet, Apache-2.0) running on WebGPU or WebAssembly, with Restore/Erase refinement and an optional background color.
- **Works offline** once loaded, and installs as an app. In Chromium, installed LocalCrop appears in "Open with…" for images.
- **No metadata leaks:** EXIF, XMP, IPTC and GPS never reach the output, because it's rebuilt from decoded pixels.

Keyboard shortcuts are listed in the app (press `?`). See [SCOPE.md](SCOPE.md) for the full specification and [VENDOR.md](VENDOR.md) for the vendored runtime assets and model provenance.

## Development

Requires the Node version in `.nvmrc`.

```sh
npm ci
npm run dev        # dev server (the service worker is only registered in production builds)
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ at http://localhost:4173/image-tool/
```

### Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, tests, build, then deploy to GitHub Pages.
It needs a one-time repository setting: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### Dependencies

The runtime dependencies are React and React DOM only. The build uses Vite, TypeScript, Tailwind CSS v4 and Vitest. Versions are pinned exactly (`.npmrc` has `save-exact=true`), and CI installs with `npm ci`.

Runtime assets are **vendored** (committed) so that a rebuild months from now produces the same app:

| What | Where |
|---|---|
| jSquash codec glue + `.wasm` (single-threaded) | `src/vendor/jsquash/` (bundled by Vite) |
| onnxruntime-web 1.30.0 (WebGPU build) | `public/vendor/ort@1.30.0/` |
| Background-removal model (46.7 MB) | `public/models/isnet-general-use-wq8/` |

To upgrade a package, edit its version in `scripts/vendor.mjs` and run `npm run vendor`. That re-copies the files and regenerates `VENDOR.md` with SHA-256 hashes. The model's provenance and conversion (`scripts/quantize_weights.py`) are documented in `scripts/vendor-manual.md`.

### Layout

```
src/lib/        pure logic + unit tests (crop math, presets, templates, quality search, ZIP, CRC32, inpainting…)
src/worker/     encode/fill/compose pipeline (processor worker) and background removal (segment worker)
src/state/      reducer, context, persistence, input handling
src/components/ UI (native elements + Tailwind)
src/pwa/        hand-written service worker + registration
src/vendor/     vendored codec glue + .wasm
```

## Hosting notes and verification

GitHub Pages can't set response headers, so there's no cross-origin isolation and no `SharedArrayBuffer`. All WASM runs single-threaded (ONNX Runtime with `numThreads = 1`), and the Content-Security-Policy is a `<meta>` tag in `index.html`.

Answers to the open questions in SCOPE.md §13, checked with Playwright against the production build in Chrome 153, Firefox 155 and WebKit 26.6:

1. **Model:** ISNet general-use (DIS weights, Apache-2.0), converted to weight-only 8-bit (46.7 MB). IoU ≥ 0.99 against the fp32 model. RMBG was excluded by license; BiRefNet-lite couldn't get under 100 MB. Details are in VENDOR.md.
2. **jSquash from `src/vendor/`:** works unpatched. Vite bundles the glue's `new URL('x.wasm', import.meta.url)`. The upstream JS wrappers aren't vendored; `src/worker/codecs.ts` calls the glue directly, which avoids the `wasm-feature-detect` dependency and the multi-threaded paths.
3. **ONNX Runtime files:** `ort.webgpu.min.mjs` plus `ort-wasm-simd-threaded.asyncify.{mjs,wasm}`. That single wasm serves both the WebGPU and WASM providers.
4. **OffscreenCanvas:** available in Chrome and Firefox. Playwright's WebKit build on Windows has no OffscreenCanvas 2D. There, encoding and the background-removal pre/post-processing fall back to main-thread `<canvas>` behind the same interfaces, and all features still work.
5. **CSP:** unchanged from the spec, with zero violations in all three engines (codecs, ONNX Runtime on WebGPU and WASM, service worker).

Measured: batch export of 30 images blocked the main thread for at most 14 ms. Background removal blocked it for at most 33 ms and took about 8 s on WebGPU, or 24–40 s single-threaded on WASM, including the first download.
