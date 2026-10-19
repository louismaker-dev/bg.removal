"""Build EGStudio.exe with PyInstaller (run on Windows)."""
import PyInstaller.__main__

PyInstaller.__main__.run([
    "run.py",
    "--name=EGStudio",
    "--noconfirm",
    "--windowed",
    "--icon=icon.ico",
    "--add-data=icon.ico;.",
    "--add-data=bgremover/web;bgremover/web",
    "--collect-all=webview",
    "--collect-binaries=onnxruntime",
    "--collect-submodules=onnxruntime",
    "--collect-submodules=onnx",
    "--hidden-import=bgremover.optimize",
    "--hidden-import=bgremover.studio",
    "--hidden-import=bgremover.updater",
    "--add-data=bgremover/build.txt;bgremover",
    "--hidden-import=clr",
])

# .NET Framework: allow loading our own DLLs even if Windows marked them as
# downloaded from the internet (belt and braces with the unblock in run.py).
import shutil  # noqa: E402

shutil.copy("EGStudio.exe.config", "dist/EGStudio/EGStudio.exe.config")
