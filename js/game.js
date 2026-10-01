/* The game layer: XP, levels, stats, streaks, weekly quests, achievements, epic quests, PRs.
   Everything is derived from the logs in F.store, so editing or deleting a log keeps the numbers honest. */
window.F = window.F || {};

F.game = (() => {
  const LB2KG = 0.45359237;
  const QSTAT = { lift: 'STR', krav: 'AGI', n4x4: 'END', z2: 'END', yoga: 'MOB', murph: 'END', fast: 'FUEL', pt: 'ARMOR', walk: 'END', holds: 'GRIT', protein: 'FUEL', sugar: 'FUEL' };
  const BIG4 = { back_squat: 'squat', front_squat: 'squat', bb_box_squat: 'squat', bb_bench: 'bench', conv_deadlift: 'deadlift', sumo_deadlift: 'deadlift', bb_ohp: 'ohp' };
  const COOKIE_KCAL = 150;

  // ---------- body numbers ----------
  function weightLb() {
    const S = F.store.load();
    for (let i = S.measurements.length - 1; i >= 0; i--) if (S.measurements[i].weight) return S.measurements[i].weight;
    return S.profile.weightLb || 180;
  }
  const kcal = (met, min) => Math.round((met || 4) * weightLb() * LB2KG * (min || 0) / 60);
  function age() { const y = F.store.load().profile.birthYear; return y ? new Date().getFullYear() - y : null; }
  function hrMax() { const S = F.store.load(); if (S.profile.hrMax) return S.profile.hrMax; const a = age(); return a ? Math.round(208 - 0.7 * a) : null; }
  function proteinTarget() { const S = F.store.load(); return S.settings.nutrition.protein || Math.round((weightLb() * 0.8) / 5) * 5; }
  // Treats are counted, not weighed: small ½, regular 1, big 2. Older logs carried sugar grams; map those to a size.
  function treatBudget() { const n = F.store.load().settings.nutrition; return n.treatsWeek ?? 5; }
  // Water: half your bodyweight in ounces is the usual starting point, kept between 64 and 120 oz. Stored in fl oz.
  function waterAuto() {
    const oz = Math.min(120, Math.max(64, Math.round((weightLb() * 0.5) / 8) * 8));
    return F.u.metric() ? (Math.round((oz * 29.5735) / 100) * 100) / 29.5735 : oz;   // a round number of ml in metric
  }
  function waterTarget() { const w = F.store.load().settings.nutrition.water; return w > 0 ? w : waterAuto(); }
  // Judged on the amounts as they're shown (0.1 oz or 1 ml), so a card that reads "96 / 96 oz" is always a tick.
  function waterMet(total, target = waterTarget()) { return F.u.vv(total || 0) >= F.u.vv(target); }
  function tpOf(it) {
    if (!it) return 0;
    if (it.tp !== undefined && it.tp !== null) return +it.tp || 0;
    const g = +it.sug || 0;
    if (!it.treat && g < 10) return 0;
    return g < 10 ? 0.5 : g < 25 ? 1 : 2;
  }
  function bmr() {
    const S = F.store.load(), p = S.profile, a = age();
    if (!p.heightIn || !a || !p.sex) return null;
    const kg = weightLb() * LB2KG, cm = p.heightIn * 2.54;
    return Math.round(10 * kg + 6.25 * cm - 5 * a + (p.sex === 'female' ? -161 : 5));
  }
  function suggestKcal() { const b = bmr(); return b ? Math.round((b * 1.45 - 300) / 50) * 50 : null; }
  const e1rm = (w, r) => (w && r ? w * (1 + Math.min(r, 15) / 30) : 0);
  // XP for a fast builds hour by hour after the first 12 (an ordinary night): 60 at 16 h, 150 at 24 h, 200 at 36 h,
  // and nothing extra beyond that. Ending early still earns the hours that were done.
  const FAST_XP = [[12, 0], [16, 60], [24, 150], [36, 200]];
  function fastXP(hrs) {
    if (!(hrs > FAST_XP[0][0])) return 0;
    for (let i = 1; i < FAST_XP.length; i++) {
      const [h0, x0] = FAST_XP[i - 1], [h1, x1] = FAST_XP[i];
      if (hrs <= h1) return Math.round(x0 + ((hrs - h0) / (h1 - h0)) * (x1 - x0));
    }
    return FAST_XP[FAST_XP.length - 1][1];
  }

  // ---------- levels ----------
  function titleFor(L) { let t = 'Recruit'; for (const [lv, name] of F.data.prog().titles) if (L >= lv) t = name; return t; }
  function levelInfo(xp) {
    const L = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1, cur = 100 * (L - 1) ** 2, next = 100 * L ** 2;
    return { level: L, xp, cur, next, into: xp - cur, need: next - cur, pct: (xp - cur) / (next - cur), title: titleFor(L) };
  }
  function statInfo(xp) {
    const L = Math.floor(Math.sqrt(Math.max(0, xp) / 30)) + 1, cur = 30 * (L - 1) ** 2, next = 30 * L ** 2;
    return { level: L, xp, pct: (xp - cur) / (next - cur), toNext: next - xp };
  }

  // ---------- per-session XP (stored on the session at save time) ----------
  function sessionXP(rec) {
    const tpl = F.data.session(rec.tpl);
    const met = rec.met || (tpl && tpl.met) || 4;
    let xp = Math.round((rec.minutes || 0) * met * 1.2);
    const split = {};
    let sets = 0;
    for (const en of rec.entries || []) {
      const e = F.data.ex(en.ex);
      const n = (en.sets || []).filter((z) => z.done).length;
      sets += n;
      if (e && n) split[e.stat] = (split[e.stat] || 0) + n;
    }
    xp += sets * 2 + (rec.rounds || 0) * 3 + (rec.prs || []).length * 25;
    if ((rec.tags || []).includes('recovery')) xp += 40;
    const main = rec.stat || (tpl && tpl.stat) || 'END';
    const tot = Object.values(split).reduce((a, b) => a + b, 0);
    const out = {};
    if (tot) { out[main] = 0.5; for (const [k, v] of Object.entries(split)) out[k] = (out[k] || 0) + (0.5 * v) / tot; }
    else out[main] = 1;
    return { xp: Math.max(5, xp), split: out };
  }

  // PRs versus everything logged before this session.
  function detectPRs(rec) {
    const T = compute().T;
    const prs = [];
    for (const en of rec.entries || []) {
      if (en.kind) continue; // list/flow/circuit entries aren't graded sets
      const e = F.data.ex(en.ex);
      const done = (en.sets || []).filter((z) => z.done);
      if (!e || !done.length) continue;
      if (e.log === 'wr') {
        const best = Math.max(...done.map((z) => e1rm(z.w, z.r))), prev = T.e1rm[e.id] || 0;
        const bw = Math.max(...done.map((z) => z.w || 0)), pw = T.maxW[e.id] || 0;
        if (prev && best > prev + 0.5) prs.push({ ex: e.id, kind: 'e1rm', value: Math.round(best), prev: Math.round(prev) });
        else if (pw && bw > pw) prs.push({ ex: e.id, kind: 'weight', value: bw, prev: pw });
      } else if (e.log === 'r') {
        const best = Math.max(...done.map((z) => z.r || 0)), prev = T.repsBest[e.id] || 0;
        if (prev && best > prev) prs.push({ ex: e.id, kind: 'reps', value: best, prev });
      } else if (e.log === 'h') {
        const best = Math.max(...done.map((z) => z.s || 0)), prev = T.holdBest[e.id] || 0;
        if (prev && best > prev) prs.push({ ex: e.id, kind: 'hold', value: best, prev });
      } else if (e.log === 'ws') {
        const best = Math.max(...done.map((z) => (z.w || 0) * (e.pair ? 2 : 1))), prev = T.carryMax[e.id] || 0;
        if (prev && best > prev) prs.push({ ex: e.id, kind: 'carry', value: best, prev });
      }
    }
    if (rec.tpl === 'cindy' && rec.rounds && T.cindyBest && rec.rounds > T.cindyBest) prs.push({ ex: 'cindy', kind: 'rounds', value: rec.rounds, prev: T.cindyBest });
    if (rec.tpl === 'murph_builder' && rec.rounds && T.murphRounds && rec.rounds > T.murphRounds) prs.push({ ex: 'murph_builder', kind: 'rounds', value: rec.rounds, prev: T.murphRounds });
    return prs;
  }
  function prText(p) {
    const e = F.data.ex(p.ex);
    const name = e ? e.name : p.ex === 'cindy' ? 'Cindy' : 'Murph builder';
    const f = { e1rm: (v) => 'est. 1RM ' + F.u.w(v), weight: (v) => F.u.w(v), reps: (v) => v + ' reps', hold: (v) => F.ui.mmss(v), carry: (v) => F.u.w(v), rounds: (v) => v + ' rounds' }[p.kind] || String;
    return { name, now: f(p.value), prev: f(p.prev) };
  }

  // ---------- fast days ----------
  // A day spent mostly fasting: a logged fast, or the running one through its target, covers 12 hours or more of it.
  // Quests marked fastOff (protein, food log) are off that day, and the week's protein-days target drops by one.
  function fastDay(date) {
    const S = F.store.load();
    const a = F.ui.parse(date).getTime(), b = F.ui.parse(F.ui.addDays(date, 1)).getTime();
    let ms = 0;
    const cover = (s, e) => { ms += Math.max(0, Math.min(e, b) - Math.max(s, a)); };
    for (const f of S.fasts) cover(f.start, f.end);
    if (S.activeFast) cover(S.activeFast.start, Math.max(Date.now(), S.activeFast.start + S.activeFast.targetH * 3.6e6));
    return ms >= 12 * 3.6e6;
  }
  const dailyTasksOn = (date) => { const fast = fastDay(date); return F.data.prog().dailyTasks.filter((t) => !(fast && t.fastOff)); };

  // ---------- daily tasks ----------
  function tasksDoneFor(date, d, S, proteinT, walkT, waterT) {
    const out = new Set();
    const cover = S.settings.formalPtCovers || {};
    for (const t of dailyTasksOn(date)) {
      if (t.kind === 'checkin') { if (S.days[date] && S.days[date].checkin) out.add(t.id); }
      else if (!d) continue;
      else if (t.kind === 'session') { if (t.tags.some((g) => d.tags.has(g)) || (cover[t.id] && d.tags.has('formalpt'))) out.add(t.id); }
      else if (t.kind === 'walk') { if (d.walkMin >= walkT) out.add(t.id); }
      else if (t.kind === 'protein') { if (d.protein >= proteinT) out.add(t.id); }
      else if (t.kind === 'food') { if (d.foodN > 0) out.add(t.id); }
      else if (t.kind === 'water') { if (waterMet(d.water, waterT)) out.add(t.id); }
    }
    return out;
  }

  // ---------- weekly quests ----------
  function weekQuotas(ws, days, S) {
    const P = F.data.prog(), today = F.ui.today();
    const dates = Array.from({ length: 7 }, (_, i) => F.ui.addDays(ws, i));
    const end = dates[6];
    const travelDays = dates.filter((d) => F.store.isTravel(d)).length;
    const fastDays = dates.filter((d) => fastDay(d)).length;
    const homeFrac = (7 - travelDays) / 7;
    const sess = S.sessions.filter((x) => x.date >= ws && x.date <= end);
    const proteinT = proteinTarget(), budget = treatBudget();
    const elapsed = dates.filter((d) => d <= today).length;
    const list = [];
    for (const q of P.quotas) {
      const o = (S.settings.quotas || {})[q.id] || {};
      const home = o.home ?? q.home, trav = o.travel ?? q.travel;
      let target = Math.round(home * homeFrac + trav * (1 - homeFrac));
      if (q.kind === 'protein') target = Math.max(0, target - fastDays);   // no protein target on a fast day
      let done = 0, extra = null;
      const tagged = (tag) => sess.filter((x) => (x.tags || []).includes(tag));
      if (q.kind === 'count') done = tagged(q.tag).filter((x) => !q.minMin || (x.minutes || 0) >= q.minMin).length;
      else if (q.kind === 'days') done = new Set(tagged(q.tag).map((x) => x.date)).size;
      else if (q.kind === 'minutes') done = tagged(q.tag).reduce((a, x) => a + (x.minutes || 0), 0);
      else if (q.kind === 'holdMin') done = Math.floor(dates.reduce((a, d) => a + ((days[d] && days[d].holdSec) || 0), 0) / 60);
      else if (q.kind === 'protein') done = dates.filter((d) => days[d] && days[d].protein >= proteinT).length;
      // a fast belongs to the week it started in, so a Saturday-night-to-Monday 36 h fast still counts
      else if (q.kind === 'fast') done = S.fasts.filter((f) => { const b = F.ui.ymd(new Date(f.start)); return b >= ws && b <= end && f.end - f.start >= 24 * 3.6e6; }).length;
      else if (q.kind === 'sugar') {
        const used = dates.reduce((a, d) => a + ((days[d] && days[d].treats) || 0), 0);
        const foodDays = dates.filter((d) => days[d] && days[d].foodN > 0).length;
        const enough = foodDays >= Math.min(4, Math.max(1, elapsed));
        extra = { used, budget, foodDays };
        done = used <= budget && enough ? 1 : 0;
      }
      list.push({ id: q.id, label: q.label, icon: q.icon, kind: q.kind, target, done, met: target > 0 && done >= target, extra, stat: QSTAT[q.id] });
    }
    const act = list.filter((q) => q.target > 0);
    return { ws, end, list, travelDays, fastDays, perfect: act.length > 0 && act.every((q) => q.met), realSessions: sess.filter((x) => !x.auto).length, closed: end < today };
  }

  // ---------- the big derivation ----------
  let cache = null, cacheRev = -1, cacheDay = '';
  function compute() {
    const S = F.store.load(), today = F.ui.today();
    if (cache && cacheRev === F.store.rev() && cacheDay === today) return cache;
    const P = F.data.prog();
    const statXP = Object.fromEntries(P.stats.map((x) => [x.id, 0]));
    const src = { sessions: 0, tasks: 0, weeks: 0, fasts: 0, measures: 0, ach: 0, quests: 0 };
    let total = 0;
    const days = {};
    const D = (d) => days[d] || (days[d] = { xp: 0, active: false, min: 0, kcal: 0, tags: new Set(), holdSec: 0, walkMin: 0, protein: 0, treats: 0, kcalIn: 0, foodN: 0, water: 0, sessions: 0 });
    const give = (d, xp, stat, kind) => {
      if (!xp) return;
      total += xp; src[kind] += xp;
      if (d) D(d).xp += xp;
      if (stat && stat in statXP) statXP[stat] += xp;
    };
    const T = { sessions: 0, realSessions: 0, minutes: 0, kcal: 0, volume: 0, holdSec: 0, bikeMi: 0, walkMi: 0, runMi: 0, prs: 0,
      tagCount: {}, tagDays: {}, longest: {}, countMin: {}, distBest: {}, holdBest: {}, repsBest: {}, e1rm: {}, maxW: {}, carries: {}, carryMax: {},
      cindyBest: 0, murphRounds: 0, murphRx: 0, big4: new Set(), countPhase: {}, fasts24: 0, fasts36: 0, fastHours: 0, waterOz: 0 };

    for (const s of S.sessions) {
      const d = D(s.date), tags = s.tags || [];
      d.active = true; d.sessions++; d.min += s.minutes || 0; d.kcal += s.kcal || 0;
      tags.forEach((t) => d.tags.add(t));
      if (s.act === 'pt_visit') d.tags.add('formalpt');
      T.sessions++; if (!s.auto) T.realSessions++;
      T.minutes += s.minutes || 0; T.kcal += s.kcal || 0; T.prs += (s.prs || []).length;
      for (const t of tags) {
        T.tagCount[t] = (T.tagCount[t] || 0) + 1;
        (T.tagDays[t] || (T.tagDays[t] = new Set())).add(s.date);
        T.longest[t] = Math.max(T.longest[t] || 0, s.minutes || 0);
        (T.countMin[t] || (T.countMin[t] = [])).push(s.minutes || 0);
      }
      if (tags.includes('lift')) T.countPhase[s.phase || 1] = (T.countPhase[s.phase || 1] || 0) + 1;
      if (tags.includes('walk')) d.walkMin += s.minutes || 0;
      if (s.dist) {
        const mode = s.mode || s.act || '';
        if (mode === 'bike') T.bikeMi += s.dist;
        else if (mode === 'run' || mode === 'walk_run') T.runMi += s.dist;
        else if (mode === 'walk' || mode === 'brisk_walk' || tags.includes('walk')) T.walkMi += s.dist;
        if (s.act) T.distBest[s.act] = Math.max(T.distBest[s.act] || 0, s.dist);
      }
      for (const en of s.entries || []) {
        if (en.kind) continue; // list/flow/circuit entries aren't graded sets
        const e = F.data.ex(en.ex);
        if (!e) continue;
        for (const z of en.sets || []) {
          if (!z.done) continue;
          if (e.log === 'wr') {
            if (z.w && z.r) {
              T.volume += z.w * z.r * (e.pair ? 2 : 1);
              T.e1rm[e.id] = Math.max(T.e1rm[e.id] || 0, e1rm(z.w, z.r));
              T.maxW[e.id] = Math.max(T.maxW[e.id] || 0, z.w);
              if (BIG4[e.id]) T.big4.add(BIG4[e.id]);
            }
            if (z.r) T.repsBest[e.id] = Math.max(T.repsBest[e.id] || 0, z.r);
          } else if (e.log === 'r') {
            if (z.r) T.repsBest[e.id] = Math.max(T.repsBest[e.id] || 0, z.r);
          } else if (e.log === 'h') {
            if (z.s) { const sec = z.s * (e.side ? 2 : 1); T.holdSec += sec; d.holdSec += sec; T.holdBest[e.id] = Math.max(T.holdBest[e.id] || 0, z.s); }
          } else if (e.log === 'ws') {
            if (z.w && z.s) { const w = z.w * (e.pair ? 2 : 1); (T.carries[e.id] || (T.carries[e.id] = [])).push({ w, s: z.s }); T.carryMax[e.id] = Math.max(T.carryMax[e.id] || 0, w); }
          }
        }
      }
      if (s.tpl === 'cindy' && s.rounds) T.cindyBest = Math.max(T.cindyBest, s.rounds);
      if (s.tpl === 'murph_builder' && s.rounds) T.murphRounds = Math.max(T.murphRounds, s.rounds);
      if (s.tpl === 'murph' && s.checks && s.checks.rx) T.murphRx = 1;
      const xp = s.xp || 0, split = s.split || { [s.stat || 'END']: 1 };
      total += xp; src.sessions += xp; d.xp += xp;
      for (const [k, f] of Object.entries(split)) if (k in statXP) statXP[k] += xp * f;
    }

    for (const [date, items] of Object.entries(S.food)) {
      const d = D(date);
      for (const it of items) { d.protein += +it.p || 0; d.treats += tpOf(it); d.kcalIn += +it.kcal || 0; d.foodN++; }
    }
    for (const [date, items] of Object.entries(S.water || {})) {
      const d = D(date);
      for (const it of items) { d.water += +it.oz || 0; T.waterOz += +it.oz || 0; }
    }
    for (const f of S.fasts) {
      const hrs = (f.end - f.start) / 3.6e6, date = F.ui.ymd(new Date(f.end));
      T.fastHours += hrs;
      if (hrs >= 36) T.fasts36++;
      if (hrs >= 24) T.fasts24++;
      give(date, fastXP(hrs), 'FUEL', 'fasts');
    }
    for (const m of S.measurements) give(m.date, 50, null, 'measures');

    const proteinT = proteinTarget(), walkT = S.settings.walkMin || 30, waterT = waterTarget();
    let proteinDays = 0, waterDays = 0;
    for (const date of new Set([...Object.keys(days), ...Object.keys(S.days)])) {
      if (date > today) continue;
      const done = tasksDoneFor(date, days[date], S, proteinT, walkT, waterT);
      D(date).tasks = done;
      for (const t of P.dailyTasks) if (done.has(t.id)) give(date, t.xp, t.stat, 'tasks');
      if (done.has('protein')) proteinDays++;
      if (done.has('water')) waterDays++;
    }

    // Streak: any logged session (PT counts) makes a day active. Every 7 active days banks a freeze (max 2);
    // a missed day spends one instead of breaking the streak.
    const activeDates = Object.keys(days).filter((d) => days[d].active && d <= today).sort();
    const streak = { current: 0, best: 0, freezes: 0, comebacks: 0, frozen: new Set(), activeToday: !!(days[today] && days[today].active) };
    if (activeDates.length) {
      let cur = 0, earn = 0, gap = 0, fr = 0;
      for (let d = activeDates[0]; d <= today; d = F.ui.addDays(d, 1)) {
        if (days[d] && days[d].active) {
          if (gap >= 4) streak.comebacks++;
          gap = 0; cur++; earn++;
          if (earn >= 7) { earn = 0; if (fr < 2) fr++; }
        } else if (d !== today) {
          gap++;
          if (fr > 0 && cur > 0) { fr--; streak.frozen.add(d); } else { cur = 0; earn = 0; }
        }
        streak.best = Math.max(streak.best, cur);
      }
      streak.current = cur; streak.freezes = fr;
    }

    let travelActiveDays = 0;
    for (const d of activeDates) if (F.store.isTravel(d)) travelActiveDays++;

    const weeks = {};
    let perfectWeeks = 0, sugarWeeks = 0, weeks3 = 0;
    const firstDates = [S.created, activeDates[0], Object.keys(S.food).sort()[0]].filter(Boolean).sort();
    const thisWS = F.ui.weekStart(today);
    for (let ws = F.ui.weekStart(firstDates[0] || today); ws <= thisWS; ws = F.ui.addDays(ws, 7)) {
      const W = weekQuotas(ws, days, S);
      weeks[ws] = W;
      const at = W.end < today ? W.end : today;
      for (const q of W.list) if (q.met && (q.kind !== 'sugar' || W.closed)) give(at, P.quotaXP, q.stat, 'weeks');
      if (W.closed && W.perfect) { perfectWeeks++; give(at, P.perfectXP, null, 'weeks'); }
      if (W.closed && (W.list.find((q) => q.id === 'sugar') || {}).met) sugarWeeks++;
      if (W.realSessions >= 3) weeks3++;
    }

    const stats = {};
    for (const st of P.stats) stats[st.id] = Object.assign({ id: st.id, name: st.name, icon: st.icon, color: st.color, desc: st.desc }, statInfo(statXP[st.id] || 0));
    const C = { src, statXP, stats, days, T, streak, weeks, thisWeek: weeks[thisWS], firstDay: firstDates[0] || today, proteinDays, waterDays, sugarWeeks, perfectWeeks, weeks3, travelActiveDays,
      minStatLevel: Math.min(...Object.values(stats).map((x) => x.level)) };
    C.metric = (name) => metric(name, C, S);

    C.achievements = P.achievements.map((a) => { const v = C.metric(a.metric); return Object.assign({}, a, { value: v, unlocked: v >= a.gte, pct: Math.max(0, Math.min(1, v / a.gte)) }); });
    for (const a of C.achievements) if (a.unlocked) give(null, a.xp, null, 'ach');
    C.quests = P.quests.filter((q) => S.settings.quests[q.id] !== false).map((q) => {
      const steps = q.steps.map((st) => {
        const key = q.id + '.' + st.id;
        const locked = !!st.phase && (S.settings.phase || 1) < st.phase;  // e.g. heavy carries wait for Phase 2
        let done, value = null, goal = null;
        if (st.check) done = !locked && !!S.checks[key];
        else {
          goal = st.gte ?? S.settings.goals[st.gteSetting];
          value = C.metric(st.metric);
          done = !locked && goal !== null && goal !== undefined && goal > 0 && value >= goal;
        }
        return Object.assign({}, st, { key, done, value, goal, locked });
      });
      const n = steps.filter((x) => x.done).length;
      return Object.assign({}, q, { steps, n, complete: n === steps.length, pct: n / steps.length });
    });
    for (const q of C.quests) for (const st of q.steps) if (st.done) give(null, st.xp, null, 'quests');

    C.total = total;
    C.level = levelInfo(total);
    cache = C; cacheRev = F.store.rev(); cacheDay = today;
    return C;
  }

  function metric(name, C, S) {
    const [k, a, b] = name.split(':');
    const T = C.T;
    const anyMax = (list, fn) => Math.max(0, ...list.split(',').map(fn));
    const arm = (m) => { const v = [m.sites && m.sites.bicepL, m.sites && m.sites.bicepR].filter((x) => x); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };
    switch (k) {
      case 'sessions': return T.realSessions;
      case 'ptDays': return T.tagDays.pt ? T.tagDays.pt.size : 0;
      case 'streakBest': return C.streak.best;
      case 'comebacks': return C.streak.comebacks;
      case 'volume': return T.volume;
      case 'holdMin': return T.holdSec / 60;
      case 'bikeMiles': return T.bikeMi;
      case 'walkMiles': return T.walkMi;
      case 'fasts24': return T.fasts24;
      case 'fasts36': return T.fasts36;
      case 'proteinDays': return C.proteinDays;
      case 'waterDays': return C.waterDays;
      case 'sugarWeeks': return C.sugarWeeks;
      case 'measures': return S.measurements.length;
      case 'perfectWeeks': return C.perfectWeeks;
      case 'travelActiveDays': return C.travelActiveDays;
      case 'prs': return T.prs;
      case 'cindyBest': return T.cindyBest;
      case 'murphRounds': return T.murphRounds;
      case 'murphRx': return T.murphRx;
      case 'minStatLevel': return C.minStatLevel;
      case 'big4Logged': return T.big4.size;
      case 'weeks3': return C.weeks3;
      case 'waistDrop': { const m = S.measurements.filter((x) => x.sites && x.sites.waist); return m.length >= 2 ? m[0].sites.waist - m[m.length - 1].sites.waist : 0; }
      case 'armGain': { const m = S.measurements.filter((x) => arm(x) !== null); return m.length >= 2 ? arm(m[m.length - 1]) - arm(m[0]) : 0; }
      case 'count': return T.tagCount[a] || 0;
      case 'countPhase': { let n = 0; for (const [p, v] of Object.entries(T.countPhase)) if (+p >= +b) n += v; return n; }
      case 'countMin': return (T.countMin[a] || []).filter((m) => m >= +b).length;
      case 'longest': return T.longest[a] || 0;
      case 'distBest': return T.distBest[a] || 0;
      case 'holdBest': return T.holdBest[a] || 0;
      case 'holdBestAny': return anyMax(a, (id) => T.holdBest[id] || 0);
      case 'repsBest': return T.repsBest[a] || 0;
      case 'e1rmBw': return (T.e1rm[a] || 0) / weightLb();
      case 'e1rmBwAny': return anyMax(a, (id) => T.e1rm[id] || 0) / weightLb();
      case 'carryPct': case 'carryPctAny': {
        const tgt = S.settings.goals.thresholdLb;
        if (!tgt) return 0;
        return (anyMax(a, (id) => Math.max(0, ...(T.carries[id] || []).filter((c) => c.s >= +b).map((c) => c.w))) / tgt) * 100;
      }
      case 'carryBw': return Math.max(0, ...(T.carries[a] || []).filter((c) => c.s >= +b).map((c) => c.w)) / weightLb();
      default: return 0;
    }
  }

  // Human-readable progress for an auto quest step / achievement.
  function metricText(name, value, goal) {
    const k = name.split(':')[0];
    if (/^hold/.test(k)) return `${F.ui.mmss(value)} / ${F.ui.mmss(goal)}`;
    if (/^e1rmBw|carryBw/.test(k)) return `${F.ui.num(value, 2)}× / ${goal}× BW`;
    if (/^carryPct/.test(k)) return `${F.ui.num(value)}% / ${goal}%`;
    if (k === 'volume') return `${F.ui.compact(value)} / ${F.ui.compact(goal)} lb`;
    if (k === 'waistDrop' || k === 'armGain') return `${F.u.lv(Math.max(0, value))} / ${F.u.lv(goal)} ${F.u.lu()}`;
    if (k === 'distBest' || /Miles$/.test(k)) return `${F.ui.num(F.u.dv(value), 1)} / ${F.ui.num(F.u.dv(goal), 1)} ${F.u.du()}`;
    if (k === 'longest') return `${Math.round(value)} / ${goal} min`;
    if (k === 'holdMin') return `${Math.floor(value)} / ${goal} min`;
    return `${F.ui.num(Math.min(value, goal))} / ${F.ui.num(goal)}`;
  }

  // ---------- celebrations after any change ----------
  function afterChange() {
    const S = F.store.load(), C = compute(), seen = S.seen, today = F.ui.today(), P = F.data.prog();
    seen.q = seen.q || {};
    if (!seen.init) {
      seen.init = true; seen.level = C.level.level;
      for (const a of C.achievements) if (a.unlocked) seen.ach[a.id] = today;
      for (const q of C.quests) for (const st of q.steps) if (st.done) seen.steps[st.key] = today;
      for (const [ws, W] of Object.entries(C.weeks)) { if (W.closed && W.perfect) seen.weeks[ws] = today; for (const q of W.list) if (q.met) seen.q[ws + ':' + q.id] = 1; }
      for (const st of Object.values(C.stats)) seen.stats[st.id] = st.level;
      F.store.save();
      return;
    }
    let dirty = false;
    if (C.level.level > (seen.level || 1)) {
      F.ui.celebrate({ icon: '⚡', eyebrow: 'Level up', title: `Level ${C.level.level}`, sub: C.level.level % 5 === 0 || C.level.title !== titleFor(seen.level || 1) ? `New title: ${C.level.title}` : `${F.ui.num(C.level.need - C.level.into)} XP to level ${C.level.level + 1}.` });
      seen.level = C.level.level; dirty = true;
    }
    for (const a of C.achievements) if (a.unlocked && !seen.ach[a.id]) {
      seen.ach[a.id] = today; dirty = true;
      F.ui.celebrate({ icon: a.icon, eyebrow: 'Achievement unlocked', title: a.name, sub: a.desc, xp: a.xp });
    }
    for (const q of C.quests) {
      const fresh = q.steps.filter((st) => st.done && !seen.steps[st.key]);
      if (!fresh.length) continue;
      fresh.forEach((st) => { seen.steps[st.key] = today; });
      dirty = true;
      if (q.complete) F.ui.celebrate({ icon: q.icon, eyebrow: 'Epic quest complete', title: q.name, sub: 'Every step done.', xp: fresh.reduce((a, st) => a + st.xp, 0) });
      else for (const st of fresh) F.ui.celebrate({ icon: q.icon, eyebrow: q.name + ' · step ' + (q.steps.indexOf(q.steps.find((x) => x.key === st.key)) + 1), title: st.label, xp: st.xp, quiet: true });
    }
    for (const [ws, W] of Object.entries(C.weeks)) {
      for (const q of W.list) if (q.met && (q.kind !== 'sugar' || W.closed) && !seen.q[ws + ':' + q.id]) {
        seen.q[ws + ':' + q.id] = 1; dirty = true;
        F.ui.toast(`${q.icon} Weekly quest done: ${q.label}  +${P.quotaXP} XP`, 2800);
      }
      if (W.closed && W.perfect && !seen.weeks[ws]) {
        seen.weeks[ws] = today; dirty = true;
        F.ui.celebrate({ icon: '🌟', eyebrow: 'Week of ' + F.ui.fmtDate(ws, { month: 'short', day: 'numeric' }), title: 'Perfect week', sub: 'Every weekly quest done.', xp: P.perfectXP });
      }
    }
    for (const st of Object.values(C.stats)) if ((seen.stats[st.id] || 1) < st.level) {
      if (seen.stats[st.id]) F.ui.toast(`${st.icon} ${st.name} → level ${st.level}`, 2600);
      seen.stats[st.id] = st.level; dirty = true;
    }
    if (dirty) F.store.save();
    if (F.app) F.app.chrome();
  }

  return { compute, afterChange, sessionXP, detectPRs, prText, weekQuotas, metricText, levelInfo, statInfo, titleFor,
    fastDay, dailyTasksOn, weightLb, kcal, age, hrMax, proteinTarget, treatBudget, waterTarget, waterAuto, waterMet, tpOf, bmr, suggestKcal, e1rm, fastXP, COOKIE_KCAL, QSTAT };
})();
