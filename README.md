# BG Remover

Offline background remover for Windows. It uses the BiRefNet AI model and runs on Intel Iris Xe, NVIDIA or AMD graphics (DirectML), or falls back to the CPU.

## Download
Go to **Releases** → download `BgRemover-win64.zip` → unzip → run `BgRemover.exe`.
The first run downloads the AI model once (about 1GB for Best/Balanced, about 220MB for Fast). After that it works fully offline.

## Quality modes
- **Fast**: light model, one pass.
- **Balanced**: full model, reads the image twice (normal + mirrored) and averages.
- **Best**: Balanced plus a high-res pass over the subject's edges, for hair, fur, cables and fine outlines.

All modes then snap the edges to the real outline at full resolution and remove the old background colour from the edges.

## Outputs
- Transparent PNG
- White background JPG
- White square (marketplace): cropped to the product, centred with padding, at least 800px

## Building
Every push to `main` builds the exe with GitHub Actions and publishes it as a release.
