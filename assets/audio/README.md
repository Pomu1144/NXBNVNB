# Audio Files Directory

## Music (`music/`)

Original instrumental BGM, MP3 128 kbps, played by `js/audio-manager.js`
(Web Audio, per-page tracks, crossfades, gapless loops).

| File | Where it plays |
|------|----------------|
| title.mp3 | index.html (login) |
| village.mp3 | village.html |
| battle.mp3 | battle.html |
| boss.mp3 | boss battles (`BattleCore.isBoss`, or `AudioManager.playMusic('boss')`) |
| summon.mp3 | summon.html |
| arena.mp3 | arena.html and arena battles |
| shop.mp3 | shop.html and every other menu page |
| victory.mp3 / defeat.mp3 | battle results (one-shot) |

Loop tracks have 0.25 s of wrapped audio before the loop start and after the
loop end; the loop points are listed in `MUSIC_TRACKS` in
`js/audio-manager.js`. Replace a file only together with its loop points.

A page can pick its track with `<body data-music="village">` (`none` = silent).

## Sound Effects (`sfx/`)

Howler.js sounds defined in `AudioManager.defineSounds()` (ui_click, hit,
critical, jutsu, ultimate, summon, victory, defeat). Missing files fail quietly.

## Credits

Music is original, rendered with the FluidR3_GM soundfont (MIT licence, Copyright Frank Wen).

## Original game sound bank (`original/`)

Every cue of the original game's sound bank (`criaudio/ja/nrb.acb` + `.awb` in the IPA),
extracted with `tools/audio/extract_acb.py` (HCA decoded by ffmpeg):

| Folder | What |
|--------|------|
| `original/sfx/` | 124 sound effects (`SE_*`: hits, slashes, explosions, elements, jutsu, buffs/debuffs, menus, gacha) |
| `original/voice/` | 573 voice lines (`voice_<id>_<name>_{atk,ski,oug,gasha}_*` for Naruto, Sasuke, Sakura, Kakashi, Iruka, Hashirama, Madara; `voice_ui_titlecall_*`). Cues with several takes are `<cue>__1.mp3`, `__2.mp3`... |
| `original/music/` | 12 BGM tracks (`BGM_*`), loop points in `manifest.json` |
| `original/jingles/` | 6 jingles (`JG_*`: level up, mission clear / fail, evolution...) |

`original/manifest.json` lists every file with its cue name, length and loop points.
`js/audio-manager.js` plays the sound effects (its `SFX` table maps game events to clips);
`js/title-call.js` plays a random `voice_ui_titlecall_*` on the first tap on the title page (`AudioManager.playVoice`);
the music player still uses `music/`.
