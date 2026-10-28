# Content schema

Run `python tools/validate.py` after any edit. It checks the schema and all references. It also checks that every slot used by a session still resolves to at least one exercise for home, hotel room, gym and hotel gym, in every phase and on knee or back flare days.

## data/exercises.json

```jsonc
{
  "id": "goblet_box_squat",          // stable key — history, PRs and slot preferences use it; never rename
  "name": "Goblet box squat",
  "cat": "strength",                 // pt | strength | core | iso | carry | mobility | yoga | krav | conditioning | cardio
  "stat": "STR",                     // STR | END | AGI | MOB | GRIT | ARMOR | FUEL — where its XP goes
  "equip": ["db|kb", "box"],         // every entry required; "a|b" = either. [] = none
  "log": "wr",                       // wr weight×reps | r reps | h hold seconds | ws weight×seconds (carries) | dt distance+time
  "pair": true,                      // optional: two dumbbells — volume counts both, inputs say "each"
  "side": true,                      // optional: per side (holds run twice, reps are per side)
  "inc": 5,                          // optional: progression step in lb (default 5)
  "phase": 2,                        // optional: earliest program phase (default 1)
  "gate": "run",                     // optional: locked until the Run Again quest clearance step
  "knee": "caution",                 // ok | caution | avoid  (meniscus/cartilage)
  "back": "ok",                      // ok | caution | avoid  (lumbar disc)
  "sh": "caution",                   // optional, shoulder
  "tags": ["squat", "quad"],         // free-form; "avoid" marks reference-only entries never programmed
  "cues": ["…", "…"],
  "note": "…"                        // optional injury-aware note shown in the player and library
}
```

Filter rules (`blocked()` in `js/data.js`):
- An exercise is excluded if its phase is above the current phase, its equipment is missing, or it's `avoid` for a flagged injury.
- On a flare day (check-in level 2) anything not `ok` for that joint is excluded.
- On a "grumpy" day (level 1) `ok` options sort ahead of `caution` ones.

## data/program.json

- `slots`: `{ id: { name, cands: [exercise ids, most advanced first] } }`. The player takes the first candidate that passes the filter. Your swap choice (`settings.slotPrefs`) wins when it passes too.
- `sessions[]`: `{ id, name, sub, icon, group, tags[], stat, met, est, blocks[], loc?, requires?, alt?, flare?: {knee, back}, gate?, desc?, finishChecks?, dynamic? }`
  - `tags` drive the weekly goals and daily quests (`lift`, `krav`, `n4x4`, `z2`, `yoga`, `murph`, `pt`, `walk`, `mobility`, `holds`, `recovery`, `benchmark`…).
  - `requires` / `alt`: if the kit can't satisfy `requires`, the `alt` session is used (e.g. the 4×4 becomes `n4x4_room`).
  - `loc: "gym"`: the session always resolves with the gym kit (the hotel-gym kit while travelling), whatever Today is set to. On a Gym day, Today offers whichever of `gymA` / `gymB` was done less recently (`F.data.nextGym`).
  - `flare`: the session to swap in when the knee or back check-in is 2 and the session is opened from a weekly goal or the Gym day button.
  - `dynamic`: `pt` (built from the PT routine), `holds` (from `isoRotation`) or `mobility` (from `mobilityRotation`).
- Block types:
  - `list`: checklist. Items `{ex, dose, sets?, alt?}`; `sets` shows set bubbles.
  - `sets`: logged sets. Items `{slot|ex, sets, reps?, hold?, secs?, rest?, focus?, onlyFocus?}`. `focus` adds a set when that priority is on.
  - `flow`: guided sequence. Items `{ex, secs|reps}`.
  - `timer`: `{timer: {kind: intervals|steady|amrap|stopwatch, warm, work, rest, rounds, cool, workLabel(s), restLabel, hr?, hrZone?, altLabel?}, log: [dist|hr|steps|rounds]}`.
  - `circuit`: rounds tracker. `{rounds, rest, progress?, max?, items: [{slot|ex, reps}]}`. With `progress`, the target is last time + 1.
  - `core: true` keeps a block in "short on time" mode.
  - `requires: [equipment ids]` on a block skips it when the kit lacks one (`"a|b"` means either). Example: the Krav heavy-bag rounds need `bag`.
- `schedule`: weekday (`"0"` = Sunday) → session ids. Nothing is scheduled since 2026-10-28; the printable plan uses it as the list of sessions to describe. `benchmark` is no longer used.
- `dailyTasks[]`: `{ id, label, sub?, icon, xp, kind: checkin|session|walk|protein|water|food, session?, tags?, cats?, stat, min?, fastOff?, until? }`.
  - A `session` task is done by a session carrying one of its `tags`, or by any done exercise from `cats` (quick sets too). Tapping it opens an exercise picker for `cats` with `session` on top.
  - `fastOff: true` switches it off on a fast day (a fast covering 12 hours or more of it).
  - `until: "YYYY-MM-DD"` retires it after that date; the days it was on keep their XP.
- `quotas[]` (weekly goals): `{ id, label, icon, kind, home, travel, … }`, targets in times a week.
  - Kinds: `days` (days with a session tagged from `tags` or a done exercise from `cats`), `count` (sessions tagged `tag`, at least `minMin` long), `protein` (days at the target), `fast` (fasts of `minH` hours or more, default 24), `sugar` (treats within budget), `minutes`, `holdMin`.
  - What tapping it on Today does: `cats` opens an exercise picker (`whole` puts that session on top), `log` opens a quick log, `session` previews that session.
  - A user's change lives in `settings.quotas[id]` as `{ home, travel, since, prev }`: it applies from the week starting `since`, and `prev` is the version before, so earlier weeks keep their targets.
- `activities` (quick log), `achievements`, `quests`.
- Metric names are listed in `tools/validate.py` (`METRIC`) and implemented in `metric()` in `js/game.js`: `count:<tag>`, `holdBest:<ex>`, `e1rmBw:<ex>`, `carryPct:<ex>:<secs>`, `distBest:<activity>`, …
- `fastingStages`, `fastingTips`, `fastingCaution`, `foods`, `treats`, `measureSites`, `safety`.
