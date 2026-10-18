"""BG Remover - offline background removal for Windows."""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time
import traceback
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import numpy as np
from PIL import Image, ImageTk

try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
    HAS_DND = True
except Exception:  # noqa: BLE001
    HAS_DND = False

from bgremover import engine as eng

APP_NAME = "BG Remover"
from bgremover.version import VERSION
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}

BG = "#16181d"
PANEL = "#1f2229"
CARD = "#262a33"
TEXT = "#e8eaee"
MUTED = "#9aa1ad"
ACCENT = "#4f8cff"
OK = "#3ecf8e"
ERR = "#ff6b6b"


def settings_file() -> Path:
    return eng.app_dir() / "settings.json"


def checker(w: int, h: int, sq: int = 12) -> Image.Image:
    y, x = np.mgrid[:h, :w]
    c = (((y // sq + x // sq) % 2) * 40 + 200).astype(np.uint8)
    return Image.fromarray(np.dstack([c, c, c]))


class App:
    def __init__(self) -> None:
        self.root = TkinterDnD.Tk() if HAS_DND else tk.Tk()
        self.root.title(f"{APP_NAME} {VERSION}")
        self.root.geometry("1180x760")
        self.root.minsize(980, 640)
        self.root.configure(bg=BG)
        try:
            self.root.iconbitmap(default=str(Path(getattr(sys, "_MEIPASS", ".")) / "icon.ico"))
        except Exception:  # noqa: BLE001
            pass

        self.engine = eng.Engine()
        self.events: "queue.Queue[tuple]" = queue.Queue()
        self.files: list[str] = []
        self.status: dict[str, str] = {}
        self.results: dict[str, str] = {}
        self.busy = False
        self.stop_flag = False
        self._preview_imgs = []

        saved = self._load_settings()
        self.v_quality = tk.StringVar(value=saved.get("quality", "Best"))
        self.v_output = tk.StringVar(value=saved.get("output", eng.OUTPUT_MODES[0]))
        self.v_refine = tk.BooleanVar(value=saved.get("edge_refine", True))
        self.v_decon = tk.BooleanVar(value=saved.get("decontaminate", True))
        self.v_specks = tk.BooleanVar(value=saved.get("remove_specks", True))
        self.v_gpu = tk.BooleanVar(value=saved.get("use_gpu", True))
        self.v_outdir = tk.StringVar(value=saved.get("outdir", ""))
        self.v_status = tk.StringVar(value="Drop images here to start.")
        self.v_device = tk.StringVar(value="Device: not loaded yet")

        self._style()
        self._build()
        self.root.after(100, self._pump)
        self.root.protocol("WM_DELETE_WINDOW", self._close)

    # ------------------------------------------------------------- settings
    def _load_settings(self) -> dict:
        try:
            return json.loads(settings_file().read_text())
        except Exception:  # noqa: BLE001
            return {}

    def _save_settings(self) -> None:
        data = dict(quality=self.v_quality.get(), output=self.v_output.get(),
                    edge_refine=self.v_refine.get(), decontaminate=self.v_decon.get(),
                    remove_specks=self.v_specks.get(), use_gpu=self.v_gpu.get(),
                    outdir=self.v_outdir.get())
        try:
            settings_file().write_text(json.dumps(data, indent=2))
        except Exception:  # noqa: BLE001
            pass

    def _settings(self) -> eng.Settings:
        return eng.Settings(quality=self.v_quality.get(), output=self.v_output.get(),
                            edge_refine=self.v_refine.get(), decontaminate=self.v_decon.get(),
                            remove_specks=self.v_specks.get())

    # ------------------------------------------------------------------- UI
    def _style(self) -> None:
        st = ttk.Style(self.root)
        st.theme_use("clam")
        st.configure(".", background=BG, foreground=TEXT, fieldbackground=CARD, font=("Segoe UI", 10))
        st.configure("Panel.TFrame", background=PANEL)
        st.configure("TLabel", background=PANEL, foreground=TEXT)
        st.configure("Muted.TLabel", background=PANEL, foreground=MUTED)
        st.configure("Title.TLabel", background=BG, foreground=TEXT, font=("Segoe UI Semibold", 16))
        st.configure("Sub.TLabel", background=BG, foreground=MUTED)
        st.configure("H.TLabel", background=PANEL, foreground=TEXT, font=("Segoe UI Semibold", 11))
        st.configure("TCheckbutton", background=PANEL, foreground=TEXT)
        st.map("TCheckbutton", background=[("active", PANEL)])
        st.configure("TRadiobutton", background=PANEL, foreground=TEXT)
        st.map("TRadiobutton", background=[("active", PANEL)])
        st.configure("TButton", background=CARD, foreground=TEXT, borderwidth=0, padding=(12, 7))
        st.map("TButton", background=[("active", "#323744"), ("disabled", "#22252c")],
               foreground=[("disabled", "#5d636e")])
        st.configure("Accent.TButton", background=ACCENT, foreground="white",
                     font=("Segoe UI Semibold", 11), padding=(16, 10))
        st.map("Accent.TButton", background=[("active", "#3d78ea"), ("disabled", "#2c3a57")])
        st.configure("TCombobox", fieldbackground=CARD, background=CARD, foreground=TEXT,
                     arrowcolor=TEXT, bordercolor=CARD, lightcolor=CARD, darkcolor=CARD, padding=6)
        st.map("TCombobox", fieldbackground=[("readonly", CARD)], foreground=[("readonly", TEXT)],
               selectbackground=[("readonly", CARD)], selectforeground=[("readonly", TEXT)],
               background=[("active", "#323744")])
        self.root.option_add("*TCombobox*Listbox.background", CARD)
        self.root.option_add("*TCombobox*Listbox.foreground", TEXT)
        self.root.option_add("*TCombobox*Listbox.selectBackground", ACCENT)
        st.configure("Vertical.TScrollbar", background=CARD, troughcolor=CARD, arrowcolor=MUTED,
                     bordercolor=CARD, lightcolor=CARD, darkcolor=CARD)
        st.map("Vertical.TScrollbar", background=[("active", "#323744")])
        st.configure("Horizontal.TProgressbar", troughcolor=CARD, background=ACCENT, borderwidth=0)

    def _build(self) -> None:
        top = tk.Frame(self.root, bg=BG)
        top.pack(fill="x", padx=18, pady=(14, 6))
        ttk.Label(top, text=APP_NAME, style="Title.TLabel").pack(side="left")
        ttk.Label(top, textvariable=self.v_device, style="Sub.TLabel").pack(side="right")

        body = tk.Frame(self.root, bg=BG)
        body.pack(fill="both", expand=True, padx=18, pady=6)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=1)

        # ---- left: queue + settings
        left = ttk.Frame(body, style="Panel.TFrame", padding=14)
        left.grid(row=0, column=0, sticky="nsw", padx=(0, 12))

        self.drop = tk.Label(left, text="Drop images or folders here\n\nor use the buttons below",
                             bg=CARD, fg=MUTED, font=("Segoe UI", 10), width=36, height=5,
                             relief="flat", cursor="hand2")
        self.drop.pack(fill="x")
        self.drop.bind("<Button-1>", lambda e: self.add_files())
        if HAS_DND:
            self.drop.drop_target_register(DND_FILES)
            self.drop.dnd_bind("<<Drop>>", self._on_drop)
            self.root.drop_target_register(DND_FILES)
            self.root.dnd_bind("<<Drop>>", self._on_drop)

        btns = ttk.Frame(left, style="Panel.TFrame")
        btns.pack(fill="x", pady=(8, 6))
        ttk.Button(btns, text="Add images", command=self.add_files).pack(side="left")
        ttk.Button(btns, text="Add folder", command=self.add_folder).pack(side="left", padx=6)
        ttk.Button(btns, text="Clear", command=self.clear).pack(side="right")

        lf = tk.Frame(left, bg=CARD)
        lf.pack(fill="both", expand=True)
        self.listbox = tk.Listbox(lf, bg=CARD, fg=TEXT, selectbackground=ACCENT, borderwidth=0,
                                  highlightthickness=0, activestyle="none", height=10,
                                  font=("Segoe UI", 9))
        sb = ttk.Scrollbar(lf, orient="vertical", command=self.listbox.yview)
        self.listbox.configure(yscrollcommand=sb.set)
        self.listbox.pack(side="left", fill="both", expand=True, padx=(6, 0), pady=6)
        sb.pack(side="right", fill="y")
        self.listbox.bind("<<ListboxSelect>>", self._on_select)

        ttk.Label(left, text="Quality", style="H.TLabel").pack(anchor="w", pady=(12, 2))
        qf = ttk.Frame(left, style="Panel.TFrame")
        qf.pack(fill="x")
        for q in eng.QUALITY_MODES:
            ttk.Radiobutton(qf, text=q, value=q, variable=self.v_quality).pack(side="left", padx=(0, 12))
        ttk.Label(left, text="Fast = quick drafts · Best = reads fine detail (hair, edges)",
                  style="Muted.TLabel", font=("Segoe UI", 8)).pack(anchor="w")

        ttk.Label(left, text="Output", style="H.TLabel").pack(anchor="w", pady=(10, 2))
        ttk.Combobox(left, textvariable=self.v_output, values=eng.OUTPUT_MODES,
                     state="readonly").pack(fill="x")

        ttk.Label(left, text="Edges", style="H.TLabel").pack(anchor="w", pady=(10, 2))
        ttk.Checkbutton(left, text="Snap edges to real outline", variable=self.v_refine).pack(anchor="w")
        ttk.Checkbutton(left, text="Remove background colour fringe", variable=self.v_decon).pack(anchor="w")
        ttk.Checkbutton(left, text="Remove small stray bits", variable=self.v_specks).pack(anchor="w")
        ttk.Checkbutton(left, text="Use graphics card (GPU)", variable=self.v_gpu,
                        command=self._gpu_changed).pack(anchor="w", pady=(6, 0))

        ttk.Label(left, text="Save to", style="H.TLabel").pack(anchor="w", pady=(10, 2))
        of = ttk.Frame(left, style="Panel.TFrame")
        of.pack(fill="x")
        self.outlabel = ttk.Label(of, style="Muted.TLabel", width=30)
        self.outlabel.pack(side="left", fill="x", expand=True)
        ttk.Button(of, text="Change", command=self.pick_outdir).pack(side="right")
        self._refresh_outlabel()

        # ---- right: preview + run
        right = ttk.Frame(body, style="Panel.TFrame", padding=14)
        right.grid(row=0, column=1, sticky="nsew")
        right.rowconfigure(1, weight=1)
        right.columnconfigure(0, weight=1)
        right.columnconfigure(1, weight=1)
        ttk.Label(right, text="Original", style="H.TLabel").grid(row=0, column=0, sticky="w")
        ttk.Label(right, text="Result", style="H.TLabel").grid(row=0, column=1, sticky="w", padx=(10, 0))
        self.cv_before = tk.Canvas(right, bg=CARD, highlightthickness=0)
        self.cv_after = tk.Canvas(right, bg=CARD, highlightthickness=0)
        self.cv_before.grid(row=1, column=0, sticky="nsew", pady=(6, 0))
        self.cv_after.grid(row=1, column=1, sticky="nsew", pady=(6, 0), padx=(10, 0))
        for cv in (self.cv_before, self.cv_after):
            cv.bind("<Configure>", lambda e: self._show_selected())
        self.cv_after.bind("<Double-Button-1>", lambda e: self._open_result())

        bottom = ttk.Frame(right, style="Panel.TFrame")
        bottom.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(12, 0))
        bottom.columnconfigure(0, weight=1)
        self.progress = ttk.Progressbar(bottom, mode="determinate")
        self.progress.grid(row=0, column=0, sticky="ew", padx=(0, 12))
        self.btn_run = ttk.Button(bottom, text="Remove backgrounds", style="Accent.TButton",
                                  command=self.start)
        self.btn_run.grid(row=0, column=1)
        self.btn_open = ttk.Button(bottom, text="Open output folder", command=self._open_folder)
        self.btn_open.grid(row=0, column=2, padx=(8, 0))
        ttk.Label(bottom, textvariable=self.v_status, style="Muted.TLabel").grid(
            row=1, column=0, columnspan=3, sticky="w", pady=(8, 0))

    # -------------------------------------------------------------- queue
    def _add(self, paths) -> None:
        added = 0
        for p in paths:
            p = str(p)
            if os.path.isdir(p):
                for f in sorted(Path(p).rglob("*")):
                    if f.suffix.lower() in EXTS and "_nobg" not in f.stem and "_white" not in f.stem:
                        added += self._add_one(str(f))
            elif Path(p).suffix.lower() in EXTS:
                added += self._add_one(p)
        self.v_status.set(f"{len(self.files)} image(s) ready." if added else "No new images found.")
        if added and self.listbox.curselection() == ():
            self.listbox.selection_set(len(self.files) - added)
            self._show_selected()

    def _add_one(self, p: str) -> int:
        if p in self.files:
            return 0
        self.files.append(p)
        self.status[p] = "waiting"
        self.listbox.insert("end", self._row(p))
        return 1

    def _row(self, p: str) -> str:
        icon = {"waiting": "○", "working": "◐", "done": "●", "error": "✕"}[self.status[p]]
        return f" {icon}  {Path(p).name}"

    def _update_row(self, p: str) -> None:
        i = self.files.index(p)
        self.listbox.delete(i)
        self.listbox.insert(i, self._row(p))
        color = {"done": OK, "error": ERR, "working": ACCENT}.get(self.status[p], TEXT)
        self.listbox.itemconfig(i, fg=color)

    def _on_drop(self, event) -> None:
        self._add(self.root.tk.splitlist(event.data))

    def add_files(self) -> None:
        fs = filedialog.askopenfilenames(title="Choose images", filetypes=[
            ("Images", "*.jpg *.jpeg *.png *.webp *.bmp *.tif *.tiff"), ("All files", "*.*")])
        self._add(fs)

    def add_folder(self) -> None:
        d = filedialog.askdirectory(title="Choose a folder of images")
        if d:
            self._add([d])

    def clear(self) -> None:
        if self.busy:
            return
        self.files.clear()
        self.status.clear()
        self.results.clear()
        self.listbox.delete(0, "end")
        self.cv_before.delete("all")
        self.cv_after.delete("all")
        self.progress["value"] = 0
        self.v_status.set("Drop images here to start.")

    def pick_outdir(self) -> None:
        d = filedialog.askdirectory(title="Save results to (Cancel = next to each image)")
        self.v_outdir.set(d or "")
        self._refresh_outlabel()
        self._save_settings()

    def _refresh_outlabel(self) -> None:
        d = self.v_outdir.get()
        self.outlabel.configure(text=d if d else "'nobg' folder next to each image")

    def _outdir_for(self, p: str) -> str:
        return self.v_outdir.get() or str(Path(p).parent / "nobg")

    def _gpu_changed(self) -> None:
        self.engine.use_gpu = self.v_gpu.get()
        self.engine.reset()
        self.v_device.set("Device: will reload on next run")

    # ------------------------------------------------------------ preview
    def _on_select(self, _e=None) -> None:
        self._show_selected()

    def _selected(self):
        sel = self.listbox.curselection()
        if sel and sel[0] < len(self.files):
            return self.files[sel[0]]
        return None

    def _fit(self, im: Image.Image, cv: tk.Canvas) -> Image.Image:
        cw, ch = max(cv.winfo_width(), 50), max(cv.winfo_height(), 50)
        im = im.copy()
        im.thumbnail((cw - 8, ch - 8), Image.LANCZOS)
        return im

    def _show_selected(self) -> None:
        p = self._selected()
        self._preview_imgs = []
        for cv in (self.cv_before, self.cv_after):
            cv.delete("all")
        if not p:
            return
        try:
            src = Image.open(p)
            from PIL import ImageOps
            src = ImageOps.exif_transpose(src).convert("RGB")
            self._draw(self.cv_before, self._fit(src, self.cv_before))
        except Exception:  # noqa: BLE001
            return
        out = self.results.get(p)
        if out and os.path.exists(out):
            res = Image.open(out).convert("RGBA")
            res = self._fit(res, self.cv_after)
            bg = checker(*res.size).convert("RGBA")
            bg.alpha_composite(res)
            self._draw(self.cv_after, bg.convert("RGB"))
        else:
            msg = {"working": "Working on it...", "error": "Failed - see status below"}.get(
                self.status.get(p, ""), "Not processed yet")
            self.cv_after.create_text(self.cv_after.winfo_width() // 2, self.cv_after.winfo_height() // 2,
                                      text=msg, fill=MUTED, font=("Segoe UI", 10))

    def _draw(self, cv: tk.Canvas, im: Image.Image) -> None:
        tkim = ImageTk.PhotoImage(im)
        self._preview_imgs.append(tkim)
        cv.create_image(cv.winfo_width() // 2, cv.winfo_height() // 2, image=tkim)

    def _open_result(self) -> None:
        p = self._selected()
        if p and p in self.results:
            os.startfile(self.results[p]) if hasattr(os, "startfile") else None

    def _open_folder(self) -> None:
        p = self._selected() or (self.files[0] if self.files else None)
        d = self.v_outdir.get() or (self._outdir_for(p) if p else "")
        if d and os.path.isdir(d) and hasattr(os, "startfile"):
            os.startfile(d)

    # --------------------------------------------------------------- run
    def start(self) -> None:
        if self.busy:
            self.stop_flag = True
            self.v_status.set("Stopping after this image...")
            return
        todo = [p for p in self.files if self.status[p] in ("waiting", "error")]
        if not todo:
            todo = list(self.files)
        if not todo:
            self.v_status.set("Add some images first.")
            return
        self._save_settings()
        key = "lite" if self.v_quality.get() == "Fast" else "full"
        if not eng.model_ready(key):
            name, mb, label = eng.MODELS[key]
            if not messagebox.askyesno(
                    APP_NAME, f"First time setup: download the AI model ({label}, about {mb} MB)?\n\n"
                              "This only happens once. After that the app works fully offline."):
                return
        self.busy = True
        self.stop_flag = False
        self.btn_run.configure(text="Stop")
        self.progress["maximum"] = len(todo)
        self.progress["value"] = 0
        self.engine.use_gpu = self.v_gpu.get()
        threading.Thread(target=self._worker, args=(todo, key, self._settings()), daemon=True).start()

    def _worker(self, todo, key, s: eng.Settings) -> None:
        post = self.events.put
        try:
            if not eng.model_ready(key):
                post(("status", "Downloading AI model... 0%"))
                eng.download_model(key, lambda f: post(("status", f"Downloading AI model... {f * 100:.0f}%")))
            ok = 0
            t_all = time.time()
            for n, p in enumerate(todo, 1):
                if self.stop_flag:
                    break
                post(("state", p, "working"))
                t = time.time()
                try:
                    rgba = self.engine.process(p, s, lambda m, n=n: post(("status", f"[{n}/{len(todo)}] {m}")))
                    post(("device", self.engine.device))
                    out = self.engine.save(rgba, p, self._outdir_for(p), s)
                    post(("done", p, out, time.time() - t))
                    ok += 1
                except Exception as e:  # noqa: BLE001
                    traceback.print_exc()
                    post(("error", p, f"{Path(p).name}: {e}"))
                post(("progress", n))
            post(("finish", ok, len(todo), time.time() - t_all))
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            post(("fatal", str(e)))

    def _pump(self) -> None:
        try:
            while True:
                ev = self.events.get_nowait()
                kind = ev[0]
                if kind == "status":
                    self.v_status.set(ev[1])
                elif kind == "device":
                    self.v_device.set(f"Running on: {ev[1]}")
                elif kind == "state":
                    self.status[ev[1]] = ev[2]
                    self._update_row(ev[1])
                    self._focus(ev[1])
                elif kind == "done":
                    _, p, out, secs = ev
                    self.status[p] = "done"
                    self.results[p] = out
                    self._update_row(p)
                    self._focus(p)
                    self.v_status.set(f"Saved {Path(out).name} ({secs:.1f}s)")
                elif kind == "error":
                    self.status[ev[1]] = "error"
                    self._update_row(ev[1])
                    self.v_status.set(f"Error - {ev[2]}")
                elif kind == "progress":
                    self.progress["value"] = ev[1]
                elif kind == "finish":
                    _, ok, total, secs = ev
                    self._done_ui()
                    self.v_status.set(f"Done: {ok}/{total} image(s) in {secs:.0f}s. "
                                      "Double-click the result to open it.")
                elif kind == "fatal":
                    self._done_ui()
                    self.v_status.set(f"Error: {ev[1]}")
                    messagebox.showerror(APP_NAME, ev[1])
        except queue.Empty:
            pass
        self.root.after(80, self._pump)

    def _focus(self, p: str) -> None:
        i = self.files.index(p)
        self.listbox.selection_clear(0, "end")
        self.listbox.selection_set(i)
        self.listbox.see(i)
        self._show_selected()

    def _done_ui(self) -> None:
        self.busy = False
        self.btn_run.configure(text="Remove backgrounds")

    def _close(self) -> None:
        self._save_settings()
        self.root.destroy()
        os._exit(0)

    def run(self) -> None:
        if len(sys.argv) > 1:
            self.root.after(300, lambda: self._add(sys.argv[1:]))
        self.root.mainloop()


def main() -> None:
    # crash log for the windowed exe (no console)
    if getattr(sys, "frozen", False):
        try:
            log = open(eng.app_dir() / "log.txt", "a", encoding="utf-8", buffering=1)
            sys.stdout = sys.stderr = log
        except Exception:  # noqa: BLE001
            pass
    App().run()


if __name__ == "__main__":
    main()
