#!/usr/bin/env python3
"""Hashirama Senju (418) battle sheets, rendered from the original game's SpriteStudio rig.

    python3 tools/sprites/ipa_rig/build_hashirama.py <AssetBundle/iOS dir> [--out assets/sprites/skins/hashirama_418_original]
                                                     [--preview DIR]

<AssetBundle/iOS dir> is Payload/BNEI0249.app/Data/Raw/AssetBundle/iOS from the unzipped IPA.
The rig lives in sprite/unit/sprite/0402_mock.prefab (+ textures/common_unit.png), its clips
in sprite/unit/mockanimations/0402 and the ultimate's at-the-enemies effect in
sprite/effect/21354_effect. Writes idle / run / attack / hit / ko / ultimate (+ ultimate_fx)
in the format read by js/sprite-player.js. Requires UnityPy, Pillow, numpy.
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

RS = 1.7          # render scale (SpriteStudio px -> canvas px); idle body ~270 px tall
CANVAS = (3000, 2800)
ORIGIN = (1500, 1900)  # SpriteStudio (0, 0) = the unit's feet
HEIGHT = 256      # sheet frame height for body-sized sheets (idle body = full frame)
MAX_SIDE = 8192   # keep sheets under the common mobile texture limit


def controllers(path):
    return {o.read_typetree()['m_Name']: o.read_typetree()['m_AnimationClips'][0]['m_PathID']
            for o in UnityPy.load(path).objects if o.type.name == 'AnimatorController'}


def load_clips(path):
    env = UnityPy.load(path)
    return {o.path_id: o for o in env.objects if o.type.name == 'AnimationClip'}


def render(parts, cells, clip, fps, t0=0.0, t1=None, mirror=True, only=None):
    t1 = clip.stop if t1 is None else t1
    n = max(1, int(round((t1 - t0) * fps)))
    out = []
    for k in range(n):
        im = ss.render_frame(parts, cells, clip.sample(t0 + k / fps), canvas=CANVAS, origin=ORIGIN, scale=RS, only=only)
        out.append(im.transpose(Image.FLIP_LEFT_RIGHT) if mirror else im)
    return out


def bbox(im, thr=8):
    return im.getchannel('A').point(lambda v: 255 if v > thr else 0).getbbox()


def pack(out, frames, fps, loop, ref, hits=(), body_px=None, fx=None, quality=88, anchor=None):
    """ref: (left, top, right) of the idle body on the canvas; the feet line is ORIGIN[1].
    anchor: canvas x of the unit's spot (default: the middle of the idle body).
    Every sheet's bottom edge is the feet line, so the player can stand it on the unit's spot."""
    feet = ORIGIN[1]
    boxes = [b for b in (bbox(f) for f in frames) if b]
    l = min(b[0] for b in boxes) - 4
    t = min(b[1] for b in boxes) - 4
    r = max(b[2] for b in boxes) + 4
    bottom = feet + 3
    ref_h = feet - ref[1]
    fh = HEIGHT
    if body_px:
        fh = max(fh, int(np.ceil(body_px * (bottom - t) / ref_h)))
    sc = fh / (bottom - t)
    fw = round((r - l) * sc)
    cols = min(len(frames), max(1, MAX_SIDE // 2 // fw))
    rows = -(-len(frames) // cols)
    if rows * fh > MAX_SIDE:
        raise SystemExit(f'{out}: {rows}x{fh}px rows exceed {MAX_SIDE}px')
    sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f.crop((l, t, r, bottom)).resize((fw, fh), Image.LANCZOS), ((i % cols) * fw, (i // cols) * fh))
    sheet.save(out + '.webp', quality=quality, method=6)
    meta = {'frameWidth': fw, 'frameHeight': fh, 'frames': len(frames), 'columns': cols, 'fps': fps, 'loop': loop}
    if not loop:
        meta['hits'] = list(hits)
    meta['heightScale'] = round((bottom - t) / ref_h, 4)
    ax = (ref[0] + ref[2]) / 2 if anchor is None else anchor
    meta['anchorX'] = round((ax - l) / (r - l), 4)
    if loop:
        meta['anchorY'] = 1.0
    if fx:
        meta['fx'] = fx
    json.dump(meta, open(out + '.json', 'w'), indent=2)
    print(f'{os.path.basename(out)}: {len(frames)} frames {fw}x{fh} hs={meta["heightScale"]} hits={list(hits)}')
    return meta


def fx_rig(path):
    """The effect bundle: one SSController per layer (back, front) + one clip each."""
    env = UnityPy.load(path)
    objs = {o.path_id: o for o in env.objects}
    ctrls, parts = [], {}
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        cn = o.read().m_Script.read().m_ClassName
        t = o.read_typetree()
        if cn == 'SSController':
            ctrls.append(t)
        elif cn == 'SSPart':
            parts.setdefault(t['controller']['m_PathID'], []).append(t)
    ctrl_ids = [o.path_id for o in env.objects if o.type.name == 'MonoBehaviour'
                and o.read().m_Script.read().m_ClassName == 'SSController']
    clips = [ss.Clip(o.read_typetree()) for o in env.objects if o.type.name == 'AnimationClip']
    layers = []
    for cid, ct in zip(ctrl_ids, ctrls):
        ps = sorted(parts[cid], key=lambda p: p['arrayIndex'])
        hs = {ss.H(p['path']) for p in ps}
        clip = next(c for c in clips if c.bindings and c.bindings[0]['path'] in hs)
        tex = [objs[r['m_PathID']].read().image.convert('RGBA') for r in ct['cellTextures']]
        cells = []
        for c in ct['cellList']:
            tx = tex[c['mapId']]
            W, H = tx.size
            cells.append(dict(c, img=tx.crop((round(c['uvL'] * W), round((1 - c['uvT']) * H),
                                             round(c['uvR'] * W), round((1 - c['uvB']) * H)))))
        layers.append((ps, cells, clip))
    # draw the 'back' layer first
    layers.sort(key=lambda L: 0 if any(p['path'].startswith('root/back') for p in L[0]) else 1)
    return layers


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ios')
    ap.add_argument('--out', default='assets/sprites/skins/hashirama_418_original')
    ap.add_argument('--preview')
    a = ap.parse_args()
    R = a.ios
    os.makedirs(a.out, exist_ok=True)
    parts, cells = ss.load_rig(f'{R}/sprite/unit/sprite/0402_mock.prefab', [f'{R}/sprite/unit/textures/common_unit.png'])
    acs = controllers(f'{R}/sprite/unit/mockanimations/0402')
    raw = load_clips(f'{R}/sprite/unit/mockanimations/0402')
    clip = lambda name: ss.Clip(raw[acs[name + 'L']].read_typetree())

    # battle stance: upright, hands together in a seal (as in the original game's battles);
    # 0040200004 is a crouched stance
    idle = render(parts, cells, clip('3040210001'), 24)
    boxes = [bbox(f) for f in idle]
    ref = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes))
    sheets = {}
    sheets['idle'] = pack(f'{a.out}/idle', idle, 24, True, ref)

    # crouched dash: the first 0.3 s is the smoke-teleport out of the idle pose
    run = render(parts, cells, clip('0040200002'), 24, 0.3)
    sheets['run'] = pack(f'{a.out}/run', run, 24, True, ref)

    # palm strike: wind-up, slash (0.46 s) and impact burst (0.61 s)
    fps = 14
    att = render(parts, cells, clip('1040200001'), fps)
    sheets['attack'] = pack(f'{a.out}/attack', att, fps, False, ref, hits=[round(0.46 * fps), round(0.61 * fps)])

    # flinch: the recoil that opens the backstep (0040200003), then back to the stance
    recoil = render(parts, cells, clip('0040200003'), 12, 0.0, 0.25)
    hit = [idle[0]] + recoil + [recoil[-1], idle[0]]
    sheets['hit'] = pack(f'{a.out}/hit', hit, 12, False, ref)
    thumb(idle[0], ref, f'{a.out}/thumb.webp')

    # no KO clip ships in the IPA: 0040200003 is a backstep (hop back, stagger, land). Use it up
    # to the deepest backward stagger, then tip that pose over the back foot onto the ground.
    back = render(parts, cells, clip('0040200003'), 12)
    deep = max(range(len(back) * 3 // 4), key=lambda i: lean(back[i]))
    ko = back[:deep + 1] + [topple(back[deep], ang) for ang in (16, 36, 56, 72, 78, 78)]
    sheets['ko'] = pack(f'{a.out}/ko', ko, 12, False, ref)

    # ultimate: Sage Art: Wood Style: Shinsu Senju, in three layers like the unit's base sheets:
    #   ultimate      Hashirama alone, in place (the caster sheet)
    #   ultimate_body the summoning smoke + the Thousand-Armed Buddha, behind him
    #   ultimate_fx   the fist barrage over the targets, carrying the 12 hits
    fps = 12
    buddha = lambda path: path.startswith(('root/C_senju', 'root/A_smoke'))
    uclip = clip('2040221354')
    n = int(2.65 * fps)  # after the Buddha fades (~2.4 s) the clip just idles: keep a short settle
    ult = render(parts, cells, uclip, fps, 0.0, n / fps, only=lambda path: not buddha(path))
    body = render(parts, cells, uclip, fps, 0.0, n / fps, only=buddha)
    b0, body = trim(body)
    layers = fx_rig(f'{R}/sprite/effect/21354_effect')
    fx = []
    for k in range(int(3.3 * fps)):
        acc = None
        for ps, cl, c in layers:
            im = ss.render_frame(ps, cl, c.sample(k / fps), canvas=CANVAS, origin=ORIGIN, scale=RS)
            acc = im if acc is None else Image.alpha_composite(acc, im)
        fx.append(acc.transpose(Image.FLIP_LEFT_RIGHT))
    f0, fx = trim(fx)
    u0 = bbox(ult[0])  # Hashirama stands off the rig origin in this clip
    sheets['ultimate'] = pack(f'{a.out}/ultimate', ult, fps, False, ref, anchor=(u0[0] + u0[2]) / 2,
                              fx=[{'sheet': 'ultimate_body', 'at': 'caster', 'startFrame': b0, 'layer': 'behind'},
                                  {'sheet': 'ultimate_fx', 'at': 'targets', 'startFrame': f0}])
    # the Buddha stands centred on Hashirama (units stand near the screen edge, so a Buddha
    # behind him as in the original would be off-screen)
    sheets['ultimate_body'] = pack_fx(f'{a.out}/ultimate_body', body, fps, ref, hits=0, height=480,
                                      max_units=99, fade=0, quality=82)
    sheets['ultimate_fx'] = pack_fx(f'{a.out}/ultimate_fx', fx, fps, ref, hits=12, center='impact')

    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
        for name, frames in (('idle', idle), ('run', run), ('attack', att), ('hit', hit), ('ko', ko),
                             ('ultimate', ult), ('ultimate_body', body), ('ultimate_fx', fx)):
            strip(frames, f'{a.preview}/{name}.png')


def lean(frame):
    """How far the top of the body sits behind (left of) the feet, in px."""
    a = np.asarray(frame.getchannel('A')) > 24
    rows = np.where(a.any(1))[0]
    top, bot = rows[0], rows[-1]
    mid = lambda r: np.where(a[r])[0].mean()
    return mid(bot - 2) - mid(top + (bot - top) // 6)


def topple(frame, angle):
    """Rotate a backward-leaning pose about its back foot by `angle` degrees (falls to the left),
    keeping that foot on the feet line."""
    b = bbox(frame)
    pivot = (b[0] + 10, ORIGIN[1])
    return frame.rotate(angle, resample=Image.BICUBIC, center=pivot)


def trim(frames):
    """Drop the empty frames at both ends; returns (first kept index, frames)."""
    lit = [i for i, f in enumerate(frames) if bbox(f, 24)]
    return lit[0], frames[lit[0]:lit[-1] + 1]


def fx_impacts(frames):
    """Mean coverage of each frame (the impacts are where it is largest)."""
    return [np.asarray(f.getchannel('A'), np.float32).mean() for f in frames]


def pack_fx(out, frames, fps, ref, hits, height=420, quality=86, max_units=3.6, fade=0.2, center='content'):
    """Effect-only sheet. center: 'content' = middle of everything drawn, 'impact' = middle of the
    frames with the most coverage (where the technique lands; placed on the targets)."""
    feet = ORIGIN[1]
    ref_h = feet - ref[1]
    boxes = [b for b in (bbox(f, 24) for f in frames) if b]
    # the Buddha's arms reach down from far above: cap the height and fade the top edge
    t = max(min(b[1] for b in boxes) - 4, int(feet - max_units * ref_h))
    bottom = max(min(max(b[3] for b in boxes) + 4, int(feet + 0.8 * ref_h)), feet + 4)  # dust rings: cap
    cov = fx_impacts(frames)
    if center == 'impact':
        big = [bbox(f, 24) for f, c in zip(frames, cov) if c >= 0.5 * max(cov)]
        cx = (min(b[0] for b in big) + max(b[2] for b in big)) / 2
    else:
        cx = (min(b[0] for b in boxes) + max(b[2] for b in boxes)) / 2
    half = max(max(cx - b[0], b[2] - cx) for b in boxes) + 4
    l, r = int(cx - half), int(cx + half)
    fh = height
    sc = fh / (bottom - t)
    fw = round((r - l) * sc)
    cols = min(len(frames), max(1, MAX_SIDE // 2 // fw))
    rows = -(-len(frames) // cols)
    sheet = Image.new('RGBA', (cols * fw, rows * fh), (0, 0, 0, 0))
    ramp = np.clip(np.arange(fh, dtype=np.float32) / max(fade * fh, 1e-6), 0, 1)[:, None] if fade else 1.0
    if fade:  # soft bottom edge too (capped dust rings)
        ramp = ramp * np.clip((fh - 1 - np.arange(fh, dtype=np.float32)) / (0.08 * fh), 0, 1)[:, None]
    for i, f in enumerate(frames):
        a = np.asarray(f.crop((l, t, r, bottom)).resize((fw, fh), Image.LANCZOS)).copy()
        a[..., 3] = (a[..., 3] * ramp).astype(np.uint8)
        sheet.paste(Image.fromarray(a, 'RGBA'), ((i % cols) * fw, (i // cols) * fh))
    sheet.save(out + '.webp', quality=quality, method=6)
    # hits: one per frame, ending on the last frame of the full impact (the fists keep landing
    # until the dust settles)
    peak = max(cov)
    end = max(i for i, c in enumerate(cov) if c >= 0.5 * peak)
    start = max(0, end - hits + 1)
    idx = list(range(start, start + hits))
    meta = {'frameWidth': fw, 'frameHeight': fh, 'frames': len(frames), 'columns': cols, 'fps': fps,
            'loop': False, 'hits': idx, 'fxOnly': True, 'groundY': round((feet - t) / (bottom - t), 4),
            'centerX': 0.5, 'heightUnits': round((bottom - t) / ref_h, 3)}
    json.dump(meta, open(out + '.json', 'w'), indent=2)
    print(f'{os.path.basename(out)}: {len(frames)} frames {fw}x{fh} heightUnits={meta["heightUnits"]} hits={idx}')
    return meta


def thumb(frame, ref, out, size=256):
    """Square upper-body crop (head to waist) on transparency, like the other skin thumbs."""
    l, t, r = ref
    h = ORIGIN[1] - t
    t += round(h * 0.2)  # skip the tall hair tuft
    side = round(h * 0.6)
    cx = (l + r) // 2
    box = (cx - side // 2, t, cx - side // 2 + side, t + side)
    frame.crop(box).resize((size, size), Image.LANCZOS).save(out, quality=90, method=6)


def strip(frames, out, h=200):
    th = [f.crop(bbox(f) or (0, 0, 1, 1)) for f in frames]
    sc = h / max(t.height for t in th)
    th = [t.resize((max(1, round(t.width * sc)), max(1, round(t.height * sc)))) for t in th]
    cols = min(len(th), 12)
    cw = max(t.width for t in th)
    rows = -(-len(th) // cols)
    sh = Image.new('RGBA', (cols * cw, rows * h), (64, 64, 76, 255))
    for i, t in enumerate(th):
        sh.alpha_composite(t, ((i % cols) * cw, (i // cols) * h + h - t.height))
    sh.convert('RGB').save(out)


if __name__ == '__main__':
    main()
