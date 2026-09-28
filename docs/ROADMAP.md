# Roadmap

The first version covers planning, logging, adapting and gamification, all on one device. These ideas are deferred.

## Likely next

- **Cross-device sync.** A private GitHub Gist holding the backup JSON: push after each session, pull on launch. The merge logic already exists in `F.store.importJSON`.
- **Progress photos.** Store them in IndexedDB so they never leave the device, with a monthly slot beside the tape measurements and a side-by-side compare.
- **Reminders.** An ntfy push for the morning check-in, the fast-day start and monthly measurements, run from a GitHub Actions cron like Canto's plan.

## Nice to have

- **Bluetooth heart-rate strap for the 4×4** (Web Bluetooth works in Android Chrome). This would give live zone feedback and log average HR automatically.
- **Plate calculator and warm-up sets** for barbell lifts once Phase 2 unlocks.
- **Deload prompt** every 5–6 weeks, or when RPE trends up.
- **Steps import.** A PWA can't read Apple Health or Google Fit directly; an iOS Shortcut or Android intent could post steps into the quick log.
- **Claude coach.** A weekly review of the logs, with suggestions and PT-question prompts.
