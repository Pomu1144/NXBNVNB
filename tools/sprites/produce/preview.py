"""Contact sheets and GIF previews for produce.py.

    python3 preview.py poses SPEC [names...]   quick look at raw poses (keyed, labelled)
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spritelib as L  # noqa: E402

BG = (44, 50, 66, 255)


def _label(d, xy, text, fill=(255, 230, 120)):
    d.text(xy, text, fill=fill)


def poses_sheet(s, names, out, T=260):
    import produce
    scales_f = os.path.join(produce.workdir(s), "scales.json")
    scales = json.load(open(scales_f)) if os.path.exists(scales_f) else {}
    names = [n for n in names if os.path.exists(produce.pose_file(s, n))]
    cols = min(8, len(names)) or 1
    rows = -(-len(names) // cols)
    cv = Image.new("RGBA", (cols * T, rows * (T + 16)), BG)
    d = ImageDraw.Draw(cv)
    for i, n in enumerate(names):
        f = produce.pose_file(s, n)
        im = L.keyed(f).copy()
        er = L.edge_report(f)
        im.thumbnail((T, T))
        x, y = (i % cols) * T, (i // cols) * (T + 16)
        cv.alpha_composite(im, (x, y + 16))
        d.rectangle((x, y + 16, x + T - 1, y + 16 + T - 1), outline=(90, 100, 120))
        sc = scales.get(n, {}).get("scale")
        bad = [k[0] for k, v in er.items() if v > s.get("edge_tolerance_px", 12)]
        _label(d, (x + 3, y + 2), f"{n} {'' if sc is None else f'x{sc:.2f}'} {'EDGE:' + ''.join(bad) if bad else ''}",
               (255, 120, 120) if bad or (sc and abs(sc - 1) > 0.15) else (255, 230, 120))
    cv.convert("RGB").save(out)
    return out


def _sheet_order(s):
    import produce
    return [(f, n, sh, u) for f, n, sh, u in produce.sheet_jobs(s)
            if os.path.exists(os.path.join(produce.ROOT, f, n + ".json"))]


def contact(s, out, H=150):
    """One row per packed sheet: every frame at display scale (heightScale applied),
    hit frames marked, idle body-height guide lines."""
    import produce
    rows = []
    for folder, name, sh, unit in _sheet_order(s):
        frames, m = L.sheet_frames(os.path.join(produce.ROOT, folder), name)
        hs = m.get("heightScale", 1) if name != "idle" else 1
        h = round(H * hs)
        w = round(m["frameWidth"] * h / m["frameHeight"])
        rows.append((folder, name, m, [f.resize((w, h), Image.LANCZOS) for f in frames], w, h))
    if not rows:
        return None
    maxw = max(len(r[3]) * r[4] for r in rows) + 110
    tot = sum(max(r[5] for r in rows) + 22 for r in rows)
    rh = max(r[5] for r in rows) + 22
    cv = Image.new("RGBA", (min(maxw, 6000), tot), BG)
    d = ImageDraw.Draw(cv)
    for k, (folder, name, m, frames, w, h) in enumerate(rows):
        y0 = k * rh
        base = y0 + rh - 4
        _label(d, (4, y0 + 4), f"{os.path.basename(folder)}")
        _label(d, (4, y0 + 18), f"{name} {m['frames']}f {m['fps']}fps", (200, 220, 255))
        _label(d, (4, y0 + 32), f"hits {len(m.get('hits', []))} hs {m.get('heightScale', '-')}", (200, 220, 255))
        d.line((110, base - H, cv.width, base - H), fill=(80, 90, 110))  # idle head line
        d.line((110, base, cv.width, base), fill=(80, 90, 110))
        for i, f in enumerate(frames):
            x = 110 + i * w
            if x + w > cv.width:
                break
            cv.alpha_composite(f, (x, base - h))
            if i in m.get("hits", []):
                d.rectangle((x, y0 + 2, x + 10, y0 + 8), fill=(255, 80, 80))
    cv.convert("RGB").save(out)
    print("contact", out)
    return out


def gif(s, out, H=200, W=560):
    """idle x2, run x3, attack, idle, jutsu, idle, ultimate, idle, hit, idle, ko (+hold)."""
    import produce
    base = os.path.join(produce.ROOT, s["folder"])
    seq = []

    def add(name, reps=1, hold_last=0):
        if not os.path.exists(os.path.join(base, name + ".json")):
            return
        frames, m = L.sheet_frames(base, name)
        hs = m.get("heightScale", 1) if name != "idle" else 1
        h = round(H * hs)
        w = round(m["frameWidth"] * h / m["frameHeight"])
        ax = m.get("anchorX", 0.5)
        hits = set(m.get("hits", []))
        for _ in range(reps):
            for i, f in enumerate(frames):
                cv = Image.new("RGBA", (W, H + 70), BG)
                cv.alpha_composite(f.resize((w, h), Image.LANCZOS), (round(W * 0.4 - ax * w), H + 50 - h))
                dr = ImageDraw.Draw(cv)
                dr.text((8, 6), f"{s['primary']['id']} {name} {i}", fill=(230, 230, 230))
                if i in hits:
                    dr.text((W - 60, 6), "HIT", fill=(255, 90, 90))
                seq.append((cv.convert("P", palette=Image.ADAPTIVE, colors=255), int(1000 / m["fps"])))
        if hold_last:
            seq.append((seq[-1][0], hold_last))

    add("idle", 2)
    add("run", 3)
    add("attack")
    add("idle", 1)
    add("jutsu")
    add("idle", 1)
    add("ultimate")
    add("idle", 1)
    add("hit")
    add("idle", 1)
    add("ko", 1, 900)
    seq[0][0].save(out, save_all=True, append_images=[a for a, _ in seq[1:]], duration=[b for _, b in seq],
                   loop=0, disposal=2)
    print("gif", out, len(seq), "frames")
    return out


if __name__ == "__main__":
    import produce
    if sys.argv[1] == "poses":
        s = produce.load(sys.argv[2])
        names = sys.argv[3:] or list(s["poses"])
        produce.measure_scales(s)
        print(poses_sheet(s, names, os.path.join(produce.workdir(s), "poses.png")))
