# Ninja Legends — native app (Capacitor)

The phone app version of the game. It wraps the web game that lives one
folder up; nothing in the web game is changed. The app runs full screen in
landscape (no browser bars, no status bar; the iPhone home indicator fades
out and Android's system bars are hidden until you swipe from an edge).

```
app/
  capacitor.config.json   app id, name, web folder
  scripts/copy-web.mjs    copies the web game into www/ (skips tools/, docs/,
                          backups and sw.js)
  resources/              icon + splash sources (npm run icons)
  ios/                    Xcode project
  android/                Android Studio / Gradle project
  www/                    generated copy of the game (not committed)
```

## Setup (once)

```bash
cd app
npm install
```

## After changing the game

Any change to the web game needs to be copied into the app:

```bash
npm run sync          # copy the game into www/ and into both native projects
```

## Android

Needs Android Studio (or the Android SDK + JDK 21).

```bash
npm run android:debug   # builds android/app/build/outputs/apk/debug/app-debug.apk
```

Copy `app-debug.apk` to the phone and open it to install (allow "install
unknown apps" for your file manager or browser). Or `npm run open:android`
and press Run in Android Studio with the phone plugged in.

## iPhone

Needs a Mac with Xcode 16+.

1. `npm run sync`
2. `npm run open:ios` — opens `ios/App/App.xcodeproj` in Xcode.
3. Select the **App** target → *Signing & Capabilities* → pick your Team
   (a free Apple ID works; a paid developer account is needed for
   TestFlight and to stop the app expiring after 7 days).
4. Plug in the iPhone, pick it as the run destination, press ▶.
   First time only: on the phone, *Settings → General → VPN & Device
   Management* → trust your developer certificate.

## Notes

- Saves are kept inside the app, separately from Safari. A player moving from
  the website to the app starts a fresh save in the app.
- The service worker is left out of the app build: the files are already on
  the phone, and a cached worker could keep serving an old version after an
  app update.
- The app bundles all game art (about 850 MB), so the first install is large.
- New icon or splash art: replace `resources/icon.png` (1024×1024) and
  `resources/splash.png` (2732×2732), then `npm run icons`.
