"""Check GitHub Releases for a newer build and install it in place (Windows)."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, Optional

REPO = "louismaker-dev/bg.removal"
API = f"https://api.github.com/repos/{REPO}/releases/latest"
ASSET = "EGStudio-win64.zip"


def current_tag() -> str:
    """The release tag this exe was built as (written by CI), e.g. v2.0.9."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).parent.parent))
    for p in (base / "bgremover" / "build.txt", Path(__file__).parent / "build.txt"):
        if p.exists():
            return p.read_text(encoding="utf-8").strip()
    return "dev"


def _nums(tag: str) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", tag or ""))


def check() -> dict:
    cur = current_tag()
    req = urllib.request.Request(API, headers={"User-Agent": "EGStudio", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read().decode("utf-8"))
    latest = data.get("tag_name", "")
    asset = next((a for a in data.get("assets", []) if a.get("name") == ASSET), None)
    newer = cur != "dev" and _nums(latest) > _nums(cur)
    return {"current": cur, "latest": latest, "newer": newer, "notes": data.get("body") or "",
            "page": data.get("html_url"), "url": asset and asset.get("browser_download_url"),
            "size": asset and asset.get("size"), "published": data.get("published_at")}


def install(url: str, work: Path, progress: Optional[Callable[[str, float], None]] = None) -> str:
    """Download + unpack the new build, then hand over to a small script that
    swaps the files once this app has closed and starts the new version."""
    if not getattr(sys, "frozen", False) or os.name != "nt":
        raise RuntimeError("Automatic update only works in the installed Windows app.")
    exe = Path(sys.executable)
    app_dir = exe.parent
    upd = work / "update"
    shutil.rmtree(upd, ignore_errors=True)
    upd.mkdir(parents=True)
    zpath = upd / ASSET
    req = urllib.request.Request(url, headers={"User-Agent": "EGStudio"})
    with urllib.request.urlopen(req, timeout=60) as r, open(zpath, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if progress and total:
                progress(f"Downloading update… {done * 100 // total}%", done / total)
    if progress:
        progress("Unpacking…", -1)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(upd / "new")
    src = upd / "new" / "EGStudio"
    if not (src / "EGStudio.exe").exists():
        cand = list((upd / "new").rglob("EGStudio.exe"))
        if not cand:
            raise RuntimeError("Update package looks broken (no EGStudio.exe inside).")
        src = cand[0].parent
    pid = os.getpid()
    bat = work / "apply_update.bat"
    bat.write_text(f"""@echo off
:wait
tasklist /FI "PID eq {pid}" 2>nul | find "{pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)
robocopy "{src}" "{app_dir}" /E /R:5 /W:1 /NFL /NDL /NJH /NJS >nul
start "" "{exe}"
rmdir /s /q "{upd}"
""", encoding="utf-8")
    flags = 0x00000008 | 0x00000200 | 0x08000000  # DETACHED | NEW_GROUP | NO_WINDOW
    subprocess.Popen(["cmd", "/c", str(bat)], creationflags=flags, close_fds=True, cwd=str(work))
    return "ok"
