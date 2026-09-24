#!/usr/bin/env python3
"""Build the awakening-material catalog and per-unit awakening requirements
from the Naruto Blazing wiki.

Outputs (repo-relative):
  data/materials.json                       material catalog (id, name, element,
                                            rarity, icon, description, obtain, ...)
  data/awakening-materials-per-unit.json    { unitId: { fromTier: {to, materials,
                                            wikiCard, blazing} } } from the unit
                                            infobox ``material-N`` fields
  assets/awakening-materials/wiki/<id>.webp the wiki's framed card icons
                                            (Card-NNNN.png, alpha kept)

Sources (all through fetch.api_get: throttled, retried, descriptive UA):
  * Category:Awakening Materials, Category:Blazing Awakening Materials and
    their sub-categories (Special Awakening Tool, Special Blazing Awakening
    Materials) -> item pages, 50 titles per revisions request.
  * prop=imageinfo&iiprop=url for File:Card-NNNN.png, 50 per request.
  * Unit infoboxes from the wiki-sync page cache (fetch.py). Pass
    ``--pages-cache`` to read another checkout's cache read-only.

Every API response and downloaded image is cached under
``.cache/materials/``; reruns make no requests unless ``--refresh``.

Usage:
  python3 tools/wiki-sync/materials.py
  python3 tools/wiki-sync/materials.py --pages-cache /path/to/.cache/pages
"""
import argparse
import collections
import glob
import io
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch import api_get, USER_AGENT  # noqa: E402
from parse import INFOBOX_RE, _match_braces, split_fields, clean  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.path.join(HERE, ".cache", "materials")
ICON_DIR = os.path.join(REPO, "assets", "awakening-materials", "wiki")
ICON_WEB = "assets/awakening-materials/wiki"
ROOT_CATEGORIES = ["Category:Awakening Materials", "Category:Blazing Awakening Materials"]
ELEMENTS = ("Heart", "Skill", "Body", "Bravery", "Wisdom")
MAT_INFOBOX_RE = re.compile(r"\{\{\s*(%s)\s+Materials\s*(?=\||\n)" % "|".join(ELEMENTS))
TIER_ORDER = ["1S", "2S", "3S", "4S", "5S", "6S", "6SB", "7S", "7SL", "8S", "8SM", "9S", "9ST", "10SO"]
# Per-unit requirements are only applied up to Blazing Awakening; the
# 6SB -> 7S rules are an open question and stay on the generic tier table.
MAX_TARGET = "6SB"


def dump(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")


def cached(name, refresh, fn):
    path = os.path.join(CACHE, name)
    if not refresh and os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    data = fn()
    dump(data, path)
    return data


# ---------------------------------------------------------------- wiki reads
def category_titles():
    titles, seen, queue = [], set(), list(ROOT_CATEGORIES)
    while queue:
        cat = queue.pop(0)
        if cat in seen:
            continue
        seen.add(cat)
        cont = {}
        while True:
            r = api_get(dict({"action": "query", "list": "categorymembers", "cmtitle": cat,
                              "cmlimit": 500}, **cont))
            for m in r["query"]["categorymembers"]:
                t = m["title"]
                if t.startswith("Category:"):
                    queue.append(t)
                elif t not in titles:
                    titles.append(t)
            if "continue" not in r:
                break
            cont = r["continue"]
    return titles


def page_wikitext(titles):
    out = {}
    for i in range(0, len(titles), 50):
        r = api_get({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                     "titles": "|".join(titles[i:i + 50])})
        for p in r["query"]["pages"].values():
            rev = (p.get("revisions") or [{}])[0]
            out[p["title"]] = rev.get("slots", {}).get("main", {}).get("*", "")
    return out


def image_urls(files):
    out = {}
    for i in range(0, len(files), 50):
        r = api_get({"action": "query", "prop": "imageinfo", "iiprop": "url|size",
                     "titles": "|".join("File:" + f for f in files[i:i + 50])})
        for p in r["query"]["pages"].values():
            ii = (p.get("imageinfo") or [None])[0]
            if ii:
                out[p["title"][5:]] = ii["url"]
    return out


def download(url, dest):
    if os.path.exists(dest):
        return
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as fh:
        fh.write(data)


# ---------------------------------------------------------------- parsing
def stars(v):
    return len(re.findall("★", v or ""))


def slug(s):
    s = re.sub(r"[\"'’]", "", s.lower())
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def wiki_plain(v):
    """Wiki markup -> short plain text (links become their target title)."""
    v = v or ""
    v = re.sub(r"\[\[File:[^\]]*?\.(?:png|jpg|gif)\|[^\]]*?Banner[^\]]*?link=([^\]|]+)\]\]", r'"\1" banner', v)
    v = re.sub(r"\[\[File:[^\]]*?link=([^\]|]+)\]\]", r"\1", v)
    v = re.sub(r"\[\[File:[^\]]*\]\]", "", v)
    v = re.sub(r"<br\s*/?>", "; ", v, flags=re.I)
    v = v.replace("►", "")
    v = clean(v)
    v = re.sub(r"\s*;\s*", "; ", v).strip("; ").strip()
    v = re.sub(r"\s{2,}", " ", v)
    return v


def material_id(title, mat_name, element, rarity):
    el = element.lower()
    m = re.match(r'Awakening Scroll "(\w+)\s+Book" \(★(\d)\)', title)
    if m and m.group(1) in ELEMENTS:
        return "book_%s_%s" % (m.group(1).lower(), m.group(2))
    m = re.match(r'Awakening Scroll "Book of Victor" \(★(\d)\)', title)
    if m:
        return "book_victor_%s" % m.group(1)
    if title.startswith("Awakening Charm"):
        return "awakening_charm"
    m = re.match(r'(\w+) Beads "(Battle|Light) \1 Beads"', title)
    if m:
        return "beads_%s_%d" % (m.group(1).lower(), rarity)
    m = re.match(r'(Ferocious|Deadly) Beads "(.+)"$', title)
    if m:
        return "%s_beads_%s" % (m.group(1).lower(), slug(m.group(2)))
    m = re.match(r'(.+?) "Special Awakening Tool"', title)
    if m:
        return "tool_%s" % slug(m.group(1))
    return slug(title)


def parse_material(title, text):
    m = MAT_INFOBOX_RE.search(text)
    if not m:
        return None
    end = _match_braces(text, m.start())
    f = split_fields(text[m.start() + 2:end - 2])
    element = m.group(1)
    rarity = stars(f.get("rarity"))
    card = int(re.sub(r"\D", "", f.get("card-no", "0")) or 0)
    mat_name = clean(f.get("mat-name")) or title.split(' "')[0]
    sub = re.search(r'"(.+)"', title)
    subtitle = sub.group(1) if sub else clean(f.get("mat-title"))
    cats = re.findall(r"\[\[Category:([^\]|]+)", text)
    info = wiki_plain(f.get("additional-information"))
    obtain = wiki_plain(f.get("how-obtain"))
    mid = material_id(title, mat_name, element, rarity)
    if mid.startswith("book_victor") or mid == "awakening_charm":
        element_key = None  # universal-looking, element orb is cosmetic
    else:
        element_key = element.lower()
    if mid.startswith("book_") and not mid.startswith("book_victor"):
        kind = "scroll"
    elif mid.startswith("beads_"):
        kind = "beads"
    elif "_beads_" in mid:
        kind = "special_beads"
    elif mid.startswith("tool_"):
        kind = "tool"
    else:
        kind = "special"
    if info and info.upper() != "N/A":
        desc = info
    elif kind == "scroll":
        desc = "Awakening material for %s characters." % element
    elif kind == "beads":
        desc = "Blazing Awakening material for %s characters." % element
    else:
        desc = "Awakening material."
    if kind == "scroll":
        short = "%s Book ★%d" % (element, rarity)
    elif kind == "beads":
        short = "%s ★%d" % (subtitle, rarity)
    elif kind == "special_beads":
        short = "%s \"%s\"" % (mat_name, subtitle)
    elif mid.startswith("book_victor"):
        short = "Book of Victor ★%d" % rarity
    else:
        short = mat_name
    return {
        "id": mid,
        "name": "%s \"%s\"" % (mat_name, subtitle) if subtitle else mat_name,
        "shortName": short,
        "element": element_key,
        "orb": element.lower(),
        "rarity": rarity,
        "kind": kind,
        "category": "Blazing Awakening Materials" if kind in ("beads", "special_beads") else "Awakening Materials",
        "cardNo": card,
        "icon": "%s/%s.webp" % (ICON_WEB, mid),
        "description": desc,
        "obtain": obtain if obtain and obtain.upper() != "N/A" else None,
        "wikiTitle": title,
        "wikiCategories": cats,
    }


def unit_infoboxes(pages_dir):
    """Yield (page_title, fields) for every unit infobox in the page cache."""
    for path in sorted(glob.glob(os.path.join(pages_dir, "*.json"))):
        with open(path, encoding="utf-8") as fh:
            pg = json.load(fh)
        text = pg.get("wikitext") or ""
        for m in INFOBOX_RE.finditer(text):
            end = _match_braces(text, m.start())
            f = split_fields(text[m.start() + 2:end - 2])
            yield pg.get("title", ""), m.group(1), f


def card_of(v):
    m = re.search(r"Card-(\d+)\.png", v or "")
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages-cache", default=os.path.join(HERE, ".cache", "pages"))
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    titles = cached("category_titles.json", args.refresh, category_titles)
    texts = cached("material_pages.json", args.refresh, lambda: page_wikitext(titles))

    materials = []
    for t in titles:
        rec = parse_material(t, texts.get(t, ""))
        if rec:
            materials.append(rec)
        else:
            print("skip (no infobox):", t)
    by_card = {m["cardNo"]: m for m in materials}

    files = ["Card-%04d.png" % m["cardNo"] for m in materials]
    urls = cached("image_urls.json", args.refresh, lambda: image_urls(files))

    from PIL import Image
    os.makedirs(ICON_DIR, exist_ok=True)
    for m in materials:
        fname = "Card-%04d.png" % m["cardNo"]
        src = os.path.join(CACHE, "img", fname)
        download(urls[fname], src)
        img = Image.open(src)
        img = img.convert("RGBA")
        img.save(os.path.join(ICON_DIR, m["id"] + ".webp"), "WEBP", quality=92, method=6)

    # -- per-unit requirements from unit infoboxes --------------------------
    records = []  # {card, rarity, ba, mats:{id:n}, unknown:[...], to, bto}
    for title, element, f in unit_infoboxes(args.pages_cache):
        card = _int(f.get("card-no"))
        if not card:
            continue
        mats, unknown = collections.OrderedDict(), []
        for i in range(1, 8):
            v = f.get("material-%d" % i)
            if not v:
                continue
            c = card_of(v)
            if c is None:
                continue  # "No material.png"
            m = by_card.get(c)
            if m is None:
                unknown.append(c)
                continue
            mats[m["id"]] = mats.get(m["id"], 0) + 1
        ba = "(Blazing Awakened)" in title or "FF00FF" in (f.get("rarity") or "")
        records.append({
            "card": card, "rarity": stars(f.get("rarity")), "ba": ba, "title": title,
            "element": element, "mats": mats, "unknown": unknown,
            "to": card_of(f.get("awaken-thum")), "bto": card_of(f.get("b-awaken-thum")),
        })

    normal = {}   # card -> record with awaken-thum (card -> next card)
    blazing = {}  # base 6* card -> record (6S -> 6SB)
    blazing_ba = {}  # BA card -> record (for our units keyed by the BA card number)
    for r in records:
        if not r["mats"] and not r["unknown"]:
            continue
        if r["to"] and not r["ba"]:
            normal.setdefault(r["card"], r)
        if r["bto"]:
            base = r["bto"] if r["ba"] else r["card"]
            if not r["ba"] or base not in blazing:
                blazing[base] = r
            if r["ba"]:
                blazing_ba.setdefault(r["card"], r)

    with open(os.path.join(REPO, "data", "characters.json"), encoding="utf-8") as fh:
        chars = json.load(fh)
    rarity_of_card = {}
    for r in records:
        rarity_of_card.setdefault(r["card"], r["rarity"])

    per_unit, stats = {}, collections.Counter()
    fallback_units, wiki_units = set(), set()
    for c in chars:
        m = re.search(r"_(\d+)$", c["id"])
        if not m:
            continue
        card = int(m.group(1))
        lo, hi = c.get("starMinCode"), c.get("starMaxCode")
        if lo not in TIER_ORDER or hi not in TIER_ORDER:
            continue
        for i in range(TIER_ORDER.index(lo), TIER_ORDER.index(hi)):
            frm, to = TIER_ORDER[i], TIER_ORDER[i + 1]
            if TIER_ORDER.index(to) > TIER_ORDER.index(MAX_TARGET):
                continue
            rec = None
            if to == "6SB":
                rec = blazing.get(card) or blazing_ba.get(card)
            else:
                want = int(frm[:-1])
                cur, hops = card, 0
                while cur and hops < 4:
                    r = normal.get(cur)
                    if r and r["rarity"] == want:
                        rec = r
                        break
                    if r is None or r["rarity"] > want:
                        break
                    cur, hops = r["to"], hops + 1
            if rec and rec["mats"] and not rec["unknown"]:
                per_unit.setdefault(c["id"], {})[frm] = {
                    "to": to,
                    "materials": dict(rec["mats"]),
                    "wikiCard": rec["card"],
                    "wikiTitle": rec["title"],
                }
                stats["wiki"] += 1
                wiki_units.add(c["id"])
            else:
                stats["fallback"] += 1
                if rec and rec["unknown"]:
                    stats["fallback_unknown_material"] += 1
                fallback_units.add(c["id"])

    materials.sort(key=lambda m: ({"scroll": 0, "beads": 1, "special": 2, "tool": 3, "special_beads": 4}[m["kind"]],
                                  ELEMENTS.index(m["orb"].capitalize()) if m["kind"] in ("scroll", "beads") else 0,
                                  m["rarity"] if m["kind"] != "special_beads" else 0, m["id"]))
    for m in materials:
        m.pop("wikiCategories", None)
    dump({
        "source": "https://naruto-blazing.fandom.com (Category:Awakening Materials, "
                  "Category:Blazing Awakening Materials); built by tools/wiki-sync/materials.py",
        "materials": materials,
    }, os.path.join(REPO, "data", "materials.json"))
    dump({
        "source": "Unit infobox material-N / awaken-thum / b-awaken-thum fields on "
                  "https://naruto-blazing.fandom.com; built by tools/wiki-sync/materials.py. "
                  "Keyed by unit id, then the tier the unit awakens FROM. Steps up to 6SB only.",
        "units": per_unit,
    }, os.path.join(REPO, "data", "awakening-materials-per-unit.json"))

    kinds = collections.Counter(m["kind"] for m in materials)
    print("materials:", len(materials), dict(kinds))
    print("awaken steps: wiki=%d fallback=%d (unknown material: %d)" % (
        stats["wiki"], stats["fallback"], stats["fallback_unknown_material"]))
    print("units with any wiki step: %d; units with any fallback step: %d; units fully fallback: %d" % (
        len(wiki_units), len(fallback_units), len(fallback_units - wiki_units)))


def _int(v):
    m = re.search(r"\d+", v or "")
    return int(m.group(0)) if m else None


if __name__ == "__main__":
    main()
