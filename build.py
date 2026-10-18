"""Build BgRemover.exe with PyInstaller (run on Windows)."""
import PyInstaller.__main__

PyInstaller.__main__.run([
    "run.py",
    "--name=BgRemover",
    "--noconfirm",
    "--windowed",
    "--icon=icon.ico",
    "--add-data=icon.ico;.",
    "--collect-all=tkinterdnd2",
    "--collect-binaries=onnxruntime",
    "--collect-submodules=onnxruntime",
    "--collect-submodules=onnx",
    "--hidden-import=bgremover.optimize",
])
