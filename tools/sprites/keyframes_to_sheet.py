#!/usr/bin/env python3
"""Pack green-screen key poses into an attack spritesheet with hit markers.

    python3 tools/sprites/keyframes_to_sheet.py spec.json

spec.json:
{
  "out": "assets/sprites/minato_2101/jutsu",   # writes jutsu.webp + jutsu.json
  "fps": 12,
  "height": 256,                               # output frame height (px)
  "reference": "poses/idle_base.png",          # idle pose on the same canvas size;
                                               # used to keep the body the same size
  "keys": { "windup": "poses/j1.png", "strike": "poses/j3.png", ... },
  "timeline": [                                # played in order
    ["windup", 3],                             # [key, frames to hold]
    ["strike", 1, "hit"],                      # "hit" marks this frame as a hit
    ...
  ]
}

The JSON written next to the sheet adds:
  hits         – frame indices where a hit lands (one damage number each)
  heightScale  – render height relative to the idle sheet, so the character
                 stays the same size even though effects make the frame taller
  anchorX      – horizontal position of the character's body in the frame (0..1)
All key poses must share one canvas size and framing (feet near the bottom).
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from build_spritesheet import key_green  # noqa: E402


def alpha_box(im, thresh=16):
    return im.getchannel("A").point(lambda v: 255 if v > thresh else 0).getbbox()


def main():
    spec_path = sys.argv[1]
    base = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path))
    rel = lambda p: p if os.path.isabs(p) else os.path.join(base, p)

    keys = {k: key_green(Image.open(rel(p))) for k, p in spec["keys"].items()}
    size = next(iter(keys.values())).size
    for k, im in keys.items():
        if im.size != size:
            keys[k] = im.resize(size, Image.LANCZOS)

    # One crop box for every key → no jitter, lunges keep their travel.
    boxes = [alpha_box(im) for im in keys.values()]
    left = min(b[0] for b in boxes)
    top = min(b[1] for b in boxes)
    right = max(b[2] for b in boxes)
    bottom = max(b[3] for b in boxes)
    box = (max(0, left - 4), max(0, top - 4), min(size[0], right + 4), min(size[1], bottom + 2))

    fh = int(spec.get("height", 256))
    scale = fh / (box[3] - box[1])
    fw = round((box[2] - box[0]) * scale)
    cropped = {k: im.crop(box).resize((fw, fh), Image.LANCZOS) for k, im in keys.items()}

    frames, hits = [], []
    for entry in spec["timeline"]:
        key, hold = entry[0], int(entry[1])
        is_hit = len(entry) > 2 and entry[2] == "hit"
        for n in range(hold):
            if is_hit and n == 0:
                hits.append(len(frames))
            frames.append(cropped[key])

    # heightScale: crop height vs the idle character's height on the same canvas.
    height_scale = 1.0
    if spec.get("reference"):
        ref = key_green(Image.open(rel(spec["reference"])))
        if ref.size != size:
            ref = ref.resize(size, Image.LANCZOS)
        rb = alpha_box(ref, 40)
        height_scale = round((box[3] - box[1]) / (rb[3] - rb[1]), 4)

    # anchorX: where the character's feet sit horizontally in the frame (0..1),
    # taken from the first timeline key, so the player can keep the body on
    # the unit's position while effects extend past it.
    first = keys[spec["timeline"][0][0]]
    fb = alpha_box(first, 40)
    anchor_x = round(((fb[0] + fb[2]) / 2 - box[0]) / (box[2] - box[0]), 4)

    cols = min(len(frames), max(1, 4096 // fw))
    rows = -(-len(frames) // cols)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))

    out = rel(spec["out"]) if not os.path.isabs(spec["out"]) and not spec["out"].startswith("assets/") else spec["out"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out + ".webp", quality=86, method=6)
    meta = {
        "frameWidth": fw, "frameHeight": fh, "frames": len(frames), "columns": cols,
        "fps": int(spec.get("fps", 12)), "loop": False,
        "hits": hits, "heightScale": height_scale, "anchorX": anchor_x,
    }
    json.dump(meta, open(out + ".json", "w"), indent=2)
    print(f"{out}: {len(frames)} frames ({cols}x{rows}) {fw}x{fh}, hits={len(hits)}, heightScale={height_scale}")


if __name__ == "__main__":
    main()
