# Automated tests

Playwright Test (Chromium) against a static server of the repo root. The game
has no build step, so the tests serve the files as they are
(`python3 -m http.server`, started by Playwright's `webServer`).

## Run locally

```sh
cd tests
npm ci
npx playwright install chromium   # once; skip if Chromium is preinstalled (see below)
npx playwright test               # everything (~2-3 min)
npx playwright test --project=data          # data/asset checks only, no browser (seconds)
npx playwright test --project=phone specs/battle.spec.js
npx playwright show-report        # HTML report of the last run
```

Requires Node 18+ and `python3` on the PATH (for the static server). An
already running server on the port is reused locally (`PW_PORT`, default 4173).

### Preinstalled Chromium

`@playwright/test` is pinned (see `package.json`) and wants its matching
browser build. If Chromium is already installed elsewhere:

- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` – use a shared browser folder
  (it must contain the build this Playwright version expects).
- `PW_CHROMIUM_PATH=/path/to/chrome` – use any Chromium binary
  (`launchOptions.executablePath`), e.g. when the versions don't match.

Other knobs: `PW_WORKERS` (parallel workers), `PW_BASE_URL` (test an already
running server), `PW_LOG_IGNORED=1` (print console errors that were ignored as
benign).

## Projects

| project   | what                                                            |
|-----------|-----------------------------------------------------------------|
| `data`    | pure Node: `specs/data-integrity.spec.js`, `specs/sprite-registry.spec.js` |
| `phone`   | 932x375, `isMobile`, `hasTouch` (landscape phone)               |
| `desktop` | 1280x800                                                        |

## Specs

| file | covers |
|------|--------|
| `smoke.spec.js` | every player page loads with no uncaught errors, no `console.error`, no missing script/style/data; index login screen; dev pages (`battle copy`, `chakra-holder-demo`, `sprites-preview`) non-blocking |
| `data-integrity.spec.js` | `data/*.json` parse; character / enemy / boss references in missions, enemies, summon banners, fusions; mission rewards and shop items use known resource ids (`js/resources.js`); pages' `<script>`/`<link>` files exist |
| `sprite-registry.spec.js` | `REGISTRY` / `SHARED` in `js/sprite-player.js`: every folder resolves idle/run/attack/hit/ko (+ jutsu/ultimate where the family has them), sheet JSON is well-formed |
| `battle.spec.js` | seeded team of animated units on a non-story mission: units render, forced win through every wave shows the results screen and pays rewards; one real pointer-drag attack damages an enemy |
| `economy.spec.js` | shop ramen purchase (ryo and legacy `pearls` price) deducts and grants; refused when broke; single/multi summon deducts pearls and adds valid characters |
| `save-compat.spec.js` | an old save (legacy ids such as `ramen_5star`, `pearls`, retired scrolls, `stars` inventory) converts on load without errors |
| `mobile-layout.spec.js` | phone only: village right banner panel and bottom icon bar fully on screen and not overlapping at 932x375 and 932x340 |

## Helpers (`helpers.js`)

- `seedSave(page, extra)` seeds localStorage before any page script runs:
  login (`blazing-login-complete`, `blazing-login-username`) and a finished
  tutorial (`blazing_tutorial_v1` = `{status:'done'}`) so `js/session-gate.js`
  lets pages open, plus any extra keys (inventory, teams, resources, ...).
  Seeding happens once per test, so the game's own writes survive reloads.
- `collectErrors(page)` gathers uncaught page errors, `console.error` calls and
  same-origin 404s of scripts/styles/data. The few ignored messages are listed
  with the reason in `BENIGN_CONSOLE`; missing images only become annotations.
- `dismissLoginBonus(page)` waits for village init and closes the daily
  login-bonus reveal.
- `allStorySeen()` marks every story scene seen (`blazing_story_seen_v1`).
- `pickPlainMission()` picks a non-story, non-boss mission from
  `data/missions.json` (prefers `m_001`), so data edits don't break the battle test.

## Known issues

Problems the suite found that are reported rather than fixed are listed in
`KNOWN_ISSUES` (`specs/data-integrity.spec.js`) and `KNOWN_MISSING_CODE`
(`helpers.js`). Each has a `test.fail` test that is green while the problem
exists and turns red once it is fixed, as a reminder to drop the entry.
