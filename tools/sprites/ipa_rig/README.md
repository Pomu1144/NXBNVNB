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
| `idle`          | `0040200004`             |
| `run`           | `0040200002` from 0.3 s  |
| `attack`        | `1040200001` (2 hits)    |
| `hit`           | idle → `3040210001` guard → idle |
| `ko`            | `0040200003`             |
| `ultimate`      | `2040221354`, Hashirama only |
| `ultimate_body` | `2040221354`, Buddha + summoning smoke, behind the caster |
| `ultimate_fx`   | effect `21354` (both layers), 12 hits over the targets |

The clips are authored facing left; frames are mirrored to face right. The
Wooden Dragon jutsu isn't in the IPA, so the skin uses the base folder's
`jutsu`. Requires `pip install UnityPy pillow numpy`.
