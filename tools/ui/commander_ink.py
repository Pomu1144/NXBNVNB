#!/usr/bin/env python3
"""Sumi brush art for the battle commander UI (assets/ui/ink/cmd_*.webp).

    python3 tools/ui/commander_ink.py

swash(): a dry-brush stroke, loaded head on the left drying into bristle
streaks; enso(): a brushed circle; dab(): an ink drop used as a CSS mask."""
import numpy as np
from PIL import Image
from scipy import ndimage

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def lowfreq(n, cells, rng):
    pts = rng.uniform(-1, 1, cells + 2)
    return np.interp(np.linspace(0, cells, n), np.arange(cells + 2), pts)

def swash(W=900, H=300, seed=7, color=(10, 9, 11), tail_from=0.55, end=0.86, dry=1.0, thick=0.42, out='swash.png', streak_len=60):
    rng = np.random.default_rng(seed)
    S = 2; w, h = W * S, H * S
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = xx / w
    cx = np.arange(w) / w
    centre = h * (0.5 + 0.035 * lowfreq(w, 3, rng))
    cap = np.sqrt(np.clip(1 - (1 - np.clip(cx / 0.06, 0, 1)) ** 2, 0, 1))
    half = h * thick * (1 + 0.10 * lowfreq(w, 7, rng)) * (0.25 + 0.75 * cap) * (1 - 0.45 * ss(tail_from, 1.0, cx))
    v = (yy - centre[None, :]) / np.maximum(half[None, :], 1)          # -1..1 across the stroke
    # ragged edges: the edge wobbles a little, row by row along the stroke
    edge = 1 + 0.06 * ndimage.gaussian_filter(rng.uniform(-1, 1, (h, w)), (2, 6)) * 4
    shape = ss(1.0 * edge, 0.82 * edge, np.abs(v))
    # bristle streaks: noise stretched along x
    st = ndimage.gaussian_filter(rng.uniform(0, 1, (h, w)), (0.9 * S, streak_len * S))
    st = (st - st.mean()) / (st.std() + 1e-6)
    # each row runs out of ink at its own x (edges first)
    row_end = end + 0.10 * lowfreq(h, 40, rng)[:, None] - 0.10 * np.abs(v) ** 2
    dryness = dry * (ss(0.42, 1.0, t / np.maximum(row_end, 0.3)) + 0.25 * np.abs(v) ** 3)
    ink = ss(-0.6, 0.4, st - (dryness * 3.2 - 1.6))
    ink *= (t < row_end)
    # loaded head: solid black where the brush first lands
    ink = np.maximum(ink, ss(0.30, 0.10, t) * 0.97)
    ink *= (t > 0.004)
    # fine dry-brush pitting in the body
    pit = ndimage.gaussian_filter(rng.uniform(0, 1, (h, w)), (0.7, 3))
    ink *= 1 - 0.55 * ss(0.30, 0.22, pit) * ss(0.12, 0.5, t)
    a = shape * ink
    # density: slightly lighter (grey wash) in the dry part
    a *= (0.80 + 0.20 * ss(0.8, 0.2, t))
    a = ndimage.gaussian_filter(a, 0.5)
    rgba = np.zeros((h, w, 4), np.uint8); rgba[..., :3] = color
    rgba[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA').resize((W, H), Image.LANCZOS)
    im.save(out)
    return im

def prev(im, name, bg=(110, 140, 70, 255)):
    b = Image.new('RGBA', im.size, bg); b.alpha_composite(im); b.convert('RGB').save(name)

def enso(N=240, seed=4, color=(10, 9, 11), out='enso.png'):
    rng = np.random.default_rng(seed)
    S = 3; n = N * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    c = n / 2; R = n * 0.40
    r = np.hypot(xx - c, yy - c)
    ang = (np.arctan2(yy - c, xx - c) + np.pi / 2) % (2 * np.pi)   # 0 at top, clockwise
    u = ang / (2 * np.pi)
    span = 0.93                                                      # leaves a gap near the top
    on = u < span
    uu = np.clip(u / span, 0, 1)
    width = n * 0.075 * (0.55 + 0.45 * ss(0.0, 0.08, uu)) * (1 - 0.6 * ss(0.55, 1.0, uu)) * (1 + 0.12 * np.interp(uu, np.linspace(0, 1, 9), rng.uniform(-1, 1, 9)))
    Rr = R * (1 + 0.025 * np.interp(uu, np.linspace(0, 1, 7), rng.uniform(-1, 1, 7)))
    v = (r - Rr) / np.maximum(width, 1)
    shape = ss(1.0, 0.75, np.abs(v)) * on
    # streaks run along the circle: noise in (u, v) space
    grid = ndimage.gaussian_filter(rng.uniform(0, 1, (64, 2048)), (0.8, 30))
    grid = (grid - grid.mean()) / grid.std()
    gi = np.clip(((v + 1) / 2) * 63, 0, 63).astype(int)
    gj = np.clip(uu * 2047, 0, 2047).astype(int)
    st = grid[gi, gj]
    dryness = ss(0.45, 1.0, uu) + 0.3 * np.abs(v) ** 3
    ink = ss(-0.6, 0.4, st - (dryness * 3.0 - 1.4))
    ink = np.maximum(ink, ss(0.25, 0.05, uu) * 0.97)
    a = ndimage.gaussian_filter(shape * ink * ss(0.0, 0.03, uu) ** 0.6, 0.6)
    rgba = np.zeros((n, n, 4), np.uint8); rgba[..., :3] = color; rgba[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA').resize((N, N), Image.LANCZOS); im.save(out); return im

def dab(N=48, seed=2, out='dab.png'):
    rng = np.random.default_rng(seed)
    S = 4; n = N * S
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    c = n / 2
    ang = np.arctan2(yy - c, xx - c)
    k = np.linspace(-np.pi, np.pi, 13); kr = rng.uniform(0.82, 1.0, 13); kr[-1] = kr[0]
    rr = n * 0.42 * np.interp(ang, k, kr)
    r = np.hypot((xx - c) * 1.08, yy - c)
    a = ss(rr, rr * 0.86, r)
    a *= 1 - 0.25 * ss(0.65, 0.8, ndimage.gaussian_filter(rng.uniform(0, 1, (n, n)), 3))
    rgba = np.zeros((n, n, 4), np.uint8); rgba[..., :3] = 255; rgba[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA').resize((N, N), Image.LANCZOS); im.save(out); return im


if __name__ == '__main__':

    import os
    A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'ui', 'ink') + os.sep
    def save(im, name, q=90):
        im.save(A + name, 'WEBP', quality=q, method=6, exact=True)
    save(enso(N=200, color=(238, 228, 204)), 'cmd_enso.webp')
    save(dab(N=40), 'cmd_dab.webp')
    save(swash(W=720, H=260, end=0.97, tail_from=0.6), 'cmd_swash.webp', 85)
    save(swash(W=560, H=140, seed=11, color=(168, 38, 30), end=0.95, tail_from=0.5, thick=0.40, out='x.png', streak_len=50), 'cmd_swash_red.webp', 88)
    band = swash(W=1400, H=380, seed=21, end=1.05, tail_from=0.75, thick=0.44, out='band.png', streak_len=90)
    save(band, 'cmd_band.webp', 85)


