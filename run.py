import os
import sys


def _unblock_downloaded_files() -> None:
    """Windows tags every file unzipped from a downloaded zip as 'from the
    internet' (a hidden Zone.Identifier stream). .NET then refuses to load
    the window library (Python.Runtime.dll) and the app crashes at start.
    Removing the tag from our own files fixes it; it's what the zip's
    Properties > Unblock checkbox does."""
    if os.name != "nt" or not getattr(sys, "frozen", False) or os.environ.get("EGS_NO_UNBLOCK"):
        return
    root = os.path.dirname(sys.executable)
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.endswith((".dll", ".exe", ".pyd", ".config")):
                try:
                    os.remove(os.path.join(dirpath, f) + ":Zone.Identifier")
                except OSError:
                    pass


_unblock_downloaded_files()

from bgremover.studio import main  # noqa: E402

if __name__ == "__main__":
    main()
