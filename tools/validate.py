#!/usr/bin/env python
"""Validate data/exercises.json and data/program.json (see docs/CONTENT-SCHEMA.md).

Checks the schema, every cross-reference (slots, sessions, rotations, schedule,
quests), and that every slot used in a session still resolves to at least one
exercise for the scenarios that matter most: home / hotel room / gym, with knee
and back injuries on, in each phase, and on flare-up days.

Usage: python tools/validate.py            (exit 1 on any error)
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
CATS = {"pt", "strength", "core", "iso", "carry", "mobility", "yoga", "krav", "conditioning", "cardio"}
STATS = {"STR", "END", "AGI", "MOB", "GRIT", "ARMOR", "FUEL"}
LOGS = {"r", "wr", "h", "dt", "ws"}
FLAGS = {"ok", "caution", "avoid"}
BLOCKS = {"list", "sets", "flow", "timer", "circuit"}
TIMERS = {"intervals", "steady", "amrap", "stopwatch"}
METRIC = re.compile(
    r"^(sessions|ptDays|streakBest|comebacks|volume|holdMin|bikeMiles|walkMiles|fasts24|fasts36|proteinDays|sugarWeeks|"
    r"measures|perfectWeeks|travelActiveDays|prs|cindyBest|murphRounds|murphRx|minStatLevel|big4Logged|weeks3|waistDrop|armGain|"
    r"count:\w+|countPhase:\w+:\d|countMin:\w+:\d+|longest:\w+|distBest:\w+|holdBest:\w+|holdBestAny:[\w,]+|repsBest:\w+|"
    r"e1rmBw:\w+|e1rmBwAny:[\w,]+|carryPct:\w+:\d+|carryPctAny:[\w,]+:\d+|carryBw:\w+:\d+)$")

errors, warnings = [], []
err, warn = errors.append, warnings.append


def load(name):
    with open(os.path.join(ROOT, name), encoding="utf-8") as f:
        return json.load(f)


ex_doc, prog = load("exercises.json"), load("program.json")
EX = {}
for e in ex_doc["exercises"]:
    i = e.get("id", "?")
    if i in EX:
        err(f"exercise {i}: duplicate id")
    EX[i] = e
    for k in ("name", "cat", "stat", "equip", "log", "knee", "back", "cues"):
        if k not in e:
            err(f"exercise {i}: missing {k}")
    if e.get("cat") not in CATS:
        err(f"exercise {i}: bad cat {e.get('cat')}")
    if e.get("stat") not in STATS:
        err(f"exercise {i}: bad stat {e.get('stat')}")
    if e.get("log") not in LOGS:
        err(f"exercise {i}: bad log {e.get('log')}")
    for k in ("knee", "back", "sh"):
        if k in e and e[k] not in FLAGS:
            err(f"exercise {i}: bad {k} flag {e[k]}")
    if e.get("phase", 1) not in (1, 2, 3):
        err(f"exercise {i}: bad phase")

EQUIP = {q["id"] for q in prog["equipment"]}
for e in EX.values():
    for req in e.get("equip", []):
        for alt in req.split("|"):
            if alt not in EQUIP:
                err(f"exercise {e['id']}: unknown equipment '{alt}'")
for loc, kit in prog["kits"].items():
    for q in kit:
        if q not in EQUIP:
            err(f"kit {loc}: unknown equipment '{q}'")

SLOTS = prog["slots"]
for sid, s in SLOTS.items():
    for c in s["cands"]:
        if c not in EX:
            err(f"slot {sid}: unknown exercise '{c}'")
        elif "avoid" in EX[c].get("tags", []):
            err(f"slot {sid}: '{c}' is on the avoid list")

SESS = {s["id"]: s for s in prog["sessions"]}


def check_ref(where, item):
    if "slot" in item:
        if item["slot"] not in SLOTS:
            err(f"{where}: unknown slot '{item['slot']}'")
    elif "ex" in item:
        if item["ex"] not in EX:
            err(f"{where}: unknown exercise '{item['ex']}'")
    else:
        err(f"{where}: item has neither ex nor slot")
    if "alt" in item and item["alt"] not in EX:
        err(f"{where}: unknown alt '{item['alt']}'")


used_slots = set()
slot_users = {}  # slot -> session ids that use it (to know which ones swap out on flare days)
for s in prog["sessions"]:
    w = f"session {s['id']}"
    for k in ("name", "tags", "stat", "met", "est"):
        if k not in s:
            err(f"{w}: missing {k}")
    for k in ("alt",):
        if k in s and s[k] not in SESS:
            err(f"{w}: unknown {k} session '{s[k]}'")
    for why, target in (s.get("flare") or {}).items():
        if target not in SESS:
            err(f"{w}: unknown flare session '{target}'")
    if s.get("dynamic"):
        if s["dynamic"] not in ("pt", "holds", "mobility"):
            err(f"{w}: unknown dynamic '{s['dynamic']}'")
        continue
    if not s.get("blocks"):
        err(f"{w}: no blocks")
    for bi, b in enumerate(s.get("blocks", [])):
        bw = f"{w} block {bi + 1}"
        if b.get("type") not in BLOCKS:
            err(f"{bw}: bad type {b.get('type')}")
        if b.get("type") == "timer" and b.get("timer", {}).get("kind") not in TIMERS:
            err(f"{bw}: bad timer kind")
        for req in b.get("requires", []):
            for alt in req.split("|"):
                if alt not in EQUIP:
                    err(f"{bw}: requires unknown equipment '{alt}'")
        for it in b.get("items", []):
            check_ref(bw, it)
            if "slot" in it:
                used_slots.add(it["slot"])
                slot_users.setdefault(it["slot"], set()).add(s["id"])
            if b.get("type") == "flow" and not ("secs" in it or "reps" in it):
                err(f"{bw}: flow item {it} needs secs or reps")

for day, items in prog["isoRotation"].items():
    for it in items:
        check_ref(f"isoRotation[{day}]", it)
        used_slots.add(it.get("slot"))
        slot_users.setdefault(it.get("slot"), set()).add("holds")
for day, sid in prog["mobilityRotation"].items():
    if sid not in SESS:
        err(f"mobilityRotation[{day}]: unknown session {sid}")
for day, ids in prog["schedule"].items():
    for sid in ids:
        if sid not in SESS:
            err(f"schedule[{day}]: unknown session {sid}")
for it in prog["ptDefault"]:
    check_ref("ptDefault", it)
for t in prog["dailyTasks"]:
    if t.get("session") and t["session"] not in SESS:
        err(f"dailyTask {t['id']}: unknown session")
for a in prog["achievements"]:
    if not METRIC.match(a["metric"]):
        err(f"achievement {a['id']}: unknown metric '{a['metric']}'")
for q in prog["quests"]:
    for st in q["steps"]:
        if st.get("check"):
            continue
        if not METRIC.match(st.get("metric", "")):
            err(f"quest {q['id']}.{st['id']}: unknown metric '{st.get('metric')}'")
        if "gte" not in st and "gteSetting" not in st:
            err(f"quest {q['id']}.{st['id']}: needs gte or gteSetting")
for f in prog["foods"]:
    for k in ("id", "name", "p", "kcal"):
        if k not in f:
            err(f"food {f.get('id')}: missing {k}")
for t in prog["treatSizes"]:
    for k in ("id", "label", "pts", "kcal", "examples"):
        if k not in t:
            err(f"treat size {t.get('id')}: missing {k}")
ING = {i["id"]: i for i in prog["ingredients"]}
for i in prog["ingredients"]:
    for k in ("id", "name", "unit", "p", "kcal"):
        if k not in i:
            err(f"ingredient {i.get('id')}: missing {k}")
for m in prog["starterMeals"]:
    for it in m["items"]:
        if it["ing"] not in ING:
            err(f"starter meal {m['id']}: unknown ingredient {it['ing']}")


# ---- Resolver coverage: mirror of F.data.allowed() in js/data.js ----
def has_equip(e, kit):
    return all(any(a in kit for a in req.split("|")) for req in e.get("equip", []))


def allowed(e, kit, phase, knee_flare=0, back_flare=0):
    if e.get("phase", 1) > phase or e.get("gate"):
        return False
    if not has_equip(e, kit):
        return False
    if e.get("knee") == "avoid" or e.get("back") == "avoid":
        return False
    if knee_flare >= 2 and e.get("knee") != "ok":
        return False
    if back_flare >= 2 and e.get("back") != "ok":
        return False
    return True


kits = {k: set(v) for k, v in prog["kits"].items()}
kits["bare"] = {"wall", "box", "strap"}  # hotel room with nothing packed
scenarios = []
for phase in (1, 2, 3):
    for loc in ("home", "room", "gym", "hotelgym"):
        scenarios.append((f"{loc} p{phase}", kits[loc], phase, 0, 0))
scenarios += [("bare room p1", kits["bare"], 1, 0, 0), ("home knee-flare", kits["home"], 1, 2, 0), ("home back-flare", kits["home"], 1, 0, 2)]
def gym_only(sid):
    users = slot_users.get(sid, ())
    return bool(users) and all(SESS.get(u, {}).get("loc") == "gym" for u in users)


def swaps_out(sid, joint):
    """True when every session using this slot is replaced by a recovery session on a flare of `joint`."""
    return all(joint in (SESS[u].get("flare") or {}) for u in slot_users.get(sid, ()))


gym_scenarios = [(f"gym p{p}", kits["gym"], p, 0, 0) for p in (1, 2, 3)] + [("gym knee-flare", kits["gym"], 1, 2, 0), ("gym back-flare", kits["gym"], 1, 0, 2)]
for sid in sorted(used_slots):
    for name, kit, phase, kf, bf in (gym_scenarios if gym_only(sid) else scenarios):
        if (kf and swaps_out(sid, "knee")) or (bf and swaps_out(sid, "back")):
            continue
        if not any(allowed(EX[c], kit, phase, kf, bf) for c in SLOTS[sid]["cands"] if c in EX):
            (err if name in ("home p1", "room p1", "gym p1") else warn)(f"slot {sid}: nothing available for {name}")

print(f"{len(EX)} exercises, {len(SLOTS)} slots, {len(SESS)} sessions, {len(prog['achievements'])} achievements, {len(prog['quests'])} quests")
for w in warnings:
    print("warn:", w)
for e in errors:
    print("ERROR:", e)
print(f"{len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)
