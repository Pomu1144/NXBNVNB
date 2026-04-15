# Audio Files Directory

## Folder Structure

```
assets/audio/
├── bgm/              # Background Music
│   ├── menu.mp3     # Main menu/village music
│   ├── battle.mp3   # Battle music
│   └── summon.mp3   # Summon/gacha music
├── sfx/              # Sound Effects
│   ├── button_click.mp3
│   ├── summon_pull.mp3
│   └── level_up.mp3
└── README.md         # This file
```

## Music Files Setup

### 1. Background Music (BGM)

Place your MP3 files in the `bgm/` folder:

- **menu.mp3** - Plays on index.html (village/main menu)
- **battle.mp3** - Plays during battles
- **summon.mp3** - Plays on summon page

**Default path for menu music**: `assets/audio/bgm/menu.mp3`

### 2. Sound Effects (SFX)

Place sound effect MP3 files in the `sfx/` folder for:
- Button clicks
- Summon animations
- Level ups
- Notifications
- etc.

## File Requirements

- **Format**: MP3 (recommended)
- **Bitrate**: 128-192 kbps recommended
- **Loop**: BGM files should be seamless loops
- **Size**: Keep files under 5MB for faster loading

## How to Add Music

1. Place your MP3 file at: `assets/audio/bgm/menu.mp3`
2. Reload the page
3. Click the Play button (▶) in the Music Control Panel
4. Adjust volume using the slider

## Alternative Music Path

If you prefer a different folder structure, edit `js/music-player.js`:

```javascript
// Change line 18:
init(trackPath = 'assets/music/general.mp3') {
```

To:

```javascript
init(trackPath = 'path/to/your/music.mp3') {
```

## Troubleshooting

**Music won't play?**
- Check the file path is exactly: `assets/audio/bgm/menu.mp3`
- Check browser console for errors (F12)
- Make sure file is MP3 format
- Try clicking the page first (browsers block autoplay)

**No sound?**
- Check Music Control Panel volume slider
- Check if mute button shows 🔇 (muted) or 🔊 (unmuted)
- Check Settings > Audio Settings for master volume
