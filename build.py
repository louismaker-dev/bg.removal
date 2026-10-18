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
    "--hidden-import=clr",
])
