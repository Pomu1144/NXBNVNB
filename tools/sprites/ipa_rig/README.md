# Sheets from the original game's sprite rigs

The original iOS build (`Payload/BNEI0249.app`, Unity 2018.4) draws units with
SpriteStudio: each unit is a rig of cut-out parts (`SSPart`) on a part sheet
(`SSController.cellList` = part name + UV rect) and every animation is a Unity
clip that keys the parts' fields. Only a few rigs ship inside the IPA (the rest
were downloaded at runtime): unit 0402 (Hashirama with the Thousand-Armed
Buddha) and its ultimate effect `21354`.

`ssrender.py` replays those clips into RGBA frames:

* decodes the clip's streamed / dense / constant curves and maps each binding
  (CRC32 of the part path + field name) to `pos`, `rot.z`, `cellId`, `alpha`,
  `flpH/V`, `prio`, `vert{LB,RB,LT,RT}` (corner offsets), `vcol` (tint), the
  renderer's `m_Enabled` and the Transform scale;
* draws the parts in `prio` order, parents first, SpriteStudio space (+y up,
  `(0, 0)` = the unit's feet); `alphaBlendType` 1 is additive and the tint's
  blend function (multiply etc.) is the field hashed `3756801849`.

`build_hashirama.py` turns rig 0402 into the "Original Blazing" skin
(`assets/sprites/skins/hashirama_418_original`, registered in `js/skins.js`):

```
unzip Blazing.ipa -d ipa
python3 tools/sprites/ipa_rig/build_hashirama.py ipa/Payload/BNEI0249.app/Data/Raw/AssetBundle/iOS --preview /tmp/prev
```

| sheet           | clip                     |
|-----------------|--------------------------|
| `idle`          | `3040210001` (upright seal stance, as in the original battles; `0040200004` is a crouched stance) |
| `run`           | `0040200002` from 0.3 s  |
| `attack`        | `1040200001` (2 hits)    |
| `hit`           | idle → opening recoil of `0040200003` → idle |
| `ko`            | backstep `0040200003` to its deepest stagger, then tipped onto the ground (no KO clip in the IPA) |
| `ultimate`      | `2040221354`, Hashirama only |
| `ultimate_body` | `2040221354`, Buddha + summoning smoke, behind the caster |
| `ultimate_fx`   | effect `21354` (both layers), 12 hits over the targets |

The clips are authored facing left; frames are mirrored to face right. The
Wooden Dragon jutsu isn't in the IPA, so the skin uses the base folder's
`jutsu`. Requires `pip install UnityPy pillow numpy`.

## Other renderers

* `build_gimmicks.py`: the battlefield gimmick zones (poison, chakra up, chakra down,
  swap seal) to `assets/sprites/gimmicks/<type>_<shape>.webp/.json`, one looping sheet
  per shape (square / tall / wide). Each rig has invisible "node" parts that mark the
  zone's footprint; they are not drawn, their box is written as `zone` in the json.
  Played by `js/battle/battle-gimmicks.js`.
* `build_ui.py`: every battle UI rig (hit sparks, skill auras and activations, chakra
  effects, cursor, cut-ins, "Incoming Boss", "Ultra Combo") to
  `assets/ui/original/anim/`, the damage and hit-counter digit fonts to
  `assets/ui/original/font/` and the English text images to `assets/ui/original/text/`.
  The fonts are used by `js/battle/battle-digits.js`. Each rig's clip comes from the
  AnimatorController of the same name (rigs share part paths, so matching by bindings
  picks the wrong clip). `js/battle/battle-ui-fx.js` plays `sys_0020_hit_dageki` (white
  starburst) on every hit and `sys_0012_kemuri_b` (smoke puff) when a unit dies.

```
python3 tools/sprites/ipa_rig/build_gimmicks.py ipa/Payload/BNEI0249.app/Data/Raw/AssetBundle/iOS
python3 tools/sprites/ipa_rig/build_ui.py ipa/Payload/BNEI0249.app
python3 tools/audio/extract_acb.py <nrb.acb> <nrb.awb> assets/audio/original --format mp3
```

The sound bank sits in the IPA as Unity TextAssets (`criaudio/ja/nrb.acb.bytes` and
`nrb.awb.bytes`); export their raw bytes with UnityPy first.
