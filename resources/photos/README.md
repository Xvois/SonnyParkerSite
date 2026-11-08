# Photographs

Everything in this folder becomes the photo wall at `/photography.html`,
arranged by its dominant colour.

## Adding photographs

1. Drop the image files in here — `jpg`, `png`, `webp`, `avif` and `tiff` all
   work. HEIC from an iPhone needs converting first (Preview → Export → JPEG).
2. Run the builder from the repo root:

   ```sh
   python3 scripts/photos.py
   ```

   It orients each file correctly, writes a web-sized thumbnail into `thumbs/`,
   works out the dominant colour, and rewrites `photos.json`.

3. Reload `photography.html`. To publish, commit **both** the image and
   `photos.json` (and `thumbs/`) — the page is static, so nothing is generated
   at deploy time.

Useful flags:

| Command | What it does |
|---|---|
| `python3 scripts/photos.py` | Rebuild thumbnails and the manifest |
| `python3 scripts/photos.py --clean` | Also delete thumbnails whose source is gone |
| `python3 scripts/photos.py --max 1400` | Bigger thumbnails (default 720px long edge) |

## Captions

The alt text is empty by default — a photograph wall is decorative. To caption
one, drop a text file next to it with the same name:

```
IMG_4021.jpg
IMG_4021.txt   ← first line becomes the alt text
```

## How the sorting works

Each frame is sampled down to 48×48 pixels. Pixels that are properly saturated
are averaged by hue (weighted by saturation and brightness), which gives the
hue used for sorting. If fewer than 12% of the pixels are colourful, the frame
is treated as neutral and filed at the end of the wall, ordered black → grey →
white.

`gallery.js` implements the same maths so the drag-and-drop preview on the page
sorts a new shoot where it would actually land.
