#!/usr/bin/env python3
"""Fill gaps in data/characters.json from the cached Naruto Blazing wiki pages.

Matching: a unit ``<name>_<N>`` is matched to the wiki infobox whose
``card-no`` is N.  The wiki ``char-name`` / ``char-title`` must equal our
``name`` / ``version`` after normalization (case, punctuation, accents),
otherwise the pair goes to the mismatch report and nothing is applied.

Filling: only empty / missing fields are filled (``--overwrite`` replaces
differing values too).  Differences between an existing value and the wiki
are listed as conflicts.  Field groups (``--fields``, default = all but the
opt-in ones):

  element      element (Heart/Body/Skill/Bravery/Wisdom, capitalised as the
               battle code's ELEMENT_ADVANTAGES table expects)
  ultimate     skills.ultimate  <- wiki Secret Technique (stechnique-*)
  jutsu        missing sub-fields of skills.jutsu.byTier.* (chakraCostMax,
               nwusDescription, hits, shape, range, position, description)
               and the whole jutsu when the unit has none
  hitCount     metadata.hitCount <- ninjutsu hits (when 0 / missing)
  maxLevel     metadata.maxLevel <- max-lv
  range        top-level range (Short/Mid/Long/Vast)
  luck, cost   {base,max} when both are 0
  affiliation  when []
  abilities    when []
  fieldSkill, buddySkill   description when missing
  stats        statsBase / statsMax hp, atk, speed when 0 / missing
  lbEligible   (opt-in) false -> true when the wiki says limit-break = yes

Fix modes (opt-in flags, change existing values; see README):
  --fix-hitcount            metadata.hitCount <- wiki ninjutsu hits where it differs
  --fix-misplaced-ultimate  ultimate that is really the ninjutsu -> jutsu slot; real
                            Secret Technique becomes the ultimate (or none)
  --fix-rarity              rarity <- wiki card rarity (tier codes are only reported)
  --fix-tier                starMinCode/starMaxCode/art of units below their card rarity,
                            plus the awakening-transforms chain (writes on --apply only)

Output: ``--report`` JSON + a Markdown summary next to it, and ``--patch``
(list of set-operations, each with the value it expects to replace).
``--apply`` writes characters.json; ``--apply-patch FILE`` applies a
previously written patch.  Writes use
``json.dumps(d, ensure_ascii=False, indent=1) + '\\n'`` to keep diffs minimal.
"""
import argparse
import collections
import copy
import json
import os
import random
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch  # noqa: E402
import parse as wparse  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_CHARS = os.path.join(REPO, "data", "characters.json")
SCRATCH = os.environ.get("WIKI_SYNC_OUT", os.path.join(HERE, ".cache", "out"))
ALL_FIELDS = ["element", "ultimate", "jutsu", "hitCount", "maxLevel", "range", "luck", "cost",
              "affiliation", "abilities", "fieldSkill", "buddySkill", "stats", "lbEligible"]
OPT_IN = {"lbEligible"}
# Explicit fix modes (opt-in, each behind its own CLI flag): these CHANGE existing values.
FIX_MODES = {"fix-hitcount", "fix-misplaced-ultimate", "fix-rarity", "fix-tier"}
TIER_ORDER = ["1S", "2S", "3S", "4S", "5S", "6S", "6SB", "7S", "7SL", "8S", "8SM", "9S", "9ST", "10SO"]
DEFAULT_TRANSFORMS = os.path.join(REPO, "data", "awakening-transforms.json")
EMPTY_MARKERS = (None, "", [], {})


# ----------------------------------------------------------------- helpers
def norm(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[‘’´`]", "'", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def norm_text(s):
    s = str(s or "").replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", s).strip().rstrip(".").lower()


def strip_paren(s):
    return re.sub(r"\s*\([^()]*\)\s*$", "", str(s or ""))


def name_match(unit, w):
    """'exact' | 'alias' | None.

    alias covers two formatting artefacts only (card # must already match):
      * wiki name carries a parenthetical our name lacks: "Pain (Tendo)" ~ "Pain"
      * our version was truncated at an embedded double quote:
        'The Ino-' ~ 'The Ino-"Shika"-Cho Trio'
    """
    n_ok = norm(w["name"]) == norm(unit.get("name"))
    v_ok = norm(w["version"]) == norm(unit.get("version"))
    if n_ok and v_ok:
        return "exact"
    n_alias = n_ok or norm(strip_paren(w["name"])) == norm(unit.get("name"))
    ov, wv = str(unit.get("version") or ""), str(w["version"] or "")
    v_alias = v_ok or (len(ov) >= 4 and wv.startswith(ov) and wv[len(ov):len(ov) + 1] == '"')
    return "alias" if (n_alias and v_alias) else None


def is_empty(v):
    return v is None or v == "" or v == [] or v == {}


def tier_star(code):
    m = re.match(r"(\d+)", code or "")
    return int(m.group(1)) if m else None


def derive_effects(desc):
    """Structured effects the battle code reads (multiplier / targets / selfChakra)."""
    d = desc or ""
    fx = {}
    m = re.search(r"(\d+(?:\.\d+)?)x\s+(?:at+ack|damage)", d, re.I)
    if m:
        v = float(m.group(1))
        fx["multiplier"] = int(v) if v == int(v) else v
    if not re.search(r"all enemies", d, re.I):
        m = re.search(r"(\d+)\s+(?:[\w-]+\s+){0,3}?enem(?:y|ies)", d, re.I)
        if m:
            fx["targets"] = int(m.group(1))
    m = re.search(r"restores?\s+(?:your|own)\s+chakra\s+gauge\s+by\s+(\d+)", d, re.I)
    if m:
        fx["selfChakra"] = int(m.group(1))
    return fx


def skill_tier_entry(w):
    """Wiki skill record -> our byTier entry (jutsu/ultimate layout)."""
    e = collections.OrderedDict()
    e["chakraCost"] = w["chakra"]
    if w.get("chakra_max") is not None:
        e["chakraCostMax"] = w["chakra_max"]
    e["hits"] = w["hits"]
    e["shape"] = w["shape"] or "—"
    e["range"] = w["range"] or "—"
    e["position"] = w["position"] or "—"
    e["description"] = w["description"] or ""
    if w.get("nwus_description"):
        e["nwusDescription"] = w["nwus_description"]
    return e


# ------------------------------------------------------------ wiki index
def load_wiki(cache):
    by_card = collections.defaultdict(list)
    n = 0
    for page in fetch.iter_cached(cache):
        for rec in wparse.parse_page_all(page):
            rec["blazing_awakened"] = "blazing awakened" in (page.get("title") or "").lower()
            if rec.get("card_no") is not None:
                by_card[rec["card_no"]].append(rec)
                n += 1
    return by_card, n


def pick_record(unit, cands):
    """Choose among wiki records sharing a card # (tabbers, BA pages, wiki typos)."""
    if len(cands) == 1:
        return cands[0]
    want_ba = str(unit.get("starMinCode", "")).endswith("B")
    rar = unit.get("rarity")
    nm, ver = norm(unit.get("name")), norm(unit.get("version"))

    def score(r):
        return ((norm(r["name"]) == nm and norm(r["version"]) == ver) * 4
                + (r.get("rarity") == rar) * 2 + (r.get("blazing_awakened") == want_ba))
    return sorted(cands, key=score, reverse=True)[0]


# --------------------------------------------------------------- diffing
class Ctx:
    def __init__(self, unit, fields, overwrite):
        self.unit = unit
        self.fields = fields
        self.overwrite = overwrite
        self.ops = []
        self.conflicts = []
        self.consistent = []
        self.notes = []

    def get(self, path):
        cur = self.unit
        for k in path:
            if not isinstance(cur, dict) or k not in cur:
                return None
            cur = cur[k]
        return cur

    def set(self, field, path, value, old=None):
        self.ops.append({"id": self.unit["id"], "field": field, "path": path,
                         "old": old if old is not None else self.get(path), "value": value})

    def check(self, field, path, wiki_value, compare=None, fill=True, label=None):
        """Fill `path` if empty, else record conflict/consistency."""
        if field not in self.fields or is_empty(wiki_value):
            return
        cur = self.get(path)
        if is_empty(cur) or (field in ("hitCount",) and cur == 0):
            if fill:
                self.set(label or field, path, wiki_value, cur)
            return
        same = (compare or (lambda a, b: a == b))(cur, wiki_value)
        if same:
            self.consistent.append(".".join(path))
        else:
            self.conflicts.append({"id": self.unit["id"], "path": ".".join(path), "ours": cur, "wiki": wiki_value})
            if self.overwrite and fill:
                self.set(label or field, path, wiki_value, cur)


def text_eq(a, b):
    return norm_text(a) == norm_text(b)


def diff_skill_tier(ctx, field, base_path, ours, w, skip_ult_extras=False):
    """Compare/fill one byTier entry against a wiki skill record."""
    entry = skill_tier_entry(w)
    for k in ("chakraCost", "chakraCostMax", "hits", "shape", "range", "position", "description", "nwusDescription"):
        if k not in entry:
            continue
        wv = entry[k]
        if k in ("shape", "range", "position") and wv == "—":
            continue
        cmp = text_eq if k in ("description", "nwusDescription", "shape", "range", "position") else None
        ctx.check(field, base_path + [k], wv, cmp, label=field.split("_")[0] + "." + k)


def diff_unit(unit, w, fields, overwrite):
    ctx = Ctx(unit, fields, overwrite)
    skills = unit.get("skills") or {}

    # --- top level
    ctx.check("element", ["element"], w["element"], lambda a, b: a == b)
    ctx.check("range", ["range"], w["range"])
    for key in ("luck", "cost"):
        wv = w.get(key)
        cur = unit.get(key)
        if key in fields and wv and wv["base"] is not None:
            if not cur or (not cur.get("base") and not cur.get("max")):
                ctx.set(key, [key], {"base": wv["base"], "max": wv["max"]}, cur)
            elif cur != wv:
                ctx.conflicts.append({"id": unit["id"], "path": key, "ours": cur, "wiki": wv})
    ctx.check("affiliation", ["affiliation"], w["affiliation"], lambda a, b: set(b) <= set(a))
    ctx.check("maxLevel", ["metadata", "maxLevel"], w["max_lv"])
    if w["ninjutsu"]:
        ctx.check("hitCount", ["metadata", "hitCount"], w["ninjutsu"]["hits"])
    ctx.check("abilities", ["abilities"], w["abilities"],
              lambda a, b: [norm(x.get("name")) for x in a] == [norm(x["name"]) for x in b])
    for fk, wk, typ, label in (("fieldSkill", "field_skill", "Field", "Field Skill"),
                               ("buddySkill", "buddy_skill", "Buddy", "Buddy Skill")):
        if fk not in fields or not w[wk]:
            continue
        if not skills.get(fk):
            ctx.set(fk, ["skills", fk], {"name": label, "type": typ, "description": w[wk]}, None)
        else:
            ctx.check(fk, ["skills", fk, "description"], w[wk], text_eq)
    st = w["stats"]
    for grp, suf in (("statsBase", "base"), ("statsMax", "max")):
        for s in ("hp", "atk", "speed"):
            wv = st.get("%s_%s" % (s, suf))
            if wv is None:
                continue
            cur = (unit.get(grp) or {}).get(s)
            if cur in (None, 0):
                if "stats" in fields:
                    ctx.set("stats", [grp, s], wv, cur)
            elif cur != wv:
                ctx.conflicts.append({"id": unit["id"], "path": "%s.%s" % (grp, s), "ours": cur, "wiki": wv})
    if "lbEligible" in fields and w["limit_break"] and not unit.get("lbEligible"):
        ctx.set("lbEligible", ["lbEligible"], True, unit.get("lbEligible"))
    if w.get("rarity") and unit.get("rarity") and w["rarity"] != unit["rarity"]:
        ctx.conflicts.append({"id": unit["id"], "path": "rarity", "ours": unit["rarity"], "wiki": w["rarity"]})
        if "fix-rarity" in fields:
            ctx.set("fix-rarity", ["rarity"], w["rarity"], unit["rarity"])
    if w.get("rarity") and tier_star(unit.get("starMinCode")) and tier_star(unit.get("starMinCode")) < w["rarity"]:
        ctx.notes.append({"id": unit["id"], "kind": "tier_below_card_rarity", "starMinCode": unit.get("starMinCode"),
                          "starMaxCode": unit.get("starMaxCode"), "wiki_rarity": w["rarity"],
                          "jutsu_tiers": list(((skills.get("jutsu") or {}).get("byTier") or {}).keys())})
    if ("fix-hitcount" in fields and w["ninjutsu"] and w["ninjutsu"]["hits"]
            and (unit.get("metadata") or {}).get("hitCount") not in (None, 0, w["ninjutsu"]["hits"])):
        ctx.set("fix-hitcount", ["metadata", "hitCount"], w["ninjutsu"]["hits"], unit["metadata"]["hitCount"])

    # --- tiers the card's skills live under
    jutsu = skills.get("jutsu") or {}
    tiers = list((jutsu.get("byTier") or {}).keys()) or [unit.get("starMinCode") or "%dS" % (w["rarity"] or 1)]

    # --- jutsu
    wn = w["ninjutsu"]
    if wn and "jutsu" in fields:
        if not (jutsu.get("byTier")):
            ctx.set("jutsu_new", ["skills", "jutsu"],
                    {"name": wn["name"], "type": "Jutsu", "byTier": {t: skill_tier_entry(wn) for t in tiers}},
                    skills.get("jutsu"))
        else:
            ctx.check("jutsu", ["skills", "jutsu", "name"], wn["name"], lambda a, b: norm(a) == norm(b), fill=False)
            for t in tiers:
                diff_skill_tier(ctx, "jutsu", ["skills", "jutsu", "byTier", t], jutsu["byTier"][t], wn)

    # --- ultimate (wiki Secret Technique)
    ws = w["stechnique"]
    ult0 = skills.get("ultimate")
    if wn and ult0 and norm(ult0.get("name")) == norm(wn["name"]) and not (ws and norm(ws["name"]) == norm(wn["name"])):
        ctx.conflicts.append({"id": unit["id"], "path": "skills.ultimate",
                              "ours": "ultimate '%s'" % ult0.get("name"),
                              "wiki": "that is the Ninjutsu; Secret Technique is %s" % (ws["name"] if ws else "none"),
                              "kind": "ninjutsu_in_ultimate_slot"})
        if "fix-misplaced-ultimate" in fields:
            fix_misplaced_ultimate(ctx, skills, ult0, ws, tiers)
            return ctx
    if ws and "ultimate" in fields:
        ult = skills.get("ultimate")
        sec = skills.get("secret")
        if not ult and sec and norm(sec.get("name")) == norm(ws["name"]):
            ctx.conflicts.append({"id": unit["id"], "path": "skills.ultimate",
                                  "ours": "stored as skills.secret (%s)" % sec.get("name"),
                                  "wiki": "Secret Technique %s" % ws["name"], "kind": "stechnique_in_secret_slot"})
        elif not ult or not ult.get("byTier"):
            entry = skill_tier_entry(ws)
            fx = derive_effects(ws["description"])
            if fx:
                entry["effects"] = fx
            ctx.set("ultimate", ["skills", "ultimate"],
                    {"name": ws["name"], "type": "Ultimate", "byTier": {t: copy.deepcopy(entry) for t in tiers}},
                    ult)
        else:
            ctx.check("ultimate", ["skills", "ultimate", "name"], ws["name"], lambda a, b: norm(a) == norm(b), fill=False)
            for t in ult["byTier"]:
                diff_skill_tier(ctx, "ultimate_fields", ["skills", "ultimate", "byTier", t], ult["byTier"][t], ws)
                ours_t = ult["byTier"][t]
                fx = derive_effects(ws["description"])
                if fx and "effects" not in ours_t and text_eq(ours_t.get("description"), ws["description"]):
                    ctx.set("ultimate.effects", ["skills", "ultimate", "byTier", t, "effects"], fx, None)
    return ctx


def fix_misplaced_ultimate(ctx, skills, ult0, ws, tiers):
    """Our skills.ultimate is really the wiki Ninjutsu: move it to the jutsu slot
    (merging with an existing jutsu, original values first, wiki fills gaps),
    then set the real Secret Technique as the ultimate, or drop the ultimate
    when the wiki has none."""
    jutsu = skills.get("jutsu")
    if not jutsu or not jutsu.get("byTier"):
        moved = copy.deepcopy(ult0)
        moved["type"] = "Jutsu"
        ctx.set("fix-misplaced-ultimate", ["skills", "jutsu"], moved, jutsu)
    else:
        # A jutsu already exists (same skill): keep it, never duplicate; just
        # note any field where the misplaced copy disagreed with it.
        for t, e in (ult0.get("byTier") or {}).items():
            cur = jutsu["byTier"].get(t) or {}
            diff = {k: {"jutsu": cur.get(k), "misplaced_ultimate": v} for k, v in e.items() if cur.get(k) != v}
            if diff:
                ctx.notes.append({"id": ctx.unit["id"], "kind": "misplaced_ultimate_differs_from_jutsu",
                                  "tier": t, "diff": diff})
    if ws:
        entry = skill_tier_entry(ws)
        fx = derive_effects(ws["description"])
        if fx:
            entry["effects"] = fx
        ctx.set("fix-misplaced-ultimate", ["skills", "ultimate"],
                {"name": ws["name"], "type": "Ultimate", "byTier": {t: copy.deepcopy(entry) for t in tiers}}, ult0)
    else:
        ctx.ops.append({"id": ctx.unit["id"], "field": "fix-misplaced-ultimate", "op": "delete",
                        "path": ["skills", "ultimate"], "old": ult0, "value": None})


def _own_art(uid, tier, kind, current):
    """Path of the unit's own <kind>_<tier> art; plus a (src, dst) copy list when
    that file doesn't exist yet (code builds portrait_<tier>.webp paths)."""
    d = os.path.join("assets", "characters", uid)
    want = "%s/%s_%s.webp" % (d, kind, tier)
    if os.path.exists(os.path.join(REPO, want)):
        return want, []
    srcs = []
    if current and current.startswith(d + "/") and os.path.exists(os.path.join(REPO, current)):
        srcs.append(current)
    try:
        srcs += sorted("%s/%s" % (d, f) for f in os.listdir(os.path.join(REPO, d))
                       if f.startswith(kind + "_") and f.endswith(".webp"))
    except FileNotFoundError:
        return None, []
    if not srcs:
        return None, []
    src = srcs[0]
    copies = [(src, want)]
    png_src, png_dst = os.path.splitext(src)[0] + ".png", os.path.splitext(want)[0] + ".png"
    if os.path.exists(os.path.join(REPO, png_src)) and not os.path.exists(os.path.join(REPO, png_dst)):
        copies.append((png_src, png_dst))
    return want, copies


def plan_fix_tier(u, w, by_card, units_by_id, transforms):
    """--fix-tier: a unit whose starMinCode is below its wiki card rarity (while its
    skills are already keyed under the card's tier) becomes <rarity>S[-<rarity>SB].
    Returns (ops, transform_changes, file_copies, notes)."""
    ops, tx, copies, notes = [], [], [], []
    rar = w.get("rarity")
    cur_min = u.get("starMinCode")
    if not rar or not tier_star(cur_min) or tier_star(cur_min) >= rar:
        return ops, tx, copies, notes
    new_min = "%dS" % rar
    jt = list(((u.get("skills") or {}).get("jutsu") or {}).get("byTier") or {})
    if jt and any(t not in (new_min, new_min + "B") for t in jt):
        notes.append({"id": u["id"], "kind": "fix_tier_skipped", "reason": "jutsu tiers %s disagree with ★%d" % (jt, rar)})
        return ops, tx, copies, notes
    card = wparse.card_from_id(u["id"])
    ba_id = None
    for r in by_card.get(card + 1, []):
        if r.get("blazing_awakened") and norm(strip_paren(r["name"])) == norm(strip_paren(w["name"])) \
                and norm(r["version"]) == norm(w["version"]):
            ba_id = next((k for k in units_by_id if wparse.card_from_id(k) == card + 1), None)
    new_max = new_min + "B" if (ba_id and new_min == "6S") else new_min
    cur_max = u.get("starMaxCode")
    if cur_max in TIER_ORDER and TIER_ORDER.index(cur_max) > TIER_ORDER.index(new_max):
        new_max = cur_max
    uid = u["id"]
    portrait, c1 = _own_art(uid, new_min, "portrait", u.get("portrait"))
    full, c2 = _own_art(uid, new_min, "full", u.get("full"))
    if not portrait or not full:
        notes.append({"id": uid, "kind": "fix_tier_skipped", "reason": "no own art files"})
        return ops, tx, copies, notes
    copies += c1 + c2
    art = {"portrait": portrait, "full": full}
    new_abt = {new_min: dict(art)}
    if new_max != new_min:
        new_abt[new_max] = dict(art)

    def op(path, value, old):
        if old != value:
            ops.append({"id": uid, "field": "fix-tier", "path": path, "old": old, "value": value})
    op(["starMinCode"], new_min, cur_min)
    op(["starMaxCode"], new_max, cur_max)
    op(["artByTier"], new_abt, u.get("artByTier"))
    op(["portrait"], portrait, u.get("portrait"))
    op(["full"], full, u.get("full"))

    # Awakening chain: this card awakens (Blazing Awaken) into the BA card at new_max.
    if ba_id:
        mine = [t for t in transforms if t.get("fromId") == uid]
        into_ba = [t for t in transforms if t.get("toId") == ba_id and t.get("fromId") != uid]
        for t in mine:
            if t.get("toId") == ba_id and t.get("tier") != new_max:
                tx.append({"kind": "retier", "fromId": uid, "toId": ba_id, "old_tier": t["tier"], "tier": new_max})
        if not mine:
            # A lower-star base currently awakens straight into the BA card, skipping
            # this card: route base -> this card -> BA card instead.
            for t in into_ba:
                base = units_by_id.get(t["fromId"])
                if base and norm(base.get("version")) == norm(u.get("version")):
                    tx.append({"kind": "reroute", "fromId": t["fromId"], "old_toId": ba_id, "toId": uid, "tier": t["tier"]})
                    tx.append({"kind": "add", "fromId": uid, "toId": ba_id, "tier": new_max, "after": t["fromId"]})
                    b_art = (base.get("artByTier") or {}).get(t["tier"])
                    if b_art and "/%s/" % ba_id in str(b_art.get("portrait")):
                        new_b = copy.deepcopy(base["artByTier"])
                        new_b[t["tier"]] = dict(art)
                        ops.append({"id": base["id"], "field": "fix-tier", "path": ["artByTier"],
                                    "old": base["artByTier"], "value": new_b})
    return ops, tx, copies, notes


def apply_transform_changes(transforms, changes):
    out = list(transforms)
    for c in changes:
        if c["kind"] == "retier":
            for t in out:
                if t.get("fromId") == c["fromId"] and t.get("toId") == c["toId"]:
                    t["tier"] = c["tier"]
        elif c["kind"] == "reroute":
            for t in out:
                if t.get("fromId") == c["fromId"] and t.get("toId") == c["old_toId"]:
                    t["toId"] = c["toId"]
        elif c["kind"] == "add":
            if any(t.get("fromId") == c["fromId"] and t.get("toId") == c["toId"] for t in out):
                continue
            idx = next((i for i, t in enumerate(out) if t.get("fromId") == c["after"]), len(out) - 1)
            out.insert(idx + 1, {"fromId": c["fromId"], "toId": c["toId"], "tier": c["tier"]})
    return out


# ------------------------------------------------------------------ apply
def apply_ops(units, ops, strict=True):
    by_id = {u["id"]: u for u in units}
    applied, stale = [], []
    for op in ops:
        u = by_id.get(op["id"])
        if u is None:
            stale.append(dict(op, reason="unit not found"))
            continue
        cur = u
        for k in op["path"][:-1]:
            if not isinstance(cur.get(k), dict):
                cur[k] = {}
            cur = cur[k]
        last = op["path"][-1]
        if strict and cur.get(last) != op.get("old"):
            stale.append(dict(op, reason="value changed since patch was made", now=cur.get(last)))
            continue
        if op.get("op") == "delete":
            cur.pop(last, None)
        else:
            cur[last] = op["value"]
        applied.append(op)
    return applied, stale


def dump(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    os.replace(tmp, path)


# ----------------------------------------------------------------- report
def coverage(units):
    return {
        "units": len(units),
        "with_element": sum(1 for u in units if u.get("element")),
        "with_ultimate": sum(1 for u in units if (u.get("skills") or {}).get("ultimate")),
        "with_jutsu": sum(1 for u in units if ((u.get("skills") or {}).get("jutsu") or {}).get("byTier")),
        "with_range": sum(1 for u in units if u.get("range")),
        "with_affiliation": sum(1 for u in units if u.get("affiliation")),
        "with_hitCount": sum(1 for u in units if (u.get("metadata") or {}).get("hitCount")),
        "with_maxLevel": sum(1 for u in units if (u.get("metadata") or {}).get("maxLevel")),
        "with_luck": sum(1 for u in units if (u.get("luck") or {}).get("max")),
        "with_cost": sum(1 for u in units if (u.get("cost") or {}).get("base")),
        "jutsu_with_chakraCostMax": sum(1 for u in units for t in (((u.get("skills") or {}).get("jutsu") or {}).get("byTier") or {}).values() if "chakraCostMax" in t),
        "jutsu_with_nwusDescription": sum(1 for u in units for t in (((u.get("skills") or {}).get("jutsu") or {}).get("byTier") or {}).values() if t.get("nwusDescription")),
    }


def write_summary(path, rep):
    L = ["# Wiki sync report", ""]
    L.append("Mode: **%s**  ·  units: %d  ·  wiki infoboxes: %d" % (rep["mode"], rep["units_total"], rep["wiki_records"]))
    L.append("")
    L.append("| | count |\n|---|---|")
    for k in ("matched", "matched_via_alias", "mismatched", "not_found", "units_changed", "ops"):
        L.append("| %s | %d |" % (k.replace("_", " "), rep["counts"][k]))
    L.append("")
    L.append("## Fields filled\n\n| field | fills |\n|---|---|")
    for k, v in sorted(rep["filled_per_field"].items(), key=lambda x: -x[1]):
        L.append("| %s | %d |" % (k, v))
    L.append("")
    L.append("## Coverage\n\n| metric | before | after |\n|---|---|---|")
    for k in rep["coverage_before"]:
        L.append("| %s | %s | %s |" % (k, rep["coverage_before"][k], rep["coverage_after"][k]))
    L.append("")
    L.append("## Conflicts (reported, not applied)\n\n| path | count |\n|---|---|")
    for k, v in sorted(rep["conflicts_per_path"].items(), key=lambda x: -x[1]):
        L.append("| %s | %d |" % (k, v))
    L.append("")
    L.append("## Name/version mismatches (%d, never applied)\n" % len(rep["mismatches"]))
    for m in rep["mismatches"][:200]:
        L.append("- `%s` ours: %s \"%s\" — wiki #%s: %s \"%s\"" % (m["id"], m["ours_name"], m["ours_version"],
                                                               m["card_no"], m["wiki_name"], m["wiki_version"]))
    L.append("")
    L.append("## Not found on wiki (%d)\n" % len(rep["not_found"]))
    L.append(", ".join("`%s`" % x for x in rep["not_found"]))
    L.append("")
    for k, v in rep["not_found_suggestions"].items():
        L.append("- `%s` — same name/version on wiki: %s" % (k, "; ".join("#%s ★%s %s" % (x["card_no"], x["rarity"], x["title"]) for x in v)))
    L.append("")
    if rep["aliased"]:
        L.append("## Matched via alias rule (%d)\n" % len(rep["aliased"]))
        for x in rep["aliased"]:
            L.append("- `%s` ours %s ~ wiki %s" % (x["id"], x["ours"], x["wiki"]))
        L.append("")
    if rep.get("latent_available"):
        L.append("## Wiki latent skills not synced (no game slot yet): %d\n" % len(rep["latent_available"]))
        L.append(", ".join("`%s`" % x for x in rep["latent_available"]))
        L.append("")
    tn = [n for n in rep.get("notes", []) if n["kind"] == "tier_below_card_rarity"]
    if tn:
        L.append("## Tier codes below the wiki card rarity (%d, report only)\n" % len(tn))
        L.append("starMinCode is lower than the wiki card's star rarity (e.g. 5S on a ★6 card); not changed.\n")
        L.append(", ".join("`%s` (%s-%s, jutsu %s, ★%s)" % (n["id"], n["starMinCode"], n["starMaxCode"],
                                                           "/".join(n["jutsu_tiers"]), n["wiki_rarity"]) for n in tn))
        L.append("")
    if rep.get("stale"):
        L.append("## Stale ops skipped: %d\n" % len(rep["stale"]))
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


# ------------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--characters", default=DEFAULT_CHARS)
    ap.add_argument("--cache", default=fetch.DEFAULT_CACHE)
    ap.add_argument("--out", default=SCRATCH, help="dir for report/patch (default $WIKI_SYNC_OUT or .cache/out)")
    ap.add_argument("--dry-run", action="store_true", help="report + patch only (default unless --apply)")
    ap.add_argument("--apply", action="store_true", help="write characters.json")
    ap.add_argument("--apply-patch", metavar="FILE", help="apply a previously generated patch file")
    ap.add_argument("--overwrite", action="store_true", help="also replace existing values that differ from the wiki")
    ap.add_argument("--fix-hitcount", action="store_true",
                    help="set metadata.hitCount to the wiki ninjutsu hit count where it differs")
    ap.add_argument("--fix-misplaced-ultimate", action="store_true",
                    help="move an ultimate that is really the wiki ninjutsu into skills.jutsu and set the real "
                         "Secret Technique as ultimate (or remove the ultimate when the wiki has none)")
    ap.add_argument("--fix-rarity", action="store_true", help="set rarity to the wiki card rarity where it differs")
    ap.add_argument("--fix-tier", action="store_true",
                    help="raise starMinCode/starMaxCode of units below their wiki card rarity, point their art at "
                         "their own files, and fix the awakening-transforms chain")
    ap.add_argument("--transforms", default=DEFAULT_TRANSFORMS)
    ap.add_argument("--fields", help="comma list of field groups (default: all non-opt-in). Groups: " + ",".join(ALL_FIELDS))
    ap.add_argument("--ids", help="comma list of unit ids to limit to")
    ap.add_argument("--sample", type=int, help="random sample of N units (seeded) for spot checks")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args(argv)

    with open(a.characters, encoding="utf-8") as f:
        units = json.load(f)
    os.makedirs(a.out, exist_ok=True)

    if a.apply_patch:
        with open(a.apply_patch, encoding="utf-8") as f:
            ops = json.load(f)
        ops = ops.get("ops", ops) if isinstance(ops, dict) else ops
        applied, stale = apply_ops(units, ops)
        dump(a.characters, units)
        print("applied %d op(s), %d stale/skipped" % (len(applied), len(stale)))
        for s in stale[:20]:
            print("  stale:", s["id"], ".".join(s["path"]), s["reason"])
        return 0

    fields = set(ALL_FIELDS) - OPT_IN if not a.fields else set(x.strip() for x in a.fields.split(","))
    for fx in FIX_MODES:
        if getattr(a, fx.replace("-", "_")):
            fields.add(fx)
    if "ultimate" in fields:
        fields.add("ultimate_fields")
    if "jutsu" in fields:
        fields.add("jutsu_new")

    by_card, nrec = load_wiki(a.cache)
    if nrec == 0:
        print("wiki cache is empty — run fetch.py first", file=sys.stderr)
        return 1
    sel = units
    if a.ids:
        want = set(a.ids.split(","))
        sel = [u for u in units if u["id"] in want]
    if a.sample:
        sel = random.Random(a.seed).sample(sel, min(a.sample, len(sel)))

    before = coverage(units)
    ops, conflicts, mismatches, not_found, matched, latent, aliased = [], [], [], [], [], [], []
    by_nv = collections.defaultdict(list)
    for recs in by_card.values():
        for r in recs:
            by_nv[(norm(r["name"]), norm(r["version"]))].append(r)
    per_unit = {}
    notes = []
    tx_changes, file_copies = [], []
    units_by_id = {x["id"]: x for x in units}
    transforms = []
    if "fix-tier" in fields and os.path.exists(a.transforms):
        with open(a.transforms, encoding="utf-8") as f:
            transforms = json.load(f)
    not_found_suggestions = {}
    for u in sel:
        card = wparse.card_from_id(u["id"])
        cands = by_card.get(card)
        if not cands:
            sugg = [{"card_no": r["card_no"], "rarity": r["rarity"], "title": r["title"]}
                    for r in by_nv.get((norm(u.get("name")), norm(u.get("version"))), [])]
            not_found.append(u["id"])
            if sugg:
                not_found_suggestions[u["id"]] = sugg
            continue
        w = pick_record(u, cands)
        how = name_match(u, w)
        if how is None:
            mismatches.append({"id": u["id"], "card_no": card, "ours_name": u.get("name"), "ours_version": u.get("version"),
                               "wiki_name": w["name"], "wiki_version": w["version"], "wiki_title": w["title"]})
            continue
        matched.append(u["id"])
        if how == "alias":
            aliased.append({"id": u["id"], "ours": "%s \"%s\"" % (u.get("name"), u.get("version")),
                            "wiki": "%s \"%s\"" % (w["name"], w["version"])})
        ctx = diff_unit(u, w, fields, a.overwrite)
        ops += ctx.ops
        conflicts += ctx.conflicts
        notes += ctx.notes
        if "fix-tier" in fields:
            t_ops, t_tx, t_cp, t_notes = plan_fix_tier(u, w, by_card, units_by_id, transforms)
            ctx.ops += t_ops
            ops += t_ops
            tx_changes += t_tx
            file_copies += t_cp
            notes += t_notes
        if w.get("latentskill"):
            latent.append(u["id"])
        per_unit[u["id"]] = {"wiki_title": w["title"], "pageid": w["pageid"],
                             "filled": [o["field"] + ":" + ".".join(o["path"]) for o in ctx.ops],
                             "consistent": ctx.consistent,
                             "conflicts": len(ctx.conflicts)}

    after_units = copy.deepcopy(units)
    applied, stale = apply_ops(after_units, ops)
    after = coverage(after_units)

    filled = collections.Counter(o["field"] for o in ops)
    cpath = collections.Counter(re.sub(r"byTier\.[^.]+\.", "byTier.*.", c["path"]) for c in conflicts)
    rep = {
        "mode": "apply" if a.apply else "dry-run",
        "overwrite": a.overwrite,
        "fields": sorted(fields),
        "units_total": len(units),
        "units_considered": len(sel),
        "wiki_records": nrec,
        "counts": {"matched": len(matched), "matched_via_alias": len(aliased), "mismatched": len(mismatches), "not_found": len(not_found),
                   "units_changed": len({o["id"] for o in ops}), "ops": len(ops)},
        "filled_per_field": dict(filled),
        "coverage_before": before,
        "coverage_after": after,
        "conflicts_per_path": dict(cpath),
        "mismatches": mismatches,
        "not_found": not_found,
        "not_found_suggestions": not_found_suggestions,
        "aliased": aliased,
        "latent_available": latent,
        "conflicts": conflicts,
        "notes": notes,
        "transform_changes": tx_changes,
        "file_copies": file_copies,
        "stale": stale,
        "per_unit": per_unit,
    }
    rpath = os.path.join(a.out, "wiki_sync_report.json")
    ppath = os.path.join(a.out, "wiki_sync_patch.json")
    with open(rpath, "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    with open(ppath, "w", encoding="utf-8") as f:
        json.dump(ops, f, ensure_ascii=False, indent=1)
    write_summary(os.path.join(a.out, "wiki_sync_summary.md"), rep)

    print("matched %d · mismatched %d · not found %d · ops %d on %d units" % (
        len(matched), len(mismatches), len(not_found), len(ops), rep["counts"]["units_changed"]))
    print("filled:", dict(filled))
    print("coverage element %d -> %d, ultimate %d -> %d" % (before["with_element"], after["with_element"],
                                                           before["with_ultimate"], after["with_ultimate"]))
    print("report:", rpath)
    print("patch: ", ppath)
    if tx_changes or file_copies:
        print("fix-tier: %d transform change(s), %d art file copy(ies)" % (len(tx_changes), len(file_copies)))
    if a.apply:
        import shutil
        for src, dst in file_copies:
            if not os.path.exists(os.path.join(REPO, dst)):
                shutil.copy2(os.path.join(REPO, src), os.path.join(REPO, dst))
                print("copied", src, "->", dst)
        if tx_changes:
            new_t = apply_transform_changes(transforms, tx_changes)
            with open(a.transforms, "w", encoding="utf-8") as f:
                f.write(json.dumps(new_t, ensure_ascii=False, indent=2))  # file has indent=2, no trailing newline
            print("wrote", a.transforms)
        dump(a.characters, after_units)
        print("wrote", a.characters)
    return 0


if __name__ == "__main__":
    sys.exit(main())
