/* Program content: loading, exercise lookups, and turning session templates into today's concrete plan
   (slot resolution by equipment, phase, injuries and today's check-in; targets from your history). */
window.F = window.F || {};

F.data = (() => {
  const st = { ex: {}, exList: [], prog: null, sess: {} };

  async function load() {
    const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(u + ' → ' + r.status); return r.json(); });
    const [e, p] = await Promise.all([get('./data/exercises.json'), get('./data/program.json')]);
    st.exList = e.exercises;
    st.ex = Object.fromEntries(e.exercises.map((x) => [x.id, x]));
    st.prog = p;
    st.sess = Object.fromEntries(p.sessions.map((x) => [x.id, x]));
  }
  const ex = (id) => st.ex[id] || null;
  const exercises = () => st.exList;
  const prog = () => st.prog;
  const session = (id) => st.sess[id] || null;
  const sessions = () => st.prog.sessions;
  const stat = (id) => st.prog.stats.find((x) => x.id === id) || { id, name: id, icon: '•', color: 'var(--accent)' };
  const loc = (id) => st.prog.locations.find((x) => x.id === id) || st.prog.locations[0];
  const equipLabel = (id) => (st.prog.equipment.find((q) => q.id === id) || { label: id }).label;

  // ---------- context ----------
  function kit(locId) {
    const S = F.store.load();
    return new Set((S.equipment && S.equipment[locId]) || st.prog.kits[locId] || []);
  }
  function hasEquip(e, k) { return (e.equip || []).every((req) => req.split('|').some((a) => k.has(a))); }
  function missingEquip(e, k) { return (e.equip || []).filter((req) => !req.split('|').some((a) => k.has(a))).map((req) => req.split('|').map(equipLabel).join(' or ')); }

  function ctx(date = F.ui.today(), over = {}) {
    const S = F.store.load();
    const travel = F.store.isTravel(date);
    const l = over.loc || (travel ? S.settings.travelLoc : S.settings.location);
    const ci = F.store.checkin(date) || {};
    return {
      date, loc: l, travel, kit: kit(l), phase: S.settings.phase || 1,
      inj: S.profile.injuries || {}, focus: S.profile.focus || {},
      knee: over.knee ?? ci.knee ?? 0, back: over.back ?? ci.back ?? 0, energy: ci.energy ?? 1,
      prefs: S.settings.slotPrefs || {}, run: !!S.settings.runUnlocked,
    };
  }

  // Why an exercise can't be used right now (null = fine).
  function blocked(e, c) {
    if (!e) return 'unknown exercise';
    if ((e.phase || 1) > c.phase) return `unlocks in Phase ${e.phase}`;
    if (e.gate === 'run' && !c.run) return 'unlocks in the Run Again quest';
    if (!hasEquip(e, c.kit)) return 'needs ' + missingEquip(e, c.kit).join(', ');
    if (c.inj.knee && e.knee === 'avoid') return 'avoided for your knees';
    if (c.inj.lumbar && e.back === 'avoid') return 'avoided for your back';
    if (c.inj.shoulder && e.sh === 'avoid') return 'avoided for your shoulder';
    if (c.knee >= 2 && e.knee !== 'ok') return 'knees flared today';
    if (c.back >= 2 && e.back !== 'ok') return 'back flared today';
    return null;
  }
  const allowed = (e, c) => !blocked(e, c);
  function cautionScore(e, c) {
    let n = 0;
    if (c.knee >= 1 && e.knee === 'caution') n++;
    if (c.back >= 1 && e.back === 'caution') n++;
    return n;
  }
  function resolveSlot(slotId, c) {
    const slot = st.prog.slots[slotId];
    if (!slot) return { ex: null, alts: [] };
    let list = slot.cands.map(ex).filter((e) => e && allowed(e, c));
    if (c.knee >= 1 || c.back >= 1) list = list.map((e, i) => ({ e, i, k: cautionScore(e, c) })).sort((a, b) => a.k - b.k || a.i - b.i).map((o) => o.e);
    let pick = list[0] || null;
    const pref = list.find((e) => e.id === c.prefs[slotId]);
    if (pref && pick && cautionScore(pref, c) <= cautionScore(pick, c)) pick = pref;
    return { ex: pick, alts: list };
  }

  // ---------- history-driven targets ----------
  function lastEntry(exId, beforeDate, skipId) {
    const ss = F.store.load().sessions;
    for (let i = ss.length - 1; i >= 0; i--) {
      const s = ss[i];
      if (s.id === skipId || (beforeDate && s.date > beforeDate)) continue;
      const en = (s.entries || []).find((x) => x.ex === exId && !x.kind && (x.sets || []).some((z) => z.done));
      if (en) return { s, en, sets: en.sets.filter((z) => z.done) };
    }
    return null;
  }
  function lastSummary(e, date) {
    const L = lastEntry(e.id, date);
    if (!L) return null;
    const side = e.side ? '/side' : '';
    const parts = L.sets.map((z) => {
      if (e.log === 'wr') return (z.w ? F.u.wv(z.w) + '×' : '') + (z.r || 0);
      if (e.log === 'r') return String(z.r || 0);
      if (e.log === 'h') return F.ui.mmss(z.s || 0);
      if (e.log === 'ws') return (z.w ? F.u.wv(z.w) + F.u.wu() + ' ' : '') + (z.s || 0) + 's';
      return '';
    });
    return `${F.ui.fmtDate(L.s.date, { month: 'short', day: 'numeric' })}: ${parts.join(', ')}${e.log === 'wr' && L.sets.some((z) => z.w) ? ' ' + F.u.wu() : ''}${side}`;
  }
  function targetFor(e, it, date) {
    const L = lastEntry(e.id, date);
    const done = L ? L.sets : [];
    const t = { why: '' };
    const inc = e.inc || 5;
    if (e.log === 'wr') {
      const [lo, hi] = F.ui.range(it.reps, [8, 12]);
      t.lo = lo; t.hi = hi;
      if (done.length) {
        const w = Math.max(...done.map((z) => z.w || 0));
        const top = done.filter((z) => (z.w || 0) === w);
        if (w > 0 && top.every((z) => (z.r || 0) >= hi)) { t.w = w + inc; t.r = lo; t.why = `hit ${hi} every set → +${F.u.wv(inc)} ${F.u.wu()}`; }
        else { t.w = w || null; const best = Math.max(...top.map((z) => z.r || 0)); t.r = Math.min(hi, Math.max(lo, best + 1)); t.why = w ? 'same weight, one more rep' : 'beat last time by a rep'; }
      } else { t.w = null; t.r = lo; t.why = `first time: pick a weight you could lift about ${hi + 2} times`; }
    } else if (e.log === 'r') {
      const [lo, hi] = F.ui.range(it.reps, [8, 12]);
      t.lo = lo; t.hi = hi;
      if (done.length) { const best = Math.max(...done.map((z) => z.r || 0)); t.r = Math.max(lo, Math.min(best + 1, hi * 3)); t.why = best >= lo ? 'one more than your best' : ''; }
      else t.r = lo;
    } else if (e.log === 'h') {
      const [lo, hi] = F.ui.range(it.hold || it.reps, [20, 40]);
      t.lo = lo; t.hi = hi;
      if (done.length) { const best = Math.max(...done.map((z) => z.s || 0)); t.s = Math.max(lo, Math.round((best + 5) / 5) * 5); t.why = 'best + 5 s'; }
      else t.s = lo;
    } else if (e.log === 'ws') {
      const [lo, hi] = F.ui.range(it.secs, [30, 40]);
      t.lo = lo; t.hi = hi;
      if (done.length) {
        const w = Math.max(...done.map((z) => z.w || 0));
        const ok = done.filter((z) => z.w === w).every((z) => (z.s || 0) >= hi);
        t.w = ok && w ? w + inc : w || null; t.s = ok ? lo : hi; t.why = ok ? `held ${hi}s → go heavier` : 'same load, a bit longer';
      } else { t.w = null; t.s = lo; }
    }
    return t;
  }

  // ---------- plans ----------
  function ptItems() {
    const S = F.store.load();
    return (S.settings.ptRoutine && S.settings.ptRoutine.length ? S.settings.ptRoutine : st.prog.ptDefault).map((x) => ({ ex: x.ex, sets: x.sets, dose: x.reps }));
  }
  function templateFor(id, date) {
    const t = st.sess[id];
    if (!t) return null;
    if (t.dynamic === 'mobility') return st.sess[st.prog.mobilityRotation[String(F.ui.dow(date))]] || st.sess.mob_reset;
    if (t.dynamic === 'pt') return Object.assign({}, t, { blocks: [{ name: 'PT routine', type: 'list', core: true, items: ptItems() }] });
    if (t.dynamic === 'holds') {
      const rot = st.prog.isoRotation[String(F.ui.dow(date))] || [];
      return Object.assign({}, t, { blocks: [{ name: 'Holds', type: 'sets', core: true, items: rot.map((r) => ({ slot: r.slot, sets: r.sets, hold: r.hold, rest: 45 })) }] });
    }
    return t;
  }

  function buildPlan(id, date = F.ui.today(), over = {}) {
    const tpl = templateFor(id, date);
    if (!tpl) throw new Error('Unknown session ' + id);
    const c = ctx(date, over);
    const plan = {
      tpl: tpl.id, date, title: tpl.name, sub: tpl.sub, icon: tpl.icon, desc: tpl.desc || '', tags: tpl.tags.slice(), stat: tpl.stat,
      met: tpl.met, est: tpl.est, loc: c.loc, phase: c.phase, finishChecks: tpl.finishChecks || [], blocks: [],
    };
    const used = new Set(); // don't serve the same exercise twice in one session when a slot has other options
    for (const b of tpl.blocks) {
      if (b.onlyFocus && !c.focus[b.onlyFocus]) continue;
      const pb = { name: b.name, type: b.type, core: !!b.core, rounds: b.rounds || 0, rest: b.rest ?? 60, log: b.log || [], progress: !!b.progress, max: b.max || 0, items: [], done: false, vals: {} };
      if (b.timer) {
        pb.timer = Object.assign({}, b.timer);
        const main = b.items && b.items[0] && ex(b.items[0].ex);
        if (main && main.cat === 'cardio' && !allowed(main, c)) { pb.timer.noEquip = true; if (pb.timer.altLabel) pb.timer.label = pb.timer.altLabel; }
        pb.mode = main && main.cat === 'cardio' && !pb.timer.noEquip ? main.id : null;
      }
      for (const it of b.items || []) {
        if (it.onlyFocus && !c.focus[it.onlyFocus]) continue;
        let e = null, alts = [], why = null;
        if (it.slot) {
          const r = resolveSlot(it.slot, c);
          e = r.ex; alts = r.alts.map((a) => a.id);
          if (e && used.has(e.id) && b.type === 'sets') e = r.alts.find((a) => !used.has(a.id)) || e;
          if (!e) why = 'nothing available here for this slot';
        } else {
          e = ex(it.ex);
          why = blocked(e, c);
          if (why && it.alt && allowed(ex(it.alt), c)) { e = ex(it.alt); why = null; }
        }
        if (e && !why && b.type === 'sets') used.add(e.id);
        const pi = { ex: e ? e.id : it.ex || null, slot: it.slot || null, alts, why, dose: it.dose || it.reps || null, secs: it.secs || null, reps: it.reps || null, hold: it.hold || null, rest: it.rest ?? pb.rest, sets: [], done: false };
        if (pb.type === 'sets' && e && !why) {
          let n = it.sets || 3;
          if (it.focus && c.focus[it.focus]) n += 1;
          if (c.energy === 0 && n > 2 && !b.core) n -= 1;
          const t = targetFor(e, it, date);
          pi.target = t;
          pi.sets = Array.from({ length: n }, () => ({ w: t.w ?? null, r: t.r ?? null, s: t.s ?? null, done: false }));
          pi.last = lastSummary(e, date);
        }
        if (pb.type === 'list' && it.sets) pi.bubbles = Array.from({ length: it.sets }, () => false);
        if (pb.type === 'circuit' && e && why) { pi.why = why; }
        pb.items.push(pi);
      }
      if (pb.type === 'circuit') {
        const cap = b.maxByPhase && b.maxByPhase[String(c.phase)];
        if (cap) { pb.max = cap; pb.capped = true; }
        const last = pb.progress ? lastRounds(tpl.id, date) : 0;
        pb.lastRounds = last;
        pb.target = Math.min(pb.max || 99, last ? last + 1 : pb.rounds);
        pb.roundsDone = 0;
      }
      if (pb.type === 'timer' && pb.timer && pb.timer.kind === 'amrap') pb.vals.rounds = null;
      plan.blocks.push(pb);
    }
    return plan;
  }
  function lastRounds(tplId, date) {
    const ss = F.store.load().sessions;
    for (let i = ss.length - 1; i >= 0; i--) if (ss[i].tpl === tplId && ss[i].date <= date && ss[i].rounds) return ss[i].rounds;
    return 0;
  }

  // ---------- today's schedule ----------
  function reqOk(tpl, c) { return !tpl.requires || tpl.requires.every((req) => req.split('|').some((a) => c.kit.has(a))); }
  function resolveSession(id, c) {
    let tpl = st.sess[id];
    if (!tpl) return null;
    const notes = [];
    if (tpl.gate === 'run' && !c.run) { notes.push('Running unlocks in the Run Again quest — easy cardio instead.'); tpl = st.sess.z2; }
    if (!reqOk(tpl, c) && tpl.alt) { notes.push(`No cardio machine here — swapped to ${st.sess[tpl.alt].name}.`); tpl = st.sess[tpl.alt]; }
    let flare = null;
    const fl = tpl.flare || {};
    if (c.knee >= 2 && fl.knee) flare = { id: fl.knee, why: 'Knees flared' };
    else if (c.back >= 2 && fl.back) flare = { id: fl.back, why: 'Back flared' };
    return { id: tpl.id, tpl, notes, flare: flare ? Object.assign(flare, { tpl: st.sess[flare.id] }) : null, original: id };
  }
  function scheduled(date = F.ui.today()) {
    const S = F.store.load();
    const sched = S.settings.schedule || st.prog.schedule;
    let ids = (sched[String(F.ui.dow(date))] || []).slice();
    const bm = st.prog.benchmark;
    if (bm && F.ui.parse(date).getDate() <= 7) ids = ids.map((x) => (x === bm.replace ? bm.with : x));
    const c = ctx(date);
    return ids.map((x) => resolveSession(x, c)).filter(Boolean);
  }

  return { load, ex, exercises, prog, session, sessions, stat, loc, equipLabel, kit, hasEquip, missingEquip, ctx, blocked, allowed, resolveSlot,
    lastEntry, lastSummary, targetFor, templateFor, buildPlan, scheduled, resolveSession, reqOk };
})();
