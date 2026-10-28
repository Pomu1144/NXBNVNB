#!/usr/bin/env python3
"""Import ninja tool icons into the game.

Reads a folder (searched recursively) of icons named "<N>star_<Name>.png",
as exported from the "ninja tools" Drive folder (1 Star … 7 Star), and
  - writes each icon as assets/ninja-tools/<id>.webp (max 160 px)
  - rebuilds data/ninja-tools.json: one entry per icon with its name, stars
    and icon. Hand-set fields of an entry already in the file (equip, slots,
    pool) are kept; new entries get a slot stat pool guessed from the name,
    and a name ending in a shinobi ("… (Itachi)", "… (7th Hokage)") limits
    who can equip it to that shinobi's cards.

Usage:  python3 tools/ninja-tools/import.py <folder with the pngs>
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'assets' / 'ninja-tools'
DATA = ROOT / 'data' / 'ninja-tools.json'
NAME_RE = re.compile(r'^(\d)\s*star_(.+)\.(png|webp|jpe?g)$', re.I)
MAX_PX = 160

# Slot stat pool by what the tool is (first match wins)
POOLS = [
    (r'blade|sword|kunai|shuriken|knife|katana|scythe|axe|fang|claw|spear|weapon|gauntlet|knuckle|kubikiri|samehada|kiba|hiramekarei',
     ['atk', 'atkPct', 'critRate', 'critDmg']),
    (r'costume|vest|armou?r|cloak|robe|jacket|outfit|uniform|clothes|garb|mail|suit',
     ['hp', 'hpPct', 'def', 'defPct']),
    (r'forehead|protector|headband|hat|mask|helmet|goggles|hood',
     ['hp', 'hpPct', 'def', 'res']),
    (r'book|scroll|paradise|manual|tactics|tale|letter|notebook|cards?\b',
     ['nin', 'atkPct', 'critRate', 'res']),
    (r'ramen|dumpling|food|pill|tea|onigiri|bento|sweets|candy|curry|meal',
     ['hp', 'hpPct', 'res', 'spd']),
    (r'sandal|boots?|shoes|tabi|geta',
     ['spd', 'def', 'hpPct']),
    (r'necklace|ring|pendant|bead|charm|crystal|jewel|bracelet|earring',
     ['nin', 'res', 'critDmg', 'hpPct']),
]


# "(…)" name tags that name a shinobi but not by a charId prefix
CHAR_TAGS = {
    '5th kazekage': 'gaara', '7th hokage': 'naruto', 'asura': 'ashura', 'guy': 'might',
    'tendo': 'pain', 'wandering ninja sasuke': 'sasuke', 'rinne sharingan sasuke- shadow': 'sasuke',
}
NOT_CHARS = {'attack'}   # "(Attack)" is a tool kind, not Attack-prefixed cards


def char_prefixes():
    data = json.loads((ROOT / 'data' / 'characters.json').read_text())
    if isinstance(data, dict):
        data = data.get('characters', [])
    return {c['id'].split('_')[0] for c in data if c.get('id')}


def equip_for(name, prefixes):
    m = re.search(r'\(([^)]*)\)\s*$', name)
    if not m:
        return None
    tag = m.group(1).strip().lower()
    if tag in CHAR_TAGS:
        return [CHAR_TAGS[tag]]
    first = tag.split()[0] if tag else ''
    if first in prefixes and first not in NOT_CHARS:
        return [first]
    return None


def slug(name):
    s = re.sub(r"[’']", '', name.lower())
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')


def pool_for(name):
    n = name.lower()
    for pat, pool in POOLS:
        if re.search(pat, n):
            return pool
    return None   # every stat


def main(src):
    src = Path(src)
    if not src.is_dir():
        sys.exit(f'not a folder: {src}')
    old = {}
    if DATA.exists():
        for t in json.loads(DATA.read_text()).get('tools', []):
            old[t['id']] = t
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    prefixes = char_prefixes()
    tools, seen, skipped = [], set(), []
    for f in sorted(src.rglob('*')):
        m = NAME_RE.match(f.name)
        if not f.is_file() or not m:
            if f.is_file():
                skipped.append(f.name)
            continue
        stars, name = int(m.group(1)), m.group(2).strip()
        tid = slug(name)
        if tid in seen:          # same name at another star level
            tid = f'{tid}_{stars}'
        if tid in seen:
            skipped.append(f.name)
            continue
        seen.add(tid)
        with Image.open(f) as im:
            im = im.convert('RGBA')
            im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
            im.save(OUT_DIR / f'{tid}.webp', 'WEBP', quality=86, method=6)
        entry = {'id': tid, 'name': name, 'stars': stars, 'icon': f'assets/ninja-tools/{tid}.webp'}
        prev = old.get(tid, {})
        for k in ('equip', 'slots', 'pool'):
            if k in prev:
                entry[k] = prev[k]
        if 'equip' not in entry:
            who = equip_for(name, prefixes)
            if who:
                entry['equip'] = who
        if 'pool' not in entry and 'slots' not in entry:
            p = pool_for(name)
            if p:
                entry['pool'] = p
        tools.append(entry)
    tools.sort(key=lambda t: (t['stars'], t['name'].lower()))
    head = json.dumps({
        'version': 2,
        'source': 'Ninja tool icons from the "ninja tools" Drive folder (1-7 Star), imported with tools/ninja-tools/import.py. '
                  'Fields: id, name, stars (1-7), icon, optional equip (charId prefixes, e.g. "itachi"; omitted = anyone), '
                  'optional slots ([[stat, value], ...] fixed slot stats), optional pool ([stat, ...] for rolled slots; omitted = every stat).',
    }, indent=1, ensure_ascii=False)[:-2]
    rows = ',\n'.join('  ' + json.dumps(t, ensure_ascii=False) for t in tools)
    DATA.write_text(f'{head},\n "tools": [\n{rows}\n ]\n}}\n')   # one tool per line
    by = {}
    for t in tools:
        by[t['stars']] = by.get(t['stars'], 0) + 1
    print(f'{len(tools)} tools', ' '.join(f'{k}★:{v}' for k, v in sorted(by.items())))
    if skipped:
        print(f'skipped {len(skipped)}:', ', '.join(skipped[:20]), '…' if len(skipped) > 20 else '')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '')
