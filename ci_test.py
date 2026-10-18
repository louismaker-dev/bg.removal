"""CI smoke test: download lite model, optimise it, cut out a synthetic image."""
import os
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

os.environ["LOCALAPPDATA"] = str(Path("ci-models").resolve())
from bgremover import engine as eng  # noqa: E402

if not eng.model_ready("lite"):
    eng.download_model("lite", lambda f: None)

img = Image.new("RGB", (1400, 1000), (40, 140, 60))
d = ImageDraw.Draw(img)
d.ellipse([400, 200, 1000, 800], fill=(230, 60, 40))
d.rectangle([650, 100, 750, 250], fill=(90, 50, 20))
img.save("ci_test.jpg")

e = eng.Engine()
t = time.time()
s = eng.Settings(quality="Fast")
rgba = e.process("ci_test.jpg", s, print)
out = e.save(rgba, "ci_test.jpg", "ci_out", s)
a = rgba[..., 3]
print("device:", e.device, "time:", round(time.time() - t, 1), "out:", out)
inside, outside = a[500, 700], a[50, 50]
print("alpha inside/outside:", inside, outside)
if not (inside > 200 and outside < 30):
    sys.exit("cut-out looks wrong")
print("OK")
