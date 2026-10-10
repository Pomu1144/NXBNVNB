"""Replay SpriteStudio (SSPart/SSController) Unity animation clips into RGBA frames."""
import bisect, math, struct, zlib
import numpy as np
import UnityPy
from PIL import Image

TRANSFORM, RENDERER, MONO = 4, 23, 114
PIVOT = [-1, -1]  # cell pivot: offset of the part origin from the cell centre, in cell sizes


def load_rig(prefab_path, extra_tex_paths=()):
    env = UnityPy.load(prefab_path)
    objs = {o.path_id: o for o in env.objects}
    parts, ctrl = [], None
    for o in env.objects:
        if o.type.name != 'MonoBehaviour':
            continue
        cn = o.read().m_Script.read().m_ClassName
        if cn == 'SSPart':
            parts.append(o.read_typetree())
        elif cn == 'SSController' and ctrl is None:
            ctrl = o.read_typetree()
    parts.sort(key=lambda p: p['arrayIndex'])
    texs = []
    extra = []
    for p in extra_tex_paths:
        for o in UnityPy.load(p).objects:
            if o.type.name == 'Texture2D':
                extra.append(o.read().image.convert('RGBA'))
    for ref in ctrl['cellTextures']:
        o = objs.get(ref['m_PathID']) if ref['m_PathID'] else None
        texs.append(o.read().image.convert('RGBA') if o else (extra.pop(0) if extra else None))
    cells = []
    for c in ctrl['cellList']:
        tx = texs[c['mapId']] if c['mapId'] < len(texs) else None
        img = None
        if tx is not None:
            W, H = tx.size
            x0, x1 = round(c['uvL'] * W), round(c['uvR'] * W)
            y0, y1 = round((1 - c['uvT']) * H), round((1 - c['uvB']) * H)
            if x1 > x0 and y1 > y0:
                img = tx.crop((x0, y0, x1, y1))
        cells.append(dict(c, img=img))
    return parts, cells


class Clip:
    def __init__(self, tree):
        mc = tree['m_MuscleClip']
        self.stop = mc['m_StopTime']
        self.start = mc['m_StartTime']
        data = mc['m_Clip']['data']
        sc = data['m_StreamedClip']
        raw = struct.pack(f'<{len(sc["data"])}I', *sc['data'])
        nstream = sc['curveCount']
        keys = [[] for _ in range(nstream)]  # per curve: list of (time, coeffs)
        off = 0
        while off < len(raw):
            t, n = struct.unpack_from('<fI', raw, off); off += 8
            for _ in range(n):
                idx, a, b, c, d = struct.unpack_from('<i4f', raw, off); off += 20
                keys[idx].append((t, (a, b, c, d)))
        self.keys = [(([k[0] for k in ks]), [k[1] for k in ks]) for ks in keys]
        dc = data['m_DenseClip']
        self.dense = (dc['m_CurveCount'], dc['m_FrameCount'], dc['m_SampleRate'], dc['m_BeginTime'],
                      np.array(dc['m_SampleArray'], dtype=np.float32))
        self.const = data['m_ConstantClip']['data']
        self.nstream = nstream
        self.bindings = tree['m_ClipBindingConstant']['genericBindings']

    def curve_value(self, i, t):
        if i < self.nstream:
            times, co = self.keys[i]
            j = bisect.bisect_right(times, t) - 1
            if j < 0:
                j = 0
            dt = t - times[j]
            if not math.isfinite(dt):
                dt = 0.0
            a, b, c, d = co[j]
            return ((a * dt + b) * dt + c) * dt + d
        i -= self.nstream
        n, fc, sr, bt, arr = self.dense
        if i < n:
            f = min(max(int(round((t - bt) * sr)), 0), fc - 1)
            return float(arr[f * n + i])
        return self.const[i - n]

    def sample(self, t):
        """{(pathHash, typeID, attribute): value or tuple}"""
        out = {}
        ci = 0
        for b in self.bindings:
            k = (b['path'], b['typeID'], b['attribute'])
            if b['typeID'] == TRANSFORM:
                w = 4 if b['attribute'] == 2 else 3
                out[k] = tuple(self.curve_value(ci + j, t) for j in range(w))
                ci += w
            else:
                out[k] = self.curve_value(ci, t)
                ci += 1
        return out


H = lambda s: zlib.crc32(s.encode())
F = {n: H(n) for n in ['cellId', 'pos.x', 'pos.y', 'rot.z', 'alpha', 'flpH', 'flpV', 'prio',
                       'vertLB.x', 'vertLB.y', 'vertRB.x', 'vertRB.y', 'vertLT.x', 'vertLT.y', 'vertRT.x', 'vertRT.y',
                       'vcol.r', 'vcol.g', 'vcol.b', 'vcol.a', 'show']}
EN = H('m_Enabled')
VCOL_BLEND = 3756801849  # SSPart vertex-colour blend function (0 mix, 1 multiply, 2 add, 3 subtract); field name unknown


def mat(tx, ty, rot_deg, sx, sy):
    r = math.radians(rot_deg)
    c, s = math.cos(r), math.sin(r)
    return np.array([[c * sx, -s * sy, tx], [s * sx, c * sy, ty], [0, 0, 1]])


def render_frame(parts, cells, vals, canvas=(1400, 1000), origin=(700, 800), scale=1.0, only=None):
    """SpriteStudio space: +y up, pixels. Returns RGBA image.
    only: optional predicate on a part's path; other parts still drive the hierarchy but aren't drawn."""
    n = len(parts)
    world = [None] * n
    alpha = [1.0] * n
    hidden = [False] * n
    draws = []
    for p in parts:
        i = p['arrayIndex']
        ph = H(p['path'])
        g = lambda f, d: vals.get((ph, MONO, F[f]), d)
        sc = vals.get((ph, TRANSFORM, 3), (1.0, 1.0, 1.0))
        m = mat(g('pos.x', p['pos']['x']), g('pos.y', p['pos']['y']), g('rot.z', p['rot']['z']), sc[0], sc[1])
        pi = p['parentIndex']
        a = g('alpha', p['alpha'])
        hid = vals.get((ph, RENDERER, EN), 1.0) < 0.5 or g('show', p['show']) < 0.5
        if pi >= 0:
            m = world[pi] @ m
            if p['inheritAlph']:
                a *= alpha[pi]
            if p['inheritHide'] and hidden[pi]:
                hid = True
        world[i], alpha[i], hidden[i] = m, a, hid
        cid = int(round(g('cellId', p['cellId'])))
        if hid or cid < 0 or cid >= len(cells) or a <= 0.003 or p['partType'] == 0 or (only and not only(p['path'])):
            continue
        cell = cells[cid]
        if cell['img'] is None:
            continue
        w, h = cell['size']['x'], cell['size']['y']
        px, py = cell['pivot']['x'], cell['pivot']['y']
        cx, cy = PIVOT[0] * px * w, PIVOT[1] * py * h  # quad centre relative to the part origin
        corners = np.array([[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]])  # LB RB LT RT
        if g('flpH', p['flpH']) >= 0.5:
            corners[:, 0] *= -1
        if g('flpV', p['flpV']) >= 0.5:
            corners[:, 1] *= -1
        corners = corners + [cx, cy]
        for k, nm in enumerate(['LB', 'RB', 'LT', 'RT']):
            corners[k, 0] += g(f'vert{nm}.x', 0.0)
            corners[k, 1] += g(f'vert{nm}.y', 0.0)
        pts = (m @ np.c_[corners, np.ones(4)].T).T[:, :2]
        pts = pts * scale
        pts[:, 0] = origin[0] + pts[:, 0]
        pts[:, 1] = origin[1] - pts[:, 1]
        vc = (g('vcol.r', 0), g('vcol.g', 0), g('vcol.b', 0), g('vcol.a', 0), int(round(vals.get((ph, MONO, VCOL_BLEND), 0))))
        draws.append((g('prio', p['prio']), i, pts, cell['img'], a, p['alphaBlendType'], vc))
    draws.sort(key=lambda d: (d[0], d[1]))
    out = np.zeros((canvas[1], canvas[0], 4), np.float32)  # premultiplied rgb (0..255) + alpha (0..1)
    for prio, i, pts, img, a, blend, vc in draws:
        paste(out, img, pts, a, blend, vc)
    A = out[..., 3:4]
    rgb = np.where(A > 1e-4, out[..., :3] / np.maximum(A, 1e-4), 0)
    res = np.dstack([np.clip(rgb, 0, 255), np.clip(A * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


def _persp_coeffs(dst, src):
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float))


def paste(out, img, pts, a, blend, vc):
    H_, W_ = out.shape[:2]
    x0, y0 = np.floor(pts.min(0)).astype(int) - 1
    x1, y1 = np.ceil(pts.max(0)).astype(int) + 1
    x0, y0 = max(x0, 0), max(y0, 0)
    x1, y1 = min(x1, W_), min(y1, H_)
    if x1 <= x0 or y1 <= y0:
        return
    iw, ih = img.size
    src = [(0, ih), (iw, ih), (0, 0), (iw, 0)]  # LB RB LT RT in image pixel coords
    dst = [(px - x0, py - y0) for px, py in pts]
    try:
        co = _persp_coeffs(dst, src)
    except np.linalg.LinAlgError:
        return
    tile = img.transform((x1 - x0, y1 - y0), Image.PERSPECTIVE, tuple(co), Image.BILINEAR)
    t = np.asarray(tile, np.float32)
    rgb, sa = t[..., :3], t[..., 3:4] / 255.0 * a
    if vc[3] > 0:
        col = np.array(vc[:3], np.float32) * 255.0
        f = vc[4]
        tinted = rgb * col / 255.0 if f == 1 else rgb + col if f == 2 else rgb - col if f == 3 else col
        rgb = np.clip(rgb * (1 - vc[3]) + tinted * vc[3], 0, 255)
    sp = rgb * sa
    reg = out[y0:y1, x0:x1]
    if blend == 1:  # additive (SS for Unity: 0 mix, 1 add): light adds colour; coverage follows its brightness
        reg[..., :3] += sp
        reg[..., 3:4] = np.minimum(1.0, reg[..., 3:4] + sp.max(-1, keepdims=True) / 255.0)
    else:
        reg[..., :3] = sp + reg[..., :3] * (1 - sa)
        reg[..., 3:4] = sa + reg[..., 3:4] * (1 - sa)
