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
