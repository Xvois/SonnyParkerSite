# Photographs

Everything in this folder becomes the photo wall at `/photography.html`,
arranged by its dominant colour.

## Adding photographs

1. Keep the camera originals wherever you like — they are not published.
2. Point the builder at them:

   ```sh
   python3 scripts/photos.py --src ~/Pictures/icloud-shared-album
   ```

   It orients each frame, writes two JPEGs — `thumbs/` for the wall (1000px
   long edge) and `full/` for the lightbox (2400px) — works out the dominant
   colour, and rewrites `photos.json`.

3. Reload `photography.html`. To publish, commit `photos.json`, `thumbs/` and
   `full/` — the page is static, so nothing is generated at deploy time.

| Command | What it does |
|---|---|
| `python3 scripts/photos.py --src DIR` | Build both image sets + manifest from DIR |
| `python3 scripts/photos.py --clean` | Also delete images whose source is gone |
| `python3 scripts/photos.py --max 3200` | Larger lightbox images (default 2400px) |
| `python3 scripts/photos.py --thumb 1400` | Larger wall images (default 1000px) |

JPEG, PNG, WebP, AVIF and TIFF are read. HEIC is skipped — export a JPEG first.

## Layout

The wall is justified rows: each row gets one height and every photograph's
width follows its own aspect ratio, so landscape and portrait frames sit in the
same band instead of in fixed columns. Row heights are recomputed on resize.

## Captions

Alt text is empty by default. To caption one, drop a text file next to the
original with the same name; its first line becomes the alt text:

```
IMG_4021.JPG
IMG_4021.txt
```

## How the sorting works

Each frame is sampled down to 48×48 pixels. Pixels that are properly saturated
are averaged by hue (weighted by saturation and brightness), which gives the
hue used for sorting. If fewer than 12% of the pixels are colourful, the frame
is treated as neutral and filed at the end of the wall, ordered black → grey →
white.

`gallery.js` implements the same maths so the drag-and-drop preview on the page
sorts a new shoot where it would actually land.
