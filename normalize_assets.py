"""NIMBLADE — normalize_assets.py

Resize + standardize all monster/character/weapon PNG sprites to a uniform canvas
so they look consistent in-game (no more "this goblin is huge, that bandit is tiny").

USAGE (from repo root):
    pip install pillow
    python normalize_assets.py

INPUT  : public/assets/             (your existing PNGs — sub-folders OK)
OUTPUT : public/assets/normalized/  (same filenames + folder structure)

Originals in src/assets/ are NEVER modified. The script skips its own output
folder when scanning, so you can re-run safely.

WHAT IT DOES (per file):
  1. Open PNG, keep transparency
  2. Auto-crop transparent margins (find the actual sprite bounding box)
  3. Resize sprite so its HEIGHT = 500px (preserve aspect ratio)
     - if width then >700px, shrink so width = 700px instead (prevents super-wide bosses overflowing)
  4. Paste centered onto a 800x800 transparent canvas
  5. Save as PNG with optimize=True
  6. If file >500KB, re-quantize to 256 colors and resave
  7. Log a report at the end (files processed, size before/after, any skipped)

ORIGINALS ARE NEVER MODIFIED.
"""
from __future__ import annotations

import sys
from pathlib import Path
from PIL import Image

# ---------- CONFIG (tweakable) ----------
INPUT_DIR = Path("public/assets")
OUTPUT_DIR = Path("public/assets/normalized")
CANVAS_SIZE = 800             # final canvas WxH
TARGET_HEIGHT = 500           # sprite height in px on canvas
MAX_WIDTH = 700               # cap width (for wide bosses)
SIZE_LIMIT_KB = 500           # if output > this, re-quantize


def auto_crop_transparent(img: Image.Image) -> Image.Image:
    """Crop fully-transparent margins so we measure the real sprite size."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bbox = img.getbbox()  # bbox of non-zero pixels (includes alpha)
    return img.crop(bbox) if bbox else img


def resize_to_target(img: Image.Image) -> Image.Image:
    """Resize so height = TARGET_HEIGHT (or width = MAX_WIDTH if wider)."""
    w, h = img.size
    # First pass: scale by height
    scale = TARGET_HEIGHT / h
    new_w = int(w * scale)
    new_h = TARGET_HEIGHT
    # If too wide, scale down further
    if new_w > MAX_WIDTH:
        scale2 = MAX_WIDTH / new_w
        new_w = MAX_WIDTH
        new_h = int(new_h * scale2)
    return img.resize((new_w, new_h), Image.LANCZOS)


def paste_on_canvas(sprite: Image.Image) -> Image.Image:
    """Center sprite on 800x800 transparent canvas."""
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - sprite.width) // 2
    y = (CANVAS_SIZE - sprite.height) // 2
    canvas.paste(sprite, (x, y), sprite)
    return canvas


def save_compressed(img: Image.Image, out_path: Path) -> int:
    """Save PNG. If file > SIZE_LIMIT_KB, re-quantize to 256 colors. Returns final size in bytes."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG", optimize=True)
    size_kb = out_path.stat().st_size / 1024
    if size_kb > SIZE_LIMIT_KB:
        # Quantize while keeping alpha
        alpha = img.split()[-1]
        quant = img.convert("RGB").quantize(colors=256, dither=Image.Dither.FLOYDSTEINBERG)
        quant = quant.convert("RGBA")
        quant.putalpha(alpha)
        quant.save(out_path, format="PNG", optimize=True)
    return out_path.stat().st_size


def process_file(src: Path, dst: Path) -> dict:
    try:
        img = Image.open(src)
        original_size = src.stat().st_size
        cropped = auto_crop_transparent(img)
        resized = resize_to_target(cropped)
        canvas = paste_on_canvas(resized)
        final_size = save_compressed(canvas, dst)
        return {
            "file": str(src.relative_to(INPUT_DIR)),
            "ok": True,
            "before_kb": round(original_size / 1024, 1),
            "after_kb": round(final_size / 1024, 1),
        }
    except Exception as e:
        return {"file": str(src), "ok": False, "error": str(e)}


def main():
    if not INPUT_DIR.exists():
        print(f"❌ Input folder not found: {INPUT_DIR.resolve()}")
        print(f"   Create it and drop your PNG files inside, then rerun.")
        sys.exit(1)

    # Scan all PNGs but skip our own output folder (so re-runs don't loop)
    pngs = [
        p for p in INPUT_DIR.rglob("*.png")
        if OUTPUT_DIR.resolve() not in p.resolve().parents
    ]
    if not pngs:
        print(f"⚠️  No PNG files found in {INPUT_DIR.resolve()}")
        sys.exit(0)

    print(f"🔧 NIMBLADE asset normalizer")
    print(f"   Input : {INPUT_DIR.resolve()}")
    print(f"   Output: {OUTPUT_DIR.resolve()}")
    print(f"   Found : {len(pngs)} PNG files\n")

    results = []
    for src in pngs:
        rel = src.relative_to(INPUT_DIR)
        dst = OUTPUT_DIR / rel
        r = process_file(src, dst)
        results.append(r)
        status = "✅" if r["ok"] else "❌"
        if r["ok"]:
            print(f"{status} {r['file']}  ({r['before_kb']}KB → {r['after_kb']}KB)")
        else:
            print(f"{status} {r['file']}  ERROR: {r['error']}")

    ok = sum(1 for r in results if r["ok"])
    fail = len(results) - ok
    total_before = sum(r.get("before_kb", 0) for r in results if r["ok"])
    total_after = sum(r.get("after_kb", 0) for r in results if r["ok"])
    print(f"\n📊 Done. {ok} ok, {fail} failed.")
    print(f"   Total size: {total_before:.0f}KB → {total_after:.0f}KB "
          f"({(total_after/total_before*100 if total_before else 0):.0f}% of original)")


if __name__ == "__main__":
    main()
