# Audio Files Directory

## Music (`music/`)

The original game's BGM (`original/music/BGM_*`), rebuilt as loop files by
`tools/audio/make_music_loops.py` and played by `js/audio-manager.js` (Web
Audio, per-page tracks, crossfades, gapless loops).

| File | Original cue | Where it plays |
|------|--------------|----------------|
| title.mp3 | BGM_2_tittle | index.html (login) |
| home.mp3 | BGM_1_menu_home | village.html and every other menu page (track names `home`, alias `village` / `shop` / `menu`) |
| summon.mp3 | BGM_7_Gasha | summon.html |
| arena.mp3 | BGM_3_menu_pvp | arena.html, kage-league.html |
| battle.mp3 | BGM_5_battle_normal | battle.html |
| arena_battle.mp3 | BGM_4_battle_pvp | arena / Kage League battles |
| boss.mp3 | BGM_6_battle_boss | boss battles (`BattleCore.isBoss`, or `AudioManager.playMusic('boss')`) |
| discipline / tension / intrigue / sorrow / battle_event.mp3 | BGM_008..012 | available to `playMusic()` (story, domains) |

Battle results play the original jingles `original/jingles/JG_3_mission_clear.mp3` /
`JG_4_mission_fail.mp3` (one-shot).

Each original cue starts with 0.183 s of codec lead-in before its loop; the
script cuts the loop (length from `original/manifest.json`) and adds 0.25 s of
wrapped audio before the loop start and after the loop end, so the loop points
in `MUSIC_TRACKS` (`js/audio-manager.js`) work whatever MP3 decoder delay the
browser trims. Rebuild with the script rather than replacing a file by hand.

A page can pick its track with `<body data-music="home">` (`none` = silent).

On iOS the page asks for the `playback` audio session (Safari 17+), so music
plays with the ring/silent switch on, and any tap resumes audio that iOS
suspended (call, app switch).

## Sound Effects (`sfx/`)

Howler.js sounds defined in `AudioManager.defineSounds()` (ui_click, hit,
critical, jutsu, ultimate, summon, victory, defeat). Missing files fail quietly.

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
`music/` holds the loop-ready copies of `original/music/` the music player uses.
