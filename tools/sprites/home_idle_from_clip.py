#!/usr/bin/env python3
"""Village home-character idle loop from a green-screen clip.

    python3 tools/sprites/home_idle_from_clip.py <clip.mp4> <bust.webp> <out_dir>
        --box X,Y,W,H [--fps 10] [--height 640] [--per-sheet 12]

The clip is the bust composited on flat green (0,255,0) in a larger canvas and
animated (start and end frame = the still, so it loops). --box is where the
bust sat in that canvas, in the canvas's pixels; frames are cropped back to
that box so they line up exactly with the still image in the game.

Each frame is keyed: alpha from the distance to the clip's own green (sampled
from the corners), with green spill removed from the edges. The still bust's
own alpha is used as a floor inside the body (the opaque middle can't key
out), so holes never open in the character.

Writes <out_dir>/anim.json plus sheet_<n>.webp files (columns x rows frames
each), the format js/character-vignette.js plays.
"""
import argparse
import json
import math
import os
import subprocess

import numpy as np
from PIL import Image
from scipy import ndimage


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def read_frames(clip, fps):
    probe = subprocess.run([ffmpeg_exe(), "-i", clip], capture_output=True, text=True).stderr
    import re
    m = re.search(r", (\d{2,5})x(\d{2,5})", probe)
    w, h = int(m.group(1)), int(m.group(2))
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", clip, "-vf", f"fps={fps}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def key(frame, green, floor):
    f = frame.astype(np.float32)
    d = np.sqrt(((f - green) ** 2).sum(axis=2))
    a = np.clip((d - 60.0) / 70.0, 0.0, 1.0)
    a = np.maximum(a, floor)
    # spill: pull green down to the brighter of red/blue near the edges
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    spill = g > np.maximum(r, b)
    g2 = np.where(spill, np.maximum(r, b), g)
    out = np.dstack([r, g2, b, a * 255.0]).clip(0, 255).astype(np.uint8)
    # drop specks of background noise
    solid = a > 0.5
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        small = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s < 40])
        out[small, 3] = 0
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("bust")
    ap.add_argument("out_dir")
    ap.add_argument("--box", required=True)
    ap.add_argument("--fps", type=int, default=10)
    ap.add_argument("--height", type=int, default=640)
    ap.add_argument("--per-sheet", type=int, default=12)
    args = ap.parse_args()

    frames = read_frames(args.clip, args.fps)
    # the clip's first and last frames repeat the still: drop the duplicate end
    if len(frames) > 2:
        frames = frames[:-1]
    n, H, W, _ = frames.shape
    bx, by, bw, bh = (int(v) for v in args.box.split(","))
    # the clip may come back at a different size than the canvas it was given
    cw = 900.0
    s = W / cw
    bx, by, bw, bh = round(bx * s), round(by * s), round(bw * s), round(bh * s)

    corners = np.concatenate([frames[0, :8, :8].reshape(-1, 3), frames[0, :8, -8:].reshape(-1, 3)])
    green = corners.astype(np.float32).mean(axis=0)

    fh = args.height
    fw = round(fh * bw / bh)
    bust = Image.open(args.bust).convert("RGBA").resize((bw, bh), Image.LANCZOS)
    floor = ndimage.binary_erosion(np.asarray(bust)[..., 3] > 250, iterations=max(3, bw // 60)).astype(np.float32)

    keyed = []
    for f in frames:
        crop = f[by:by + bh, bx:bx + bw]
        if crop.shape[0] < bh or crop.shape[1] < bw:  # bust sat at the canvas bottom: pad
            pad = np.zeros((bh, bw, 3), np.uint8) + green.astype(np.uint8)
            pad[:crop.shape[0], :crop.shape[1]] = crop
            crop = pad
        k = key(crop, green, floor)
        keyed.append(Image.fromarray(k, "RGBA").resize((fw, fh), Image.LANCZOS))

    os.makedirs(args.out_dir, exist_ok=True)
    per = args.per_sheet
    cols = min(per, 6)
    rows = math.ceil(per / cols)
    sheets = []
    for si in range(math.ceil(len(keyed) / per)):
        sheet = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
        for k, im in enumerate(keyed[si * per:(si + 1) * per]):
            sheet.alpha_composite(im, ((k % cols) * fw, (k // cols) * fh))
        name = f"sheet_{si}.webp"
        sheet.save(os.path.join(args.out_dir, name), "WEBP", quality=82, method=6)
        sheets.append(name)
    meta = {"frames": len(keyed), "fps": args.fps, "frameWidth": fw, "frameHeight": fh,
            "columns": cols, "rows": rows, "sheets": sheets}
    with open(os.path.join(args.out_dir, "anim.json"), "w") as fp:
        json.dump(meta, fp, indent=2)
    print(meta)


if __name__ == "__main__":
    main()
