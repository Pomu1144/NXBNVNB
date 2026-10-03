#!/usr/bin/env python3
"""Pack loose, individually cropped frames into a spritesheet.

    python3 tools/sprites/frames_to_sheet.py <frames_dir> <out_dir> <anim> <i,j,k-l,...>
        [--fps 12] [--loop] [--hits 3,10] [--pingpong] [--stand 184] [--pattern Asset_{}.png]

Ripped frames come cropped to their own bounding box, with no shared origin,
so each frame is registered here: feet on the sheet's floor (bottom-aligned)
and centred on the legs (the centroid of the trouser pixels, falling back to
the frame's middle), which keeps the body still while the cloak and arms move.

Output matches js/sprite-player.js: <anim>.webp in a grid plus <anim>.json
{ frameWidth, frameHeight, frames, columns, fps, loop, hits, heightScale,
anchorX, anchorY }. heightScale is set so a standing figure (--stand px tall
in the source frames) fills 95% of the unit's sprite height, whatever the
sheet's own frame height.
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image


def parse_list(spec):
    out = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = (int(x) for x in part.split("-"))
            out.extend(range(a, b + 1) if a <= b else range(a, b - 1, -1))
        elif part:
            out.append(int(part))
    return out


def leg_x(img):
    """x of the legs: centroid of saturated blue (trouser) pixels in the lower half."""
    a = np.asarray(img).astype(np.int16)
    h = a.shape[0]
    low = a[h // 2:]
    r, g, b, al = low[..., 0], low[..., 1], low[..., 2], low[..., 3]
    blue = (al > 128) & (b > r + 40) & (b > g + 15)
    xs = np.nonzero(blue)[1]
    if xs.size >= 30:
        return float(np.median(xs))
    return img.size[0] / 2.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("out_dir")
    ap.add_argument("anim")
    ap.add_argument("frames")
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--pingpong", action="store_true")
    ap.add_argument("--hits", default="")
    ap.add_argument("--stand", type=float, default=184.0)
    ap.add_argument("--pattern", default="Asset_{}.png")
    ap.add_argument("--columns", type=int, default=12)
    args = ap.parse_args()

    idx = parse_list(args.frames)
    if args.pingpong and len(idx) > 2:
        idx = idx + idx[-2:0:-1]
    imgs = [Image.open(os.path.join(args.frames_dir, args.pattern.format(i))).convert("RGBA") for i in idx]

    ax = [leg_x(im) for im in imgs]
    left = math.ceil(max(ax))
    right = math.ceil(max(im.size[0] - x for im, x in zip(imgs, ax)))
    fw = left + right + 2
    fh = max(im.size[1] for im in imgs) + 2
    cols = min(args.columns, len(imgs))
    rows = math.ceil(len(imgs) / cols)

    sheet = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
    for k, (im, x) in enumerate(zip(imgs, ax)):
        cx, cy = (k % cols) * fw, (k // cols) * fh
        sheet.alpha_composite(im, (cx + 1 + left - round(x), cy + fh - 1 - im.size[1]))

    os.makedirs(args.out_dir, exist_ok=True)
    sheet.save(os.path.join(args.out_dir, f"{args.anim}.webp"), "WEBP", quality=92, method=6)
    meta = {
        "frameWidth": fw, "frameHeight": fh, "frames": len(imgs), "columns": cols,
        "fps": args.fps, "loop": bool(args.loop),
        "hits": parse_list(args.hits) if args.hits else [],
        "heightScale": round(fh / (args.stand / 0.95), 4),
        "anchorX": round((left + 1) / fw, 4), "anchorY": 1.0,
    }
    with open(os.path.join(args.out_dir, f"{args.anim}.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(args.anim, meta)


if __name__ == "__main__":
    main()
