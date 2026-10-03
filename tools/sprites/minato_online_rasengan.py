#!/usr/bin/env python3
"""Rasengan for Minato's Naruto Online ultimate (the Hokage Cloak skin).

    python3 tools/sprites/minato_online_rasengan.py "<rip>/In Battle" <out_dir>
    python3 tools/sprites/frames_to_sheet.py <out_dir>/fx assets/sprites/skins/minato_2101_online \\
        ultimate 0-26 --fps 12 --hits 17,18,19 --stand 187 --reg-dir <out_dir>/raw

The rip only has a grey placeholder ball where the Rasengan effect was. This
composites the owner's Rasengan effect sheet (tools/sprites/src/rasengan/,
16 keyed frames of its 4x4 layout: gather, grow, full, two thrust frames,
burst, four fade frames) over it:
  charge (Asset 172-173)          gather and grow (f00-f07), in his hand
  lunge (174-179, 163-165)        the full sphere spinning (f04-f07), in his hand
  last lunge frame                the thrust, trail behind (f10)
  impact, the lunge held (166)    the star burst ahead of his fist (f11), then
                                  the wisps scattering away (f12-f15)
The rip's grey ball is erased under the effect.
Writes <out_dir>/fx/Asset_<k>.png (with effects) and <out_dir>/raw/Asset_<k>.png
(the same frames without them, for leg registration).
"""

import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else "In Battle"
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
FX = os.path.join(HERE, "src", "rasengan")

# source frame -> (hand x, hand y, sphere radius) in that frame's pixels
MARKS = {
    172: (97, 85, 15),
    173: (108, 70, 28),
    174: (111, 51, 14),
    175: (112, 53, 14),
    176: (77, 40, 13),
    177: (21, 21, 13),
    178: (23, 23, 14),
    179: (29, 15, 14),
    163: (127, 23, 13),
    164: (183, 36, 15),
    165: (180, 36, 15),
    166: (175, 38, 16),
}
BODY = list(range(167, 180)) + [163, 164, 165, 166]   # 17 frames
# the impact: lunge held while the burst (f11) lands, then the wisps (f12-f15) scatter
IMPACT = [11, 11, 11, 12, 12, 13, 13, 14, 15, 15]
SEQ = BODY + [166] * len(IMPACT)
IMPACT_R = 120          # burst radius (source px)
IMPACT_DX = 30          # burst centre ahead of the hand
PAD_T, PAD_R = 110, 175
SPHERE_FILL = 0.62      # the full sphere's swirl radius as a share of its frame's half-size


def load_fx():
    out = []
    for i in range(16):
        im = Image.open(os.path.join(FX, f"f{i:02d}.png")).convert("RGBA")
        out.append(im.crop(im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()))
    return out


def charge_frame(i, k):
    """Which sheet frame is in his hand on body frame i (sequence index k)."""
    if i == 172:
        return 2
    if i == 173:
        return 7
    if i == 166 or i == 165:
        return 10           # the thrust: trail behind, sphere driving forward
    return 4 + (k % 4)      # the full sphere spinning (f04-f07)


def paste_center(fr, im, cx, cy):
    fr.alpha_composite(im, (int(round(cx - im.size[0] / 2)), int(round(cy - im.size[1] / 2))))


def main():
    fx = load_fx()
    for sub in ("fx", "raw"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    for k, i in enumerate(SEQ):
        src = Image.open(os.path.join(SRC, f"Asset_{i}.png")).convert("RGBA")
        w, h = src.size
        if i == 172:  # the rip's grey smoke around the forming orb -> blue chakra wind
            a = np.array(src).astype(np.float32)
            cx, cy, _ = MARKS[172]
            yy, xx = np.mgrid[0:h, 0:w]
            sat = a[..., :3].max(2) - a[..., :3].min(2)
            m = ((xx - cx) ** 2 + (yy - cy) ** 2 < 30 ** 2) & ((xx > 86) | (a[..., 3] < 235)) & (sat < 30) & (a[..., 3] > 0)
            lum = a[..., :3].mean(2)[m] / 255.0
            a[..., 0][m] = 30 + 150 * lum
            a[..., 1][m] = 90 + 150 * lum
            a[..., 2][m] = 200 + 55 * lum
            src = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
        held = k >= len(BODY)
        if held:  # the sphere is spent in the burst: erase the rip's grey ball
            a = np.array(src)
            cx, cy, r = MARKS[i]
            yy, xx = np.mgrid[0:h, 0:w]
            sat = a[..., :3].astype(int).max(2) - a[..., :3].astype(int).min(2)
            a[((xx - cx) ** 2 + (yy - cy) ** 2 <= (r - 1) ** 2) & (xx > cx - 9) & (sat < 28)] = 0
            src = Image.fromarray(a, "RGBA")
        raw = Image.new("RGBA", (w + PAD_R, h + PAD_T), (0, 0, 0, 0))
        raw.alpha_composite(src, (0, PAD_T))
        raw.save(os.path.join(OUT, "raw", f"Asset_{k}.png"))
        fr = raw.copy()

        if not held and i in MARKS:
            cx, cy, r = MARKS[i]
            j = charge_frame(i, k)
            e = fx[j]
            if j == 10:  # thrust frame: size by the sphere, head on the hand, trail behind
                s = (2 * r / SPHERE_FILL) / e.size[1]
                e = e.resize((max(1, int(e.size[0] * s)), max(1, int(e.size[1] * s))), Image.LANCZOS)
                fr.alpha_composite(e, (int(cx + r * 1.2 - e.size[0]), int(cy + PAD_T - e.size[1] / 2)))
            else:
                size = int(round(2 * r / SPHERE_FILL))
                e = e.resize((size, max(1, int(size * e.size[1] / e.size[0]))), Image.LANCZOS)
                paste_center(fr, e, cx, cy + PAD_T)
        if held:
            cx, cy, _ = MARKS[166]
            j = IMPACT[k - len(BODY)]
            e = fx[j]
            size = int(2 * IMPACT_R * (0.8 if k == len(BODY) else 1.0))
            e = e.resize((size, max(1, int(size * e.size[1] / e.size[0]))), Image.LANCZOS)
            paste_center(fr, e, cx + IMPACT_DX, cy + PAD_T)
        fr.save(os.path.join(OUT, "fx", f"Asset_{k}.png"))
    print(len(SEQ), "frames")


if __name__ == "__main__":
    main()
