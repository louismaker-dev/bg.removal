"""Rewrite BiRefNet's exported deformable convolutions into a lean form.

The public BiRefNet ONNX export unrolls every deformable conv into ~120 ops
that create several 800MB temporary tensors at once, pushing peak RAM past
6GB. We rebuild each one as "bilinear-sample then 1x1 conv" per kernel tap
(GridSample + Conv, accumulated). Same maths, far less memory, and it only
uses ops every onnxruntime build (CPU / DirectML) supports.
"""
from __future__ import annotations

import re
from collections import OrderedDict

import numpy as np
import onnx
from onnx import helper, numpy_helper

SCOPE_RE = re.compile(r"(.*/atrous_conv)/")


def _attr(node, name, default=None):
    for a in node.attribute:
        if a.name == name:
            return helper.get_attribute_value(a)
    return default


class _B:
    """Tiny graph builder."""

    def __init__(self, prefix: str):
        self.p = prefix
        self.nodes = []
        self.inits = []
        self.i = 0

    def name(self, s):
        self.i += 1
        return f"{self.p}_{s}_{self.i}"

    def const(self, arr, s="c"):
        n = self.name(s)
        self.inits.append(numpy_helper.from_array(np.asarray(arr), n))
        return n

    def op(self, op, inputs, out=None, **attrs):
        out = out or self.name(op.lower())
        self.nodes.append(helper.make_node(op, inputs, [out], name=out + "/n", **attrs))
        return out


def _build(b: _B, x, w_off, b_off, w_mod, b_mod, w_reg, k, pad, y_out):
    K = k * k
    off = b.op("Conv", [x, w_off, b_off], pads=[pad] * 4)                # [B,2K,H,W]
    mod = b.op("Conv", [x, w_mod, b_mod], pads=[pad] * 4)                # [B,K,H,W]
    mod = b.op("Sigmoid", [mod])
    mask = b.op("Add", [mod, mod])                                        # 2*sigmoid

    shp = b.op("Shape", [x])
    H = b.op("Gather", [shp, b.const(np.array(2, np.int64))], axis=0)
    W = b.op("Gather", [shp, b.const(np.array(3, np.int64))], axis=0)
    Hf = b.op("Cast", [H], to=onnx.TensorProto.FLOAT)
    Wf = b.op("Cast", [W], to=onnx.TensorProto.FLOAT)
    zero, one = b.const(np.array(0.0, np.float32)), b.const(np.array(1.0, np.float32))
    ys = b.op("Range", [zero, Hf, one])
    xs = b.op("Range", [zero, Wf, one])
    ys = b.op("Reshape", [ys, b.const(np.array([1, 1, -1, 1], np.int64))])
    xs = b.op("Reshape", [xs, b.const(np.array([1, 1, 1, -1], np.int64))])
    ky = (np.arange(K) // k - pad).astype(np.float32).reshape(1, K, 1, 1)
    kx = (np.arange(K) % k - pad).astype(np.float32).reshape(1, K, 1, 1)
    baseY = b.op("Add", [ys, b.const(ky)])                                # [1,K,H,1]
    baseX = b.op("Add", [xs, b.const(kx)])                                # [1,K,1,W]

    hw = b.op("Slice", [shp, b.const(np.array([2], np.int64)), b.const(np.array([4], np.int64))])
    tgt = b.op("Concat", [b.const(np.array([0, K, 2], np.int64)), hw], axis=0)
    off5 = b.op("Reshape", [off, tgt])
    dy = b.op("Gather", [off5, b.const(np.array(0, np.int64))], axis=2)  # [B,K,H,W]
    dx = b.op("Gather", [off5, b.const(np.array(1, np.int64))], axis=2)
    Y = b.op("Add", [dy, baseY])
    X = b.op("Add", [dx, baseX])
    # normalise for align_corners=1: n = 2*p/(S-1) - 1
    two = b.const(np.array(2.0, np.float32))
    sy = b.op("Div", [two, b.op("Max", [b.op("Sub", [Hf, one]), one])])
    sx = b.op("Div", [two, b.op("Max", [b.op("Sub", [Wf, one]), one])])
    ny = b.op("Sub", [b.op("Mul", [Y, sy]), one])
    nx = b.op("Sub", [b.op("Mul", [X, sx]), one])
    ax = b.const(np.array([-1], np.int64))
    grid = b.op("Concat", [b.op("Unsqueeze", [nx, ax]), b.op("Unsqueeze", [ny, ax])], axis=-1)  # [B,K,H,W,2]

    acc = None
    for t in range(K):
        idx = b.const(np.array(t, np.int64))
        g = b.op("Gather", [grid, idx], axis=1)                            # [B,H,W,2]
        smp = b.op("GridSample", [x, g], mode="bilinear", padding_mode="zeros", align_corners=1)
        m = b.op("Slice", [mask, b.const(np.array([t], np.int64)), b.const(np.array([t + 1], np.int64)),
                           b.const(np.array([1], np.int64))])
        wk = b.const(np.ascontiguousarray(w_reg[:, :, t // k, t % k][:, :, None, None]), "w")
        cin, cout = w_reg.shape[1], w_reg.shape[0]
        if cout <= cin:
            v = b.op("Mul", [b.op("Conv", [smp, wk]), m])
        else:
            v = b.op("Conv", [b.op("Mul", [smp, m]), wk])
        acc = v if acc is None else b.op("Add", [acc, v])
    b.op("Identity", [acc], out=y_out)


def optimize(src: str, dst: str) -> int:
    m = onnx.load(src)
    g = m.graph
    init_map = {i.name: i for i in g.initializer}

    scopes: "OrderedDict[str, list]" = OrderedDict()
    for n in g.node:
        mm = SCOPE_RE.match(n.name)
        if mm:
            scopes.setdefault(mm.group(1), []).append(n)

    replaced = 0
    remove_ids = set()
    insert_at = {}
    new_inits = []
    for scope, inner in scopes.items():
        outs = {o for n in inner for o in n.output}
        ext = []
        for n in inner:
            for i in n.input:
                if i and i not in outs and i not in ext:
                    ext.append(i)
        acts = [e for e in ext if e not in init_map]
        if len(acts) != 1:
            continue
        names = {".".join(e.split(".")[-2:]): e for e in ext if e in init_map}
        need = ["offset_conv.weight", "offset_conv.bias", "modulator_conv.weight",
                "modulator_conv.bias", "regular_conv.weight"]
        if not all(k in names for k in need) or "regular_conv.bias" in names:
            continue
        inner_ids = {id(n) for n in inner}
        consumers = {i for n in g.node if id(n) not in inner_ids for i in n.input}
        consumers |= {o.name for o in g.output}
        y = [o for o in outs if o in consumers]
        if len(y) != 1:
            continue
        convs = [n for n in inner if n.op_type == "Conv" and names["offset_conv.weight"] in n.input]
        if not convs:
            continue
        oc = convs[0]
        strides = list(_attr(oc, "strides", [1, 1]))
        pads = list(_attr(oc, "pads", [0, 0, 0, 0]))
        w_reg = numpy_helper.to_array(init_map[names["regular_conv.weight"]]).astype(np.float32)
        k = w_reg.shape[-1]
        if strides != [1, 1] or w_reg.shape[-2] != k or pads != [k // 2] * 4:
            continue
        b = _B(scope.replace("/", "_").strip("_") + "_lean")
        _build(b, acts[0], names["offset_conv.weight"], names["offset_conv.bias"],
               names["modulator_conv.weight"], names["modulator_conv.bias"], w_reg, k, k // 2, y[0])
        first = min(i for i, n in enumerate(g.node) if id(n) in inner_ids)
        insert_at[first] = b.nodes
        new_inits += b.inits
        remove_ids |= inner_ids
        replaced += 1

    kept = []
    for i, n in enumerate(g.node):
        if i in insert_at:
            kept.extend(insert_at[i])
        if id(n) not in remove_ids:
            kept.append(n)
    del g.node[:]
    g.node.extend(kept)
    g.initializer.extend(new_inits)
    # drop initializers nobody uses any more
    used = {i for n in g.node for i in n.input}
    keep = [i for i in g.initializer if i.name in used]
    del g.initializer[:]
    g.initializer.extend(keep)
    del g.value_info[:]
    onnx.save(m, dst)
    return replaced


if __name__ == "__main__":
    import sys
    print("replaced", optimize(sys.argv[1], sys.argv[2]))
