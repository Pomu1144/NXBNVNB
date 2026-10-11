#!/usr/bin/env python3
"""Battlefield gimmick tiles from the original game's SpriteStudio rigs.

    python3 tools/sprites/ipa_rig/build_gimmicks.py <AssetBundle/iOS dir> [--out assets/sprites/gimmicks]

Reads sprite/gimmick/<id>_gimmick (0001 poison, 0002 chakra up, 0003 chakra down,
0010 swap disabled). Each bundle has one rig per zone shape: <id><shape><size>_gimmick
with shape 1 = square, 2 = tall, 3 = wide and size 03/04/05. The medium (04) rig of each
shape is rendered to a looping sheet <type>_<shape>.webp/.json; js/battle/battle-gimmicks.js
scales it for small and large zones. Every rig carries two invisible "node" parts that
stretch a 2x2 px cell over the zone's footprint: they are not drawn, but their extent is
written to the json as "zone" (fractions of the frame) so the art lines up with the area
the game logic uses.
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

TYPES = {'0001': 'poison', '0002': 'chakra_up', '0003': 'chakra_down', '0010': 'swap_seal'}
SHAPES = {'1': 'square', '2': 'tall', '3': 'wide'}
FPS = 10
SCALE = 1.0
CANVAS, ORIGIN = (1600, 1400), (800, 700)
MAX_SIDE = 256  # px, longest frame side in the sheet


def rigs(path):
    env = UnityPy.load(path)
    objs = {o.path_id: o for o in env.objects}
    gos = {o.path_id: o.read().m_Name for o in env.objects if o.type.name == 'GameObject'}
    parts, ctrls = {}, {}
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        cn = o.read().m_Script.read().m_ClassName
        t = o.read_typetree()
        if cn == 'SSController':
            ctrls[gos[t['m_GameObject']['m_PathID']]] = (o.path_id, t)
        elif cn == 'SSPart':
            parts.setdefault(t['controller']['m_PathID'], []).append(t)
    clips = [ss.Clip(o.read_typetree()) for o in env.objects if o.type.name == 'AnimationClip']
    out = {}
    for name, (cid, ct) in ctrls.items():
        ps = sorted(parts[cid], key=lambda p: p['arrayIndex'])
        hs = {ss.H(p['path']) for p in ps}
        clip = max(clips, key=lambda c: sum(1 for b in c.bindings if b['path'] in hs))
        tex = [objs[r['m_PathID']].read().image.convert('RGBA') for r in ct['cellTextures']]
        cells, markers = [], set()
        for c in ct['cellList']:
            tx = tex[c['mapId']]
            W, H = tx.size
            img = tx.crop((round(c['uvL'] * W), round((1 - c['uvT']) * H), round(c['uvR'] * W), round((1 - c['uvB']) * H)))
            if c['size']['x'] <= 4 and c['size']['y'] <= 4:  # zone marker cell: never drawn
                markers.add(len(cells))
            cells.append(dict(c, img=img))
        out[name] = (ps, cells, clip, markers)
    return out


def zone_box(ps, cells, clip, markers):
    """Canvas-space box covered by the zone marker parts (root/node/part_*): each stretches the
    2x2 px marker cell over part of the footprint. Some rigs leave the cell unset or hidden, so
    the marker cell is forced on them and drawn opaque."""
    mk = min(markers)
    solid = [dict(c, img=Image.new('RGBA', (4, 4), (255, 255, 255, 255))) if i == mk else dict(c, img=None)
             for i, c in enumerate(cells)]
    node = [dict(p, show=1, cellId=float(mk), alpha=1.0) if p['path'].startswith('root/node/') else p for p in ps]
    hs = {ss.H(p['path']) for p in node if p['path'].startswith('root/node/')}
    best = None
    for k in range(8):
        vals = clip.sample(clip.stop * k / 8)
        vals = {key: v for key, v in vals.items()
                if not (key[0] in hs and key[2] in (ss.F['alpha'], ss.F['cellId'], ss.EN))}
        im = ss.render_frame(node, solid, vals, canvas=CANVAS, origin=ORIGIN, scale=SCALE,
                             only=lambda path: path.startswith('root/node/'))
        bx = im.getchannel('A').point(lambda v: 255 if v > 128 else 0).getbbox()
        if bx and (best is None or (bx[2] - bx[0]) * (bx[3] - bx[1]) > (best[2] - best[0]) * (best[3] - best[1])):
            best = bx
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ios')
    ap.add_argument('--out', default='assets/sprites/gimmicks')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    index = {}
    for gid, tname in TYPES.items():
        all_rigs = rigs(f'{a.ios}/sprite/gimmick/{gid}_gimmick')
        for sk, shape in SHAPES.items():
            ps, cells, clip, markers = all_rigs[f'{gid}{sk}04_gimmick']
            drawn = [dict(c, img=None) if i in markers else c for i, c in enumerate(cells)]
            n = max(1, int(round(clip.stop * FPS)))
            frames = [ss.render_frame(ps, drawn, clip.sample(k / FPS), canvas=CANVAS, origin=ORIGIN, scale=SCALE)
                      for k in range(n)]
            zb = zone_box(ps, cells, clip, markers)
            boxes = [f.getbbox() for f in frames if f.getbbox()] + [zb]
            # a clear margin round every frame: background-position rounding then shows
            # transparent pixels instead of the neighbouring frame's edge
            pad = 8
            l = min(b[0] for b in boxes) - pad
            t = min(b[1] for b in boxes) - pad
            r = max(b[2] for b in boxes) + pad
            btm = max(b[3] for b in boxes) + pad
            sc = min(1.0, MAX_SIDE / max(r - l, btm - t))
            fw, fh = round((r - l) * sc), round((btm - t) * sc)
            cols = min(len(frames), max(1, 4096 // fw))
            rows = -(-len(frames) // cols)
            sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
            for i, f in enumerate(frames):
                sheet.paste(f.crop((l, t, r, btm)).resize((fw, fh), Image.LANCZOS), ((i % cols) * fw, (i // cols) * fh))
            name = f'{tname}_{shape}'
            sheet.save(os.path.join(a.out, name + '.webp'), quality=74, method=6)
            zone = [round((zb[0] - l) / (r - l), 4), round((zb[1] - t) / (btm - t), 4),
                    round((zb[2] - l) / (r - l), 4), round((zb[3] - t) / (btm - t), 4)]
            meta = {'frameWidth': fw, 'frameHeight': fh, 'frames': len(frames), 'columns': cols,
                    'fps': FPS, 'loop': True, 'zone': zone}
            json.dump(meta, open(os.path.join(a.out, name + '.json'), 'w'), indent=1)
            index[name] = meta
            print(f'{name}: {len(frames)}f {fw}x{fh} zone={zone}')
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
