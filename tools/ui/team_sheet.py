#!/usr/bin/env python3
"""Cut the battle team cards' brush art out of the second painted sprite sheet.

    python3 tools/ui/team_sheet.py [tools/ui/src/team_ink_sheet.webp]

The sheet (1254px square, transparent) holds: two upright card strokes and a
washi paper swatch; a wide banner stroke; two thin brush lines; then a round
seal (re-inked indigo: the jutsu seal), a vermilion tick, a black splash and a vermilion splash.
The pieces sit in fixed rows, so each is cut from its region, cleaned of
specks (the splashes keep their spatter), toned and written to
assets/ui/ink/*.webp. Run tools/ui/commander_sheet.py first: this sheet's
banner replaces its cmd_swash.webp.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commander_sheet import OUT, ROOT, clean, save, vermilion  # noqa: E402

INDIGO = np.array([58, 98, 158], np.float32)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tools", "ui", "src", "team_ink_sheet.webp")

# (y0, y1, x0, x1) regions on the 1254px sheet
REGIONS = {
    "card_a": (0, 600, 100, 360),
    "card_b": (0, 600, 430, 700),
    "washi": (60, 540, 770, 1240),
    "banner": (598, 812, 0, 1254),
    "line_a": (812, 900, 0, 1254),
    "line_b": (900, 960, 0, 1254),
    "seal": (962, 1254, 0, 375),
    "tick": (962, 1254, 375, 630),
    "splash_k": (962, 1254, 630, 940),  # the sumi splash: not used (lost on dark ink)
    "splash_r": (962, 1254, 940, 1254),
}


def crop(a, name):
    y0, y1, x0, x1 = REGIONS[name]
    c = a[y0:y1, x0:x1]
    ys, xs = np.nonzero(c[..., 3] > 8)
    return c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def indigo(c):
    """The vermilion seal re-inked indigo (the jutsu seal), keeping its light and dark."""
    o = c.copy().astype(np.float32)
    shade = np.clip(o[..., 0] / 225.0, 0.55, 1.15)[..., None]
    o[..., :3] = INDIGO * shade + (o[..., 1:2] + o[..., 2:3]) * 0.2
    return o.clip(0, 255).astype(np.uint8)


def white(c):
    """A CSS mask: white, keeping the alpha."""
    o = c.copy()
    o[..., :3] = 255
    return o


def main():
    a = np.asarray(Image.open(SRC).convert("RGBA"))
    p = lambda n, **k: clean(crop(a, n), **k)
    save(p("card_a"), "ink_card.webp", height=900, q=85)
    save(p("card_b"), "ink_card_b.webp", height=900, q=85)
    save(clean(crop(a, "washi"), pad=4), "ink_washi.webp", width=256, q=82)
    save(p("banner"), "cmd_swash.webp", width=720, q=85)
    save(white(p("line_a", pad=2)), "ink_line_a.webp", width=600, q=90)
    save(white(p("line_b", pad=2)), "ink_line_b.webp", width=600, q=90)
    save(indigo(p("seal", keep=0.05)), "ink_seal_round.webp", width=160)
    save(vermilion(p("tick", keep=0.05)), "ink_tick.webp", width=96)
    save(vermilion(p("splash_r", keep=0.0005)), "ink_splash_red.webp", width=256)


if __name__ == "__main__":
    main()
