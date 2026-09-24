"""Shared image helpers for the sprite production pipeline.

Keying, body-scale measurement (SIFT), feet detection, edge checks and the
sheet packer. Used by produce.py; importable on its own for experiments.

Dependencies: numpy, Pillow, opencv-python-headless (for SIFT body-scale
measurement; without it the packer falls back to per-key manual "scale").
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from build_spritesheet import key_green  # noqa: E402

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

PAD = 400  # working margin around every key while aligning


# ---------------------------------------------------------------- keying ---
_KEY_CACHE = {}


def keyed(path, size=None):
    """RGBA key of a green-screen PNG (cached), optionally resized."""
    k = (path, size)
    if k not in _KEY_CACHE:
        im = key_green(Image.open(path))
        if size and im.size != tuple(size):
            im = im.resize(tuple(size), Image.LANCZOS)
        a = np.asarray(im).copy()
        a[..., 3][a[..., 3] < 10] = 0  # kill faint haze
        a = remove_specks(a)
        _KEY_CACHE[k] = Image.fromarray(a, "RGBA")
    return _KEY_CACHE[k]


def key_unmix(img, border=8):
    """Soft chroma key for effects (glows, light rays, dust, fire) with colour unmixing.

    The default key maps "a bit green" -> transparent over a narrow ramp, which
    turns soft glows into hard-edged cut-outs with a tinted fringe. Here every
    pixel is  obs = a*F + (1-a)*G  (G = measured background green). Red and
    blue come only from the art, so with m = max(R, B):
        a = 1 - (obs_g - obs_m) / (G_g - G_m)     (pixels with G <= m are opaque)
        F = (obs - (1-a)*G) / a
    i.e. the least-transparent alpha for which the art has no green of its own
    (g <= max(r, b)), which holds for fire, rock, dust, white and blue light.
    Afterwards cool light (B > R: coronas, rays) is held to g <= (r+b)/2 so pale
    blue does not come out teal. (An earlier version measured the art's g/r
    ratio per image; that under-keyed yellow fire next to red chakra.)"""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    edge = np.concatenate([a[:border].reshape(-1, 3), a[-border:].reshape(-1, 3),
                           a[:, :border].reshape(-1, 3), a[:, -border:].reshape(-1, 3)])
    G = np.median(edge, axis=0)
    m = np.maximum(a[..., 0], a[..., 2])
    al = np.clip(1.0 - (a[..., 1] - m) / max(1.0, G[1] - max(G[0], G[2])), 0.0, 1.0)
    al = np.clip((al - 0.03) / 0.97, 0.0, 1.0)  # background noise -> 0
    safe = np.maximum(al, 1e-3)[..., None]
    F = np.clip((a - (1.0 - al)[..., None] * G) / safe, 0, 255)
    cool = F[..., 2] > F[..., 0]
    F[..., 1] = np.minimum(F[..., 1], np.where(cool, (F[..., 0] + F[..., 2]) / 2, np.maximum(F[..., 0], F[..., 2])))
    F[al < 0.02] = 0
    out = np.dstack([F, al[..., None] * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def keyed_unmix(path, size=None):
    k = ("unmix", path, size)
    if k not in _KEY_CACHE:
        im = key_unmix(Image.open(path))
        if size and im.size != tuple(size):
            im = im.resize(tuple(size), Image.LANCZOS)
        a = np.asarray(im).copy()
        a[..., 3][a[..., 3] < 4] = 0
        _KEY_CACHE[k] = Image.fromarray(a, "RGBA")
    return _KEY_CACHE[k]


def remove_specks(a, min_px=40):
    """Drop tiny isolated opaque blobs (keying noise) without touching art."""
    if cv2 is None:
        return a
    m = (a[..., 3] > 40).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    small = np.zeros(n, bool)
    small[1:] = stats[1:, cv2.CC_STAT_AREA] < min_px
    a[..., 3][small[lab]] = 0
    return a


def alpha_box(im, thresh=16):
    return im.getchannel("A").point(lambda v: 255 if v > thresh else 0).getbbox()


# ------------------------------------------------------------ measuring ---
def edge_report(path, band=3, thresh=60):
    """Opaque pixel counts in the outer `band` px of each canvas side.

    Anything > a few px means the art (usually an effect) is cut by the edge."""
    a = np.asarray(keyed(path))[..., 3] > thresh
    return {"top": int(a[:band].sum()), "bottom": int(a[-band:].sum()),
            "left": int(a[:, :band].sum()), "right": int(a[:, -band:].sum())}


def feet_of(a, xfrac=None):
    """(x, y) of the feet: centre of the lowest opaque rows of the body.

    Bright saturated pixels (chakra, flames, glowing weapons) are ignored so an
    effect or blade that dips below the soles does not count as the feet."""
    rgb = a[..., :3].astype(np.int16)
    mx, mn = rgb.max(-1), rgb.min(-1)
    effect = (mx > 140) & ((mx - mn) > 0.45 * mx)
    al = (a[..., 3] > 60) & ~effect
    if xfrac:
        al = al[:, : int(al.shape[1] * xfrac)]
    rows = np.nonzero(al.sum(1) > 3)[0]
    if not len(rows):
        return (a.shape[1] / 2, a.shape[0] * 0.95)
    y = int(rows.max())
    band = al[max(0, y - 60):y + 1]
    xs = np.nonzero(band.any(0))[0]
    return (float(xs.min() + xs.max()) / 2, float(y))


_SIFT = {}


def _features(path):
    if path not in _SIFT:
        a = np.asarray(keyed(path))
        g = cv2.cvtColor(np.ascontiguousarray(a[..., :3]), cv2.COLOR_RGB2GRAY)
        m = (a[..., 3] > 128).astype(np.uint8) * 255
        sift = cv2.SIFT_create(nfeatures=4000)
        _SIFT[path] = sift.detectAndCompute(g, m)
    return _SIFT[path]


def body_scale(ref_path, path, min_matches=15):
    """Scale of the character in `path` relative to `ref_path`.

    Matches SIFT features between the two poses (effects never match the
    character, so they drop out) and takes the median ratio of the matched
    keypoint sizes — a local scale estimate that does not care about the pose.
    Returns (scale, n_matches); scale is None when there are too few matches."""
    if cv2 is None:
        return None, 0
    k0, d0 = _features(ref_path)
    k1, d1 = _features(path)
    if d0 is None or d1 is None or len(k0) < 2 or len(k1) < 2:
        return None, 0
    ms = cv2.BFMatcher().knnMatch(d0, d1, k=2)
    good = [m for m, n in (p for p in ms if len(p) == 2) if m.distance < 0.7 * n.distance]
    good = [m for m in good if k0[m.queryIdx].size > 3.0]
    if len(good) < min_matches:
        return None, len(good)
    r = np.log([k1[m.trainIdx].size / k0[m.queryIdx].size for m in good])
    # trimmed mean of the central 50% of log ratios
    lo, hi = np.percentile(r, [25, 75])
    core = r[(r >= lo) & (r <= hi)]
    return float(np.exp(core.mean() if len(core) else np.median(r))), len(good)


# -------------------------------------------------------------- packing ---
def recolor(a, rule):
    """Shift one hue band of an RGBA array (e.g. a purple hand glow -> pale white-blue).

    rule: {"hue": [lo, hi] degrees (lo > hi wraps through 0), "min_s": 0.35, "min_v": 0.45,
           "x_min": 0..1 (only right of this), "to_hue": 205 | "hue_shift": +deg, "sat_mul": 0.3,
           "val_add": 0.1}; a list of rules is applied in order."""
    if isinstance(rule, list):
        for r_ in rule:
            a = recolor(a, r_)
        return a
    rgb = a[..., :3].astype(np.float32) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, d / (mx + 1e-6), 0)
    v = mx
    lo, hi = rule.get("hue", [250, 300])
    band = ((h >= lo) & (h <= hi)) if lo <= hi else ((h >= lo) | (h <= hi))
    m = band & (s >= rule.get("min_s", 0.35)) & (v >= rule.get("min_v", 0.45))
    m &= (np.arange(a.shape[1])[None, :] >= rule.get("x_min", 0) * a.shape[1])
    if not m.any():
        return a
    h2 = (h + rule["hue_shift"]) % 360 if "hue_shift" in rule else np.full_like(h, rule.get("to_hue", 205))
    s2 = s * rule.get("sat_mul", 0.3)
    v2 = np.clip(v + rule.get("val_add", 0.1 if "to_hue" in rule or "hue_shift" not in rule else 0), 0, 1)
    c = v2 * s2
    x = c * (1 - np.abs((h2 / 60) % 2 - 1))
    z = np.zeros_like(c)
    k = (h2 // 60).astype(int) % 6
    rr = np.select([k == 0, k == 1, k == 2, k == 3, k == 4, k == 5], [c, x, z, z, x, c])
    gg = np.select([k == 0, k == 1, k == 2, k == 3, k == 4, k == 5], [x, c, c, x, z, z])
    bb = np.select([k == 0, k == 1, k == 2, k == 3, k == 4, k == 5], [z, z, x, c, c, x])
    new = (np.dstack([rr, gg, bb]) + (v2 - c)[..., None]) * 255
    out = a.copy()
    out[..., :3][m] = np.clip(new[m], 0, 255).astype(np.uint8)
    return out


def _place(path, size, ref_feet, scale, dx, dy, align_feet, edge_fade, pad=PAD, recolor_rule=None):
    im = keyed(path, size)
    a = np.asarray(im).copy()
    if recolor_rule:
        a = recolor(a, recolor_rule)
    h, w = a.shape[:2]
    if edge_fade:
        yy, xx = np.mgrid[0:h, 0:w]
        dist = np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy])
        a[..., 3] = (a[..., 3] * np.clip(dist / edge_fade, 0, 1)).astype(np.uint8)
    fx, fy = feet_of(a)
    extra_dy = (ref_feet[1] - fy) if align_feet else 0
    im = Image.fromarray(a, "RGBA")
    if scale != 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    big = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    ox = pad + fx - fx * scale + dx
    oy = pad + fy - fy * scale + dy + extra_dy
    big.alpha_composite(im, (round(ox), round(oy)))
    return big


def pack_sheet(out, reference, keys, timeline, fps=12, height=256, body_px=None, loop=False,
               edge_fade=10, anchor_x_from_ref=False, write_scale=True, max_width=4096, quality=86):
    """Pack keyed poses into <out>.webp + <out>.json.

    keys: {name: {"path", "scale", "dx", "dy", "feet"}} — scale is applied about
    the feet so every pose keeps the idle body size; feet=True moves the pose so
    its feet sit on the reference feet line.
    timeline: [[key, hold] | [key, hold, "hit"]] (already expanded).
    Returns the metadata dict (also written to <out>.json) plus 'bodyPx', the
    idle body height in sheet pixels."""
    size = Image.open(reference).size
    ref_a = np.asarray(keyed(reference))
    ref_feet = feet_of(ref_a)
    # working canvas big enough for the largest upscaled pose (summon scenes are drawn small)
    pad = max(PAD, int(max(size) * (max(float(k.get("scale", 1.0)) for k in keys.values()) - 1)) + 200)
    placed = {n: _place(k["path"], size, ref_feet, float(k.get("scale", 1.0)), k.get("dx", 0),
                        k.get("dy", 0), k.get("feet", True), edge_fade, pad, k.get("recolor")) for n, k in keys.items()}
    used = {e[0] for e in timeline}
    boxes = [alpha_box(placed[n]) for n in used]
    box = (min(b[0] for b in boxes) - 4, min(b[1] for b in boxes) - 4,
           max(b[2] for b in boxes) + 4, max(b[3] for b in boxes) + 2)
    ref_placed = _place(reference, size, ref_feet, 1.0, 0, 0, False, 0, pad)
    rb = alpha_box(ref_placed, 40)
    ref_h = rb[3] - rb[1]
    fh = int(height)
    if body_px:  # keep the idle body at >= body_px pixels tall inside this sheet
        fh = max(fh, int(np.ceil(body_px * (box[3] - box[1]) / ref_h)))
    sc = fh / (box[3] - box[1])
    fw = round((box[2] - box[0]) * sc)
    cropped = {n: placed[n].crop(box).resize((fw, fh), Image.LANCZOS) for n in used}
    frames, hits = [], []
    for e in timeline:
        n, hold = e[0], int(e[1])
        for i in range(hold):
            if len(e) > 2 and e[2] == "hit" and i == 0:
                hits.append(len(frames))
            frames.append(cropped[n])
    hs = round((box[3] - box[1]) / ref_h, 4)
    fb = alpha_box(placed[timeline[0][0]], 40)
    ax = ((fb[0] + fb[2]) / 2 - box[0]) / (box[2] - box[0])
    if anchor_x_from_ref:
        ax = ((rb[0] + rb[2]) / 2 - box[0]) / (box[2] - box[0])
    cols = min(len(frames), max(1, max_width // fw))
    rows = -(-len(frames) // cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out + ".webp", quality=quality, method=6)
    meta = {"frameWidth": fw, "frameHeight": fh, "frames": len(frames), "columns": cols,
            "fps": int(fps), "loop": bool(loop)}
    if not loop:
        meta["hits"] = hits
    if write_scale:
        meta["heightScale"] = hs
    meta["anchorX"] = round(ax, 4)
    if loop:
        meta["anchorY"] = 1.0
    with open(out + ".json", "w") as f:
        json.dump(meta, f, indent=2)
    return {**meta, "bodyPx": round(ref_h * sc, 1), "box": box}


def sheet_frames(base, name):
    """Yield (frame RGBA, meta) for a packed sheet."""
    m = json.load(open(f"{base}/{name}.json"))
    sh = Image.open(f"{base}/{name}.webp").convert("RGBA")
    fw, fh, c = m["frameWidth"], m["frameHeight"], m["columns"]
    out = [sh.crop(((i % c) * fw, (i // c) * fh, (i % c) * fw + fw, (i // c) * fh + fh))
           for i in range(m["frames"])]
    return out, m


def pack_fx(out, keys, timeline, fps=14, height=360, ground_y=0.88, sphere_key=None, sphere_units=1.75,
            crossfade=True, max_width=4096, quality=80, edge_fade=10, key="green", size_by="blob"):
    """Pack an effect-only sheet (no character) into <out>.webp + <out>.json.

    Every key shares one canvas (the generated frames were chained with the same
    camera); keys[n]["scale"] scales that key about the effect centre (canvas
    centre, 45% down), used for cheap pulse variants. The crop is the union of
    all keys plus the ground line. With crossfade, the last frame of each hold
    (hold >= 2) is a 50/50 blend with the next key for smoother continuity.

    Placement metadata for the battle code:
      groundY     — fraction of the frame height where the targets' feet go
      centerX     — fraction of the frame width at the effect centre
      heightUnits — frame height in unit heights, so that the sphere_key effect is
                    `sphere_units` unit heights tall."""
    size = Image.open(keys[timeline[0][0]]["path"]).size
    W, H = size
    cx, cy = W / 2, H * 0.45
    placed = {}
    for n, k in keys.items():
        a = np.asarray((keyed_unmix if key == "unmix" else keyed)(k["path"], size)).copy()
        if k.get("recolor"):
            a = recolor(a, k["recolor"])
        if edge_fade:
            yy, xx = np.mgrid[0:H, 0:W]
            dist = np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy])
            a[..., 3] = (a[..., 3] * np.clip(dist / edge_fade, 0, 1)).astype(np.uint8)
        im = Image.fromarray(a, "RGBA")
        s = float(k.get("scale", 1.0))
        if s != 1.0:
            im2 = im.resize((round(W * s), round(H * s)), Image.LANCZOS)
            c = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
            c.alpha_composite(im2, (round(W / 2 + cx - cx * s), round(H / 2 + cy - cy * s)))
            im = c.crop((W // 2, H // 2, W // 2 + W, H // 2 + H))
        placed[n] = im
    used = {e[0] for e in timeline}
    boxes = [alpha_box(placed[n], 24) for n in used]
    boxes = [b for b in boxes if b]
    gy = ground_y * H
    # symmetric about the effect centre so centerX stays near 0.5 (mirroring is then cheap)
    half = max(max(cx - b[0], b[2] - cx) for b in boxes) + 6
    box = (int(max(0, cx - half)), int(max(0, min(b[1] for b in boxes) - 6)),
           int(min(W, cx + half)), int(min(H, max(max(b[3] for b in boxes) + 4, gy + 8))))
    bh = box[3] - box[1]
    fh = int(height)
    sc = fh / bh
    fw = round((box[2] - box[0]) * sc)
    cropped = {n: placed[n].crop(box).resize((fw, fh), Image.LANCZOS) for n in used}
    frames, hits = [], []
    for i, e in enumerate(timeline):
        n, hold = e[0], int(e[1])
        nxt = timeline[i + 1][0] if i + 1 < len(timeline) else None
        for j in range(hold):
            if len(e) > 2 and e[2] == "hit" and j == 0:
                hits.append(len(frames))
            f = cropped[n]
            if crossfade and hold >= 2 and j == hold - 1 and nxt and nxt != n:
                f = Image.blend(f, cropped[nxt], 0.5)
            frames.append(f)
    # the effect fades out on the last hold
    last = timeline[-1]
    for j in range(int(last[1])):
        idx = len(frames) - int(last[1]) + j
        f = np.asarray(frames[idx]).copy()
        f[..., 3] = (f[..., 3] * (1 - (j + 1) / (int(last[1]) + 1))).astype(np.uint8)
        frames[idx] = Image.fromarray(f, "RGBA")
    cols = min(len(frames), max(1, max_width // fw))
    rows = -(-len(frames) // cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out + ".webp", quality=quality, method=6)
    # the sphere = the largest opaque blob of sphere_key (flying rocks and ground dust are separate blobs)
    sa = (np.asarray(placed[sphere_key or timeline[0][0]])[..., 3] > 100).astype(np.uint8)
    if size_by == "bbox":  # whole visible effect of sphere_key (translucent bodies are not one solid blob)
        sb = alpha_box(placed[sphere_key or timeline[0][0]], 40)
        sph_h = sb[3] - sb[1]
    elif cv2 is not None:
        n_, lab, stats, _ = cv2.connectedComponentsWithStats(sa, 8)
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        sph_h = int(stats[big, cv2.CC_STAT_HEIGHT])
    else:
        sb = alpha_box(placed[sphere_key or timeline[0][0]], 100)
        sph_h = sb[3] - sb[1]
    sphere_frac = sph_h / bh
    meta = {"frameWidth": fw, "frameHeight": fh, "frames": len(frames), "columns": cols,
            "fps": int(fps), "loop": False, "hits": hits, "fxOnly": True,
            "groundY": round((gy - box[1]) / bh, 4), "centerX": round((cx - box[0]) / (box[2] - box[0]), 4),
            "heightUnits": round(sphere_units / sphere_frac, 3)}
    with open(out + ".json", "w") as f:
        json.dump(meta, f, indent=2)
    return {**meta, "box": box, "sphereFrac": round(sphere_frac, 3)}
