#!/usr/bin/env python3
"""Battle UI animations, number fonts and text images from the original game.

    python3 tools/sprites/ipa_rig/build_ui.py <unzipped .app dir> [--out assets/ui/original]

<unzipped .app dir> is Payload/BNEI0249.app. Writes:
  anim/<name>.webp/.json  every SpriteStudio UI rig in uxsprite/system and
                          language/en/uxsprite/system_en (hit sparks, skill auras, chakra
                          effects, cut-ins, "Incoming Boss", "Ultra Combo"...), one sheet per
                          rig in the sprite-player format plus "origin" (the rig's anchor as
                          fractions of the frame); anim/index.json lists them
  font/digits_white.png   damage digits 0-9 (06_moji_tex), font/digits_gold.png hit-counter
                          digits (06_moji_tex_hits); font/digits.json has each glyph's x range
  text/*.png              English text images (Hits, Critical, ...)
"""
import argparse
import json
import os
import sys

import numpy as np
import UnityPy
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ssrender as ss  # noqa: E402

FPS = 15
CANVAS, ORIGIN = (1800, 1400), (900, 700)
MAX_SIDE = 384


def ui_rigs(path):
    env = UnityPy.load(path)
    objs = {o.path_id: o for o in env.objects}
    gos = {o.path_id: o.read().m_Name for o in env.objects if o.type.name == 'GameObject'}
    parts, ctrls = {}, []
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        cn = o.read().m_Script.read().m_ClassName
        t = o.read_typetree()
        if cn == 'SSController':
            ctrls.append((o.path_id, t))
        elif cn == 'SSPart':
            parts.setdefault(t['controller']['m_PathID'], []).append(t)
    clips = {o.path_id: ss.Clip(o.read_typetree()) for o in env.objects if o.type.name == 'AnimationClip'}
    # each rig has an AnimatorController of the same name holding its clip (the Animator on
    # the rig's "animator" child gets it at runtime). Rigs share part paths, so matching
    # clips by binding overlap alone picks the wrong one; that is only the fallback.
    by_name = {}
    for o in env.objects:
        if o.type.name == 'AnimatorController':
            t = o.read_typetree()
            ids = [c['m_PathID'] for c in t.get('m_AnimationClips', [])]
            if ids and ids[0] in clips:
                by_name[t['m_Name'].lower()] = clips[ids[0]]

    def clip_for(go, hs):
        name = gos.get(go, '').lower()
        if name in by_name:
            return by_name[name]
        return max(clips.values(), key=lambda c: sum(1 for b in c.bindings if b['path'] in hs))

    for cid, ct in ctrls:
        ps = sorted(parts.get(cid, []), key=lambda p: p['arrayIndex'])
        hs = {ss.H(p['path']) for p in ps}
        clip = clip_for(ct['m_GameObject']['m_PathID'], hs)
        tex = [objs[r['m_PathID']].read().image.convert('RGBA') if r['m_PathID'] in objs else None
               for r in ct['cellTextures']]
        cells = []
        for c in ct['cellList']:
            tx = tex[c['mapId']] if c['mapId'] < len(tex) else None
            img = None
            if tx is not None:
                W, H = tx.size
                x0, x1 = round(c['uvL'] * W), round(c['uvR'] * W)
                y0, y1 = round((1 - c['uvT']) * H), round((1 - c['uvB']) * H)
                if x1 > x0 and y1 > y0 and not (c['size']['x'] <= 4 and c['size']['y'] <= 4):
                    img = tx.crop((x0, y0, x1, y1))
            cells.append(dict(c, img=img))
        yield gos[ct['m_GameObject']['m_PathID']], ps, cells, clip


def pack(out, frames, loop):
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    if not boxes:
        return None
    l = min(b[0] for b in boxes) - 2
    t = min(b[1] for b in boxes) - 2
    r = max(b[2] for b in boxes) + 2
    btm = max(b[3] for b in boxes) + 2
    sc = min(1.0, MAX_SIDE / max(r - l, btm - t))
    fw, fh = max(1, round((r - l) * sc)), max(1, round((btm - t) * sc))
    cols = min(len(frames), max(1, 4096 // fw))
    rows = -(-len(frames) // cols)
    sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f.crop((l, t, r, btm)).resize((fw, fh), Image.LANCZOS), ((i % cols) * fw, (i // cols) * fh))
    sheet.save(out + '.webp', quality=80, method=6)
    meta = {'frameWidth': fw, 'frameHeight': fh, 'frames': len(frames), 'columns': cols, 'fps': FPS,
            'loop': loop, 'origin': [round((ORIGIN[0] - l) / (r - l), 4), round((ORIGIN[1] - t) / (btm - t), 4)]}
    json.dump(meta, open(out + '.json', 'w'), indent=1)
    return meta


# rigs that loop in the game (auras, standby states, cursor); the rest play once
LOOPING = ('standby', 'cursor', 'ninjutsu', 'ougi', 'shadow', 'chakramax')


def glyph_ranges(img):
    a = np.asarray(img)[..., 3] > 20
    cols = a.any(0)
    runs, s = [], None
    for x, v in enumerate(cols):
        if v and s is None:
            s = x
        if not v and s is not None:
            runs.append([s, x])
            s = None
    if s is not None:
        runs.append([s, len(cols)])
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('app')
    ap.add_argument('--out', default='assets/ui/original')
    a = ap.parse_args()
    ios = os.path.join(a.app, 'Data/Raw/AssetBundle/iOS')
    for d in ('anim', 'font', 'text'):
        os.makedirs(os.path.join(a.out, d), exist_ok=True)

    index = {}
    for bundle in ('uxsprite/system', 'language/en/uxsprite/system_en'):
        for name, ps, cells, clip in ui_rigs(os.path.join(ios, bundle)):
            loop = any(k in name.lower() for k in LOOPING) and 'hatsdou' not in name and 'hatudou' not in name
            n = max(1, int(round(clip.stop * FPS)))
            frames = [ss.render_frame(ps, cells, clip.sample(k / FPS), canvas=CANVAS, origin=ORIGIN, scale=1.0)
                      for k in range(n)]
            meta = pack(os.path.join(a.out, 'anim', name), frames, loop)
            if meta:
                index[name] = meta
                print(f'{name}: {meta["frames"]}f {meta["frameWidth"]}x{meta["frameHeight"]} loop={loop}')
            else:
                print(f'{name}: empty (art loaded at runtime), skipped')
    json.dump(index, open(os.path.join(a.out, 'anim', 'index.json'), 'w'), indent=1)

    env = UnityPy.load(os.path.join(a.app, 'Data/resources.assets'))
    fonts = {}
    for o in env.objects:
        if o.type.name != 'Texture2D':
            continue
        d = o.read()
        if d.m_Name in ('06_moji_tex', '06_moji_tex_hits'):
            img = d.image.convert('RGBA')
            key = 'digits_gold' if d.m_Name.endswith('hits') else 'digits_white'
            img.save(os.path.join(a.out, 'font', key + '.png'), optimize=True)
            fonts[key] = {'width': img.width, 'height': img.height, 'cell': img.width // 10, 'glyphs': glyph_ranges(img)}
    json.dump(fonts, open(os.path.join(a.out, 'font', 'digits.json'), 'w'), indent=1)
    print('fonts:', {k: len(v['glyphs']) for k, v in fonts.items()})

    texts = os.path.join(ios, 'language/en/stringtextures')
    for f in sorted(os.listdir(texts)):
        p = os.path.join(texts, f)
        if not os.path.isfile(p):
            continue
        for o in UnityPy.load(p).objects:
            if o.type.name == 'Texture2D':
                d = o.read()
                d.image.save(os.path.join(a.out, 'text', d.m_Name + '.png'), optimize=True)
    print('text images:', sorted(os.listdir(os.path.join(a.out, 'text'))))


if __name__ == '__main__':
    main()
