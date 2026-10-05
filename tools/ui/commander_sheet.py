#!/usr/bin/env python3
"""Cut the commander UI's sumi brush art out of one painted sprite sheet.

    python3 tools/ui/commander_sheet.py [tools/ui/src/commander_ink_sheet.webp]

The sheet (transparent background) holds, top to bottom: a huge wide stroke
(the cut-in band), a wide stroke (the banner), a vermilion stroke and an enso,
a vermilion hanko seal and six ink drops. The band is also saved upright as
the backing / mask of the battle team cards (ink_card.webp). Each piece is cropped, cleaned of
stray specks, toned (vermilion for the reds, cream for the enso so it reads on
black ink) and written to assets/ui/ink/cmd_*.webp.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tools", "ui", "src", "commander_ink_sheet.webp")
OUT = os.path.join(ROOT, "assets", "ui", "ink")
VERMILION = np.array([186, 48, 38], np.float32)
PAPER = np.array([239, 230, 207], np.float32)


def pieces(a):
    """Bounding boxes of the painted pieces, largest first."""
    lab, n = ndimage.label(ndimage.binary_dilation(a[..., 3] > 24, iterations=10))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        area = int(((lab[sl] == i + 1) & (a[sl][..., 3] > 24)).sum())
        boxes.append((area, sl))
    return [sl for _, sl in sorted(boxes, key=lambda b: -b[0])]


def clean(c, keep=0.01, pad=8):
    """Drop specks (components under `keep` of the largest), then pad."""
    m = c[..., 3] > 24
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=2))
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        small = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s < keep * sizes.max()])
        c = c.copy()
        c[small, 3] = 0
    out = np.zeros((c.shape[0] + 2 * pad, c.shape[1] + 2 * pad, 4), np.uint8)
    out[pad:-pad, pad:-pad] = c
    return out


def lum(c):
    return c[..., :3].astype(np.float32).mean(axis=2) / 255.0


def tint(c, rgb, fade=0.0):
    """Recolour to `rgb`, keeping the alpha; `fade` thins the paler, dry parts."""
    o = c.copy().astype(np.float32)
    o[..., :3] = rgb
    o[..., 3] *= 1 - fade * lum(c)
    return o.clip(0, 255).astype(np.uint8)


def vermilion(c):
    """Bright red -> vermilion, keeping the paint's light and dark."""
    o = c.copy().astype(np.float32)
    shade = np.clip(o[..., 0] / 225.0, 0.55, 1.15)[..., None]
    o[..., :3] = VERMILION * shade + (o[..., 1:2] + o[..., 2:3]) * 0.25  # pale flecks stay pale
    return o.clip(0, 255).astype(np.uint8)


def save(arr, name, width=None, height=None, q=88):
    im = Image.fromarray(arr, "RGBA")
    if width:
        im = im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS)
    elif height:
        im = im.resize((max(1, round(im.width * height / im.height)), height), Image.LANCZOS)
    im.save(os.path.join(OUT, name), "WEBP", quality=q, method=6, exact=True)
    print(name, im.size)


def main():
    a = np.asarray(Image.open(SRC).convert("RGBA"))
    big, small = pieces(a)[:5], pieces(a)[5:11]
    # the five large pieces by position: top row, second row, then left/right halves
    big = sorted(big, key=lambda sl: (sl[0].start, sl[1].start))
    band, banner = big[0], big[1]
    rest = sorted(big[2:], key=lambda sl: (sl[0].start, sl[1].start))
    red_or_enso = {}
    for sl in rest:
        c = a[sl]
        redness = (c[..., 0].astype(int) - c[..., 1]).clip(0)[c[..., 3] > 24].mean()
        squareish = abs((sl[0].stop - sl[0].start) - (sl[1].stop - sl[1].start)) < 60
        if redness > 60 and not squareish: red_or_enso["red"] = sl
        elif redness > 60: red_or_enso["seal"] = sl
        else: red_or_enso["enso"] = sl

    save(clean(a[band]), "cmd_band.webp", width=1400, q=85)
    # the same stroke stood upright (loaded head at the top): the battle team cards
    up = np.ascontiguousarray(np.rot90(clean(a[band]), k=-1))
    save(up, "ink_card.webp", height=900, q=85)
    save(clean(a[banner]), "cmd_swash.webp", width=720, q=85)
    save(vermilion(clean(a[red_or_enso["red"]], keep=0.02)), "cmd_swash_red.webp", width=560)
    save(vermilion(clean(a[red_or_enso["seal"]], keep=0.05)), "cmd_seal.webp", width=160)
    save(tint(clean(a[red_or_enso["enso"]]), PAPER, fade=0.45), "cmd_enso.webp", width=220)

    # six drops -> one strip of 64px cells (a CSS mask, so white), and one as the dab
    drops = sorted(small, key=lambda sl: (sl[0].start // 80, sl[1].start))
    cell = 64
    strip = Image.new("RGBA", (cell * len(drops), cell), (0, 0, 0, 0))
    for k, sl in enumerate(drops):
        d = Image.fromarray(tint(clean(a[sl], pad=4), (255, 255, 255), fade=0.5), "RGBA")
        d.thumbnail((cell - 4, cell - 4), Image.LANCZOS)
        strip.alpha_composite(d, (k * cell + (cell - d.width) // 2, (cell - d.height) // 2))
        if k == 0:
            d.save(os.path.join(OUT, "cmd_dab.webp"), "WEBP", quality=90, method=6, exact=True)
    strip.save(os.path.join(OUT, "cmd_drops.webp"), "WEBP", quality=90, method=6, exact=True)
    print("cmd_drops.webp", strip.size)


if __name__ == "__main__":
    main()
