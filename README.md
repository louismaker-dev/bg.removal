# EG Studio

An offline, Canva-style editor for marketplace listing images (Shopee, Lazada, TikTok Shop and others), with AI background removal built in. It runs on Windows with Intel Iris Xe, NVIDIA or AMD graphics, or on the CPU.

## Download
Go to **Releases** → download `EGStudio-win64.zip` → unzip → run `EGStudio.exe`.
The AI model downloads once the first time you remove a background (about 1GB for Best/Balanced, about 220MB for Fast). After that, everything works offline.

## What it does
- **Editor**: page sizes for marketplaces and socials, layers, undo/redo, snapping guides, zoom and pan, right-click menu, keyboard shortcuts, copy/paste images from the clipboard.
- **Templates**: 12 listing templates (hero, sale, clean white, feature callouts, dark tech, price drop, bundle, specs sheet, minimal, campaign day, before/after, live promo). They adapt to any page size.
- **Elements**: shapes, lines and arrows, e-commerce badges (sale, discount, free shipping, COD, ready stock, warranty, price tag and more), about 80 icons, a floor shadow, and a product slot.
- **Text**: 10 bundled fonts plus Windows fonts (including Chinese), font combinations, and effects (shadow, lift, outline, hollow, neon, sticker, highlight).
- **Photos**: one-click AI background removal, restore original, sticker outline, trim, crop, rounded corners, shadows, filters and adjustments, flip, replace.
- **Backgrounds**: colours, gradients, or a photo with blur.
- **Bulk listing generator**: design one listing, then pick a folder of product photos plus an optional CSV (name, price…). It removes each background, places the photo in the product slot, fills the text, and exports them all.
- **Batch background remover** for whole folders (transparent PNG, white JPG, or a white marketplace square).
- **Projects** (`.egs`), autosave with "continue where you left off", and export to PNG/JPG/WebP at 0.5–3×.

### Bulk generator CSV example
```
image,name,price
iphone-case,Shockproof Case,RM 19
powerbank,20000mAh Power Bank,RM 79
```
Type `{{name}}` or `{{price}}` in any text box, or map whole text boxes to columns in the generator. Rows are matched to photos by the `image` column (file name without the extension), or in order if there is no such column.

## Shortcuts
Ctrl+Z/Y undo/redo · Ctrl+C/V/D copy/paste/duplicate · Del delete · Arrows nudge (Shift = 10px) · Ctrl+G / Ctrl+Shift+G group/ungroup · Ctrl+S save · Ctrl+E download · Ctrl+wheel zoom · Space+drag pan · Ctrl+0 fit

## Development
- `python tools/devserver.py` runs the editor in a normal browser at http://127.0.0.1:8765 using the real AI backend.
- `python run.py` runs the desktop app (needs `pip install -r requirements.txt`).
- Every push to `main` builds the Windows app with GitHub Actions, self-tests the exe in a real window, and publishes a release.

## Credits
BiRefNet (MIT), Fabric.js (MIT), Lucide icons (ISC), fonts via Fontsource (SIL OFL).
