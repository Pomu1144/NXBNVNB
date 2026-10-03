"""Paint a cel-shaded Rasengan into Minato's ultimate frames (Naruto Online rip).

    python3 tools/sprites/minato_online_rasengan.py "<rip>/In Battle" <out_dir>
    python3 tools/sprites/frames_to_sheet.py <out_dir> assets/sprites/skins/minato_2101_online \
        ultimate 0-19 --fps 12 --hits 15,16,17,18 --stand 187

The rip only has a grey placeholder ball where the Rasengan effect was. This
draws the Rasengan (navy outline, flat blues, white core, spiral bands, a
broken wind ring) over it at hand-marked positions, turns the forming smoke
blue, and adds an impact burst on the last frames.
Writes Asset_<k>.png (k = sequence index) to <out_dir>. Frames are only padded on the top and right,
so the packer's bottom alignment and leg registration are unchanged.
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw

import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "In Battle"
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"
SS = 4  # supersample

NAVY = (22, 52, 128, 255)
BLUE = (48, 128, 226, 255)
LIGHT = (122, 206, 255, 255)
PALE = (206, 242, 255, 255)
WHITE = (255, 255, 255, 255)


def orb(r, angle, wind=1.0, form=1.0):
    """One Rasengan image (2*R square), r = sphere radius in source px."""
    R = int(r * 1.9) + 4
    S = R * 2 * SS
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    rr = r * SS * form
    ow = max(SS, int(rr * 0.12))
    # wind ring: broken cel arcs around the sphere
    if wind > 0:
        for k in range(5):
            a0 = math.degrees(angle) * 1.6 + k * 72
            rad = rr * (1.28 + 0.12 * (k % 2)) + ow
            box = (c - rad, c - rad, c + rad, c + rad)
            d.arc(box, a0, a0 + 48, fill=NAVY, width=int(ow * 2.2 * wind))
            d.arc(box, a0 + 2, a0 + 46, fill=LIGHT, width=int(ow * 1.1 * wind))
    if form <= 0:
        return im.resize((S // SS, S // SS), Image.LANCZOS)
    # sphere: outline, body, flat inner tone, core
    d.ellipse((c - rr - ow, c - rr - ow, c + rr + ow, c + rr + ow), fill=NAVY)
    d.ellipse((c - rr, c - rr, c + rr, c + rr), fill=BLUE)
    ri = rr * 0.72
    d.ellipse((c - ri, c - ri, c + ri, c + ri), fill=LIGHT)
    # swirl bands: three spiral strokes from the core outward
    for k in range(3):
        pts = []
        for t in range(0, 26):
            u = t / 25
            th = angle + k * 2 * math.pi / 3 + u * 2.6
            rad = rr * (0.18 + 0.78 * u)
            pts.append((c + rad * math.cos(th), c + rad * math.sin(th)))
        d.line(pts, fill=PALE, width=max(SS, int(rr * 0.16)), joint="curve")
        d.line(pts[:14], fill=WHITE, width=max(SS, int(rr * 0.09)), joint="curve")
    rc = rr * 0.3
    d.ellipse((c - rc, c - rc, c + rc, c + rc), fill=WHITE)
    # hard cel highlight, top-left
    hx, hy, hr = c - rr * 0.42, c - rr * 0.45, rr * 0.16
    d.ellipse((hx - hr, hy - hr * 0.7, hx + hr, hy + hr * 0.7), fill=WHITE)
    return im.resize((S // SS, S // SS), Image.LANCZOS)


def burst(r, angle, fade):
    """Impact: a hard-edged blue shock sphere with spiral streaks flying out."""
    R = int(r * 1.5) + 4
    S = R * 2 * SS
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    rr = r * SS
    ow = max(SS, int(rr * 0.07))
    a = int(255 * fade)
    d.ellipse((c - rr - ow, c - rr - ow, c + rr + ow, c + rr + ow), fill=NAVY[:3] + (a,))
    d.ellipse((c - rr, c - rr, c + rr, c + rr), fill=BLUE[:3] + (a,))
    ri = rr * 0.78
    d.ellipse((c - ri, c - ri, c + ri, c + ri), fill=LIGHT[:3] + (a,))
    rc = rr * 0.5
    d.ellipse((c - rc, c - rc, c + rc, c + rc), fill=WHITE[:3] + (a,))
    for k in range(6):
        pts = []
        for t in range(0, 22):
            u = t / 21
            th = angle + k * math.pi / 3 + u * 1.8
            rad = rr * (0.45 + 0.9 * u)
            pts.append((c + rad * math.cos(th), c + rad * math.sin(th)))
        d.line(pts, fill=NAVY[:3] + (a,), width=int(rr * 0.13), joint="curve")
        d.line(pts, fill=PALE[:3] + (a,), width=int(rr * 0.07), joint="curve")
    return im.resize((S // SS, S // SS), Image.LANCZOS)


# source frame -> (cx, cy, r, kind) in that frame's pixels; kind: form/orb
MARKS = {
    172: (97, 85, 17, "form"),
    173: (108, 70, 24, "big"),
    174: (111, 51, 10, "orb"),
    175: (112, 53, 10, "orb"),
    176: (77, 40, 9, "orb"),
    177: (21, 21, 9, "orb"),
    178: (23, 23, 10, "orb"),
    179: (29, 15, 10, "orb"),
    163: (127, 23, 9, "orb"),
    164: (183, 36, 11, "orb"),
    165: (180, 36, 11, "orb"),
    166: (175, 38, 12, "orb"),
}
SEQ = list(range(167, 180)) + [163, 164, 165, 166, 166, 166, 166]
BURST = {17: (14, 1.0), 18: (24, 1.0), 19: (32, 0.85), 20: (38, 0.5)}  # seq index -> (r, alpha)
PAD_T, PAD_R = 16, 48


def main():
    os.makedirs(OUT, exist_ok=True)
    for k, i in enumerate(SEQ):
        src = Image.open(os.path.join(SRC, f"Asset_{i}.png")).convert("RGBA")
        w, h = src.size
        fr = Image.new("RGBA", (w + PAD_R, h + PAD_T), (0, 0, 0, 0))
        if i == 172:  # the rip's grey smoke around the forming orb -> blue chakra wind
            a = np.array(src).astype(np.float32)
            cx, cy, _, _ = MARKS[172]
            yy, xx = np.mgrid[0:h, 0:w]
            sat = a[..., :3].max(2) - a[..., :3].min(2)
            m = ((xx - cx) ** 2 + (yy - cy) ** 2 < 30 ** 2) & ((xx > 86) | (a[..., 3] < 235)) & (sat < 30) & (a[..., 3] > 0)
            lum = a[..., :3].mean(2)[m] / 255.0
            a[..., 0][m] = 30 + 150 * lum
            a[..., 1][m] = 90 + 150 * lum
            a[..., 2][m] = 200 + 55 * lum
            src = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
        fr.alpha_composite(src, (0, PAD_T))
        ang = k * 0.62
        if i in MARKS and k not in BURST or (i == 166 and k == 16):
            cx, cy, r, kind = MARKS[i]
            if kind == "form":
                o = orb(r, ang, wind=1.0, form=0.55)
            elif kind == "big":
                o = orb(r, ang, wind=1.0)
            else:
                o = orb(r, ang, wind=0.8)
            fr.alpha_composite(o, (cx - o.size[0] // 2, cy + PAD_T - o.size[1] // 2))
        if k in BURST:
            cx, cy, _, _ = MARKS[166]
            br, fade = BURST[k]
            b = burst(br, ang, fade)
            bx, by = cx + 10 + br // 3, cy + PAD_T
            fr.alpha_composite(b, (bx - b.size[0] // 2, by - b.size[1] // 2))
            if fade >= 1.0:  # the sphere still in hand at the moment of impact
                o = orb(MARKS[166][2], ang, wind=0.0)
                fr.alpha_composite(o, (cx - o.size[0] // 2, cy + PAD_T - o.size[1] // 2))
        fr.save(os.path.join(OUT, f"Asset_{k}.png"))
    print(len(SEQ), "frames")


if __name__ == "__main__":
    main()
