# wiki-sync

Closes the gap between `data/characters.json` and the
[Naruto Blazing wiki](https://naruto-blazing.fandom.com). It fills fields that
are empty in our data (element, ultimate, range, luck, cost, affiliation, hit
count, max level, missing jutsu/ultimate sub-fields). It never changes existing
values unless you pass `--overwrite`. Python 3, standard library only.

| file | job |
|---|---|
| `fetch.py` | finds every unit page (pages that transclude `Template:{Heart,Body,Skill,Bravery,Wisdom} Characters` / `Template:All Characters`) and caches its raw wikitext in `.cache/pages/<pageid>.json` (gitignored) |
| `parse.py` | infobox wikitext → normalized record (element from the template name, `card-no`, `ninjutsu-*`, `stechnique-*`, `latentskill-*`, abilities, stats, …) |
| `sync.py` | matches records to our units, writes a report and a patch, and optionally applies them |

## Usage

```bash
# 1. fetch (the first run takes ~25 requests; later runs only fetch new pages)
python3 tools/wiki-sync/fetch.py
python3 tools/wiki-sync/fetch.py --rediscover      # pick up pages added to the wiki since
python3 tools/wiki-sync/fetch.py --refresh         # re-download everything (wiki edits)
python3 tools/wiki-sync/fetch.py --search-missing  # full-text search for our units whose card # isn't cached

# 2. dry run: report + patch, no data changes
python3 tools/wiki-sync/sync.py --dry-run
python3 tools/wiki-sync/sync.py --dry-run --ids kakashi_705,naruto_2115
python3 tools/wiki-sync/sync.py --dry-run --sample 20            # random spot check

# 3. apply
python3 tools/wiki-sync/sync.py --apply
python3 tools/wiki-sync/sync.py --apply-patch <out>/wiki_sync_patch.json   # apply a reviewed patch
```

Output goes to `$WIKI_SYNC_OUT` (default `tools/wiki-sync/.cache/out/`):

- `wiki_sync_summary.md`: counts filled per field, coverage before and after, conflicts, mismatches, and units not found
- `wiki_sync_report.json`: the full detail, including a `per_unit` breakdown (filled, consistent, conflicts)
- `wiki_sync_patch.json`: a list of `{id, field, path, old, value}` set-operations. `--apply-patch` skips any op whose `old` no longer matches the file (it reports those as stale), so a patch can't overwrite edits made after it was generated.

All writes use `json.dumps(d, ensure_ascii=False, indent=1) + "\n"`, so the diff only shows the fields that changed. Running the sync a second time produces 0 ops.

## Matching rules

1. Card number: the numeric suffix of our id (`kakashi_2091` → 2091) must equal the wiki `card-no`. When the wiki has several infoboxes with the same number (tabber pages, Blazing Awakened pages, wiki typos), the sync picks the one that matches our name, version, rarity and BA flag.
2. Name and version: the sync compares the wiki `char-name`/`char-title` with our `name`/`version`, ignoring case, punctuation and accents. Two formatting artefacts are accepted and listed under "Matched via alias rule":
   - the wiki name has a parenthetical that ours lacks, e.g. `Pain (Tendo)` ~ `Pain`
   - our version was cut off at an embedded quote, e.g. `The Ino-` ~ `The Ino-"Shika"-Cho Trio`

   Every other difference goes to the mismatch list and is never applied.

## Field groups (`--fields a,b,c`)

`element, ultimate, jutsu, hitCount, maxLevel, range, luck, cost, affiliation,
abilities, fieldSkill, buddySkill, stats` are on by default. `lbEligible` is
opt-in: it flips `false` → `true` when the wiki says `limit-break = yes`,
which changes gameplay.

- `element` is capitalised (`Heart`), as `ELEMENT_ADVANTAGES` in `js/battle/battle-effects.js` expects.
- `ultimate` comes from the wiki **Secret Technique** (`stechnique-*`). Each byTier key uses the unit's own jutsu tier codes. `"N → M"` chakra is split into `chakraCost`/`chakraCostMax`; `description-1` becomes `description` and `description-2` becomes `nwusDescription`. `effects.multiplier`, `effects.targets` (omitted for "all enemies") and `effects.selfChakra` are derived from the description text. The sync reports two cases without filling them:
  - `stechnique_in_secret_slot`: the unit already stores the technique as `skills.secret`
  - `ninjutsu_in_ultimate_slot`: our ultimate is really the wiki's ninjutsu
- `jutsu` fills missing sub-fields of an existing jutsu, or the whole jutsu when the unit has none.
- `hitCount` is `metadata.hitCount` ← `ninjutsu-hit`, filled when it is 0 or missing.
- Latent skills (`latentskill-*`) are listed in the report but not synced, because the game has no slot for them yet.

## Fix modes (opt-in, change existing values)

Each fix mode corrects one kind of conflict the report lists. Each has its own flag, so you can reproduce it on demand:

```bash
python3 tools/wiki-sync/sync.py --dry-run --fix-hitcount --fix-misplaced-ultimate --fix-rarity
python3 tools/wiki-sync/sync.py --apply   --fix-hitcount --fix-misplaced-ultimate --fix-rarity
```

- `--fix-hitcount` sets `metadata.hitCount` to the wiki **ninjutsu** hit count wherever it differs. It doesn't touch skills.
- `--fix-misplaced-ultimate` handles a `skills.ultimate` that is really the wiki ninjutsu (`ninjutsu_in_ultimate_slot`):
  - If the unit has no jutsu, the ultimate moves to `skills.jutsu` (type `Jutsu`).
  - If a jutsu already exists, it is kept as it is, so nothing is duplicated. Any field where the misplaced copy disagreed is listed under `notes` in the report (`misplaced_ultimate_differs_from_jutsu`).
  - The real Secret Technique then becomes the ultimate. If the wiki has none, the ultimate is removed (the patch records this as a `"op": "delete"` op).
- `--fix-rarity` sets `rarity` to the wiki card's star count. It doesn't touch `starMinCode`/`starMaxCode`. Units whose `starMinCode` is below the wiki card rarity show up in the summary under "Tier codes below the wiki card rarity" for manual review.

- `--fix-tier` applies to a unit whose `starMinCode` is below its wiki card's star rarity while its skills are already keyed under the card's tier (for example, a ★6 card stored as `5S–6S`). It changes:
  - **Tier codes:** `starMinCode` becomes `<rarity>S`. `starMaxCode` becomes `6SB` when the wiki's next card (N+1) is this card's Blazing Awakened form, which matches `kakashi_705` (`6S–6SB`, awakens into `kakashi_706` at `6SB`).
  - **Art:** `artByTier` and the top-level `portrait`/`full` point at the unit's own files. If no `*_<tier>.webp` file exists, the tool copies one from the existing art and keeps the original. It copies because reward icons build `portrait_<tier>.webp` paths.
  - **Awakening chain (`data/awakening-transforms.json`):** the `N → N+1` transform moves to the new max tier. A lower-star base that awakened straight into the BA card (for example, `sasuke_721 → sasuke_723`) is rerouted to `base → N → BA`. The base's awakened-tier art is pointed at card N's art.

  The report lists these edits under `transform_changes` and `file_copies`. Transform edits and file copies happen only with `--apply`, because they are not part of the patch file. Instances saved before a tier fix are lifted to the unit's new minimum tier on page load by the tier-floor migration at the end of `js/character_inv.js`.

`--overwrite` replaces conflicting values with the wiki's. Review the Conflicts
section of the summary before you use it.
