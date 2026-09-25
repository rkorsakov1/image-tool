"""Weight-only 8-bit quantization for the background-removal model (see scripts/vendor-manual.md).

Conv/ConvTranspose/MatMul/Gemm fp32 weights become uint8 + a per-output-channel DequantizeLinear.
Compute stays fp32, so the model runs on every ONNX Runtime execution provider (WASM and WebGPU),
while the file shrinks to about a quarter. With the session option `session.disable_quant_qdq=1`,
ONNX Runtime constant-folds the DequantizeLinear nodes at load time, so inference is as fast as fp32.

Usage: python scripts/quantize_weights.py isnet-general-use.onnx model.onnx
Requires: pip install onnx numpy
"""
import sys
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto

src, dst = sys.argv[1], sys.argv[2]
model = onnx.load(src)
graph = model.graph
inits = {i.name: i for i in graph.initializer}
consumers = {}
for node in graph.node:
    for idx, name in enumerate(node.input):
        consumers.setdefault(name, []).append((node, idx))

new_inits, new_nodes, removed = [], [], set()
MIN_SIZE = 1024
for name, init in list(inits.items()):
    if init.data_type != TensorProto.FLOAT:
        continue
    uses = consumers.get(name, [])
    if not uses or not all((n.op_type in ('Conv', 'ConvTranspose') and i == 1) or (n.op_type in ('MatMul', 'Gemm') and i == 1) for n, i in uses):
        continue
    w = numpy_helper.to_array(init)
    if w.size < MIN_SIZE or w.ndim < 2:
        continue
    op = uses[0][0].op_type
    # Per-channel axis: output channels. Conv: axis 0 (O,I,kh,kw); ConvTranspose: axis 1 (I,O,...); MatMul (K,N): axis 1; Gemm depends on transB.
    if op == 'Conv':
        axis = 0
    elif op == 'ConvTranspose':
        axis = 1
    elif op == 'MatMul':
        axis = w.ndim - 1
    else:
        trans_b = next((a.i for a in uses[0][0].attribute if a.name == 'transB'), 0)
        axis = 0 if trans_b else 1
    if any(n.op_type != op for n, _ in uses):
        continue
    moved = np.moveaxis(w, axis, 0).reshape(w.shape[axis], -1)
    lo = np.minimum(moved.min(axis=1), 0.0)
    hi = np.maximum(moved.max(axis=1), 0.0)
    scale = (hi - lo) / 255.0
    scale[scale == 0] = 1e-8
    zero = np.clip(np.round(-lo / scale), 0, 255).astype(np.uint8)
    shape = [1] * w.ndim
    shape[axis] = w.shape[axis]
    q = np.clip(np.round(w / scale.reshape(shape)) + zero.reshape(shape), 0, 255).astype(np.uint8)
    qname, sname, zname = name + '_q', name + '_scale', name + '_zp'
    new_inits += [numpy_helper.from_array(q, qname), numpy_helper.from_array(scale.astype(np.float32), sname), numpy_helper.from_array(zero, zname)]
    new_nodes.append(helper.make_node('DequantizeLinear', [qname, sname, zname], [name], axis=axis, name=name + '_dq'))
    removed.add(name)

kept = [i for i in graph.initializer if i.name not in removed]
del graph.initializer[:]
graph.initializer.extend(kept + new_inits)
nodes = new_nodes + list(graph.node)
del graph.node[:]
graph.node.extend(nodes)
# DequantizeLinear with per-axis needs opset >= 13.
for opset in model.opset_import:
    if opset.domain in ('', 'ai.onnx') and opset.version < 13:
        opset.version = 13
onnx.checker.check_model(model)
onnx.save(model, dst)
print(f'quantized {len(removed)} weight tensors -> {dst}')
