#!/usr/bin/env python3
"""Replace an effect drawn into a unit's sprite sheet with frames from an effect sheet.

    python3 tools/sprites/swap_effect.py <sprite_folder> <sheet> <fx_frames_dir> [--pad 70] [--scale 1.25]

The chibi sheets have their lightning (Chidori / Lightning Blade) painted into
the character frames. For every frame this finds that effect (bright, bluish
pixels, plus the white core inside them), erases it, and composites a frame
of the new effect where it was, sized to it:
  before the first hit frame   -> the effect sheet's charge frames (00-07),
                                  centred on the old effect's white core (the hand)
                                  or its thrust frames (08-10) when the old
                                  effect is a long streak, and on the frame
                                  just before the strike
  on hit frames                -> the star burst (11), alternating with the
                                  full charged frame (07) for a crackle
  after the last hit           -> the dissipating frames (12-15)
The effect sheet is the 4x4 layout: gather, grow, full, thrust x3, burst,
fade x4 (fx_frames_dir/f00.png .. f15.png, transparent, already keyed).

Cells grow by --pad on the top, left and right (never the bottom, so the
feet stay on the floor); frameWidth/frameHeight, anchorX and heightScale are
updated so the body renders at the same size and place. The sheet is
rewritten in place: keep a copy if you may want the old one back.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage


def effect_mask(cell):
    a = np.asarray(cell).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    blue = (al > 40) & (b > 150) & (b - r > 40) & (g > 110)
    blue = ndimage.binary_opening(blue, iterations=1)
    if blue.sum() < 25:
        return None
    near = ndimage.binary_dilation(blue, iterations=5)
    white = (al > 40) & (np.minimum(np.minimum(r, g), b) > 215)
    m = blue | (white & near)
    # the glow fringe around it
    fringe = ndimage.binary_dilation(m, iterations=2) & (al > 0) & (b >= r) & (b > 120)
    return m | fringe


def content_bbox(im):
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return bb or (0, 0, im.size[0], im.size[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("sheet")
    ap.add_argument("fx_dir")
    ap.add_argument("--pad", type=int, default=70)
    ap.add_argument("--scale", type=float, default=1.25)
    args = ap.parse_args()

    meta = json.load(open(os.path.join(args.folder, f"{args.sheet}.json")))
    sheet = Image.open(os.path.join(args.folder, f"{args.sheet}.webp")).convert("RGBA")
    fw, fh, cols, n = meta["frameWidth"], meta["frameHeight"], meta["columns"], meta["frames"]
    hits = sorted(meta.get("hits") or [])
    fx = [Image.open(os.path.join(args.fx_dir, f"f{i:02d}.png")).convert("RGBA") for i in range(16)]
    fx = [f.crop(content_bbox(f)) for f in fx]

    cells = [sheet.crop(((k % cols) * fw, (k // cols) * fh, (k % cols + 1) * fw, (k // cols + 1) * fh)) for k in range(n)]
    found = []
    for k, c in enumerate(cells):
        m = effect_mask(c)
        if m is None:
            found.append(None)
            continue
        ys, xs = np.nonzero(m)
        # centre on the bright white core (the hand), not on the whole effect,
        # which can include a long trailing streak
        a = np.asarray(c).astype(np.int16)
        core = m & (a[..., :3].min(axis=2) > 225)
        cys, cxs = np.nonzero(core) if core.sum() >= 10 else (ys, xs)
        found.append(dict(mask=m, x0=xs.min(), x1=xs.max(), y0=ys.min(), y1=ys.max(),
                          cx=float(cxs.mean()), cy=float(cys.mean()), area=int(m.sum())))

    first_hit = hits[0] if hits else None
    last_hit = hits[-1] if hits else None
    pre = [k for k, f in enumerate(found) if f and (first_hit is None or k < first_hit)]
    post = [k for k, f in enumerate(found) if f and last_hit is not None and k > last_hit]

    P = args.pad
    nfw, nfh = fw + 2 * P, fh + P
    out = Image.new("RGBA", (nfw * cols, nfh * ((n + cols - 1) // cols)), (0, 0, 0, 0))
    plan = []
    for k, (c, f) in enumerate(zip(cells, found)):
        a = np.array(c)
        cell = Image.new("RGBA", (nfw, nfh), (0, 0, 0, 0))
        if f is not None:
            a[f["mask"], 3] = 0
        cell.alpha_composite(Image.fromarray(a, "RGBA"), (P, P))
        if f is not None:
            w, h = f["x1"] - f["x0"] + 1, f["y1"] - f["y0"] + 1
            streak = w > 2.2 * h and w > 60 and f["area"] > 800
            if hits and k in hits:
                j = hits.index(k)
                src = 11 if j % 2 == 0 else 7
            elif k in post:
                src = 12 + min(3, int(4 * post.index(k) / max(1, len(post))))
            elif first_hit is not None and k == first_hit - 1:
                src = 9  # driving it forward into the strike
            elif streak:
                src = 8 + min(2, pre.index(k) % 3) if k in pre else 9
            else:
                src = min(7, int(8 * (pre.index(k) + 1) / max(1, len(pre)))) if k in pre else 7
            e = fx[src]
            if src in (8, 9, 10):  # thrust: the streak's head (right end) at the old streak's head
                s = max(max(w, 1.6 * h) / e.size[0], 0.2) * 1.1
                e = e.resize((max(1, int(e.size[0] * s)), max(1, int(e.size[1] * s))), Image.LANCZOS)
                x = P + f["x1"] - e.size[0] + int(0.12 * e.size[0])
                y = P + (f["y0"] + f["y1"]) / 2 - e.size[1] / 2
            else:
                # hit frames take the old effect's full extent; others its compact size
                size = max(w, h) if (hits and k in hits) else min(max(w, h), 2.0 * np.sqrt(f["area"]))
                s = max(size / max(e.size), 0.12) * args.scale
                e = e.resize((max(1, int(e.size[0] * s)), max(1, int(e.size[1] * s))), Image.LANCZOS)
                if hits and k in hits:  # the strike: centre on the old effect's extent
                    cx, cy = (f["x0"] + f["x1"]) / 2, (f["y0"] + f["y1"]) / 2
                else:
                    cx, cy = f["cx"], f["cy"]
                x = P + cx - e.size[0] / 2
                y = P + cy - e.size[1] / 2
            cell.alpha_composite(e, (int(round(x)), int(round(y))))
            plan.append(f"{k}:{src}")
        out.alpha_composite(cell, ((k % cols) * nfw, (k // cols) * nfh))

    out.save(os.path.join(args.folder, f"{args.sheet}.webp"), "WEBP", quality=92, method=6)
    ax = float(meta.get("anchorX", 0.5))
    meta["anchorX"] = round((ax * fw + P) / nfw, 4)
    meta["heightScale"] = round(float(meta.get("heightScale", 1.0)) * nfh / fh, 4)
    meta["frameWidth"], meta["frameHeight"] = nfw, nfh
    with open(os.path.join(args.folder, f"{args.sheet}.json"), "w") as fp:
        json.dump(meta, fp, indent=2)
    print(args.sheet, "frames->fx", " ".join(plan))


if __name__ == "__main__":
    main()
