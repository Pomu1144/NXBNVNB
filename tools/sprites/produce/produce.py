#!/usr/bin/env python3
"""Battle-sprite production pipeline (see README.md in this folder).

    produce.py status   SPEC            pose table: done / submitted / waiting
    produce.py pending  [SPEC ...]       jobs_wait-ready groups of unfinished jobs
    produce.py requests SPEC [--only a,b] [--redo a,b] [--max N]
                                         write Higgsfield batch requests for every
                                         pose whose references are ready
    produce.py record   SPEC FILE.json   merge submitted jobs / jobs_wait results
    produce.py fetch    SPEC             download finished poses into the work dir
    produce.py pack     SPEC             key + scale + align + pack all sheets
    produce.py validate SPEC             automatic quality gates (exit 1 on failure)
    produce.py preview  SPEC [--out DIR] contact sheet + GIF
    produce.py register [SPEC ...]       write REGISTRY / dev-panel / preview entries
    produce.py build    SPEC             pack + validate + preview

SPEC is a path or a spec name from specs/ (e.g. `hinata_813`).
"""
import argparse
import glob
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

MODEL = "gpt_image_2_5"
CREDITS_PER_IMAGE = 1.5
# jobs_wait result_url = RESULT_PREFIX + YYYYMMDD_HHMMSS_<job_id>.png (account specific; shorthand for `record`)
RESULT_PREFIX = os.environ.get("HF_RESULT_PREFIX", "https://d8j0ntlcm91z4.cloudfront.net/user_3ExhJLdSJP4zpTAt39VpPKE7gHV/hf_")
STYLE_MEDIA = "c41e48b2-eb1c-4613-a558-91b4231fd467"  # Minato 2101 idle base pose (style reference)

STYLE = ("Same art style and shading as the Minato battle sprite reference: soft painterly anime "
         "rendering, smooth gradients, soft shadows, glossy highlights, rim lighting, 2.5D mobile gacha "
         "battle-sprite look (Naruto Blazing), NOT flat vector cel shading.")
MARGIN = ("The whole body and ALL effects stay fully inside the canvas with at least 70 pixels of empty "
          "green margin on every side (nothing touching or cut by any edge).")
BG = "Flat pure chroma green #00FF00 background, no ground, no shadow, no text, no numbers, no border."

TEMPLATES = {
    # refs: official card art, style sprite
    "base": ("Full-body battle sprite of {character}. Match the character, face, hair, outfit and colours of "
             "the FIRST reference image (official card art). {style} The SECOND reference image is only a style "
             "reference, do not copy that character. Pose: {prompt} Side view facing RIGHT, whole body from head "
             "to feet, the character is about 72% of the canvas height, horizontally centred, feet about 60 px "
             "above the bottom edge. {margin} {bg}"),
    # refs: base pose
    "edit": ("Edit the reference image: keep EXACTLY the same character ({short}), same outfit, same soft "
             "painterly 2.5D anime battle-sprite rendering, same canvas, same scale (identical head size and body "
             "size, do not shrink or enlarge {obj}), feet at the same spot near the bottom of the canvas, side view "
             "facing RIGHT. Change only: {prompt} {margin} {bg}"),
    # refs: base pose, style sprite
    "pose": ("Same character, outfit and rendering as the FIRST reference image ({short}). {style} {scale_rule}"
             "Battle sprite key pose facing RIGHT: {prompt} Feet near the bottom of the canvas. "
             "{margin} {bg}"),
    # refs: pose A, pose B
    # effect-only frames (technique layer, no character); refs: previous FX frame when "from" is set
    "fx": ("Effect-only frame (no character) of a jutsu for a Naruto Blazing style battle. {fx_style} "
           "{fx_refs}NO character, NO people, NO hands, NO text. {continuity}{prompt} Composition: the effect is centred horizontally; the ground line is at about "
           "88% of the canvas height (only cracks, dust and rocks on it, no drawn ground plane). {margin} {bg}"),
    "tween": ("The two reference images are consecutive key poses of the same battle sprite ({short}). Draw the "
              "IN-BETWEEN frame exactly halfway between the FIRST and the SECOND pose: {prompt} Same character, "
              "outfit, rendering, canvas and scale (identical head and body size), side view facing RIGHT, feet "
              "near the bottom of the canvas. {margin} {bg}"),
}


# default look of effect-only frames; a spec can override it with "fx_style"
FX_STYLE = ("Anime film still, painted cel-shaded, matching the Naruto Shippuden anime style: clean dark "
            "outlines, cel colours with soft painted shading, smooth clean high-resolution rendering that fits "
            "hand-painted anime characters and backgrounds. NOT pixel art, NOT low-res game VFX, no sparkles, no "
            "glitter or particle noise.")


# ------------------------------------------------------------------ spec ---
def spec_path(arg):
    if os.path.exists(arg):
        return os.path.abspath(arg)
    p = os.path.join(HERE, "specs", arg + ".json")
    if os.path.exists(p):
        return p
    sys.exit(f"no spec {arg}")


def load(arg):
    p = spec_path(arg)
    s = json.load(open(p))
    s["_path"] = p
    s.setdefault("state", {}).setdefault("poses", {})
    s["state"].setdefault("media", {})
    s["state"].setdefault("next_index", s.get("index_base", 0))
    return s


def save(s):
    p = s.pop("_path")
    with open(p, "w") as f:
        json.dump(s, f, indent=1, ensure_ascii=False)
        f.write("\n")
    s["_path"] = p


def workdir(s):
    d = os.path.join(HERE, "work", s["name"])
    os.makedirs(d, exist_ok=True)
    return d


def pose_file(s, name):
    return os.path.join(workdir(s), name + ".png")


def rel(p):
    return os.path.relpath(p, ROOT)


_CHARS = None


def char_data(cid):
    global _CHARS
    if _CHARS is None:
        _CHARS = {c["id"]: c for c in json.load(open(os.path.join(ROOT, "data", "characters.json")))}
    return _CHARS[cid]


def skill_hits(unit, kind):
    """Hit count of a unit's jutsu/ultimate from data/characters.json (None if it has none)."""
    c = char_data(unit["id"])
    sk = (c.get("skills") or {}).get(kind)
    if not sk:
        return None
    bt = sk.get("byTier") or {}
    t = bt.get(unit.get("tier")) or (list(bt.values())[-1] if bt else {})
    return int(t.get("hits") or 1)


# -------------------------------------------------------------- requests ---
def deps(s, name):
    p = s["poses"][name]
    t = p["type"]
    if t == "base":
        return []
    if t == "fx":
        return [p["from"]] if p.get("from") else []
    if t in ("edit", "pose"):
        return [p.get("from", "base")]
    if t == "tween":
        return list(p["from"])
    raise ValueError(t)


def media_for(s, name):
    p, st = s["poses"][name], s["state"]
    job = lambda n: st["poses"][n]["job_id"]  # noqa: E731
    t = p["type"]
    if t == "fx":
        refs = ([job(p["from"])] if p.get("from") else []) + ([] if p.get("fx_refs") is False else list(s.get("fx_refs", [])))
    elif t == "base":
        refs = [st["media"]["ref_art"], st["media"].get("style", STYLE_MEDIA)]
    elif t == "edit":
        refs = [job(p.get("from", "base"))]
    elif t == "pose":
        refs = [job(p.get("from", "base")), st["media"].get("style", STYLE_MEDIA)]
    else:
        refs = [job(p["from"][0]), job(p["from"][1])]
    return [{"role": "image_references", "value": v} for v in refs]


def prompt_for(s, name):
    p = s["poses"][name]
    subj, obj = (s.get("pronouns") or ["he", "him"])[:2]
    scale_rule = "" if p.get("free_scale") else (
        f"IMPORTANT: draw {obj} at EXACTLY the same scale as the FIRST reference (same head size and body size, "
        f"do not shrink {obj}). ")
    continuity = ("Continue EXACTLY from the FIRST reference image (the previous frame): same camera, same "
                  "framing, same scale and the same centre point of the effect; change only this: ") if p.get("from") else ""
    fx_refs = ""
    if p["type"] == "fx" and s.get("fx_refs") and p.get("fx_refs") is not False:
        which = "SECOND" if p.get("from") else "The"
        fx_refs = (f"{which} reference image is only a style and colour reference (screenshot): match its "
                   f"look, NOT its sky, clouds or background. ")
    return TEMPLATES[p["type"]].format(character=s["character"], short=s["short"], prompt=p["prompt"].strip(),
                                       scale_rule=scale_rule, continuity=continuity, fx_refs=fx_refs,
                                       fx_style=p.get("fx_style", s.get("fx_style", FX_STYLE)),
                                       style=STYLE, margin=MARGIN if not p.get("no_margin") else "", bg=BG,
                                       subj=subj, obj=obj).replace("  ", " ")


def cmd_requests(s, a):
    st = s["state"]["poses"]
    only = set(a.only.split(",")) if a.only else None
    redo = set(a.redo.split(",")) if a.redo else set()
    ready = []
    for n in s["poses"]:
        if only and n not in only:
            continue
        if n in st and st[n].get("job_id") and n not in redo:
            continue
        if all(st.get(d, {}).get("status") == "completed" and d not in redo for d in deps(s, n)):
            ready.append(n)
    ready = ready[: a.max] if a.max else ready
    if not ready:
        print("nothing ready")
        return
    reqs = []
    for n in ready:
        i = s["state"]["next_index"]
        s["state"]["next_index"] += 1
        params = {"model": MODEL, "quality": s["poses"][n].get("quality", "high"), "aspect_ratio": "1:1",
                  "medias": media_for(s, n), "prompt": prompt_for(s, n)}
        if not params["medias"]:
            del params["medias"]
        reqs.append({"index": i, "params": params})
    for r, n in zip(reqs, ready):
        e = st.setdefault(n, {})
        if e.get("job_id"):  # keep the superseded take for reference
            e.setdefault("previous", []).append(e["job_id"])
        e["pending_index"] = r["index"]
        for k in ("job_id", "status", "url"):
            e.pop(k, None)
    d = workdir(s)
    files = []
    for k in range(0, len(reqs), 12):
        f = os.path.join(d, f"req_{reqs[k]['index']}.json")
        json.dump(reqs[k:k + 12], open(f, "w"), indent=1)
        files.append(f)
    save(s)
    print(f"{len(reqs)} requests (~{len(reqs) * CREDITS_PER_IMAGE:g} credits): {', '.join(ready)}")
    for f in files:
        print("  ", f)


def cmd_record(s, a):
    """FILE: list of {index, job_id[, status, url|result_url|results[..]]}.

    Accepts the `jobs` array of generate_image_batch or jobs_wait output."""
    txt = open(a.file).read()
    try:
        data = json.loads(txt)
    except ValueError:  # shorthand lines: "INDEX JOB_ID" (submitted) or "JOB_ID URL|HHMMSS" (completed)
        data = []
        for ln in txt.split("\n"):
            t = ln.split()
            if len(t) == 2 and t[0].isdigit():
                data.append({"index": int(t[0]), "job_id": t[1], "status": "pending"})
            elif len(t) == 2:
                u = t[1] if t[1].startswith("http") else f"{RESULT_PREFIX}{a.date}_{t[1]}_{t[0]}.png"
                data.append({"job_id": t[0], "status": "completed", "url": u})
            elif len(t) == 1 and len(t[0]) == 36:
                data.append({"job_id": t[0], "status": "failed"})
    if isinstance(data, dict):
        data = data.get("jobs") or data.get("results") or []
    by_index = {v["pending_index"]: n for n, v in s["state"]["poses"].items() if v.get("pending_index") is not None}
    by_job = {v.get("job_id"): n for n, v in s["state"]["poses"].items() if v.get("job_id")}
    for j in data:
        n = by_job.get(j.get("job_id")) or by_index.get(j.get("index"))
        if not n:
            continue
        e = s["state"]["poses"][n]
        if j.get("job_id"):
            e["job_id"] = j["job_id"]
        url = j.get("url") or j.get("result_url")
        if not url and isinstance(j.get("results"), list) and j["results"]:
            r0 = j["results"][0]
            url = r0.get("url") if isinstance(r0, dict) else r0
        if url:
            e["url"] = url
        stt = j.get("status")
        if stt:
            e["status"] = stt
        if j.get("error"):
            e["error"] = j["error"]
        print(f"{s['name']:12s} {n:10s} {e.get('status', '?'):10s} {e.get('job_id', '')}")
    save(s)
    if getattr(a, "fetch", True):
        cmd_fetch(s, a)


def cmd_fetch(s, a):
    for n, e in s["state"]["poses"].items():
        f = pose_file(s, n)
        if e.get("url") and (a.force or not os.path.exists(f) or e.get("fetched") != e["url"]):
            subprocess.run(["curl", "-sS", "-o", f, e["url"]], check=True)
            e["fetched"] = e["url"]
            print("fetched", n)
    save(s)


def pending_jobs(s):
    return [{"index": v.get("pending_index", 0), "job_id": v["job_id"]}
            for v in s["state"]["poses"].values()
            if v.get("job_id") and v.get("status") not in ("completed", "failed", "nsfw")]


def cmd_status(s, a):
    st = s["state"]["poses"]
    rows = []
    for n, p in s["poses"].items():
        e = st.get(n, {})
        have = os.path.exists(pose_file(s, n))
        rows.append((n, p["type"], e.get("status") or ("pending" if "pending_index" in e else "-"),
                     "file" if have else ""))
    for r in rows:
        print("%-10s %-6s %-10s %s" % r)
    done = sum(1 for r in rows if r[3])
    print(f"{done}/{len(rows)} poses downloaded")


# ------------------------------------------------------------------ pack ---
def expand_timeline(tl, hits):
    """Resolve ["@hits", [keys...], hold] into enough hit frames that the whole
    timeline carries exactly `hits` hit markers (explicit "hit" entries count)."""
    explicit = sum(1 for e in tl if e[0] != "@hits" and len(e) > 2 and e[2] == "hit")
    out = []
    for e in tl:
        if e[0] == "@hits":
            keys, hold = e[1], int(e[2]) if len(e) > 2 else 1
            n = max(0, (hits or 0) - explicit)
            out += [[keys[i % len(keys)], hold, "hit"] for i in range(n)]
        else:
            out.append(list(e))
    return out


def sheet_jobs(s):
    """(folder, sheet name, sheet spec, unit for hits) for every sheet incl. variants."""
    jobs = []
    for name, sh in s["sheets"].items():
        if name.startswith("_"):  # parked / disabled sheet definitions
            continue
        jobs.append((s["folder"], name, sh, sh.get("unit") or s["primary"]))
    for v in s.get("variants", []):
        for name, sh in v["sheets"].items():
            jobs.append((v["folder"], name, sh, sh.get("unit") or v["primary"]))
    return jobs


def measure_scales(s, force=False):
    """Body scale of every pose relative to the idle base (cached in work/<name>/scales.json).

    A pose is matched against the base and against the other poses of its group
    (same name prefix: run*, j*, u*, h*/k*, at*); poses of one sheet resemble
    each other far more than they resemble the idle pose, so chaining through a
    sibling (scale(p vs q) * scale(q vs base)) gives many more feature matches.
    The estimates are combined with their match counts as weights."""
    import spritelib as L
    f = os.path.join(workdir(s), "scales.json")
    cache = json.load(open(f)) if os.path.exists(f) and not force else {}
    base = pose_file(s, "base")
    have = [n for n in s["poses"] if os.path.exists(pose_file(s, n)) and s["poses"][n].get("type") != "fx"]
    sig = {n: int(os.path.getmtime(pose_file(s, n))) for n in have}
    key = json.dumps(sig, sort_keys=True)
    if cache.get("_key") == key:
        return cache
    direct = {n: ((1.0, 999) if n == "base" else L.body_scale(base, pose_file(s, n))) for n in have}
    group = lambda n: re.match(r"[a-z]+", n).group(0).replace("k", "h")  # noqa: E731
    out = {"_key": key}
    for n in have:
        if n == "base":
            out[n] = {"scale": 1.0, "matches": 999}
            continue
        est = []
        if direct[n][0]:
            est.append((direct[n][0], direct[n][1]))
        for q in have:
            if q in (n, "base") or group(q) != group(n) or not direct[q][0]:
                continue
            sq, mq = L.body_scale(pose_file(s, q), pose_file(s, n))
            if sq:
                est.append((sq * direct[q][0], min(mq, direct[q][1])))
        if est:
            w = sum(m for _, m in est)
            out[n] = {"scale": float(math.exp(sum(math.log(v) * m for v, m in est) / w)), "matches": int(w),
                      "direct": direct[n][0]}
        else:
            out[n] = {"scale": None, "matches": direct[n][1]}
    json.dump(out, open(f, "w"), indent=1)
    return out


def key_opts(s, n, scales):
    """Pose placement for the packer: auto body-scale correction + manual tweaks."""
    p = s["poses"][n]
    k = {"path": pose_file(s, n), "feet": p.get("feet", True), "dx": p.get("dx", 0), "dy": p.get("dy", 0)}
    if p.get("recolor"):
        k["recolor"] = s.get("recolors", {}).get(p["recolor"], p["recolor"]) if isinstance(p["recolor"], str) else p["recolor"]
    if "scale" in p:
        k["scale"] = p["scale"]
    else:
        m = scales.get(n, {})
        if not m.get("scale") and isinstance(p.get("from"), str) and p["from"] != n:
            # not measurable (mostly effects): an edit of another pose keeps that pose's size
            return {**k, "scale": key_opts(s, p["from"], scales)["scale"]}
        k["scale"] = 1.0 / m["scale"] if m.get("scale") and p.get("auto_scale", True) else 1.0
    return k


def cmd_pack(s, a):
    import spritelib as L
    scales = measure_scales(s)
    report = {}
    idle_body = 0
    # idle first: every other sheet keeps at least the idle body resolution
    for folder, name, sh, unit in sorted(sheet_jobs(s), key=lambda j: j[1] != "idle"):
        if sh.get("skill"):
            hits = skill_hits(unit, sh["skill"])
            if hits is None:
                print(f"skip {name}: {unit['id']} has no {sh['skill']}")
                continue
        else:
            hits = sh.get("hits", 0)
        tl = expand_timeline(sh["timeline"], hits)
        names = {e[0] for e in tl}
        if sh.get("type") == "fx":
            var = sh.get("variants", {})
            keys = {n: ({"path": pose_file(s, var[n]["from"]), "scale": var[n].get("scale", 1.0)} if n in var
                        else {"path": pose_file(s, n), "scale": s["poses"][n].get("scale", 1.0)}) for n in names}
            if sh.get("recolor"):
                names_ = sh["recolor"] if isinstance(sh["recolor"], list) else [sh["recolor"]]
                rc = [s.get("recolors", {}).get(r, r) for r in names_]
                for k in keys.values():
                    k["recolor"] = rc
            meta = L.pack_fx(os.path.join(ROOT, folder, name), keys, tl, fps=sh.get("fps", 14),
                             height=sh.get("height", 360), ground_y=sh.get("ground_y", 0.88),
                             sphere_key=sh.get("sphere_key"), sphere_units=sh.get("sphere_units", 1.75),
                             crossfade=sh.get("crossfade", True), quality=sh.get("quality", 80),
                             key=sh.get("key", "green"), size_by=sh.get("size_by", "blob"))
            report[f"{folder}/{name}"] = {"hits": len(meta["hits"]), "want_hits": hits, "frames": meta["frames"],
                                          "size": [meta["frameWidth"], meta["frameHeight"]], "fx": True,
                                          "heightUnits": meta["heightUnits"], "sphereFrac": meta["sphereFrac"]}
            print(f"{folder}/{name} (fx): {meta['frames']}f {meta['frameWidth']}x{meta['frameHeight']} "
                  f"hits={len(meta['hits'])} heightUnits={meta['heightUnits']} groundY={meta['groundY']}")
            continue
        keys = {n: key_opts(s, n, scales) for n in names}
        meta = L.pack_sheet(os.path.join(ROOT, folder, name), pose_file(s, "base"), keys, tl,
                            fps=sh.get("fps", 12), height=sh.get("height", 256),
                            body_px=max(sh.get("body_px") or 0, idle_body) or None,
                            loop=sh.get("loop", False), edge_fade=sh.get("edge_fade", 10),
                            anchor_x_from_ref=sh.get("anchor_x_from_ref", False), quality=sh.get("quality", 86),
                            write_scale=sh.get("write_scale", not sh.get("loop", False) or name == "run"))
        if name == "idle":
            idle_body = math.ceil(meta["bodyPx"])
        if sh.get("fx"):  # caster sheet of a layered technique: tell the battle code when to spawn each FX layer
            out = []
            for fx in (sh["fx"] if isinstance(sh["fx"], list) else [sh["fx"]]):
                start = 0
                for e in tl:
                    if e[0] == fx.get("start_key"):
                        break
                    start += int(e[1])
                o = {"sheet": fx["sheet"], "at": fx.get("at", "targets"), "startFrame": start + int(fx.get("delay", 0))}
                for k in ("layer", "projectile", "base"):
                    if k in fx:
                        o[k] = fx[k]
                out.append(o)
            m = json.load(open(os.path.join(ROOT, folder, name + ".json")))
            m["fx"] = out if isinstance(sh["fx"], list) else out[0]
            json.dump(m, open(os.path.join(ROOT, folder, name + ".json"), "w"), indent=2)
        report[f"{folder}/{name}"] = {"bodyPx": meta["bodyPx"], "hits": len(meta.get("hits", [])),
                                      "want_hits": hits,
                                      "frames": meta["frames"], "size": [meta["frameWidth"], meta["frameHeight"]],
                                      "heightScale": meta.get("heightScale"), "anchorX": meta["anchorX"]}
        print(f"{folder}/{name}: {meta['frames']}f {meta['frameWidth']}x{meta['frameHeight']} "
              f"hits={len(meta.get('hits', []))} hs={meta.get('heightScale')} body={meta['bodyPx']}px")
    json.dump(report, open(os.path.join(workdir(s), "pack.json"), "w"), indent=1)


# -------------------------------------------------------------- validate ---
def cmd_validate(s, a):
    import spritelib as L
    errs, warns = [], []
    scales = measure_scales(s)
    used = set()
    for folder, name, sh, unit in sheet_jobs(s):
        for e in sh["timeline"]:
            used.update(e[1] if e[0] == "@hits" else [e[0]])
    fx_variants = {}
    for folder, name, sh, unit in sheet_jobs(s):
        fx_variants.update(sh.get("variants", {}) if sh.get("type") == "fx" else {})
    for n in sorted(used):
        if n in fx_variants:
            continue
        if n not in s["poses"]:
            errs.append(f"timeline uses undefined pose {n}")
        elif not os.path.exists(pose_file(s, n)):
            errs.append(f"pose {n} missing (not generated/fetched)")
    for n in s["poses"]:
        if n not in used and n != "base" and not s["poses"][n].get("helper"):
            warns.append(f"pose {n} is not used by any sheet")
    tol = s.get("edge_tolerance_px", 12)
    for n in sorted(used):
        f = pose_file(s, n)
        if n in fx_variants or not os.path.exists(f):
            continue
        er = L.edge_report(f)
        bad = {k: v for k, v in er.items() if v > tol}
        if bad and not s["poses"].get(n, {}).get("edge_ok"):
            errs.append(f"pose {n}: art touches the canvas edge {bad} (regenerate, or set edge_ok after checking the fade)")
        p = s["poses"].get(n, {})
        if p.get("type") == "fx" or n in fx_variants:
            continue
        m = scales.get(n, {})
        applied = key_opts(s, n, scales)["scale"]
        if m.get("scale") is None:
            if n != "base" and "scale" not in p:
                warns.append(f"pose {n}: body scale not measurable ({m.get('matches')} matches) — check by eye")
        else:
            final = m["scale"] * applied
            if abs(final - 1) > 0.05 and p.get("size_check", True):
                errs.append(f"pose {n}: body size {final:.3f}x idle after correction (>±5%)")
            if abs(m["scale"] - 1) > 0.15:
                warns.append(f"pose {n}: generated at {m['scale']:.2f}x idle (auto-corrected; large drift)")
    rep_f = os.path.join(workdir(s), "pack.json")
    rep = json.load(open(rep_f)) if os.path.exists(rep_f) else {}
    need = ["idle", "run", "attack", "jutsu", "hit", "ko"]
    for folder, name, sh, unit in sheet_jobs(s):
        path = os.path.join(ROOT, folder, name + ".json")
        want = skill_hits(unit, sh["skill"]) if sh.get("skill") else sh.get("hits")
        if sh.get("skill") and want is None:
            continue
        if not os.path.exists(path):
            errs.append(f"{folder}/{name}: sheet not packed")
            continue
        m = json.load(open(path))
        if want is not None and len(m.get("hits", [])) != want:
            errs.append(f"{folder}/{name}: {len(m.get('hits', []))} hit frames, data says {want}")
        if sh.get("fx"):
            layers = sh["fx"] if isinstance(sh["fx"], list) else [sh["fx"]]
            mfx = m.get("fx")
            mfx = mfx if isinstance(mfx, list) else [mfx] if mfx else []
            if len(mfx) != len(layers):
                errs.append(f"{folder}/{name}: fx block missing in the packed json")
            for fx, mf in zip(layers, mfx):
                fxp = os.path.join(ROOT, fx.get("base", folder), fx["sheet"] + ".json")
                if not os.path.exists(fxp):
                    errs.append(f"{folder}/{name}: fx sheet {fx['sheet']} not packed")
                elif not 0 <= mf["startFrame"] < m["frames"]:
                    errs.append(f"{folder}/{name}: fx {fx['sheet']} startFrame {mf['startFrame']} outside the caster sheet")
        if sh.get("type") == "fx":
            continue
        hs = m.get("heightScale", 1)
        if not 0.85 <= hs <= sh.get("max_height_scale", 1.35):
            errs.append(f"{folder}/{name}: heightScale {hs} out of range")
        elif not 0.93 <= hs <= 1.15:
            warns.append(f"{folder}/{name}: heightScale {hs} (effects extend well beyond the body)")
        r = rep.get(f"{folder}/{name}")
        idle = rep.get(f"{s['folder']}/idle")
        if r and idle and name not in ("idle",) and r["bodyPx"] < idle["bodyPx"] - 0.5:
            errs.append(f"{folder}/{name}: body {r['bodyPx']}px < idle {idle['bodyPx']}px (pixelated)")
    for n in need:
        if n not in s["sheets"]:
            errs.append(f"sheet {n} missing from spec")
    if "ultimate" not in s["sheets"] and skill_hits(s["primary"], "ultimate"):
        errs.append("unit has an ultimate but the spec has no ultimate sheet")
    for w in warns:
        print("WARN ", w)
    for e in errs:
        print("ERROR", e)
    print("validate:", "OK" if not errs else f"{len(errs)} error(s)", f"({len(warns)} warning(s))")
    if errs:
        sys.exit(1)


# --------------------------------------------------------------- preview ---
def cmd_preview(s, a):
    import preview
    out = a.out or workdir(s)
    preview.contact(s, os.path.join(out, f"mp_{s['dev']['id']}_sheets.png"))
    preview.gif(s, os.path.join(out, f"mp_{s['dev']['id']}.gif"))


def cmd_build(s, a):
    cmd_pack(s, a)
    cmd_preview(s, a)
    cmd_validate(s, a)


# -------------------------------------------------------------- register ---
def replace_block(path, tag, lines, indent):
    src = open(path).read()
    pat = re.compile(r"([ \t]*)(//|<!--) <produce:%s>.*?(//|<!--) </produce:%s>( -->)?" % (tag, tag), re.S)
    m = pat.search(src)
    if not m:
        sys.exit(f"{path}: no <produce:{tag}> block")
    ind = m.group(1)
    body = "\n".join(ind + l for l in lines)
    open_c, close_c = ("//", "") if m.group(2) == "//" else ("<!--", " -->")
    new = f"{ind}{open_c} <produce:{tag}> generated by tools/sprites/produce/produce.py register{close_c}\n" \
          f"{body + chr(10) if lines else ''}{ind}{open_c} </produce:{tag}>{close_c}"
    src = src[:m.start()] + new + src[m.end():]
    open(path, "w").write(src)


def cmd_register(specs):
    reg, shared, dev, prev = [], [], [], []
    for s in specs:
        if not os.path.exists(os.path.join(ROOT, s["folder"], "idle.json")):
            print(f"skip {s['name']}: not packed")
            continue
        fam = [(s["folder"], s["ids"], s)] + [(v["folder"], v["ids"], v) for v in s.get("variants", [])]
        for folder, ids, _ in fam:
            for cid in ids:
                c = char_data(cid)
                reg.append(f"{cid}: '{folder}', // {c['name']} \"{c['version']}\" {c['rarity']}★")
        for v in s.get("variants", []):
            own = sorted(v["sheets"])
            shared.append(f"'{v['folder']}': {{ from: '{s['folder']}', own: {json.dumps(own)} }},")
        d = s["dev"]
        dev.append(json.dumps({"id": d["id"], "tier": d["tier"], "label": d["label"], "note": d.get("note", "")},
                              ensure_ascii=False) + ",")
        prev.append(json.dumps({"id": s["primary"]["id"], "name": d["label"], "base": s["folder"]},
                               ensure_ascii=False) + ",")
    replace_block(os.path.join(ROOT, "js/sprite-player.js"), "registry", reg, "    ")
    replace_block(os.path.join(ROOT, "js/sprite-player.js"), "shared", shared, "    ")
    replace_block(os.path.join(ROOT, "js/characters-dev-panel.js"), "units", dev, "    ")
    replace_block(os.path.join(ROOT, "sprites-preview.html"), "units", prev, "      ")
    print(f"registered {len(reg)} ids from {len(specs)} spec(s)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd")
    ap.add_argument("spec", nargs="*")
    ap.add_argument("--only")
    ap.add_argument("--redo")
    ap.add_argument("--max", type=int)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--out")
    ap.add_argument("--date", default=__import__("time").strftime("%Y%m%d", __import__("time").gmtime()))
    a = ap.parse_args()
    if a.cmd == "register":
        names = a.spec or [os.path.basename(p)[:-5] for p in sorted(glob.glob(os.path.join(HERE, "specs", "*.json")))]
        return cmd_register([load(n) for n in names])
    if a.cmd == "pending":  # jobs_wait groups (<=12) for every submitted-but-unfinished pose
        names = a.spec or [os.path.basename(p)[:-5] for p in sorted(glob.glob(os.path.join(HERE, "specs", "*.json")))]
        jobs = [j for n in names for j in pending_jobs(load(n))]
        for k in range(0, len(jobs), 12):
            print(json.dumps(jobs[k:k + 12]))
        return
    if a.cmd == "record":  # record [SPEC] FILE — without SPEC the file is matched against every spec
        a.file = a.spec[-1]
        names = a.spec[:-1] or [os.path.basename(p)[:-5] for p in sorted(glob.glob(os.path.join(HERE, "specs", "*.json")))]
        for n in names:
            cmd_record(load(n), a)
        return
    fn = {"status": cmd_status, "requests": cmd_requests, "fetch": cmd_fetch, "pack": cmd_pack,
          "validate": cmd_validate, "preview": cmd_preview, "build": cmd_build}[a.cmd]
    for n in a.spec:
        fn(load(n), a)


if __name__ == "__main__":
    main()
