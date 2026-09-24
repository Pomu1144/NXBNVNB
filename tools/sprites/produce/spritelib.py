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
def _place(path, size, ref_feet, scale, dx, dy, align_feet, edge_fade):
    im = keyed(path, size)
    a = np.asarray(im).copy()
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
    big = Image.new("RGBA", (w + 2 * PAD, h + 2 * PAD), (0, 0, 0, 0))
    ox = PAD + fx - fx * scale + dx
    oy = PAD + fy - fy * scale + dy + extra_dy
    big.alpha_composite(im, (round(ox), round(oy)))
    return big


def pack_sheet(out, reference, keys, timeline, fps=12, height=256, body_px=None, loop=False,
               edge_fade=10, anchor_x_from_ref=False, write_scale=True, max_width=4096):
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
    placed = {n: _place(k["path"], size, ref_feet, float(k.get("scale", 1.0)), k.get("dx", 0),
                        k.get("dy", 0), k.get("feet", True), edge_fade) for n, k in keys.items()}
    used = {e[0] for e in timeline}
    boxes = [alpha_box(placed[n]) for n in used]
    box = (min(b[0] for b in boxes) - 4, min(b[1] for b in boxes) - 4,
           max(b[2] for b in boxes) + 4, max(b[3] for b in boxes) + 2)
    ref_placed = _place(reference, size, ref_feet, 1.0, 0, 0, False, 0)
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
    sheet.save(out + ".webp", quality=86, method=6)
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
