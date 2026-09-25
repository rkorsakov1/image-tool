### Background-removal model: ISNet general-use (DIS), 8-bit weights

- **Model:** ISNet, "general use" weights from *Highly Accurate Dichotomous Image Segmentation* (DIS), Qin et al., ECCV 2022
- **Weights license:** Apache-2.0 — https://github.com/xuebinqin/DIS/blob/main/LICENSE.md (copy in `LICENSE`)
- **ONNX export used as input:** `isnet-general-use.onnx` from rembg (MIT), release `v0.0.0`:
  https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
  (178,648,008 bytes, SHA-256 `60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a`)
- **Conversion:** `python scripts/quantize_weights.py isnet-general-use.onnx model.onnx`
  (onnx 1.23.0). Weight-only, per-output-channel 8-bit: 117 weight tensors become `uint8` +
  `DequantizeLinear`. Compute stays fp32, so it runs on both the WASM and WebGPU providers.
  The session sets `session.disable_quant_qdq = 1` so ONNX Runtime constant-folds the
  dequantization at load time (measured: same speed as the fp32 model).
- **Location:** `public/models/isnet-general-use-wq8/model.onnx` (46.7 MB, under GitHub's 50 MB warning)
- **Input:** `input_image`, float32 `[1, 3, 1024, 1024]`, RGB, CHW.
  Normalization (as in rembg): `x = pixel / max(pixel)`, then `(x - 0.5) / 1.0` per channel.
- **Output:** `output_image`, float32 `[1, 1, 1024, 1024]`; min-max normalized to 0…1 and used as alpha.
- **Config:** `SEGMENTATION_MODEL` in `src/worker/segmentationModel.ts`.

#### Why this model

| Candidate | License | Size | Result |
|---|---|---|---|
| RMBG-1.4 / 2.0 (BRIA) | non-commercial | — | excluded by license |
| BiRefNet-lite (onnx-community) | MIT | 224 MB fp32, 115 MB fp16 | over 100 MB; weight-only 8-bit only reached 174 MB |
| ISNet (onnx-community repack) | labelled AGPL-3.0 | 44–176 MB | excluded by license label |
| **ISNet general-use (rembg export of DIS weights)** | **Apache-2.0** | **46.7 MB after 8-bit weights** | **chosen** |
| U²-Netp | Apache-2.0 | 4.6 MB | fast, but IoU vs ISNet fell to 0.22 on a cluttered test photo |

Quality check of the 8-bit file against the original fp32 model (ONNX Runtime CPU, masks
thresholded at 0.5, scikit-image sample photos): IoU 1.000 / 0.998 / 1.000 / 0.991
(astronaut / chelsea / coffee / rocket), mean absolute alpha difference 0.0008.
Dynamic int8 quantization (ConvInteger) was also tried: slightly worse (IoU down to 0.973) and ~3× slower.
