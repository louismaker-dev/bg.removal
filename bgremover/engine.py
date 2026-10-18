"""Background removal engine.

BiRefNet (ONNX) runs on DirectML (Intel / NVIDIA / AMD GPUs on Windows) with an
automatic CPU fallback. On top of the raw model output the engine adds:

* flip test-time augmentation (looks at the image twice, averages)
* high-res tiled pass for edges ("reads" fine detail at ~2048px)
* guided-filter upsampling so the cut-out snaps to real edges at full res
* colour decontamination so old background colour doesn't bleed into edges
"""
from __future__ import annotations

import os
import sys
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np
import onnxruntime as ort

RELEASE = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/"
MODELS = {
    # key: (file name, approx size MB, label)
    "full": ("BiRefNet-general-epoch_244.onnx", 973, "BiRefNet (full)"),
    "lite": ("BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx", 224, "BiRefNet (lite)"),
}
MODEL_RES = 1024
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)

QUALITY_MODES = ("Fast", "Balanced", "Best")
OUTPUT_MODES = ("Transparent PNG", "White background JPG", "White square (marketplace)")

Progress = Optional[Callable[[str], None]]


def app_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~/.local/share")
    d = Path(base) / "BgRemover"
    d.mkdir(parents=True, exist_ok=True)
    return d


def model_dir() -> Path:
    # A "models" folder next to the exe wins (lets you copy models in manually).
    exe_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
    local = exe_dir / "models"
    if local.is_dir():
        return local
    d = app_dir() / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d


def model_path(key: str) -> Path:
    return model_dir() / MODELS[key][0]


def opt_path(key: str) -> Path:
    return model_dir() / (Path(MODELS[key][0]).stem + ".fast.onnx")


def model_ready(key: str) -> bool:
    p = model_path(key)
    return p.is_file() and p.stat().st_size > 1_000_000


def prepare_model(key: str, log: Progress = None) -> None:
    """Build the memory-friendly copy of the model once (keeps the original)."""
    if opt_path(key).is_file():
        return
    try:
        from .optimize import optimize
        if log:
            log("Optimising model for your PC (one time, ~1 min)...")
        tmp = opt_path(key).with_suffix(".tmp")
        optimize(str(model_path(key)), str(tmp))
        tmp.replace(opt_path(key))
    except Exception as e:  # noqa: BLE001
        if log:
            log(f"Optimisation skipped ({e.__class__.__name__}); using original model")


def download_model(key: str, on_progress: Optional[Callable[[float], None]] = None) -> Path:
    name = MODELS[key][0]
    dest = model_path(key)
    tmp = dest.with_suffix(".part")
    req = urllib.request.Request(RELEASE + name, headers={"User-Agent": "BgRemover"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if on_progress and total:
                on_progress(done / total)
    if total and tmp.stat().st_size != total:
        tmp.unlink(missing_ok=True)
        raise IOError("Download incomplete, please try again.")
    tmp.replace(dest)
    return dest


@dataclass
class Settings:
    quality: str = "Best"          # Fast / Balanced / Best
    output: str = "Transparent PNG"
    edge_refine: bool = True       # guided filter snap to real edges
    decontaminate: bool = True     # remove background colour fringe
    remove_specks: bool = True     # delete tiny stray blobs
    padding_pct: float = 8.0       # for marketplace square


class Engine:
    def __init__(self) -> None:
        self.sessions: dict[str, ort.InferenceSession] = {}
        self.device = "CPU"
        self.use_gpu = True

    # ---------------------------------------------------------------- model
    def _session(self, key: str, log: Progress = None) -> ort.InferenceSession:
        if key in self.sessions:
            return self.sessions[key]
        # only keep one model in memory at a time
        self.sessions.clear()
        prepare_model(key, log)
        paths = [p for p in (opt_path(key), model_path(key)) if p.is_file()]
        avail = ort.get_available_providers()
        attempts = []
        if self.use_gpu and "CUDAExecutionProvider" in avail:
            attempts.append((["CUDAExecutionProvider", "CPUExecutionProvider"], "NVIDIA CUDA"))
        if self.use_gpu and "DmlExecutionProvider" in avail:
            attempts.append((["DmlExecutionProvider", "CPUExecutionProvider"], "GPU (DirectML)"))
        attempts.append((["CPUExecutionProvider"], "CPU"))

        last_err = None
        for path, (providers, label) in [(str(p), a) for p in paths for a in attempts]:
            try:
                so = ort.SessionOptions()
                so.enable_cpu_mem_arena = False  # halves peak RAM for this model
                so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                if "DmlExecutionProvider" in providers:
                    so.enable_mem_pattern = False
                    so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                if log:
                    log(f"Loading model on {label}...")
                sess = ort.InferenceSession(path, sess_options=so, providers=providers)
                # smoke test so a broken GPU path falls back now, not mid-batch
                sess.run(None, {sess.get_inputs()[0].name: np.zeros((1, 3, MODEL_RES, MODEL_RES), np.float32)})
                self.device = label
                self.sessions[key] = sess
                return sess
            except Exception as e:  # noqa: BLE001
                last_err = e
                if log:
                    log(f"{label} not usable, falling back ({e.__class__.__name__})")
        raise RuntimeError(f"Could not load model: {last_err}")

    def reset(self) -> None:
        self.sessions.clear()

    # ------------------------------------------------------------ inference
    def _infer(self, sess: ort.InferenceSession, rgb: np.ndarray) -> np.ndarray:
        """rgb float32 0..1 HxWx3 -> probability map at the same HxW."""
        h, w = rgb.shape[:2]
        interp = cv2.INTER_AREA if max(h, w) > MODEL_RES else cv2.INTER_CUBIC
        x = cv2.resize(rgb, (MODEL_RES, MODEL_RES), interpolation=interp)
        x = (x - MEAN) / STD
        x = x.transpose(2, 0, 1)[None].astype(np.float32)
        out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
        prob = 1.0 / (1.0 + np.exp(-out.astype(np.float32)))
        return cv2.resize(prob, (w, h), interpolation=cv2.INTER_LINEAR)

    def _infer_tta(self, sess, rgb):
        a = self._infer(sess, rgb)
        b = self._infer(sess, np.ascontiguousarray(rgb[:, ::-1]))[:, ::-1]
        return (a + b) * 0.5

    def _tiled(self, sess, rgb: np.ndarray, band: np.ndarray, base: np.ndarray, log: Progress) -> np.ndarray:
        """Run the model on overlapping 1024 crops of a ~1800px version.

        Tiles that contain no subject edge are skipped (the global view is
        kept there), so plain product shots stay quick.
        """
        h, w = rgb.shape[:2]
        scale = 1792.0 / max(h, w)
        W, H = max(MODEL_RES, round(w * scale)), max(MODEL_RES, round(h * scale))
        big = cv2.resize(rgb, (W, H), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
        band_b = cv2.resize(band, (W, H), interpolation=cv2.INTER_LINEAR)
        base_b = cv2.resize(base, (W, H), interpolation=cv2.INTER_LINEAR)
        acc = np.zeros((H, W), np.float32)
        wsum = np.zeros((H, W), np.float32)
        win1 = np.hanning(MODEL_RES + 2)[1:-1].astype(np.float32) + 1e-3
        win = np.outer(win1, win1)

        def starts(n):
            if n <= MODEL_RES:
                return [0]
            k = int(np.ceil((n - MODEL_RES) / (MODEL_RES * 0.75))) + 1
            return [round(i * (n - MODEL_RES) / (k - 1)) for i in range(k)]

        ys, xs = starts(H), starts(W)
        todo = [(y, x) for y in ys for x in xs
                if band_b[y:y + MODEL_RES, x:x + MODEL_RES].max() > 0.01]
        for i, (y, x) in enumerate(todo, 1):
            if log:
                log(f"Reading fine detail {i}/{len(todo)}...")
            crop = big[y:y + MODEL_RES, x:x + MODEL_RES]
            ch, cw = crop.shape[:2]
            p = self._infer(sess, crop)
            acc[y:y + ch, x:x + cw] += p * win[:ch, :cw]
            wsum[y:y + ch, x:x + cw] += win[:ch, :cw]
        tiled = np.where(wsum > 1e-4, acc / np.maximum(wsum, 1e-6), base_b)
        return cv2.resize(tiled, (w, h), interpolation=cv2.INTER_LINEAR)

    def predict(self, rgb: np.ndarray, s: Settings, log: Progress = None) -> np.ndarray:
        key = "lite" if s.quality == "Fast" else "full"
        sess = self._session(key, log)
        # work at <= 2048 for prediction, refine later at full res
        h, w = rgb.shape[:2]
        f = min(1.0, 2048.0 / max(h, w))
        work = cv2.resize(rgb, (round(w * f), round(h * f)), interpolation=cv2.INTER_AREA) if f < 1 else rgb

        if log:
            log("Reading the whole image...")
        if s.quality == "Fast":
            prob = self._infer(sess, work)
        else:
            prob = self._infer_tta(sess, work)

        if s.quality == "Best" and max(work.shape[:2]) > MODEL_RES * 1.1:
            # Trust tiles only around the subject's boundary; the global view
            # decides what is subject vs background everywhere else.
            hard = (prob > 0.5).astype(np.uint8)
            k = max(3, int(max(work.shape[:2]) * 0.02)) | 1
            ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
            band = cv2.morphologyEx(hard, cv2.MORPH_GRADIENT, ker).astype(np.float32)
            band = np.maximum(band, ((prob > 0.03) & (prob < 0.97)).astype(np.float32))
            band = cv2.GaussianBlur(band, (0, 0), k / 4)
            tiled = self._tiled(sess, work, band, prob, log)
            prob = prob * (1 - band) + tiled * band

        if f < 1:
            prob = cv2.resize(prob, (w, h), interpolation=cv2.INTER_LINEAR)
        return np.clip(prob, 0, 1).astype(np.float32)

    # ------------------------------------------------------- post-processing
    @staticmethod
    def guided_filter(guide: np.ndarray, src: np.ndarray, r: int, eps: float) -> np.ndarray:
        gray = cv2.cvtColor(guide, cv2.COLOR_RGB2GRAY)
        box = lambda a: cv2.boxFilter(a, -1, (r, r))  # noqa: E731
        mI, mp = box(gray), box(src)
        cov = box(gray * src) - mI * mp
        var = box(gray * gray) - mI * mI
        a = cov / (var + eps)
        b = mp - a * mI
        return box(a) * gray + box(b)

    def refine(self, rgb: np.ndarray, alpha: np.ndarray, s: Settings) -> np.ndarray:
        h, w = alpha.shape
        if s.edge_refine:
            r = max(3, int(max(h, w) / 400)) | 1
            g = self.guided_filter(rgb, alpha, r, 1e-4)
            # only let the filter act near edges; keep solid areas solid
            edge = ((alpha > 0.01) & (alpha < 0.99)).astype(np.uint8)
            edge = cv2.dilate(edge, np.ones((r * 2 + 1, r * 2 + 1), np.uint8)).astype(np.float32)
            edge = cv2.GaussianBlur(edge, (0, 0), r / 2)
            alpha = np.clip(alpha * (1 - edge) + g * edge, 0, 1)
        # crush near-zero/near-one noise
        alpha = np.clip((alpha - 0.02) / 0.96, 0, 1)
        if s.remove_specks:
            mask = (alpha > 0.5).astype(np.uint8)
            n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
            if n > 2:
                areas = stats[1:, cv2.CC_STAT_AREA]
                min_area = max(areas.max() * 0.005, h * w * 0.0002)
                small = np.where(areas < min_area)[0] + 1
                if len(small):
                    kill = np.isin(lab, small)
                    kill = cv2.dilate(kill.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
                    alpha[kill & (mask == 1)] = 0
                    alpha[kill] = np.minimum(alpha[kill], 0.0)
        return alpha.astype(np.float32)

    @staticmethod
    def estimate_foreground(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
        """Blur-fusion foreground estimation (Forte & Pitie 2021)."""
        a = alpha[..., None]

        def bf(F, B, r):
            ba = cv2.blur(alpha, (r, r))[..., None]
            bF = cv2.blur(F * a, (r, r)) / (ba + 1e-5)
            bB = cv2.blur(B * (1 - a), (r, r)) / ((1 - ba) + 1e-5)
            F = bF + a * (rgb - a * bF - (1 - a) * bB)
            return np.clip(F, 0, 1), bB

        F, B = bf(rgb, rgb, 91)
        F, _ = bf(F, B, 7)
        return F.astype(np.float32)

    # ------------------------------------------------------------- pipeline
    def process(self, path: str, s: Settings, log: Progress = None):
        """Cut out an image file. Returns RGBA uint8."""
        return self.process_rgb(load_rgb(path), s, log)

    def process_rgb(self, rgb: np.ndarray, s: Settings, log: Progress = None):
        """rgb float32 0..1 -> RGBA uint8 cut-out."""
        alpha = self.predict(rgb, s, log)
        if log:
            log("Polishing edges...")
        alpha = self.refine(rgb, alpha, s)
        fg = self.estimate_foreground(rgb, alpha) if s.decontaminate else rgb
        rgba = np.dstack([fg, alpha])
        return (np.clip(rgba * 255 + 0.5, 0, 255)).astype(np.uint8)

    def save(self, rgba: np.ndarray, src_path: str, out_dir: str, s: Settings) -> str:
        stem = Path(src_path).stem
        os.makedirs(out_dir, exist_ok=True)
        if s.output == "Transparent PNG":
            out = os.path.join(out_dir, f"{stem}_nobg.png")
            write_image(out, cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
            return out
        img = rgba
        if s.output.startswith("White square"):
            img = square_canvas(rgba, s.padding_pct)
        white = composite_white(img)
        out = os.path.join(out_dir, f"{stem}_white.jpg")
        write_image(out, cv2.cvtColor(white, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])
        return out


# ------------------------------------------------------------------ helpers
def load_rgb(path: str) -> np.ndarray:
    from PIL import Image, ImageOps
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)  # respect phone rotation
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    im = im.convert("RGB")
    return np.asarray(im, dtype=np.float32) / 255.0


def write_image(path: str, img: np.ndarray, params=None) -> None:
    # cv2.imwrite can't handle non-ASCII Windows paths; encode then write.
    ext = os.path.splitext(path)[1]
    ok, buf = cv2.imencode(ext, img, params or [])
    if not ok:
        raise IOError(f"Could not encode {path}")
    buf.tofile(path)


def composite_white(rgba: np.ndarray) -> np.ndarray:
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    rgb = rgba[..., :3].astype(np.float32)
    return np.clip(rgb * a + 255 * (1 - a) + 0.5, 0, 255).astype(np.uint8)


def square_canvas(rgba: np.ndarray, pad_pct: float) -> np.ndarray:
    ys, xs = np.where(rgba[..., 3] > 8)
    if len(xs) == 0:
        return rgba
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape[:2]
    side = int(round(max(ch, cw) / (1 - 2 * pad_pct / 100.0)))
    side = max(side, 800)  # marketplaces like >= 800px
    canvas = np.zeros((side, side, 4), np.uint8)
    scale = min((side * (1 - 2 * pad_pct / 100.0)) / max(ch, cw), 1e9)
    if abs(scale - 1) > 1e-3:
        crop = cv2.resize(crop, (max(1, round(cw * scale)), max(1, round(ch * scale))),
                          interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
        ch, cw = crop.shape[:2]
    y0, x0 = (side - ch) // 2, (side - cw) // 2
    canvas[y0:y0 + ch, x0:x0 + cw] = crop
    return canvas
