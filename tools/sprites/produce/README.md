# Battle-sprite production pipeline

Turns one character card into the full animated battle-sprite set played by
`js/sprite-player.js`:

| sheet      | loop | what                                  | hits                         |
|------------|------|----------------------------------------|------------------------------|
| `idle`     | yes  | 3-4 breathing poses                   | –                            |
| `run`      | yes  | 6-pose ninja run                       | –                            |
| `attack`   | no   | normal attack, ~0.6 s                  | `hits` in the spec (2)       |
| `jutsu`    | no   | the unit's jutsu, ~10-12 poses         | = `skills.jutsu` hits        |
| `ultimate` | no   | the unit's ultimate (if it has one)    | = `skills.ultimate` hits     |
| `hit`      | no   | flinch (played by battle-hit-react.js) | –                            |
| `ko`       | no   | collapse, last frame held              | –                            |

Everything about a character lives in one spec, `specs/<name>.json`; the
scripts only read/write that file, `work/<name>/` (raw poses, git-ignored) and
`assets/sprites/<folder>/`.

Dependencies: Python 3 with numpy, Pillow and `opencv-python-headless`
(`pip install opencv-python-headless`; used for body-size measurement),
Node + Playwright for the in-battle checks. Art comes from the Higgsfield MCP
tools (`gpt_image_2_5`, ~1.5 credits per image, never video).

## Quick start for a new character (~40-45 images, 60-70 credits)

1. **Pick the card family.** Find every id that shares the art/outfit
   (`data/characters.json` → `artByTier`, `data/awakening-transforms.json`).
   Use the most prominent id as `primary` (its tier's hit counts drive the
   sheets). Ids whose *jutsu* differs go in a `variants` entry (own folder,
   own `jutsu` sheet, everything else shared — see `hinata_813.json`).
2. **Copy a spec** (`cp specs/hinata_813.json specs/<name>.json`) and edit:
   `name`, `index_base` (unique thousands block, e.g. 4000), `folder`, `ids`,
   `primary`, `dev` (dev-panel button), `reference_art`, `character` (long
   description for the base pose), `short` (one line repeated in every pose),
   `pronouns`, all `poses[*].prompt` texts, and clear `state` down to
   `{"media": {}}`. Write jutsu/ultimate poses from the skill's name and
   description in `data/characters.json`.
3. **Upload the card art** with `mcp__higgsfield__media_upload`
   (filename `…png`), `curl -X PUT` the file to the returned URL, then
   `media_confirm`. Put the media id in `state.media.ref_art`.
   (`state.media.style` defaults to the Minato 2101 base sprite,
   `c41e48b2-…`, the style reference used for every unit so far.)
4. **Base pose first** — everything else is derived from it:
   ```
   python3 produce.py requests <name> --only base
   ```
   Submit the printed `work/<name>/req_*.json` content verbatim with
   `mcp__higgsfield__generate_image_batch` (≤ 12 per call), then record:
   ```
   python3 produce.py record  jobs.txt   # lines "INDEX JOB_ID" from the batch result
   python3 produce.py pending             # jobs_wait-ready groups of 12
   python3 produce.py record  done.txt    # lines "JOB_ID HHMMSS" (or "JOB_ID URL") from jobs_wait → also downloads
   python3 preview.py poses <name>        # work/<name>/poses.png — look at it!
   ```
   Re-roll with `requests <name> --only base --redo base` until the base is
   clean (no aura/effects baked into the idle pose, full body, ~70-85 % of the
   canvas height, painterly Blazing look).
5. **Everything else:** `python3 produce.py requests <name>` writes every pose
   whose references are done (edits/poses first; the in-between `tween`
   poses become ready once both of their key poses are completed — run
   `requests` again). Submit, `record`, `pending`/`jobs_wait`, `record`.
   A `429 rate_limit_reached` item is simply resubmitted later with the same
   index. A `nsfw`/refused job is recorded as `failed`: **do not re-word the
   same content to get around it** — drop or replace the pose's idea, note it
   in the pose (`"refused": "..."`) and report it.
6. **Review** `python3 preview.py poses <name>`: labels show the measured
   body scale (`x0.93` = drawn 7 % small; corrected automatically) and
   `EDGE:` flags for art cut by the canvas border (regenerate those with a
   smaller effect / explicit right-margin in the prompt). Re-roll bad poses
   with `requests <name> --redo a,b`.
7. **Build:** `python3 produce.py build <name>` = pack + contact sheet + GIF +
   validation (exit code 1 on any error). Outputs
   `work/<name>/mp_<primary>_sheets.png` and `mp_<primary>.gif`.
8. **Register:** `python3 produce.py register` rewrites the generated blocks
   (`<produce:…>` markers) in `js/sprite-player.js` (REGISTRY + SHARED
   variant map), `js/characters-dev-panel.js` (an "Add … (animated sprite)"
   button per spec, id `chardev-add-<dev.id>`) and `sprites-preview.html`.
9. **Verify in the game** with
   `node tools/sprites/produce/verify_battle.js <charId> <outDir> [tier]`
   (server: `python3 -m http.server 8765` in the repo root) — idle, run on
   drag, normal attack, jutsu and ultimate (damage numbers = sheet hits = data
   hits), hit, KO, screenshots `vb_<id>_*.png`. Ids without a dev button are
   added with `CharDevTools.addSpriteUnit`; `NOMAX=1` adds a plain Lv80 copy
   (maxing awakens 5★/6★ forms into the next id, so use it to test variants).
   Also open `sprites-preview.html` (Idle/Run/Jutsu/Ultimate/Attack/Hit/KO).

## Spec reference

```jsonc
{
  "name": "hinata_813",            // spec + work dir name
  "index_base": 1000,              // batch indices start here (keep unique per spec)
  "folder": "assets/sprites/hinata_813",
  "ids": ["hinata_813"],           // REGISTRY ids that use this folder for everything
  "primary": {"id": "hinata_813", "tier": "6S"},   // skill hit counts come from here
  "variants": [{                   // ids sharing the art but with a different jutsu
    "folder": "assets/sprites/hinata_811", "ids": ["hinata_811", "hinata_812"],
    "primary": {"id": "hinata_812", "tier": "6S"},
    "sheets": {"jutsu": { … }}     // only these sheets live in the variant folder
  }],
  "dev": {"id": "hinata_813", "tier": "6S", "label": "…", "note": "…"},
  "reference_art": "assets/characters/hinata_813/full_6S.png",
  "character": "long description used for the base pose",
  "short": "one-line description repeated in every other prompt",
  "pronouns": ["she", "her"],
  "sheets": {
    "idle":  {"fps": 8, "loop": true, "timeline": [["base", 2], ["idle_m", 1], …]},
    "jutsu": {"fps": 12, "height": 300, "body_px": 296, "skill": "jutsu",
              "timeline": [["j1", 2], ["@hits", ["j5", "j6", "j7", "j8"], 1], ["j9", 2, "hit"], …]},
    "attack": {"fps": 14, "hits": 2, "timeline": [["at1", 1], ["at3", 2, "hit"], …]}
  },
  "poses": {
    "base": {"type": "base", "prompt": "pose description"},      // refs: card art + style sprite
    "idle_in": {"type": "edit", "prompt": "what changes"},       // refs: base (small edits: breathing, hit, KO)
    "j1": {"type": "pose", "prompt": "key pose + effect"},        // refs: base + style sprite (big pose changes)
    "u4": {"type": "pose", "from": "u3", "prompt": "…"},          // derive from another pose (keeps an effect consistent)
    "h0": {"type": "tween", "from": ["base", "h1"], "prompt": "…"} // in-between of two finished poses
  },
  "state": {…}                     // written by the scripts: media ids, job ids, urls, previous takes
}
```

Timeline entries: `[pose, holdFrames]`, `[pose, hold, "hit"]` (a damage
number on the first frame), `["@hits", [poses…], hold]` (expands to exactly
as many hit frames as the data needs, minus explicit "hit" entries — so the
sheet's hit count always equals `skills.<kind>.byTier[tier].hits`).

Pose options: `scale` (manual scale about the feet; overrides the automatic
correction), `auto_scale: false`, `dx`/`dy` (px on the 1024 canvas),
`feet: false` (don't snap the feet to the idle feet line), `edge_ok: true`
(accept an edge touch after checking the feathered result), `helper: true`
(generated but unused, e.g. a reference for other poses), `size_check: false`
(skip the ±5 % gate when the body is hidden, e.g. a silhouette in smoke),
`free_scale: true` (drop the "same scale as the reference" rule from the
prompt — for summons/giant scenes where the character is drawn small on
purpose; the packer still scales him back to idle size, see Jiraiya's
Gamabunta ultimate with `max_height_scale` on the sheet).

Sheet options: `unit` (take the hit count from another id, e.g. when the
primary id has no ultimate in the data), `max_height_scale` (raise the 1.35
heightScale limit for deliberately tall sheets such as summons), `quality`
(webp quality, default 86; lower it for very large sheets — Jiraiya ultimate uses 74).

## Two-layer techniques (caster sheet + effect-only FX sheet)

For techniques that happen *at the enemies* (e.g. Pain's Chibaku Tensei) the
unit does not dash in. The skill is split in two sheets:

* **caster sheet** (e.g. `ultimate`): the unit in place — raise arm, launch,
  hold, clench, recover. Clean poses (no big effects); body-size and edge checks
  apply as usual. Its sheet spec carries an `fx` block:
  `"fx": {"sheet": "ultimate_fx", "at": "targets", "start_key": "c_launch"}`.
  `pack` writes `"fx": {"sheet", "at", "startFrame"}` into the caster json
  (`startFrame` = first frame of `start_key`). The caster sheet has no hits.
* **FX sheet** (e.g. `ultimate_fx`): `"type": "fx"` sheet of poses with
  `"type": "fx"` (effect only, green screen, no character). Chain the frames
  with `"from": "<previous frame>"` so each one continues the last (same camera
  and centre); MEDIUM quality is enough (`"quality": "medium"`, 0.5 credits).
  Sheet options: `ground_y` (ground line in the generated canvas, 0.88),
  `sphere_key` + `sphere_units` (the largest blob of that key is sized to this
  many unit heights in battle), `variants` (`{"f5b": {"from": "f5", "scale": 1.03}}`,
  cheap scaled pulses about the effect centre), `crossfade` (default on: the
  last frame of each hold >= 2 is blended with the next key). The skill hits go
  on the FX timeline (`@hits` works as usual). The json gets `fxOnly`,
  `groundY`, `centerX` and `heightUnits` (frame height in unit heights).

Look of the FX frames (lessons from the first Chibaku Tensei take, which read
as purple "pixel game FX"):

* Prompt wording: the default `FX_STYLE` asks for an *anime film still,
  painted cel-shaded, Naruto Shippuden style*, no pixel art / game VFX /
  sparkles. A spec can override it with `fx_style` (put the colour rules there,
  e.g. "core pure matte black, light white / pale blue, rocks earth tones,
  NO purple").
* `fx_refs`: media ids added as extra references to every FX request (e.g. an
  uploaded anime still of the technique, via `media_upload` + curl PUT +
  `media_confirm`); the prompt says it is a style / colour reference only.
* `"key": "unmix"` on the FX sheet: soft key with colour unmixing
  (`spritelib.key_unmix`: the least-transparent alpha for which the art has no
  green of its own, then the green is removed exactly). The default green key is a hard cut, which cut soft
  glows into jagged stickers with teal fringes (only ~6% of the old frames'
  pixels had partial alpha); unmix keeps coronas, rays and dust translucent and
  removes the green spill.
* `recolors` + `"recolor"` (pose or FX sheet; a name, a rule or a list): hue
  band shifts applied at pack time (`spritelib.recolor`), e.g. a left-over
  violet tint -> pale blue, salmon rock -> khaki, or a purple glow on a caster
  hand -> white. Raw generations stay untouched.
* Pack at `height` 420 and webp `quality` 88 so the element is always
  downscaled in battle.

In battle (`BattleCombat.performSpriteSkill` / `playTechniqueFx`) a caster sheet
with a `fx` block: no dash, the unit faces the targets and plays in place; at
`startFrame` a small projectile leaves its hand and the FX sheet is drawn in the
scene centred on the targets with its `groundY` row on their feet line,
`heightUnits x --sprite-h` tall, above the units and under the damage numbers
(scene z 30: above #battlefield-grid, under #damage-numbers and the HUD), mirrored when the caster is on the right. If it would reach under the
top HUD it slides down (<= 35% of its height) and then shrinks. Damage numbers
follow the FX hit frames; the turn ends when both layers have finished.
Sheets without `fx` behave exactly as before.

Checks: `validate` (FX hits == data, caster fx block, edge checks on FX frames),
`preview.fx_gif(spec, "ultimate", out, alone=out2)` (caster + FX at battle
scale, and the FX alone), and `node verify_fx.js <charId> <outDir>` (in-battle:
caster never moves, FX centred on the target and under the HUD, damage numbers
== FX hits, no page errors; saves screencast frames for a GIF).

**Several layers (e.g. Itachi's Susano'o).** `fx` may be a list. Each entry:
`sheet`, `at` (`"targets"`: centred on the targets, feet on their feet line;
`"caster"`: centred on the caster), `start_key` + optional `delay` (frames),
optional `layer: "behind"` (scene z 4, under the unit grid, so a Susano'o
stands behind Itachi) and `projectile: true` (the small black core flying from
the hand, Chibaku Tensei). Only the layer whose sheet has hit frames carries the
hits (normally the one at the targets); the turn ends when the caster and every
layer have finished. A tall caster layer slides the caster down under the HUD
for the cast (sheetSafeY with heightUnits x groundY) and back afterwards.
Example (`specs/itachi_2096.json`):
`"fx": [{"sheet": "jutsu_body", "at": "caster", "layer": "behind", "start_key": "cs_seal"},
        {"sheet": "jutsu_fx", "at": "targets", "start_key": "cs_seal", "delay": 9}]`.
FX sheets whose sphere_key effect is not one solid blob (a translucent
Susano'o) use `"size_by": "bbox"`. A pose can opt out of the spec's `fx_refs`
with `"fx_refs": false` (e.g. strike frames that must not copy the Susano'o
figure from the style reference). Pose names must not reuse existing ones
(`h1..h3` are hit-reaction poses, `c1..c5` Itachi's clone jutsu) - the FX frames
use `s*`, `b*`, `x*`, `t*`.

A layer can use another unit's FX sheet with `"base": "assets/sprites/<folder>"`
(Itachi "The Promised Day" `itachi_2031` reuses the Susano'o body `jutsu_body`
of `itachi_2096` for Yasaka Beads and only has its own strike sheet). A pose can
override the spec's `fx_style` with its own (`itachi_2031` a1-a5: black
Amaterasu flames instead of the Susano'o palette).

Sheet names starting with `_` are parked (not packed or validated).

## What the scripts do

* **Keying** (`spritelib.keyed`): green-screen → alpha with spill removal,
  haze and speck cleanup.
* **Body size** (`spritelib.body_scale`): SIFT features of the character are
  matched between each pose and the idle base; the trimmed mean of the matched
  keypoint-size ratios is the pose's body scale (effects never match, so they
  don't bias it). The packer divides it out, so every sheet shows the
  character at the idle size. Poses with too few matches (KO lying down,
  poses buried in effects) fall back to the scale of their `from` pose or 1.0
  and are listed as warnings — check them by eye in the contact sheet.
* **Feet** (`spritelib.feet_of`): lowest opaque rows, ignoring bright
  saturated effect pixels, snapped to the idle feet line.
* **Packing** (`spritelib.pack_sheet`): shared crop box per sheet, frame
  height raised so the body keeps at least the idle body's pixel height
  (`body_px`, and never below idle), `heightScale` so the player renders the
  body at the same on-screen size, `anchorX` on the body, 10 px edge feather.
* **Validation** (`produce.py validate`): every timeline pose exists; no pose
  touches any of the 4 canvas edges; body size within ±5 % of idle after
  correction; hit frames == data hits (attack: spec `hits`); heightScale in
  0.85-1.35 (warning outside 0.93-1.15); body pixel height ≥ idle in every
  sheet; idle/run/attack/jutsu/hit/ko (+ultimate when the unit has one) exist.

## Budget / pacing

* ~1.5 credits per image; a full set is ~40 poses + ~5 re-rolls ≈ 65-75
  credits (~85 with a jutsu variant). Check `mcp__higgsfield__balance` before
  and after a batch.
* Other workers share the rate limit: submit ≤ 12 at a time; resubmit 429s.
* Normal-attack prompts must say "a clearly DIFFERENT pose from the reference
  with big visible motion", otherwise the model returns the idle pose again.
