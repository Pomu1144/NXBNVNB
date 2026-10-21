"""List the card art painted edge to edge (the remade art), for the dossier.

The original cards share one backdrop (dark sky, brown hills, clouds) with
the unit drawn in the middle, so the ink dossier zooms in on the face. The
remade art (PRs #125/#127/#138/#139...) fills the whole square instead and
must be shown whole. Remade files are the large ones (> 250 KB as webp)
that do not sit on the shared backdrop.

    python3 tools/art/full_bleed.py   # rewrites data/full-bleed-art.json
"""
import glob, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# corners/edges of the shared backdrop, sampled on a 60 px thumbnail
POINTS = [(0, 0), (30, 0), (59, 0), (0, 30), (59, 30)]
BACKDROP = [(13, 12, 9), (13, 9, 3), (13, 10, 4), (37, 26, 14), (36, 27, 14)]


def on_backdrop(path):
    im = Image.open(path).convert('RGB').resize((60, 60), Image.BILINEAR)
    return all(max(abs(a - b) for a, b in zip(im.getpixel(p), ref)) <= 12 for p, ref in zip(POINTS, BACKDROP))


def main():
    out = []
    for f in sorted(glob.glob(os.path.join(ROOT, 'assets/characters/*/full_*.webp'))):
        if os.path.getsize(f) > 250_000 and not on_backdrop(f):
            out.append(os.path.relpath(f, ROOT).replace(os.sep, '/'))
    with open(os.path.join(ROOT, 'data/full-bleed-art.json'), 'w') as fh:
        json.dump(out, fh, indent=1)
        fh.write('\n')
    print(len(out), 'full-bleed art files')


if __name__ == '__main__':
    main()
