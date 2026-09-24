#!/usr/bin/env python3
"""Parse Naruto Blazing wiki unit infoboxes into normalized records.

A unit page's wikitext starts (possibly after ``{{Incomplete}}`` or inside a
``<tabber>``) with ``{{<Element> Characters | field = value | ...}}``.  The
template name gives the element; the fields give everything else.

``parse_page(cached_page)`` returns the first infobox as a record and
``parse_page_all`` returns every infobox on the page (tabber pages have
several).  Record layout (None when absent)::

  {pageid, title, element, name, version, card_no, rarity, range,
   luck:{base,max}, cost:{base,max}, max_lv, max_lv_lb, limit_break,
   affiliation:[...], normal_hit, stats:{hp_base,hp_max,atk_base,atk_max,
   speed_base,speed_max}, field_skill, buddy_skill,
   abilities:[{name,description}],
   ninjutsu|stechnique|latentskill: {name, description, nwus_description,
       chakra, chakra_max, hits, shape, range, position}}

Run directly to dump parsed records:  python3 parse.py <cached_page.json>...
"""
import json
import re
import sys

ELEMENTS = ("Heart", "Body", "Skill", "Bravery", "Wisdom")
INFOBOX_RE = re.compile(r"\{\{\s*(%s)\s+Characters\s*(?=\||\n)" % "|".join(ELEMENTS))


def card_from_id(unit_id):
    """'kakashi_2091' -> 2091 ; 'naruto_001' -> 1 ; None if no numeric suffix."""
    m = re.search(r"_(\d+)$", unit_id or "")
    return int(m.group(1)) if m else None


def _match_braces(text, start):
    """Index just past the '}}' closing the '{{' at text[start]."""
    depth = 0
    i = start
    n = len(text)
    while i < n:
        two = text[i:i + 2]
        if two == "{{":
            depth += 1
            i += 2
            continue
        if two == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return i
            continue
        i += 1
    return n


def split_fields(body):
    """Split template body on top-level '|' (ignoring [[..|..]] and {{..|..}})."""
    parts, buf = [], []
    curly = square = 0
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two == "{{":
            curly += 1; buf.append(two); i += 2; continue
        if two == "}}":
            curly = max(0, curly - 1); buf.append(two); i += 2; continue
        if two == "[[":
            square += 1; buf.append(two); i += 2; continue
        if two == "]]":
            square = max(0, square - 1); buf.append(two); i += 2; continue
        c = body[i]
        if c == "|" and curly == 0 and square == 0:
            parts.append("".join(buf)); buf = []
        else:
            buf.append(c)
        i += 1
    parts.append("".join(buf))
    fields = {}
    for p in parts[1:]:  # parts[0] is the template name
        if "=" not in p:
            continue
        k, v = p.split("=", 1)
        k = k.strip()
        if k:
            fields[k] = v.strip()
    return fields


def _value_multiplier(m):
    args = [a.strip() for a in m.group(1).split("|")]
    try:
        a = float(args[0]) if args and args[0] else 100.0
        b = float(args[1]) if len(args) > 1 and args[1] else 2.0
        fmt = lambda x: str(int(x)) if x == int(x) else str(x)
        return "%s / %s" % (fmt(a), fmt(a * b))
    except ValueError:
        return m.group(0)


def clean(v):
    """Wikitext -> plain text (links, files, simple templates, html, bold)."""
    if v is None:
        return None
    s = v
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\{\{\s*ValueMultiplier\s*\|([^{}]*)\}\}", _value_multiplier, s)
    s = re.sub(r"\[\[\s*(?:File|Image):[^\[\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^\[\]|]*\|([^\[\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\[\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    s = s.replace("&nbsp;", " ").replace("&amp;", "&")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def _int(v):
    m = re.search(r"-?\d+", clean(v) or "") if v is not None else None
    return int(m.group(0)) if m else None


def parse_arrow(v):
    """'5 → 4' -> (5, 4) ; '6' -> (6, None) ; '' -> (None, None)."""
    s = clean(v) or ""
    nums = re.findall(r"\d+(?:\.\d+)?", s)
    if not nums:
        return None, None
    conv = lambda x: int(float(x)) if float(x) == int(float(x)) else float(x)
    first = conv(nums[0])
    if len(nums) > 1 and re.search(r"→|->|&rarr;|⇒", s):
        return first, conv(nums[1])
    return first, None


def _skill(f, prefix):
    name = clean(f.get(prefix + "-name"))
    if not name:
        return None
    d1 = f.get(prefix + "-description-1")
    d2 = f.get(prefix + "-description-2")
    d = f.get(prefix + "-description")
    desc = clean(d1 if d1 else d)
    nwus = clean(d2) if d2 else None
    chakra, chakra_max = parse_arrow(f.get(prefix + "-chakra"))
    return {
        "name": name,
        "description": desc or None,
        "nwus_description": nwus or None,
        "chakra": chakra,
        "chakra_max": chakra_max,
        "hits": _int(f.get(prefix + "-hit")),
        "shape": clean(f.get(prefix + "-shape")) or None,
        "range": clean(f.get(prefix + "-range")) or None,
        "position": clean(f.get(prefix + "-position")) or None,
    }


def _affiliations(v):
    out = []
    for m in re.finditer(r"\[\[\s*File:([^|\]]+?)[ _]icon\.\w+", v or "", re.I):
        name = m.group(1).replace("_", " ").strip()
        if name and name not in out:
            out.append(name)
    return out


def _abilities(f):
    out = []
    n = _int(f.get("ability-max")) or 0
    i = 1
    while True:
        t = f.get("ability-%d-title" % i)
        d = f.get("ability-%d-description" % i)
        if t is None:  # PvE/PvP split: ability-N-title-1 (missions) / -2 (NWUS)
            t = f.get("ability-%d-title-1" % i)
            d = f.get("ability-%d-description-1" % i)
        if t is None and i > n:
            break
        if t is not None:
            out.append({"name": clean(t), "description": clean(d) or ""})
        i += 1
        if i > 30:
            break
    return out


def parse_fields(element, f, page=None):
    luck_b, luck_m = parse_arrow(f.get("luck"))
    if luck_b is None and f.get("luck-base"):
        luck_b, luck_m = _int(f.get("luck-base")), _int(f.get("luck-max"))
    cost_b, cost_m = parse_arrow(f.get("cost"))
    rarity_s = clean(f.get("rarity")) or ""
    return {
        "pageid": page.get("pageid") if page else None,
        "title": page.get("title") if page else None,
        "revid": page.get("revid") if page else None,
        "element": element,
        "name": clean(f.get("char-name")),
        "version": clean(f.get("char-title")),
        "card_no": _int(f.get("card-no")),
        "rarity": rarity_s.count("★") or None,
        "range": clean(f.get("range")) or None,
        "luck": {"base": luck_b, "max": luck_m if luck_m is not None else luck_b} if luck_b is not None else None,
        "cost": {"base": cost_b, "max": cost_m if cost_m is not None else cost_b} if cost_b is not None else None,
        "max_lv": _int(f.get("max-lv")),
        "max_lv_lb": _int(f.get("max-lv-lb")),
        "limit_break": (clean(f.get("limit-break")) or "").lower() == "yes",
        "affiliation": _affiliations(f.get("affiliation")),
        "normal_hit": _int(f.get("normal-hit")),
        "stats": {
            "hp_base": _int(f.get("HP2-base")), "hp_max": _int(f.get("HP2-max")),
            "atk_base": _int(f.get("ATK2-base")), "atk_max": _int(f.get("ATK2-max")),
            "speed_base": _int(f.get("speed-base")), "speed_max": _int(f.get("speed-max")),
        },
        "field_skill": clean(f.get("field-skill")) or None,
        "buddy_skill": clean(f.get("buddy-skill")) or None,
        "abilities": _abilities(f),
        "ninjutsu": _skill(f, "ninjutsu"),
        "stechnique": _skill(f, "stechnique"),
        "latentskill": _skill(f, "latentskill"),
    }


def parse_page_all(page):
    """All infobox records on a cached page ({pageid,title,wikitext,...})."""
    text = page.get("wikitext") or ""
    out = []
    for m in INFOBOX_RE.finditer(text):
        end = _match_braces(text, m.start())
        body = text[m.start() + 2:end - 2]
        out.append(parse_fields(m.group(1), split_fields(body), page))
    return out


def parse_page(page):
    recs = parse_page_all(page)
    return recs[0] if recs else None


if __name__ == "__main__":
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as fh:
            pg = json.load(fh)
        if "wikitext" not in pg:  # raw wikitext file
            pg = {"wikitext": open(path, encoding="utf-8").read()}
        print(json.dumps(parse_page_all(pg), ensure_ascii=False, indent=1))
