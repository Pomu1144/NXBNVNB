#!/usr/bin/env python3
"""Build assets/items/lb_crystals/*.webp and data/lb-crystals.json.

Source: the shared Blazing asset archive, Drive folder "LB Crystals"
(img_card_<id>.png, 512px RGBA). Each character crystal comes as a pair of
consecutive archive ids: <id> = blue 5-star crystal, <id>+1 = gold 6-star
crystal (same face, gold glow + side shards). This matches the repo's own
data/limit_break.json, which lists every Limit Break Crystal as a 5S/6S pair.

Usage: python3 tools/lb_crystals/build.py <dir-with-archive-pngs>
Characters were identified by eye (the crystal art is not the unit art, so
automatic icon matching does not work); see CRYSTALS below.
"""
import json, os, re, sys, collections
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT_IMG = os.path.join(ROOT, 'assets/items/lb_crystals')
OUT_JSON = os.path.join(ROOT, 'data/lb-crystals.json')
SIZE = 256

# blue archive id -> character name (as spelled in data/characters.json).
# "?" marks a lower-confidence identification.
CRYSTALS = [
    (15058, 'Naruto Uzumaki'), (15060, 'Sasuke Uchiha'), (15062, 'Kakashi Hatake'),
    (15064, 'Gaara'), (15071, 'Haku'), (15073, 'Zabuza Momochi'), (15075, 'Sakura Haruno'),
    (15077, 'Kakashi Hatake'), (15082, 'Neji Hyuga'), (15084, 'Kakashi Hatake'),
    (15086, 'Rock Lee'), (15088, 'Sasuke Uchiha'), (15090, 'Naruto Uzumaki'),
    (15092, 'Jirobo'), (15094, 'Kidomaru'), (15096, 'Tsunade'), (15098, 'Sai'),
    (15100, 'Sakon'), (15102, 'Orochimaru'), (15104, 'Sasuke Uchiha'), (15106, 'Gaara'),
    (15110, 'Hiruzen Sarutobi'), (15112, 'Sasuke Uchiha'), (15114, 'Hinata Hyuga'),
    (15116, 'Itachi Uchiha'), (15118, 'Might Guy'), (15122, 'Choji Akimichi'),
    (15134, 'Kimimaro?'), (15136, 'Kakashi Hatake'), (15138, 'Obito Uchiha'),
    (15140, 'Rin Nohara'), (15144, 'Deidara'), (15146, 'Sasori'), (15152, 'Naruto Uzumaki'),
    (15154, 'Sakura Haruno'), (15156, 'Hashirama Senju'), (15158, 'Tobirama Senju'),
    (15160, 'Ino Yamanaka'), (15162, 'Sasuke Uchiha?'), (15166, 'Yamato'),
    (15168, 'Shikamaru Nara'), (15174, 'Naruto Uzumaki'), (15180, 'Gengo'),
    (15193, 'Itachi Uchiha'), (15195, 'Kisame Hoshigaki'), (15197, "Yugito Ni'i"),
    (15199, 'Pain'), (15201, 'Obito Uchiha'), (15203, 'Kabuto Yakushi'), (15205, 'Obito Uchiha'),
    (15207, 'Haku'), (15209, 'Madara Uchiha'), (15211, 'Sasuke Uchiha'), (15213, 'Karin'),
    (15215, 'Hidan'), (15217, 'Kakuzu'), (15219, 'Kakashi Hatake'), (15221, 'Might Guy'),
    (15223, 'Hanzo'), (15225, 'Third Raikage: Ay'), (15227, 'Jiraiya'), (15229, 'Konan'),
    (15231, 'Sasuke Uchiha'), (15233, 'Gengetsu Hozuki'), (15235, 'Naruto Uzumaki'),
    (15237, 'Konohamaru Sarutobi'), (15239, 'Fourth Raikage: Ay'), (15241, 'Mei Terumi'),
    (15243, 'Kaguya Otsutsuki'), (15245, 'Tsunade'), (15247, 'Sasuke Uchiha'),
    (15249, 'Ohnoki'), (15251, 'Naruto Uzumaki'), (15253, 'Darui'), (15255, 'Roshi'),
    (15257, 'Sasuke Uchiha'), (15259, 'Itachi Uchiha'), (15261, 'Naruto Uzumaki'),
    (15263, 'Sakura Haruno'), (15265, 'Tayuya'), (15272, 'Might Guy'),
    (15274, 'Tobirama Senju'), (15276, 'Naruto Uzumaki'), (15278, 'Might Guy'),
    (15280, 'Pain'), (15283, 'Tobi'), (15285, 'Obito Uchiha'), (15291, 'Naruto Uzumaki'),
    (15293, 'Sasuke Uchiha'), (15295, 'Killer Bee'), (15300, 'Sasuke Uchiha'),
    (15304, 'Kisame Hoshigaki'), (15308, 'Obito Uchiha'), (15312, 'Kaguya Otsutsuki'),
    (15317, 'Killer Bee'), (15319, 'Chojuro'), (15321, 'Suigetsu Hozuki'),
    (15323, 'Tobirama Senju'), (15328, 'Ashura'), (15333, 'Obito Uchiha'), (15337, 'Han?'),
    (15341, 'Deidara'), (15345, 'Gaara'), (15347, 'Kankuro'), (15349, 'Jiraiya'),
    (15351, 'Orochimaru'), (15353, 'Danzo Shimura?'), (15357, 'Hagoromo Otsutsuki'),
    (15361, 'Orochimaru'), (15365, 'Neji Hyuga'), (15369, 'Hashirama Senju'),
    (15373, 'Danzo Shimura'), (15377, 'Madara Uchiha'), (15381, 'Madara Uchiha'),
    (15385, 'Obito Uchiha'), (15389, 'Kinkaku/Ginkaku'), (15393, 'Masked Man'),
    (15397, 'Indra'),
]

# One character, several roster names: a crystal for any of them fits all of them.
ALIAS_GROUPS = [
    ['Obito Uchiha', 'Tobi', 'Masked Man'],
    ['Sakon', 'Ukon/Sakon'],
    ['Yamato', 'Tenzo'],
]

ELEMENTS = ['Heart', 'Skill', 'Body', 'Bravery', 'Wisdom']

# Blue = 5-star crystal, gold = 6-star crystal (data/limit_break.json 5S/6S pairs).
VARIANTS = {
    'blue': {'label': 'Blue', 'grade': 5, 'tiers': ['6S', '6SB']},
    'gold': {'label': 'Gold', 'grade': 6, 'tiers': ['6S', '6SB', '7S', '7SL', '8S', '8SM', '9S', '9ST', '10SO']},
}
PRICES = {'blue': {'ryo': 25000}, 'gold': {'ryo': 60000}}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def src_png(aid):
    for name in (f'img_card_{aid}.png', f'img_icon_{aid}.png'):
        p = os.path.join(SRC, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(aid)


def convert(aid, out):
    im = Image.open(src_png(aid)).convert('RGBA')
    alpha = im.getchannel('A')
    if alpha.getextrema()[0] != 0:
        raise ValueError(f'{aid}: no transparency')
    bbox = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(bbox)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    if side > SIZE:
        sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
    sq.save(out, 'WEBP', quality=88, method=6)
    return sq.size[0]


def main():
    chars = json.load(open(os.path.join(ROOT, 'data/characters.json')))
    by_name = collections.defaultdict(list)
    for c in chars:
        if c.get('element'):
            by_name[c['name']].append(c['element'].capitalize())
    group_of = {}
    for g in ALIAS_GROUPS:
        for n in g:
            group_of[n] = g

    os.makedirs(OUT_IMG, exist_ok=True)
    seen = collections.Counter()
    out = []
    unmapped = []
    for aid, raw in CRYSTALS:
        name = raw.rstrip('?')
        applies = group_of.get(name, [name])
        els = collections.Counter(e for n in applies for e in by_name.get(n, []))
        if not els:
            unmapped.append((aid, name))
            continue
        top = max(els.values())
        element = next(e for e in ELEMENTS if els.get(e) == top)
        seen[name] += 1
        cid = f'lb_crystal_{slug(name)}_{seen[name]}'
        entry = {
            'id': cid, 'character': name, 'appliesTo': applies, 'element': element,
            'archive': {'blue': aid, 'gold': aid + 1},
            'units': sum(len(by_name.get(n, [])) for n in applies),
        }
        if raw.endswith('?'):
            entry['identification'] = 'medium'
        for v in ('blue', 'gold'):
            fn = f'{cid}_{v}.webp'
            convert(aid if v == 'blue' else aid + 1, os.path.join(OUT_IMG, fn))
            entry[v] = f'assets/items/lb_crystals/{fn}'
        out.append(entry)

    doc = {
        'version': 1,
        'source': 'Naruto Blazing asset archive, Drive folder "LB Crystals" (extracted game assets)',
        'rules': {
            'match': 'A crystal counts only for units whose name is in its appliesTo list (same character, any version).',
            'variants': 'Blue (5-star) crystals work at tiers 6S and 6SB; gold (6-star) crystals work at every limit-break tier.',
            'spendOrder': 'Character crystals are spent before generic Limit Break Crystals; blue before gold when both fit.',
            'element': 'Most common element across the character\'s units in data/characters.json (ties: Heart, Skill, Body, Bravery, Wisdom).',
        },
        'variants': VARIANTS,
        'prices': PRICES,
        'crystals': out,
    }
    with open(OUT_JSON, 'w') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('crystals', len(out), 'characters', len({e['character'] for e in out}), 'unmapped', unmapped)


if __name__ == '__main__':
    main()
