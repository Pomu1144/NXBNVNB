"""How each card art should be framed, for the dossier and roster preview.

The original cards share one backdrop (dark sky, brown hills, clouds) with
the unit drawn in the middle, so the ink views zoom in on the unit. The
remade art (PRs #125/#127/#138/#139...) fills the whole square instead and
must be shown whole. Remade files are the large ones (> 250 KB as webp)
that do not sit on the shared backdrop.

For the originals, the unit's box (where the art differs from the shared
backdrop) lets the views zoom only as far as keeps the whole unit in frame,
centred on it, instead of on a fixed point.

    python3 tools/art/full_bleed.py   # rewrites data/full-bleed-art.json
                                      # and data/art-framing.json
"""
import glob, json, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# corners/edges of the shared backdrop, sampled on a 60 px thumbnail
POINTS = [(0, 0), (30, 0), (59, 0), (0, 30), (59, 30)]
BACKDROP = [(13, 12, 9), (13, 9, 3), (13, 10, 4), (37, 26, 14), (36, 27, 14)]
N = 200  # working size for the unit boxes


def on_backdrop(path):
    im = Image.open(path).convert('RGB').resize((60, 60), Image.BILINEAR)
    return all(max(abs(a - b) for a, b in zip(im.getpixel(p), ref)) <= 12 for p, ref in zip(POINTS, BACKDROP))


def small(path):
    im = Image.open(path).convert('RGB').resize((N, N), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(im, dtype=np.float32)


def shared_backdrop(stack):
    """Per-pixel median over the art, leaving out each image's own unit."""
    est = np.median(stack[::4], axis=0)
    for tol in (40, 22, 22):
        keep = np.abs(stack - est).max(axis=3) < tol
        new = np.nanmedian(np.where(keep[..., None], stack, np.nan), axis=0)
        est = np.where(np.isnan(new), est, new)
    return est


def unit_box(im, backdrop):
    fg = np.abs(im - backdrop).max(axis=2) > 34
    # drop specks: an opening (min then max filter)
    m = Image.fromarray(fg.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    fg = np.asarray(m) > 0
    if fg.sum() < 200:
        return None

    def span(p):
        c = np.cumsum(p) / p.sum()
        return int(np.searchsorted(c, 0.015)), int(np.searchsorted(c, 0.985)) + 1

    x0, x1 = span(fg.sum(0).astype(float))
    y0, y1 = span(fg.sum(1).astype(float))
    return [round(x0 / N, 3), round(y0 / N, 3), round(x1 / N, 3), round(y1 / N, 3)]


def main():
    full, originals = [], []
    for f in sorted(glob.glob(os.path.join(ROOT, 'assets/characters/*/full_*.webp'))):
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if os.path.getsize(f) > 250_000 and not on_backdrop(f):
            full.append(rel)
        else:
            originals.append((rel, f, on_backdrop(f)))
    with open(os.path.join(ROOT, 'data/full-bleed-art.json'), 'w') as fh:
        json.dump(full, fh, indent=1)
        fh.write('\n')
    print(len(full), 'full-bleed art files')

    stack = np.stack([small(f) for _, f, _ in originals])
    # estimated from the art whose corners show the backdrop; the rest have
    # effects out to the corners but are painted on the same backdrop
    backdrop = shared_backdrop(stack[[on for _, _, on in originals]])
    boxes = {}
    for (rel, _, _), im in zip(originals, stack):
        box = unit_box(im, backdrop)
        if box:
            boxes[rel] = box
    with open(os.path.join(ROOT, 'data/art-framing.json'), 'w') as fh:
        fh.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(v)}' for k, v in boxes.items()) + '\n}\n')
    print(len(boxes), 'framed original art files')


if __name__ == '__main__':
    main()
