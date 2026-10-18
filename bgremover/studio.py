"""EG Studio - offline listing-image editor with AI background removal.

The interface is a web page (bgremover/web) shown in a native window via
pywebview (Edge WebView2 on Windows). This module is the Python side: AI
background removal, file dialogs, reading/writing files.
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import threading
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from bgremover import engine as eng
from bgremover.version import VERSION

APP_NAME = "EG Studio"
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
MAX_IMPORT = 4096  # longest side when loading photos into the editor


def web_dir() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).parent.parent))
    return base / "bgremover" / "web"


def _b64_to_bytes(data_url: str) -> bytes:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)


def _img_to_data_url(im: Image.Image, fmt: str = "PNG", quality: int = 92) -> str:
    buf = io.BytesIO()
    if fmt == "JPEG":
        im = im.convert("RGB")
        im.save(buf, "JPEG", quality=quality)
        mime = "image/jpeg"
    else:
        im.save(buf, "PNG", optimize=False, compress_level=3)
        mime = "image/png"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


def _open_image(src) -> Image.Image:
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.mode or im.mode == "P" else "RGB")
    return im


class Api:
    """Every public method is callable from JavaScript (window.pywebview.api)."""

    def __init__(self) -> None:
        self._engine = eng.Engine()
        self._lock = threading.Lock()
        self._pmsg = ""
        self._pfrac = -1.0
        self._window = None  # set by main()
        self._cancel = False

    # --------------------------------------------------------------- info
    def info(self):
        return {"version": VERSION, "device": self._engine.device,
                "models": {k: eng.model_ready(k) for k in eng.MODELS},
                "sizes": {k: v[1] for k, v in eng.MODELS.items()},
                "settings": self._load_settings()}

    def progress(self):
        return {"msg": self._pmsg, "frac": self._pfrac, "device": self._engine.device}

    def _log(self, msg: str, frac: float = -1.0) -> None:
        self._pmsg = msg
        self._pfrac = frac

    # ----------------------------------------------------------- settings
    def _settings_path(self) -> Path:
        return eng.app_dir() / "studio_settings.json"

    def _load_settings(self) -> dict:
        try:
            return json.loads(self._settings_path().read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return {}

    def save_settings(self, data: dict):
        cur = self._load_settings()
        cur.update(data or {})
        self._settings_path().write_text(json.dumps(cur, indent=2), encoding="utf-8")
        if "use_gpu" in (data or {}):
            self._engine.use_gpu = bool(data["use_gpu"])
            self._engine.reset()
        return True

    # -------------------------------------------------------------- model
    def download_model(self, key: str):
        try:
            if not eng.model_ready(key):
                self._log("Downloading AI model... 0%", 0)
                eng.download_model(key, lambda f: self._log(f"Downloading AI model... {f * 100:.0f}%", f))
            self._log("", -1)
            return {"ok": True}
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._log("", -1)
            return {"ok": False, "error": str(e)}

    def _settings_obj(self, opts: dict) -> eng.Settings:
        opts = opts or {}
        return eng.Settings(quality=opts.get("quality", "Best"),
                            output=opts.get("output", eng.OUTPUT_MODES[0]),
                            edge_refine=opts.get("edge_refine", True),
                            decontaminate=opts.get("decontaminate", True),
                            remove_specks=opts.get("remove_specks", True),
                            padding_pct=float(opts.get("padding_pct", 8)))

    # ------------------------------------------------------ bg removal
    def remove_bg(self, data_url: str, opts: dict = None):
        """Cut out an image given as data URL. Returns PNG data URL."""
        s = self._settings_obj(opts)
        key = "lite" if s.quality == "Fast" else "full"
        if not eng.model_ready(key):
            return {"ok": False, "need_model": key}
        try:
            with self._lock:
                t = time.time()
                im = _open_image(io.BytesIO(_b64_to_bytes(data_url)))
                rgb = np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0
                rgba = self._engine.process_rgb(rgb, s, lambda m: self._log(m))
                if im.mode == "RGBA":  # keep existing transparency too
                    a0 = np.asarray(im.getchannel("A"))
                    rgba[..., 3] = np.minimum(rgba[..., 3], a0)
                out = Image.fromarray(rgba, "RGBA")
                self._log("", -1)
                return {"ok": True, "data": _img_to_data_url(out), "device": self._engine.device,
                        "secs": round(time.time() - t, 1)}
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._log("", -1)
            return {"ok": False, "error": str(e)}

    def batch_remove(self, paths: list, outdir: str, opts: dict = None):
        """Quick tool: cut out many files and save them."""
        s = self._settings_obj(opts)
        key = "lite" if s.quality == "Fast" else "full"
        if not eng.model_ready(key):
            return {"ok": False, "need_model": key}
        self._cancel = False
        done, errors = [], []
        with self._lock:
            for i, p in enumerate(paths):
                if self._cancel:
                    break
                try:
                    tag = f"[{i + 1}/{len(paths)}] {Path(p).name}: "
                    rgba = self._engine.process(p, s, lambda m: self._log(tag + m, i / len(paths)))
                    od = outdir or str(Path(p).parent / "nobg")
                    done.append(self._engine.save(rgba, p, od, s))
                except Exception as e:  # noqa: BLE001
                    traceback.print_exc()
                    errors.append(f"{Path(p).name}: {e}")
        self._log("", -1)
        return {"ok": True, "done": done, "errors": errors, "device": self._engine.device}

    def cancel_batch(self):
        self._cancel = True
        return True

    # -------------------------------------------------------------- files
    def _dialog(self, kind, **kw):
        import webview
        if not self._window:
            return None
        fd = webview.FileDialog
        kinds = {"open": fd.OPEN, "folder": fd.FOLDER, "save": fd.SAVE}
        return self._window.create_file_dialog(kinds[kind], **kw)

    def pick_images(self, multiple: bool = True):
        r = self._dialog("open", allow_multiple=multiple,
                         file_types=("Images (*.jpg;*.jpeg;*.png;*.webp;*.bmp)", "All files (*.*)"))
        return list(r or [])

    def pick_folder(self):
        r = self._dialog("folder")
        return (r[0] if isinstance(r, (list, tuple)) else r) if r else ""

    def pick_file(self, types: list = None):
        r = self._dialog("open", allow_multiple=False, file_types=tuple(types or ["All files (*.*)"]))
        return r[0] if r else ""

    def pick_save(self, filename: str, types: list = None):
        r = self._dialog("save", save_filename=filename, file_types=tuple(types or ["All files (*.*)"]))
        return (r[0] if isinstance(r, (list, tuple)) else r) if r else ""

    def list_images(self, folder: str, recursive: bool = False):
        f = Path(folder)
        it = f.rglob("*") if recursive else f.glob("*")
        return sorted(str(p) for p in it if p.suffix.lower() in IMG_EXTS and p.is_file())

    def read_image(self, path: str, max_side: int = MAX_IMPORT):
        """Load an image file for the editor (as data URL, downscaled if huge)."""
        try:
            im = _open_image(path)
            if max(im.size) > max_side:
                im.thumbnail((max_side, max_side), Image.LANCZOS)
            fmt = "PNG" if im.mode == "RGBA" else "JPEG"
            return {"ok": True, "data": _img_to_data_url(im, fmt, 95), "name": Path(path).stem,
                    "w": im.size[0], "h": im.size[1]}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}

    def read_text(self, path: str):
        for enc in ("utf-8-sig", "utf-8", "gbk", "latin-1"):
            try:
                return Path(path).read_text(encoding=enc)
            except Exception:  # noqa: BLE001
                continue
        return ""

    def write_text(self, path: str, text: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(text, encoding="utf-8")
        return True

    def save_data_url(self, path: str, data_url: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(_b64_to_bytes(data_url))
        return path

    def join(self, *parts):
        return str(Path(*parts))

    def open_path(self, path: str):
        try:
            if hasattr(os, "startfile"):
                os.startfile(path)  # noqa: S606
            return True
        except Exception:  # noqa: BLE001
            return False

    def autosave(self, data: str, thumb: str = ""):
        d = eng.app_dir()
        (d / "autosave.egs").write_text(data, encoding="utf-8")
        (d / "autosave.thumb").write_text(thumb or "", encoding="utf-8")
        return True

    def load_autosave(self):
        d = eng.app_dir()
        p = d / "autosave.egs"
        if not p.exists():
            return None
        t = d / "autosave.thumb"
        return {"data": p.read_text(encoding="utf-8"),
                "thumb": t.read_text(encoding="utf-8") if t.exists() else ""}

    def recent(self):
        return self._load_settings().get("recent", [])

    def add_recent(self, path: str, name: str, thumb: str):
        rec = [r for r in self.recent() if r.get("path") != path]
        rec.insert(0, {"path": path, "name": name, "thumb": thumb, "t": time.time()})
        self.save_settings({"recent": rec[:12]})
        return True


def main() -> None:
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    import webview

    if getattr(sys, "frozen", False):
        try:
            log = open(eng.app_dir() / "log.txt", "a", encoding="utf-8", buffering=1)
            sys.stdout = sys.stderr = log
        except Exception:  # noqa: BLE001
            pass
    api = Api()
    api._engine.use_gpu = api._load_settings().get("use_gpu", True)
    win = webview.create_window(f"{APP_NAME} {VERSION}", url=str(web_dir() / "index.html"),
                                js_api=api, width=1440, height=900, min_size=(1100, 700),
                                background_color="#16181d", text_select=False)
    api._window = win
    webview.start(http_server=True, debug="--debug" in sys.argv, private_mode=False,
                  storage_path=str(eng.app_dir() / "webview"))


def selftest() -> int:
    """Used by CI on the built exe: check everything needed is bundled."""
    out = eng.app_dir() / "selftest.txt"
    try:
        import onnxruntime as ort
        import webview  # noqa: F401
        from bgremover import optimize  # noqa: F401
        assert (web_dir() / "index.html").exists(), "web files missing"
        assert (web_dir() / "vendor" / "fabric.min.js").exists(), "fabric missing"
        api = Api()
        info = api.info()
        out.write_text("OK " + json.dumps({"providers": ort.get_available_providers(), "info": info}), encoding="utf-8")
        return 0
    except Exception:  # noqa: BLE001
        out.write_text("FAIL " + traceback.format_exc(), encoding="utf-8")
        return 1


if __name__ == "__main__":
    main()
