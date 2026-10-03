#!/usr/bin/env python3
"""Rasengan for Minato's Naruto Online ultimate (the Hokage Cloak skin).

    python3 tools/sprites/minato_online_rasengan.py "<rip>/In Battle" <out_dir>
    python3 tools/sprites/frames_to_sheet.py <out_dir>/fx assets/sprites/skins/minato_2101_online \\
        ultimate 0-34 --fps 12 --hits 17,18,19,20 --stand 187 --reg-dir <out_dir>/raw

The rip only has a grey placeholder ball where the Rasengan effect was. This
composites animated VFX, painted in the game's own flat cel effect style
(matched to its Fire Ball Jutsu effect), over it:
  tools/sprites/src/rasengan_loop.mp4    a spinning Rasengan (seamless loop)
  tools/sprites/src/rasengan_impact.mp4  the impact: star flash, blast, spiral, fragments
Both are on black; each frame is keyed to alpha by its brightness (additive
light, so un-premultiplied colour over any background), and a round mask
trims stray streaks at the clip's edges.

The sphere sits in his hand at hand-marked positions from the charge to the
lunge, spinning at twice the clip's speed; the impact then plays at full size
just ahead of his fist while he holds the lunge, the sphere still grinding in
his hand.
Writes <out_dir>/fx/Asset_<k>.png (with effects) and <out_dir>/raw/Asset_<k>.png
(the same frames without them, for leg registration).
"""
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else "In Battle"
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
LOOP = os.path.join(HERE, "src", "rasengan_loop.mp4")
IMPACT = os.path.join(HERE, "src", "rasengan_impact.mp4")
VS = 512  # decoded video size


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def read_video(path):
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", path, "-vf", f"scale={VS}:{VS}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, VS, VS, 3)


def key(rgb, inner=0.80, outer=0.98, gain=1.35):
    """Black-background VFX frame -> RGBA: alpha from brightness, colour un-premultiplied."""
    f = rgb.astype(np.float32) / 255.0
    a = np.clip((f.max(axis=2) - 0.05) * gain, 0, 1)
    yy, xx = np.mgrid[0:VS, 0:VS]
    d = np.hypot(xx - VS / 2, yy - VS / 2) / (VS / 2)
    a *= np.clip((outer - d) / (outer - inner), 0, 1)
    c = np.where(a[..., None] > 1e-3, f / np.maximum(a[..., None], 1e-3), 0)
    out = np.dstack([np.clip(c, 0, 1) * 255, a * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


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
N_IMPACT = 18                                         # the lunge held while the impact plays
SEQ = BODY + [166] * N_IMPACT
IMPACT_R = 135          # impact radius (source px) at full size
IMPACT_DX = 34          # impact centre ahead of the hand
PAD_T, PAD_R = 118, 195
SPHERE_FILL = 0.66      # the loop's sphere radius as a share of the clip's half-width


def paste_center(fr, im, cx, cy):
    fr.alpha_composite(im, (int(round(cx - im.size[0] / 2)), int(round(cy - im.size[1] / 2))))


def main():
    loop = read_video(LOOP)
    impact = read_video(IMPACT)
    # the impact clip: star flash at the start, speed-streak blast, spinning
    # spiral, then fragments that shrink away by the end
    t0 = 0
    imp_idx = np.linspace(t0, len(impact) - 1, N_IMPACT).round().astype(int)
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
        if k >= len(BODY):  # the sphere shrinks during the blast: erase the rip's grey ball under it
            a = np.array(src)
            cx, cy, r = MARKS[i]
            yy, xx = np.mgrid[0:h, 0:w]
            sat = a[..., :3].astype(int).max(2) - a[..., :3].astype(int).min(2)
            ball = ((xx - cx) ** 2 + (yy - cy) ** 2 <= (r - 1) ** 2) & (xx > cx - 9) & (sat < 28)
            a[ball] = 0
            src = Image.fromarray(a, "RGBA")
        raw = Image.new("RGBA", (w + PAD_R, h + PAD_T), (0, 0, 0, 0))
        raw.alpha_composite(src, (0, PAD_T))
        raw.save(os.path.join(OUT, "raw", f"Asset_{k}.png"))
        fr = raw.copy()

        held = k >= len(BODY)
        j = k - len(BODY)
        if i in MARKS:
            cx, cy, r = MARKS[i]
            # during the blast the sphere keeps grinding in his fist, shrinking a little
            scale = 1.0 if not held else max(0.6, 1.0 - 0.08 * j)
            size = max(8, int(round(2 * r * scale / SPHERE_FILL)))
            o = key(loop[(k * 2 * 2) % len(loop)]).resize((size, size), Image.LANCZOS)
            paste_center(fr, o, cx, cy + PAD_T)
        if held:
            cx, cy, _ = MARKS[166]
            # grows in fast over the first frames, then holds full size
            grow = min(1.0, 0.6 + 0.2 * j)
            size = int(round(2 * IMPACT_R * grow))
            b = key(impact[imp_idx[j]], inner=0.72, outer=0.97).resize((size, size), Image.LANCZOS)
            paste_center(fr, b, cx + IMPACT_DX, cy + PAD_T)
        fr.save(os.path.join(OUT, "fx", f"Asset_{k}.png"))
    print(len(SEQ), "frames")


if __name__ == "__main__":
    main()
