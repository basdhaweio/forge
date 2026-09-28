# Forge

A gamified training, rehab and nutrition tracker. It plans each day around injuries and travel, logs everything that counts as exercise (PT included), and turns consistency into XP, levels, streaks, quests and records.

**Live:** https://basdhaweio.github.io/forge/

Same stack as Canto: a static PWA, vanilla JS with no build step, installable on a phone, and working offline. Your data stays in the browser, with backup and restore available.

## What it does

- **Today**: a morning check-in (knees, back, energy), today's mission from the weekly schedule, 7 daily quests (check-in, PT, isometric holds, roll & stretch, walk, protein, food log), a fuel snapshot and the weekly quests.
- **Formal PT days**: one tap on 🩺 "Formal PT today?" logs a clinic or PT Pilates session as PT and covers the home PT routine for the day. Settings → Program can let it cover holds and stretching too.
- **Adapts**:
  - **Travel mode** swaps in the hotel-room or hotel-gym kit, makes the 4×4 machine-free and scales the weekly quests to the days away.
  - A **flare-up** check-in swaps the day to a recovery session. Recovery days keep the streak and earn bonus XP.
  - **Low energy** trims optional sets.
- **Train**: 27 guided sessions (strength A/B/C, TRX, Krav, Norwegian 4×4, Zone 2, yoga flows, mobility, Murph builder, Cindy, Murph, recovery days, travel reset) and a quick log for anything else (Krav class, walks, rides, PT visits, ski days…). There's also a history and a 245-exercise library, with knee, back and shoulder flags, cues and notes on every exercise.
- **Player**: logs sets with targets taken from your history (double progression; holds go up 5 s each time). It also has:
  - Swap for any slot, and the swap is remembered
  - A rest timer
  - A full-screen interval timer with heart-rate zones for the 4×4
  - An isometric hold timer that tracks your personal record
  - A guided yoga/mobility flow
  - A round counter for Murph/Cindy
- **Fuel**:
  - A protein target (0.8 g/lb by default)
  - **Added sugar on a weekly budget**, so a baking day evens out, with treat presets and your own saved foods
  - Optional calories
  - A **fasting timer** that walks through what the body is doing hour by hour
- **Body**: monthly tape measurements with trends, the V-taper ratio and waist-to-height ratio.
- **Sync** (Settings → Sync): keeps your phone and laptop in step through a secret gist on your GitHub account, optionally encrypted with a passphrase.
- **Plan for your PT** (Settings → Program): a printable page with the week, every exercise the plan uses at home, their knee and back flags, and the rules the app follows.
- **Hero**:
  - Level and title
  - 7 stats (Strength, Engine, Agility, Mobility, Grit, Armor, Fuel)
  - A streak with freezes
  - 7 epic quests: Iron Return, Over the Threshold, Slopes Ready, Run Again, Murph, OCR Ready, Photo Day
  - 47 achievements, personal records, lifetime totals and an activity heatmap

## Layout

```
index.html, css/, js/       the app (vanilla JS, no build step)
data/exercises.json         exercise library (flags, cues, notes)
data/program.json           slots, sessions, schedule, quests, achievements, fasting, foods, safety
docs/PROGRAM.md             how the training is structured — share with your PT
docs/CONTENT-SCHEMA.md      JSON reference for editing content
docs/ROADMAP.md             what's deferred
tools/validate.py           checks the content + that every slot resolves at home/hotel/gym, per phase, on flare days
tools/serve.py              local dev server with caching off
tools/make_icons.py         renders the icons (standard library only)
```

## Run locally

```bash
python tools/serve.py
```

Then open http://localhost:8777/. The service worker is skipped on localhost unless you add `?sw` to the URL.

## Editing content

Edit the JSON in `data/`, then run `python tools/validate.py`. It should report 0 errors. Exercise ids are stable keys for history, so rename by adding a new id rather than changing an existing one. When you change shell files, bump `VERSION` in `sw.js` so installed copies update.

## Privacy and sync

Injuries, goals, measurements and logs live in the browser's localStorage on each device. None of it goes into this repo.

**Sync (Settings → Sync)** copies that data to a secret gist on your own GitHub account:
- You create a GitHub token with only the `gist` scope.
- A secret gist is unlisted, not private, so an optional passphrase encrypts the data in the browser (AES-GCM with a PBKDF2-derived key) before upload.
- The token and passphrase stay in each browser under a separate key and never go into the gist or backups.

How syncing works:
- The app pulls when it opens and when you return to it, and pushes a few seconds after you log something.
- Records carry timestamps and deletions leave tombstones, so edits and deletes sync correctly.
- Settings travel as one block, so the latest change wins.

Without sync, **Settings → Your data** downloads a backup and imports it with the same merge.
