#!/usr/bin/env python3
"""Turn a green-screen animation clip into a packed spritesheet.

    python3 tools/sprites/build_spritesheet.py <clip.mp4> <out_dir> <anim_name> [--fps 12] [--size 256]

Output (in <out_dir>):
    <anim_name>.webp  – frames laid out in a grid, transparent background
    <anim_name>.json  – { frameWidth, frameHeight, frames, columns, fps, loop }

All frames of one clip are cropped to one shared bounding box (so the
character doesn't jitter), then scaled to fit --size px tall.
Requires: Pillow, numpy, imageio-ffmpeg (pip install pillow numpy imageio-ffmpeg).
"""
import argparse
import json
import math
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def extract_frames(clip, fps, tmp):
    subprocess.run(
        [ffmpeg_exe(), "-loglevel", "error", "-i", clip,
         "-vf", f"fps={fps}", os.path.join(tmp, "f_%04d.png")],
        check=True,
    )
    return sorted(os.path.join(tmp, f) for f in os.listdir(tmp) if f.startswith("f_"))


def key_green(img):
    """Chroma-key a pure-green background to alpha, with spill suppression."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # How much greener than the other channels a pixel is.
    greenness = g - np.maximum(r, b)
    alpha = np.clip(1.0 - (greenness - 40.0) / 60.0, 0.0, 1.0)
    # Remove green fringe on semi-transparent / edge pixels.
    g_fixed = np.where(greenness > 0, np.maximum(r, b), g)
    out = np.dstack([r, g_fixed, b, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("out_dir")
    ap.add_argument("anim")
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--size", type=int, default=256, help="output frame height in px")
    ap.add_argument("--no-loop", action="store_true")
    ap.add_argument("--drop-last", type=int, default=1,
                    help="drop N trailing frames (loop clips end on the first frame)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        paths = extract_frames(args.clip, args.fps, tmp)
        if args.drop_last and len(paths) > args.drop_last:
            paths = paths[: -args.drop_last]
        frames = [key_green(Image.open(p)) for p in paths]

    # Shared bounding box across all frames → no jitter between frames.
    boxes = [f.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox() for f in frames]
    boxes = [bx for bx in boxes if bx]
    left = min(bx[0] for bx in boxes)
    top = min(bx[1] for bx in boxes)
    right = max(bx[2] for bx in boxes)
    bottom = max(bx[3] for bx in boxes)
    pad = 4
    box = (max(0, left - pad), max(0, top - pad),
           min(frames[0].width, right + pad), min(frames[0].height, bottom + pad))

    scale = args.size / (box[3] - box[1])
    fw = max(1, round((box[2] - box[0]) * scale))
    fh = args.size
    frames = [f.crop(box).resize((fw, fh), Image.LANCZOS) for f in frames]

    cols = min(len(frames), max(1, math.floor(4096 / fw)))
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))

    sheet.save(os.path.join(args.out_dir, f"{args.anim}.webp"), quality=88, method=6)
    meta = {
        "frameWidth": fw,
        "frameHeight": fh,
        "frames": len(frames),
        "columns": cols,
        "fps": args.fps,
        "loop": not args.no_loop,
    }
    with open(os.path.join(args.out_dir, f"{args.anim}.json"), "w") as fh_:
        json.dump(meta, fh_, indent=2)
    print(f"{args.anim}: {len(frames)} frames {fw}x{fh} -> {cols}x{rows} grid")


if __name__ == "__main__":
    main()
