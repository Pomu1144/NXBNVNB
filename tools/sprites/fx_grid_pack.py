#!/usr/bin/env python3
"""Pack same-size effect frames into a sprite-player sheet (<out>.webp + <out>.json).

Unlike frames_to_sheet.py (which registers character frames by their feet),
effect frames are packed as-is on a plain grid, after an optional shared crop
and resize.

  python3 tools/sprites/fx_grid_pack.py OUT f00.png f01.png ... \
      [--crop L,T,R,B] [--size W,H] [--columns N] [--fps 16] [--meta '{"heightUnits":1.4}']

A frame path may repeat (e.g. hold a spin by listing frames twice); repeats
share one decoded frame but take their own cell in the sheet.
"""
import argparse, json, math
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out', help='output path without extension')
    ap.add_argument('frames', nargs='+')
    ap.add_argument('--crop', help='L,T,R,B box applied to every frame')
    ap.add_argument('--size', help='W,H of each packed frame')
    ap.add_argument('--columns', type=int, default=0)
    ap.add_argument('--fps', type=float, default=16)
    ap.add_argument('--quality', type=int, default=82)
    ap.add_argument('--meta', default='{}', help='extra JSON fields for the .json')
    a = ap.parse_args()

    crop = tuple(int(v) for v in a.crop.split(',')) if a.crop else None
    size = tuple(int(v) for v in a.size.split(',')) if a.size else None
    cache, frames = {}, []
    for p in a.frames:
        if p not in cache:
            im = Image.open(p).convert('RGBA')
            if crop:
                im = im.crop(crop)
            if size:
                im = im.resize(size, Image.LANCZOS)
            cache[p] = im
        frames.append(cache[p])
    fw, fh = frames[0].size
    cols = a.columns or math.ceil(math.sqrt(len(frames)))
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im, ((i % cols) * fw, (i // cols) * fh))
    sheet.save(a.out + '.webp', 'WEBP', quality=a.quality, method=6, alpha_quality=90)
    meta = {'frameWidth': fw, 'frameHeight': fh, 'frames': len(frames), 'columns': cols,
            'fps': a.fps, 'loop': False, 'hits': []}
    meta.update(json.loads(a.meta))
    with open(a.out + '.json', 'w') as f:
        json.dump(meta, f, indent=2)
        f.write('\n')
    print(f'{a.out}.webp {sheet.size[0]}x{sheet.size[1]}, {len(frames)} frames of {fw}x{fh}')


if __name__ == '__main__':
    main()
