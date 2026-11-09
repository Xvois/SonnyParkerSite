#!/usr/bin/env python3
"""Build the photography wall.

Drop image files into ``resources/photos/`` and run this script. For every
image it:

  1. applies the EXIF orientation (so phone photos are never sideways),
  2. writes a web-sized JPEG thumbnail into ``resources/photos/thumbs/``,
  3. works out the dominant colour of the frame,
  4. writes ``resources/photos/photos.json``, which photography.html reads.

Colour maths uses the same weighted hue histogram as gallery.js, so a
drag-and-drop preview sorts into the same place as the published photograph.

Usage
-----
    python3 scripts/photos.py --src ~/Pictures/icloud-shared-album
    python3 scripts/photos.py            # re-generate thumbnails from sources in place
    python3 scripts/photos.py --clean    # also delete orphaned thumbnails
    python3 scripts/photos.py --max 2000 # web image long edge (default 1400)

Originals are never published: only the resized web image in ``thumbs/`` is
referenced by ``photos.json``, so the repository stays small. Point ``--src`` at
wherever the camera originals live.

Optional caption: drop a sidecar text file next to the image with the same
stem, e.g. ``resources/photos/IMG_4021.txt``, and its first line is used as
the alt text.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
PHOTO_DIR = ROOT / "resources" / "photos"
THUMB_DIR = PHOTO_DIR / "thumbs"
MANIFEST = PHOTO_DIR / "photos.json"

SUPPORTED = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff", ".bmp", ".gif"}
BUCKET_DEGREES = 30


def rgb_to_hsv(r: float, g: float, b: float) -> tuple[float, float, float]:
    """r, g, b in 0-255 -> (hue degrees, saturation 0-1, value 0-1)."""
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    hi = max(r, g, b)
    lo = min(r, g, b)
    delta = hi - lo
    sat = 0.0 if hi == 0 else delta / hi
    hue = 0.0
    if delta:
        if hi == r:
            hue = ((g - b) / delta) % 6
        elif hi == g:
            hue = (b - r) / delta + 2
        else:
            hue = (r - g) / delta + 4
        hue *= 60.0
    return hue, sat, hi


CHROMA_SAT = 0.18          # a pixel counts as "colourful" above this saturation
CHROMA_VAL = 0.15          # ...and above this brightness
NEUTRAL_SHARE = 0.12       # below this fraction of colourful pixels the frame is neutral


def summarise(img: Image.Image, size: int = 48) -> dict:
    """Dominant colour of a frame: a hue in degrees, or a neutral tone.

    Colourfulness is a *share of pixels*, not a weighted sum: a photograph is
    chromatic if enough of it is properly saturated, however bright that patch
    happens to be. The hue itself is the saturation-weighted circular mean, so
    ordering inside the wall is smooth rather than quantised into buckets.
    """
    sample = img.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    raw = sample.tobytes()
    pixels: list[tuple[int, int, int, int]] = [
        (raw[i], raw[i + 1], raw[i + 2], raw[i + 3]) for i in range(0, len(raw), 4)
    ]

    colourful = 0
    seen = 0
    luma_total = 0.0
    x = y = 0.0
    rgb_weight = [0.0, 0.0, 0.0, 0.0]
    tones = {"dark": 0.0, "mid": 0.0, "light": 0.0}

    for r, g, b, a in pixels:
        if a < 200:
            continue
        seen += 1
        hue, sat, val = rgb_to_hsv(r, g, b)
        luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
        luma_total += luma
        tones["light" if luma > 0.72 else "dark" if luma < 0.24 else "mid"] += 1

        if sat <= CHROMA_SAT or val <= CHROMA_VAL:
            continue
        colourful += 1
        w = sat * val
        rad = math.radians(hue)
        x += math.cos(rad) * w
        y += math.sin(rad) * w
        rgb_weight[0] += r * w
        rgb_weight[1] += g * w
        rgb_weight[2] += b * w
        rgb_weight[3] += w

    if seen == 0:
        return {"neutral": True, "tone": "mid", "value": 0.5, "hue": None, "hex": None}

    if colourful / seen < NEUTRAL_SHARE:
        tone = max(("dark", "mid", "light"), key=lambda k: tones[k])
        return {
            "neutral": True,
            "tone": tone,
            "value": luma_total / seen,
            "hue": None,
            "hex": None,
        }

    hue_value = (math.degrees(math.atan2(y, x)) + 360) % 360
    w = rgb_weight[3]
    hexcol = "#%02x%02x%02x" % tuple(round(c / w) for c in rgb_weight[:3])
    return {"neutral": False, "tone": None, "value": None, "hue": hue_value, "hex": hexcol}


def sort_key(entry: dict) -> float:
    if entry["neutral"]:
        return 400 + (entry.get("value") or 0.5) * 40
    return entry.get("hue") or 0.0


def caption_for(path: Path) -> str:
    sidecar = path.with_suffix(".txt")
    if sidecar.exists():
        try:
            return sidecar.read_text(encoding="utf-8").strip().splitlines()[0][:200]
        except (OSError, IndexError):
            return ""
    return ""


def build(src: Path, out: Path, max_edge: int, clean: bool) -> int:
    if not src.is_dir():
        sys.exit(f"no photo directory at {src}")
    thumb_dir = out / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    manifest = out / "photos.json"

    files = sorted(
        p
        for p in src.rglob("*")
        if p.is_file() and p.suffix.lower() in SUPPORTED and not p.name.startswith(".")
    )
    skipped = sorted(
        p for p in src.rglob("*") if p.is_file() and p.suffix.lower() in {".heic", ".heif"}
    )
    for p in skipped:
        print(f"  skipped {p.name}: HEIC needs pillow-heif; export a JPEG instead")

    entries = []
    written = set()

    for path in files:
        rel_thumb = f"thumbs/{path.stem}.jpg"
        thumb_path = thumb_dir / f"{path.stem}.jpg"
        try:
            with Image.open(path) as im:
                im = ImageOps.exif_transpose(im)
                width, height = im.size
                colour = summarise(im)
                thumb = im.copy()
                thumb.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
                if thumb.mode not in ("RGB", "L"):
                    thumb = thumb.convert("RGB")
                thumb.save(thumb_path, "JPEG", quality=84, optimize=True, progressive=True)
        except Exception as err:  # noqa: BLE001 - report and keep going
            print(f"  failed {path.name}: {err}")
            continue

        written.add(thumb_path.name)
        entries.append(
            {
                "file": rel_thumb,
                "thumb": rel_thumb,
                "w": width,
                "h": height,
                "alt": caption_for(path),
                **colour,
            }
        )
        label = "neutral/" + colour["tone"] if colour["neutral"] else f"{colour['hue']:.0f}°"
        print(f"  {path.name:<28} {width}x{height}  {label:>12}  {colour['hex'] or '—'}")

    entries.sort(key=sort_key)

    if clean:
        for thumb in thumb_dir.glob("*.jpg"):
            if thumb.name not in written:
                thumb.unlink()
                print(f"  removed orphaned thumbnail {thumb.name}")

    manifest.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(entries)} photograph(s) -> {manifest}")
    return len(entries)


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the colour-sorted photography wall.")
    ap.add_argument("--src", type=Path, default=PHOTO_DIR, help="folder holding the originals")
    ap.add_argument("--out", type=Path, default=PHOTO_DIR, help="folder for web images + photos.json")
    ap.add_argument("--max", type=int, default=1400, help="web image long edge in px (default 1400)")
    ap.add_argument("--clean", action="store_true", help="delete thumbnails with no source image")
    args = ap.parse_args()
    build(args.src.expanduser(), args.out, args.max, args.clean)


if __name__ == "__main__":
    main()
