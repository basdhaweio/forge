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
- `sessions[]`: `{ id, name, sub, icon, group, tags[], stat, met, est, blocks[], requires?, alt?, flare?: {knee, back}, gate?, desc?, finishChecks?, dynamic? }`
  - `tags` drive the weekly quests (`lift`, `krav`, `n4x4`, `z2`, `yoga`, `murph`, `pt`, `walk`, `mobility`, `holds`, `recovery`, `benchmark`…).
  - `requires` / `alt`: if the kit can't satisfy `requires`, the `alt` session is used (e.g. the 4×4 becomes `n4x4_room`).
  - `flare`: the session to swap in when the knee or back check-in is 2.
  - `dynamic`: `pt` (built from the PT routine), `holds` (from `isoRotation`) or `mobility` (from `mobilityRotation`).
- Block types:
  - `list`: checklist. Items `{ex, dose, sets?, alt?}`; `sets` shows set bubbles.
  - `sets`: logged sets. Items `{slot|ex, sets, reps?, hold?, secs?, rest?, focus?, onlyFocus?}`. `focus` adds a set when that priority is on.
  - `flow`: guided sequence. Items `{ex, secs|reps}`.
  - `timer`: `{timer: {kind: intervals|steady|amrap|stopwatch, warm, work, rest, rounds, cool, workLabel(s), restLabel, hr?, hrZone?, altLabel?}, log: [dist|hr|steps|rounds]}`.
  - `circuit`: rounds tracker. `{rounds, rest, progress?, max?, items: [{slot|ex, reps}]}`. With `progress`, the target is last time + 1.
  - `core: true` keeps a block in "short on time" mode.
- `schedule`: weekday (`"0"` = Sunday) → session ids. The first Murph day of each month becomes `benchmark.with`.
- `dailyTasks`, `quotas` (with `home` / `travel` targets), `activities` (quick log), `achievements`, `quests`.
- Metric names are listed in `tools/validate.py` (`METRIC`) and implemented in `metric()` in `js/game.js`: `count:<tag>`, `holdBest:<ex>`, `e1rmBw:<ex>`, `carryPct:<ex>:<secs>`, `distBest:<activity>`, …
- `fastingStages`, `fastingTips`, `fastingCaution`, `foods`, `treats`, `measureSites`, `safety`.
