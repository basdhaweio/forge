/* Session player: start/resume, guided logging for every block type, finish sheet, and the XP summary. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, mmss, pill } = F.ui;
  const LONG = { weekday: 'long', month: 'long', day: 'numeric' };
  const SHORT = { weekday: 'short', month: 'short', day: 'numeric' };

  // ---------- shared bits ----------
  F.flagsRow = (e) => {
    if (!e) return null;
    const inj = F.store.load().profile.injuries || {};
    const out = h('div', { class: 'exflags' });
    const add = (on, v, label) => { if (on && v && v !== 'ok') out.append(h('span', { class: 'flag ' + v, text: (v === 'avoid' ? '✕ ' : '⚠ ') + label })); };
    add(inj.knee, e.knee, 'knee'); add(inj.lumbar, e.back, 'back'); add(inj.shoulder, e.sh, 'shoulder');
    return out.childNodes.length ? out : null;
  };
  const doseText = (e, it) => {
    const side = e.side ? ' / side' : '';
    if (e.log === 'h') return `${it.hold || it.reps || '20-40'} s hold${side}`;
    if (e.log === 'ws') return `${it.target ? it.target.lo + '–' + it.target.hi : '30-40'} s carry${side}`;
    return `${it.reps || '8-12'} reps${side}`;
  };
  const targetText = (e, t) => {
    if (!t) return '';
    if (e.log === 'wr') return (t.w ? F.u.wv(t.w) + ' ' + F.u.wu() + (e.pair ? ' each' : '') + ' × ' : '') + t.r;
    if (e.log === 'r') return t.r + ' reps' + (e.side ? '/side' : '');
    if (e.log === 'h') return mmss(t.s) + (e.side ? '/side' : '');
    if (e.log === 'ws') return (t.w ? F.u.wv(t.w) + ' ' + F.u.wu() + (e.pair ? ' each' : '') + ' for ' : '') + t.s + ' s';
    return '';
  };

  // ---------- session clock: wall time minus pauses ----------
  // A.pausedAt is set while paused; A.pausedMs holds earlier pauses; A.lastAct is the last time anything was logged.
  F.activeMs = (A) => Math.max(0, (A.pausedAt || Date.now()) - A.start - (A.pausedMs || 0));
  const pauseClock = (A) => { if (!A.pausedAt) A.pausedAt = Date.now(); };
  const resumeClock = (A) => { if (A.pausedAt) { A.pausedMs = (A.pausedMs || 0) + (Date.now() - A.pausedAt); A.pausedAt = null; } };
  function restartClock(A) { A.start = Date.now(); A.pausedMs = 0; A.pausedAt = null; A.lastAct = Date.now(); A.fresh = false; if (!A.backfill) A.plan.date = F.ui.today(); }
  // A new session waits with its clock stopped (fresh) until the first thing is logged, so opening one to read costs nothing.
  const newActive = (src, plan, extra) => Object.assign({ src, plan, start: Date.now(), express: false, lastAct: Date.now(), pausedMs: 0, pausedAt: Date.now(), fresh: true }, extra);
  // Has anything been ticked or logged in this session?
  F.activeProgress = (A) => !!A && A.plan.blocks.some((pb) => (pb.type === 'sets' && pb.items.some((it) => it.sets.some((z) => z.done)))
    || ((pb.type === 'list' || pb.type === 'flow') && pb.items.some((it) => it.done || (it.bubbles && it.bubbles.some(Boolean))))
    || (pb.type === 'circuit' && pb.roundsDone) || (pb.type === 'timer' && pb.done));

  // ---------- start / preview ----------
  // A past date starts the session as a backfill: the same plan, filled in afterwards, with no clock or timers.
  F.startSession = async (id, { date, loc } = {}) => {
    const S = F.store.load();
    date = date || F.ui.today();
    const backfill = date < F.ui.today();
    if (S.active && S.active.fresh && !F.activeProgress(S.active) && !(S.active.src === id && S.active.plan.date === date)) S.active = null;   // only opened to read
    if (S.active) {
      if (S.active.src === id && S.active.plan.date === date) {
        // Reopened from that day's page once the day has passed: finish it as a fill-in, so it stays on that day.
        if (backfill && !S.active.backfill) { S.active.backfill = true; F.timer.stopRest(); F.store.saveNow(); }
        location.hash = '#/play'; return;
      }
      const ok = await confirmDlg(`${S.active.plan.title} is still in progress.`, { ok: 'Discard it and start', danger: true, sub: 'Or cancel and resume it from Today.' });
      if (!ok) { location.hash = '#/play'; return; }
    }
    try {
      S.active = newActive(id, F.data.buildPlan(id, date, { loc }), { backfill });
    } catch (e) { toast(e.message, 3000); return; }
    F.store.saveNow();
    location.hash = '#/play';
  };

  F.previewSession = (id, { date } = {}) => {
    date = date || F.ui.today();
    const past = date < F.ui.today();
    let plan;
    try { plan = F.data.buildPlan(id, date); } catch (e) { toast(e.message); return; }
    const body = h('div');
    body.append(h('div', { class: 'eyebrow', text: (past ? '📅 ' + F.ui.fmtDate(date, SHORT) + ' · ' : '') + F.data.loc(plan.loc).icon + ' ' + F.data.loc(plan.loc).label + ' · ~' + plan.est + ' min' }),
      h('h2', { text: plan.icon + ' ' + plan.title }), h('p', { class: 'muted small', text: plan.sub }),
      plan.desc ? h('p', { class: 'small mt-s', text: plan.desc }) : null);
    for (const b of plan.blocks) {
      const names = b.items.map((it) => { const e = F.data.ex(it.ex); return e ? (it.why ? `(${e.name} — ${it.why})` : e.name + (it.sets && it.sets.length ? ` ${it.sets.length}×` : '')) : null; }).filter(Boolean);
      body.append(h('div', { class: 'mt' }, h('div', { class: 'eyebrow', text: b.name + (b.core ? '' : ' · optional') }), h('div', { class: 'small', text: b.timer ? (b.timer.label || b.timer.workLabel || '') + (names.length ? ' — ' + names.join(', ') : '') : names.join(' · ') })));
    }
    const sh = sheet(h('div', null, body, h('div', { class: 'btngroup mt' },
      h('button', { class: 'btn fire big', onClick: () => { sh.close(); F.startSession(id, { date }); } }, icon(past ? 'edit' : 'play', 16), past ? 'Fill in what I did' : 'Start'),
      h('button', { class: 'btn', onClick: () => { sh.close(); F.logDoneSheet(id, date); } }, icon('check', 15), past ? 'Just mark it done' : 'Already did it'),
      h('button', { class: 'btn ghost', text: 'Close', onClick: () => sh.close() }))));
  };

  // Did it without the app, or forgot to log it: record the session with its minutes only.
  F.logDoneSheet = (id, date) => {
    const today = F.ui.today();
    date = date || today;
    let plan;
    try { plan = F.data.buildPlan(id, date); } catch (e) { toast(e.message); return; }
    const minIn = F.ui.numIn(plan.est || 30, { step: 1 });
    const notes = h('textarea', { placeholder: 'Notes (optional)', style: { minHeight: '50px' } });
    const sh = sheet(h('div', { class: 'stack' },
      h('div', null, h('div', { class: 'eyebrow', text: date === today ? 'Today' : F.ui.fmtDate(date, LONG) + ' · ' + F.ui.relDay(date) }), h('h2', { text: `${plan.icon} ${plan.title} — done` })),
      h('p', { class: 'small muted', text: `Logs it with the minutes only. It counts for XP, your streak and the weekly quests. To record sets, weights or times, use “${date === today ? 'Start' : 'Fill in what I did'}” instead.` }),
      h('label', { class: 'field' }, h('span', { text: 'Minutes' }), minIn), notes,
      h('button', { class: 'btn fire big block', onClick: () => {
        const S = F.store.load();
        const minutes = Math.max(1, Math.round(+minIn.value || plan.est || 30));
        const rec = { date, tpl: plan.tpl, src: id, title: plan.title, icon: plan.icon, tags: plan.tags, stat: plan.stat, met: plan.met, phase: plan.phase, loc: plan.loc,
          minutes, kcal: F.game.kcal(plan.met, minutes), entries: [], prs: [], notes: notes.value.trim(), quick: true };
        const x = F.game.sessionXP(rec);
        rec.xp = x.xp; rec.split = x.split;
        F.store.addSession(rec);
        if (S.active && S.active.src === id && S.active.plan.date === date && !F.activeProgress(S.active)) { S.active = null; F.timer.stopRest(); F.store.save(); }
        sh.close();
        F.ui.xpFloat(rec.xp, F.data.stat(plan.stat).icon);
        F.timer.sfx('pop');
        toast(`${plan.title} logged · ${F.ui.dur(minutes)}`, 2600, { label: 'Undo', run: () => { F.store.removeSession(rec.id); F.app.render(); } });
        F.game.afterChange();
        F.app.render();
      } }, icon('check', 18), 'Log it')));
  };

  // ---------- player ----------
  F.views.play = () => {
    const S = F.store.load();
    const A = S.active;
    if (!A) return h('div', { class: 'empty' }, 'No session in progress. ', h('a', { href: '#/', text: 'Back to Today' }));
    // Opened on an earlier day and never started: just plan it for today.
    if (A.fresh && !A.backfill && A.plan.date !== F.ui.today() && !F.activeProgress(A)) { A.plan = F.data.buildPlan(A.src, F.ui.today()); A.start = A.pausedAt = Date.now(); A.pausedMs = 0; F.store.save(); }
    const plan = A.plan;
    const persist = () => F.store.save();
    // Any logging action counts as activity, and un-pauses a paused clock.
    const save = () => {
      A.lastAct = Date.now();
      if (A.pausedAt) { resumeClock(A); paintClock(); if (!A.fresh) toast('Timer resumed', 1400); }
      A.fresh = false;
      F.store.save();
    };
    // Starting a timer, a guided flow or a hold starts the session clock too.
    const begin = () => { if (A.fresh || A.pausedAt) save(); };
    const wrap = h('div', { class: 'player' });
    const clockTxt = h('span', { class: 'clock' });
    const clockIco = h('span', { class: 'ci' });
    const clockBtn = h('button', { class: 'clockbtn', onClick: () => { if (A.pausedAt) resumeClock(A); else pauseClock(A); A.fresh = false; persist(); paintClock(); } }, clockIco, clockTxt);
    let shownState = null;
    function paintClock() {
      const s = F.activeMs(A) / 1000;
      clockTxt.textContent = s >= 3600 ? F.ui.hms(s) : mmss(s);
      const state = A.fresh ? 'ready' : A.pausedAt ? 'paused' : 'running';
      if (state !== shownState) {
        shownState = state;
        clockIco.replaceChildren(icon(state === 'running' ? 'pause' : 'play', 14));
        clockBtn.classList.toggle('paused', state !== 'running');
        clockBtn.classList.toggle('ready', state === 'ready');
        const tip = { ready: 'Not started — starts when you log something, or tap to start it now', paused: 'Paused — tap to resume', running: 'Tap to pause' }[state];
        clockBtn.setAttribute('aria-label', tip);
        clockBtn.title = tip;
      }
    }
    const bf = !!A.backfill;   // filling in a past day: no clock, no timers
    const home = bf ? '#/day/' + plan.date : '#/';
    let iv = null;
    if (!bf) { paintClock(); iv = setInterval(paintClock, 1000); }
    // Opened just to read (nothing logged, clock never started)? Leaving lets it go, so it doesn't sit on Today.
    wrap._cleanup = () => {
      if (iv) clearInterval(iv);
      const S2 = F.store.load();
      if (location.hash !== '#/play' && S2.active === A && A.fresh && !F.activeProgress(A)) { S2.active = null; F.timer.stopRest(); F.store.save(); }
    };
    const L = F.data.loc(plan.loc);
    wrap.append(h('div', { class: 'player-head' },
      h('a', { class: 'iconbtn', href: home, 'aria-label': bf ? 'Back to that day (this stays open)' : 'Back to Today (session stays open)' }, icon('back')),
      h('div', { class: 't' }, h('b', { text: plan.icon + ' ' + plan.title }), h('small', { class: 'muted', text: `${L.icon} ${L.label} · Phase ${plan.phase}` })),
      bf ? pill('📅 ' + F.ui.fmtDate(plan.date, SHORT), 'sky') : clockBtn,
      h('button', { class: 'iconbtn', 'aria-label': bf ? 'Start over or discard' : 'Restart, start over or discard', title: bf ? 'Start over or discard' : 'Restart, start over or discard', onClick: () => sessionMenu(false) }, icon(bf ? 'trash' : 'restart', 19)),
      h('button', { class: 'btn sm primary', text: bf ? 'Save' : 'Finish', onClick: () => finish() })));

    // Restart the clock, start over, or throw the session away. Also shown when a session was left open for a while.
    function sessionMenu(stale) {
      const onClock = F.ui.dur(F.activeMs(A) / 60000);
      const since = plan.date !== F.ui.today() ? ` — opened ${F.ui.relDay(plan.date)}` : '';
      const ticked = F.activeProgress(A);
      const sh = bf ? sheet(h('div', { class: 'stack' },
        h('h2', { text: 'Logging for ' + F.ui.fmtDate(plan.date, LONG) }),
        h('p', { class: 'small muted', text: 'Nothing is saved until you press Save.' }),
        ticked ? h('button', { class: 'btn block', onClick: startOver }, 'Start over — clear what’s ticked') : null,
        h('button', { class: 'btn danger block', onClick: discard }, icon('trash', 16), 'Discard this session')))
      : sheet(h('div', { class: 'stack' },
        h('h2', { text: stale ? `Still doing ${plan.title}?` : 'Session timer' }),
        h('p', { class: 'small muted', text: stale
          ? `It’s been open with nothing logged for a while (${onClock} on the clock${since}). Restart the clock so the minutes come out right.`
          : `${onClock} on the clock${A.pausedAt ? ', paused' : ''}.` }),
        h('button', { class: 'btn primary block', onClick: () => { restartClock(A); persist(); sh.close(); paintClock(); toast('Clock restarted', 1600); } }, icon('restart', 16), ticked ? 'Restart the clock (keep what’s ticked)' : 'Restart the clock'),
        ticked ? h('button', { class: 'btn block', onClick: startOver }, 'Start over — clear what’s ticked') : null,
        stale
          ? h('button', { class: 'btn block', text: 'Keep the time', onClick: () => { A.lastAct = Date.now(); persist(); sh.close(); } })
          : h('button', { class: 'btn block', onClick: () => { if (A.pausedAt) resumeClock(A); else pauseClock(A); persist(); sh.close(); paintClock(); } }, icon(A.pausedAt ? 'play' : 'pause', 16), A.pausedAt ? 'Resume the clock' : 'Pause the clock'),
        h('button', { class: 'btn danger block', onClick: discard }, icon('trash', 16), 'Discard this session')));
      async function startOver() {
        sh.close();
        if (!(await confirmDlg('Clear everything ticked and start fresh?', { ok: 'Start over', danger: true }))) return;
        F.store.load().active = newActive(A.src, F.data.buildPlan(A.src, bf ? plan.date : F.ui.today()), { express: A.express, backfill: bf });
        F.timer.stopRest(); F.store.saveNow(); F.app.render();
      }
      async function discard() {
        sh.close();
        if (!(await confirmDlg(`Discard ${plan.title}?`, { ok: 'Discard', danger: true, sub: 'Nothing from it gets logged.' }))) return;
        F.store.load().active = null; F.timer.stopRest(); F.store.saveNow(); location.hash = home;
      }
    }
    // Left open for an hour with nothing logged (or since another day)? Ask before the clock inflates the minutes.
    const idleMin = (Date.now() - (A.lastAct || A.start)) / 60000;
    if (!bf && (plan.date !== F.ui.today() || (!A.pausedAt && idleMin > 60))) setTimeout(() => { if (F.store.load().active === A && !document.querySelector('.sheet-back')) sessionMenu(true); }, 300);
    if (bf) wrap.append(h('div', { class: 'callout sky mb small', text: `📅 Logging for ${F.ui.fmtDate(plan.date, LONG)}. Tick what you did and fill in the numbers — nothing is timed, and you set the minutes when you save.` }));
    else if (plan.desc) wrap.append(h('div', { class: 'callout mb small', text: plan.desc }));
    const ci = F.store.checkin(plan.date) || {};
    if (ci.knee >= 1 || ci.back >= 1) wrap.append(h('div', { class: 'callout amber mb small', text: `Adjusted for ${bf ? 'that day’s' : "today's"} check-in (${[ci.knee >= 1 ? 'knees' : '', ci.back >= 1 ? 'back' : ''].filter(Boolean).join(' & ')}): gentler options are picked first. Stop anything sharp.` }));
    if (plan.blocks.some((b) => !b.core)) {
      const cb = h('input', { type: 'checkbox', checked: A.express });
      cb.addEventListener('change', () => { A.express = cb.checked; save(); renderBlocks(); });
      wrap.append(h('label', { class: 'toggle' }, cb, 'Short on time — main blocks only (still full credit)'));
    }
    const blocksEl = h('div');
    wrap.append(blocksEl);
    // Add anything else as you go: tap an exercise and it joins the session with three sets.
    const addEl = h('div');
    function addExercise(e) {
      let pb = plan.blocks.find((b) => b.added);
      if (!pb) { pb = { name: 'Added', type: 'sets', core: true, rounds: 0, rest: 60, log: [], progress: false, max: 0, items: [], done: false, vals: {}, added: true }; plan.blocks.push(pb); }
      const it = { ex: e.id, slot: null, alts: [], why: null, dose: null, secs: e.log === 'ws' ? '30-40' : null, reps: e.log === 'h' || e.log === 'ws' ? null : '8-12', hold: e.log === 'h' ? '20-40' : null, rest: 60, sets: [], done: false };
      const t = F.data.targetFor(e, it, plan.date);
      it.target = t; it.last = F.data.lastSummary(e, plan.date);
      it.sets = Array.from({ length: 3 }, () => ({ w: t.w ?? null, r: t.r ?? null, s: t.s ?? null, done: false }));
      pb.items.push(it);
      F.store.save();
      renderBlocks(); drawAdd();
      const cards = blockEls[plan.blocks.indexOf(pb)].querySelectorAll('.excard');
      if (cards.length) cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function drawAdd() {
      const have = new Set(plan.blocks.flatMap((b) => b.items.map((it) => it.ex)));
      const picks = F.quickPicks(plan.date, { exclude: have }).slice(0, 8);
      addEl.innerHTML = '';
      addEl.append(h('div', { class: 'section-title' }, h('h2', { text: 'Add an exercise' }), h('span', { class: 'small muted', text: 'tap to add 3 sets' })),
        h('div', { class: 'chips' }, picks.map((e) => h('button', { class: 'chip', text: e.name, onClick: () => addExercise(e) })),
          h('button', { class: 'chip', onClick: () => F.exercisePicker({ date: plan.date, title: 'Add an exercise', onPick: addExercise }) }, 'More…')));
    }
    wrap.append(addEl);
    wrap.append(h('div', { class: 'mt', style: { marginTop: '22px' } }, h('button', { class: 'btn fire big block', onClick: () => finish() }, icon('check', 18), bf ? 'Save session' : 'Finish session')));

    const blockEls = [];
    function renderBlocks() {
      blocksEl.innerHTML = '';
      plan.blocks.forEach((pb, bi) => {
        const el = h('div', { class: 'block' });
        blockEls[bi] = el;
        if (A.express && !pb.core) el.hidden = true;
        blocksEl.append(el);
        refresh(bi);
      });
    }
    function refresh(bi) {
      const pb = plan.blocks[bi], el = blockEls[bi];
      el.innerHTML = '';
      el.append(h('div', { class: 'block-head' }, h('h3', { text: pb.name }), pb.core ? null : pill('optional'), blockStatus(pb)));
      if (pb.type === 'list') el.append(listBlock(pb, bi));
      else if (pb.type === 'sets') pb.items.forEach((it) => el.append(exCard(pb, bi, it)));
      else if (pb.type === 'flow') el.append(flowBlock(pb, bi));
      else if (pb.type === 'timer') el.append(timerBlock(pb, bi));
      else if (pb.type === 'circuit') el.append(circuitBlock(pb, bi));
    }
    function blockStatus(pb) {
      let done = 0, total = 0;
      if (pb.type === 'sets') for (const it of pb.items) { if (it.why) continue; total += it.sets.length; done += it.sets.filter((z) => z.done).length; }
      else if (pb.type === 'list' || pb.type === 'flow') for (const it of pb.items) { if (it.why) continue; total++; if (it.done) done++; }
      else if (pb.type === 'circuit') { total = pb.target; done = pb.roundsDone; }
      else if (pb.type === 'timer') { total = 1; done = pb.done ? 1 : 0; }
      if (!total) return null;
      return pill(`${done}/${total}`, done >= total ? 'green' : '');
    }

    // --- list (warm-ups, PT) ---
    function listBlock(pb, bi) {
      const card = h('div', { class: 'card tight' });
      for (const it of pb.items) {
        const e = F.data.ex(it.ex);
        const row = h('div', { class: 'listrow' + (it.why ? ' off' : '') });
        row.append(h('div', { class: 't' }, h('b', { text: e ? e.name : it.ex, onClick: () => e && F.exSheet(e.id) }), h('small', { text: it.why ? 'Skipped — ' + it.why : it.dose || '' })));
        if (!it.why) {
          if (it.bubbles) {
            const bw = h('div', { class: 'bubbles' });
            it.bubbles.forEach((on, k) => bw.append(h('button', { class: 'bubble' + (on ? ' on' : ''), text: String(k + 1), 'aria-label': 'Set ' + (k + 1), onClick: () => {
              it.bubbles[k] = !it.bubbles[k]; it.done = it.bubbles.every(Boolean);
              if (it.bubbles[k]) { F.timer.sfx('pop'); F.ui.vibrate(15); }
              save(); refresh(bi);
            } })));
            row.append(bw);
          } else row.append(h('button', { class: 'tick sm' + (it.done ? ' on' : ''), 'aria-label': 'Done', onClick: () => { it.done = !it.done; if (it.done) F.timer.sfx('pop'); save(); refresh(bi); } }, icon('check', 15)));
        }
        card.append(row);
      }
      if (pb.items.some((it) => !it.why && !it.done)) card.append(h('button', { class: 'btn xs ghost mt-s', onClick: () => { for (const it of pb.items) if (!it.why) { it.done = true; if (it.bubbles) it.bubbles = it.bubbles.map(() => true); } F.timer.sfx('pop'); save(); refresh(bi); } }, icon('check', 14), 'Mark all done'));
      return card;
    }

    // --- sets (strength, holds, carries) ---
    function exCard(pb, bi, it) {
      const e = F.data.ex(it.ex);
      const slotName = it.slot ? (F.data.prog().slots[it.slot] || {}).name : '';
      const card = h('div', { class: 'excard' + (it.sets.length && it.sets.every((z) => z.done) ? ' alldone' : '') });
      if (!e || it.why) {
        card.append(h('div', { class: 'exhead' }, h('div', { class: 't' }, h('div', { class: 'name', text: e ? e.name : slotName || 'Exercise' }), h('div', { class: 'meta', text: 'Skipped — ' + (it.why || 'not available') }))));
        return card;
      }
      card.append(h('div', { class: 'exhead' },
        h('div', { class: 't' }, h('div', { class: 'name', text: e.name, onClick: () => F.exSheet(e.id) }), h('div', { class: 'meta', text: `${it.sets.length} × ${doseText(e, it)}${slotName ? ' · ' + slotName : ''}` }), F.flagsRow(e)),
        it.alts && it.alts.length > 1 ? h('button', { class: 'btn xs', onClick: () => swap(bi, it) }, icon('swap', 14), 'Swap') : null));
      const tgt = targetText(e, it.target);
      card.append(h('div', { class: 'target' }, it.last ? h('span', null, 'Last ' + it.last + '  →  ') : null, h('span', null, bf ? 'Target ' : 'Today ', h('b', { text: tgt })), it.target && it.target.why ? h('span', { text: ' · ' + it.target.why }) : null));
      const setsEl = h('div', { class: 'sets' });
      it.sets.forEach((z, k) => setsEl.append(setRow(e, it, z, k, bi)));
      setsEl.append(h('div', { class: 'row' }, h('button', { class: 'btn xs ghost', onClick: () => { const l = it.sets[it.sets.length - 1] || {}; it.sets.push({ w: l.w ?? null, r: l.r ?? null, s: l.s ?? null, done: false }); save(); refresh(bi); } }, icon('plus', 14), 'Set'),
        it.sets.length > 1 && !it.sets[it.sets.length - 1].done ? h('button', { class: 'btn xs ghost', onClick: () => { it.sets.pop(); save(); refresh(bi); } }, icon('minus', 14), 'Set') : null));
      card.append(setsEl);
      return card;
    }
    function bestHold(id) { return F.game.compute().T.holdBest[id] || 0; }
    function setRow(e, it, z, k, bi) {
      const row = h('div', { class: 'setrow' + (z.done ? ' done' : '') });
      const ins = h('div', { class: 'ins' });
      if (e.log === 'wr' || e.log === 'ws') ins.append(F.ui.numIn(F.u.wv(z.w), { placeholder: F.u.wu(), onInput: (v) => { z.w = F.u.wIn(v); save(); } }), h('span', { class: 'u', text: F.u.wu() + (e.pair ? ' ea' : '') }));
      if (e.log === 'wr') ins.append(h('span', { class: 'u', text: '×' }));
      if (e.log === 'wr' || e.log === 'r') ins.append(F.ui.numIn(z.r, { placeholder: 'reps', step: 1, onInput: (v) => { z.r = v; save(); } }), e.log === 'r' ? h('span', { class: 'u', text: 'reps' + (e.side ? '/side' : '') }) : null);
      if (e.log === 'ws') ins.append(h('span', { class: 'u', text: '×' }), F.ui.numIn(z.s, { placeholder: 's', step: 1, onInput: (v) => { z.s = v; save(); } }), h('span', { class: 'u', text: 's' }));
      if (e.log === 'h') {
        if (bf) ins.append(F.ui.numIn(z.s, { placeholder: 's', step: 1, onInput: (v) => { z.s = v; save(); } }), h('span', { class: 'u', text: 's' + (e.side ? ' / side' : '') }));
        else if (z.done) ins.append(h('button', { class: 'holdval', title: 'Edit', onClick: () => editHold(z, bi) }, mmss(z.s || 0)), h('span', { class: 'u', text: e.side ? 'per side' : '' }));
        else ins.append(h('button', { class: 'holdbtn', onClick: () => { begin(); F.timer.hold({ title: e.name, target: z.s || (it.target && it.target.s) || 30, pr: bestHold(e.id), side: e.side, onDone: (secs) => { z.s = secs; z.done = true; afterSet(it, bi); } }); } }, icon('timer', 16), 'Hold ' + mmss(z.s || 30)));
      }
      const tick = h('button', { class: 'tick' + (z.done ? ' on' : ''), 'aria-label': 'Set done', onClick: () => {
        if (z.done) { z.done = false; save(); refresh(bi); return; }
        if (e.log === 'h' && !z.s) z.s = (it.target && it.target.s) || 30;
        z.done = true; afterSet(it, bi);
      } }, icon('check', 18));
      row.append(h('span', { class: 'n', text: String(k + 1) }), ins, tick);
      return row;
    }
    function editHold(z, bi) {
      const inp = F.ui.numIn(z.s, { step: 1 });
      const sh = sheet(h('div', { class: 'stack' }, h('h2', { text: 'Hold time (seconds)' }), inp,
        h('button', { class: 'btn primary', text: 'Save', onClick: () => { z.s = inp.value === '' ? z.s : Math.max(0, Math.round(+inp.value)); save(); sh.close(); refresh(bi); } })));
    }
    function afterSet(it, bi) {
      F.timer.sfx('pop'); F.ui.vibrate(20); save(); refresh(bi);
      if (it.rest && !bf) F.timer.rest(it.sets.some((z) => !z.done) ? it.rest : Math.min(it.rest, 60), it.sets.some((z) => !z.done) ? 'Rest' : 'Next up');
    }
    async function swap(bi, it) {
      const list = it.alts.map(F.data.ex).filter(Boolean);
      const sh = sheet(h('div', null, h('h2', { text: 'Swap exercise' }),
        h('p', { class: 'small muted', text: 'Everything here fits your equipment, phase and injuries today. Your pick is remembered for this slot.' }),
        h('div', { class: 'list mt' }, list.map((e) => h('div', { class: 'item', onClick: () => choose(e) },
          h('div', { class: 't' }, h('b', { text: e.name }), h('small', { text: e.cues[0] })), F.flagsRow(e), e.id === it.ex ? pill('current', 'acc') : null)))));
      async function choose(e) {
        if (e.id === it.ex) { sh.close(); return; }
        if (it.sets.some((z) => z.done) && !(await confirmDlg('Clear the sets you logged for this one?', { ok: 'Swap', sub: 'Swapping resets this exercise’s sets.' }))) return;
        it.ex = e.id;
        it.target = F.data.targetFor(e, it, plan.date);
        it.last = F.data.lastSummary(e, plan.date);
        it.sets = it.sets.map(() => ({ w: it.target.w ?? null, r: it.target.r ?? null, s: it.target.s ?? null, done: false }));
        if (it.slot) F.store.load().settings.slotPrefs[it.slot] = e.id;
        save(); sh.close(); refresh(bi);
      }
    }

    // --- flow (yoga, mobility) ---
    function flowBlock(pb, bi) {
      const card = h('div', { class: 'card tight' });
      const live = pb.items.filter((it) => !it.why);
      const secs = live.reduce((a, it) => { const e = F.data.ex(it.ex); return a + (it.secs ? it.secs * (e && e.side ? 2 : 1) : 45); }, 0);
      if (live.some((it) => !it.done)) card.append(bf
        ? h('button', { class: 'btn block mb', onClick: () => { for (const it of live) it.done = true; F.timer.sfx('pop'); save(); refresh(bi); } }, icon('check', 16), 'Mark all done')
        : h('button', { class: 'btn fire block mb', onClick: () => startFlow(pb, bi) }, icon('play', 16), `Guided — about ${Math.max(1, Math.round(secs / 60))} min`));
      for (const it of pb.items) {
        const e = F.data.ex(it.ex);
        const d = it.secs ? mmss(it.secs) + (e && e.side ? ' / side' : '') : it.reps || '';
        card.append(h('div', { class: 'listrow' + (it.why ? ' off' : '') },
          h('div', { class: 't' }, h('b', { text: e ? e.name : it.ex, onClick: () => e && F.exSheet(e.id) }), h('small', { text: it.why ? 'Skipped — ' + it.why : d })),
          it.why ? null : h('button', { class: 'tick sm' + (it.done ? ' on' : ''), onClick: () => { it.done = !it.done; save(); refresh(bi); } }, icon('check', 15))));
      }
      return card;
    }
    function startFlow(pb, bi) {
      begin();
      const items = pb.items.filter((it) => !it.why && !it.done).map((it) => { const e = F.data.ex(it.ex); return { ref: it, name: e.name, secs: it.secs, reps: it.reps, side: !!(e.side && it.secs), cue: e.cues[0] }; });
      F.timer.flow({ title: plan.title, items, onItem: (i) => { items[i].ref.done = true; save(); }, onDone: () => refresh(bi) });
    }

    // --- timer (4×4, rounds, steady, AMRAP, stopwatch) ---
    function timerBlock(pb, bi) {
      const t = pb.timer;
      const card = h('div', { class: 'card tight' });
      const shape = t.kind === 'intervals' ? [t.warm ? mmss(t.warm) + ' warm-up' : '', `${t.rounds} × ${mmss(t.work)}${t.rest ? ' on / ' + mmss(t.rest) + ' off' : ''}`, t.cool ? mmss(t.cool) + ' cool-down' : ''].filter(Boolean).join(' · ')
        : t.kind === 'steady' ? `${t.mins} min steady` : t.kind === 'amrap' ? `${t.mins}-minute AMRAP` : 'Stopwatch — go at your pace';
      card.append(h('div', { class: 'row between' }, h('b', { text: shape }), t.hr || t.hrZone ? h('span', { class: 'small accent', text: F.timer.hrText(t.hrZone ? 'work' : 'work', t.hrZone) }) : null));
      if (t.label && t.kind !== 'intervals') card.append(h('div', { class: 'small muted mt-s', text: t.label }));
      if (t.noEquip && !t.altLabel) card.append(h('div', { class: 'small amber mt-s', text: 'No machine here — use any cardio you can do at this effort.' }));
      const live = pb.items.filter((it) => !it.why && F.data.ex(it.ex));
      const names = live.map((it) => F.data.ex(it.ex));
      if (names.length > 1) card.append(h('div', { class: 'chips mt-s' }, names.map((e) => h('button', { class: 'chip small', text: e.name, onClick: () => F.exSheet(e.id) }))));
      if (!pb.done && bf) card.append(h('button', { class: 'btn block mt', onClick: () => { pb.done = true; F.timer.sfx('pop'); save(); refresh(bi); } }, icon('check', 16), 'Mark done'));
      else if (!pb.done) card.append(h('button', { class: 'btn fire block mt', onClick: () => { begin(); F.timer.run({ title: plan.title + ' · ' + pb.name, timer: t, cue: t.kind === 'amrap' && names.length ? names.map((e, i) => (live[i].reps || '') + ' ' + e.name).join(' · ') : '', onDone: ({ secs, rounds }) => { pb.done = true; pb.vals.secs = secs; if (t.kind === 'amrap') pb.vals.rounds = rounds; save(); refresh(bi); } }); } }, icon('play', 16), 'Start timer'));
      else card.append(h('div', { class: 'row mt-s' }, pill(pb.vals.secs ? 'Done · ' + mmss(pb.vals.secs) : 'Done', 'green'), h('button', { class: 'btn xs ghost', text: bf ? 'Undo' : 'Run again', onClick: () => { pb.done = false; save(); refresh(bi); } })));
      const fields = (pb.log || []).slice();
      if (fields.length || !pb.done) {
        const lf = h('div', { class: 'logfields' });
        const field = (key, label, conv, back) => lf.append(h('label', null, label, F.ui.numIn(conv(pb.vals[key]), { onInput: (v) => { pb.vals[key] = back(v); if (!pb.done && v !== null) pb.done = true; save(); } })));
        const idn = (v) => v ?? null;
        for (const f of fields) {
          if (f === 'dist') field('dist', `Distance (${F.u.du()})`, F.u.dv, F.u.dIn);
          if (f === 'hr') field('hr', 'Avg HR (bpm)', idn, idn);
          if (f === 'steps') field('steps', 'Steps', idn, idn);
          if (f === 'rounds') field('rounds', 'Rounds', idn, idn);
        }
        if (lf.childNodes.length) card.append(lf);
      }
      return card;
    }

    // --- circuit (Krav conditioning, Murph rounds) ---
    function circuitBlock(pb, bi) {
      const card = h('div', { class: 'card tight' });
      for (const it of pb.items) {
        const e = F.data.ex(it.ex);
        card.append(h('div', { class: 'listrow' + (it.why ? ' off' : '') },
          h('div', { class: 't' }, h('b', { text: (it.reps ? it.reps + ' · ' : '') + (e ? e.name : it.ex), onClick: () => e && F.exSheet(e.id) }), it.why ? h('small', { text: 'Skipped — ' + it.why }) : null),
          it.slot && it.alts.length > 1 ? h('button', { class: 'btn xs', onClick: () => swapCircuit(bi, it) }, icon('swap', 14)) : null));
      }
      const grid = h('div', { class: 'roundgrid' });
      const n = Math.min(pb.max || 99, Math.max(pb.target, pb.roundsDone + (pb.roundsDone >= pb.target ? 1 : 0)));
      for (let k = 1; k <= n; k++) grid.append(h('button', { class: (k <= pb.roundsDone ? 'on' : '') + (k === pb.target ? ' target' : ''), text: String(k), onClick: () => {
        const was = pb.roundsDone;
        pb.roundsDone = k <= pb.roundsDone ? k - 1 : k;
        save(); refresh(bi);
        if (pb.roundsDone > was) { F.timer.sfx('pop'); F.ui.vibrate(20); if (pb.rest && !bf) F.timer.rest(pb.rest); }
      } }));
      card.append(h('div', { class: 'row between mt-s' }, h('span', { class: 'small muted', text: `${bf ? 'Tap the rounds you finished' : 'Tap each round as you finish it'} · target ${pb.target}` + (pb.lastRounds ? ` (last time ${pb.lastRounds} + 1)` : '') + (pb.capped ? ` · Phase ${plan.phase} cap ${pb.max}` : '') }), h('span', { class: 'num', style: { fontSize: '1.4rem', fontWeight: 700 }, text: pb.roundsDone + ' / ' + pb.target })));
      card.append(grid);
      return card;
    }
    function swapCircuit(bi, it) {
      const list = it.alts.map(F.data.ex).filter(Boolean);
      const sh = sheet(h('div', null, h('h2', { text: 'Swap exercise' }), h('div', { class: 'list mt' }, list.map((e) => h('div', { class: 'item', onClick: () => { it.ex = e.id; F.store.load().settings.slotPrefs[it.slot] = e.id; save(); sh.close(); refresh(bi); } }, h('div', { class: 't' }, h('b', { text: e.name }), h('small', { text: e.cues[0] })), e.id === it.ex ? pill('current', 'acc') : null)))));
    }

    // ---------- finish ----------
    const anyDone = () => F.activeProgress(A);
    function finish() {
      const P = F.store.load().profile;
      const raw = Math.max(1, Math.round(F.activeMs(A) / 60000));
      const est = plan.est || 30;
      const tooLong = !bf && raw > Math.max(est * 2.5, est + 45);
      const mins = bf || tooLong || A.fresh ? est : raw;
      const minIn = F.ui.numIn(mins, { step: 1 });
      let rpe = null, knee = 0, back = 0;
      const checks = {};
      const notes = h('textarea', { placeholder: 'Notes (optional)' });
      const rpeOpts = Array.from({ length: 10 }, (_, i) => ({ v: i + 1, label: String(i + 1) }));
      const painOpts = [{ v: 0, label: 'Fine' }, { v: 1, label: 'Achy' }, { v: 2, label: 'Sharp / catching' }];
      const sh = sheet(h('div', { class: 'stack' },
        h('h2', { text: (bf ? 'Save ' : 'Finish ') + plan.title }),
        bf ? h('div', { class: 'callout sky small', text: `Saves to ${F.ui.fmtDate(plan.date, LONG)}. Set roughly how long it took.` }) : null,
        !anyDone() ? h('div', { class: 'callout amber small', text: "Nothing is ticked yet — it'll still be logged as a session with the minutes below." }) : null,
        tooLong ? h('div', { class: 'callout amber small', text: `The clock says ${F.ui.dur(raw)} — it looks like it was left running, so this uses the usual ${est} min. Change it if that’s wrong.` }) : null,
        h('label', { class: 'field' }, h('span', { text: 'Minutes' }), minIn),
        h('div', null, h('div', { class: 'eyebrow', text: 'How hard was it? (1 easy – 10 max)' }), F.ui.seg(rpeOpts, null, (v) => { rpe = v; })),
        P.injuries.knee ? h('div', null, h('div', { class: 'eyebrow', text: 'Knees during the session' }), F.ui.seg(painOpts, 0, (v) => { knee = v; })) : null,
        P.injuries.lumbar ? h('div', null, h('div', { class: 'eyebrow', text: 'Back during the session' }), F.ui.seg(painOpts, 0, (v) => { back = v; })) : null,
        (plan.finishChecks || []).map((c) => { const cb = h('input', { type: 'checkbox' }); cb.addEventListener('change', () => { checks[c.id] = cb.checked; }); return h('label', { class: 'toggle' }, cb, c.label); }),
        notes,
        h('div', { class: 'btngroup' },
          h('button', { class: 'btn fire big', onClick: () => { sh.close(); commit(Math.max(1, +minIn.value || mins), { rpe, pain: { knee, back }, checks, notes: notes.value.trim() }); } }, icon('check', 18), 'Save session'),
          h('button', { class: 'btn danger', text: 'Discard', onClick: async () => { sh.close(); if (await confirmDlg('Discard this session?', { ok: 'Discard', danger: true })) { F.store.load().active = null; F.timer.stopRest(); F.store.saveNow(); location.hash = home; } } }))));
    }
    function commit(minutes, extra) {
      const entries = [];
      let rounds = 0, dist = null, hr = null, steps = null, mode = null;
      for (const pb of plan.blocks) {
        if (pb.type === 'sets') for (const it of pb.items) {
          if (!it.ex || it.why) continue;
          const sets = it.sets.filter((z) => z.done).map((z) => ({ w: z.w ?? null, r: z.r ?? null, s: z.s ?? null, done: true }));
          if (sets.length) entries.push({ ex: it.ex, slot: it.slot, sets });
        }
        if (pb.type === 'list') for (const it of pb.items) {
          if (it.why) continue;
          const n = it.bubbles ? it.bubbles.filter(Boolean).length : it.done ? 1 : 0;
          if (n) entries.push({ ex: it.ex, kind: 'list', sets: Array.from({ length: n }, () => ({ done: true })) });
        }
        if (pb.type === 'flow') for (const it of pb.items) if (it.done && !it.why) entries.push({ ex: it.ex, kind: 'flow', sets: [{ s: it.secs || null, done: true }] });
        if (pb.type === 'circuit' && pb.roundsDone) {
          rounds = Math.max(rounds, pb.roundsDone);
          for (const it of pb.items) if (it.ex && !it.why) entries.push({ ex: it.ex, kind: 'circuit', sets: Array.from({ length: pb.roundsDone }, () => ({ r: parseInt(it.reps, 10) || null, done: true })) });
        }
        if (pb.type === 'timer') {
          if (pb.vals.rounds) rounds = Math.max(rounds, pb.vals.rounds);
          if (pb.vals.dist) dist = (dist || 0) + pb.vals.dist;
          if (pb.vals.hr) hr = pb.vals.hr;
          if (pb.vals.steps) steps = pb.vals.steps;
          if (pb.mode && pb.done) mode = mode || pb.mode;
        }
      }
      const rec = Object.assign({ date: plan.date, tpl: plan.tpl, src: A.src, title: plan.title, icon: plan.icon, tags: plan.tags, stat: plan.stat, met: plan.met, phase: plan.phase, loc: plan.loc,
        minutes, kcal: F.game.kcal(plan.met, minutes), entries, rounds: rounds || null, dist, hr, steps, mode }, extra);
      rec.prs = F.game.detectPRs(rec);
      const x = F.game.sessionXP(rec);
      rec.xp = x.xp; rec.split = x.split;
      F.store.addSession(rec);
      F.store.load().active = null;
      F.store.saveNow();
      F.timer.stopRest();
      location.hash = '#/done/' + rec.id;
    }

    renderBlocks();
    drawAdd();
    return wrap;
  };

  // ---------- summary ----------
  F.views.done = (id) => {
    const S = F.store.load();
    const rec = S.sessions.find((x) => x.id === id);
    if (!rec) return h('div', { class: 'empty' }, 'Session not found. ', h('a', { href: '#/', text: 'Today' }));
    const C = F.game.compute();
    const past = rec.date !== F.ui.today();
    const wrap = h('div', { class: 'stack' });
    const xpEl = h('div', { class: 'summary-xp', text: '+0' });
    wrap.append(h('div', { class: 'hero center' + (past ? ' past' : '') },
      h('div', { style: { fontSize: '3rem' }, text: rec.icon || '🔥' }),
      h('div', { class: 'eyebrow', text: past ? 'Logged for ' + F.ui.fmtDate(rec.date, LONG) : 'Session complete' }),
      h('h1', { text: rec.title }),
      xpEl,
      h('div', { class: 'muted small', text: `${F.ui.dur(rec.minutes)} · ≈ ${num(rec.kcal)} kcal (${num(rec.kcal / F.game.COOKIE_KCAL, 1)} cookies' worth 🍪)` })));
    setTimeout(() => F.ui.countUp(xpEl, rec.xp, { fmt: (v) => '+' + num(v) + ' XP' }), 150);

    const gains = h('div', { class: 'card' }, h('div', { class: 'eyebrow', text: 'Stats' }));
    for (const [k, f] of Object.entries(rec.split || {}).sort((a, b) => b[1] - a[1])) {
      const st = C.stats[k];
      if (!st) continue;
      gains.append(h('div', { class: 'gainrow' }, h('span', { text: st.icon }), h('b', { text: st.name }), F.ui.progress(st.pct, '', false), h('span', { class: 'v', text: '+' + num(rec.xp * f) })));
      gains.lastChild.querySelector('.progress i').style.background = st.color;
    }
    wrap.append(gains);

    if (rec.prs && rec.prs.length) {
      const pc = h('div', { class: 'card glow' }, h('div', { class: 'eyebrow', text: `🎉 ${rec.prs.length} personal record${rec.prs.length > 1 ? 's' : ''}` }));
      for (const p of rec.prs) { const t = F.game.prText(p); pc.append(h('div', { class: 'pr-line' }, h('span', { text: '📈' }), h('div', { class: 'grow' }, h('b', { text: t.name }), h('div', { class: 'small muted', text: `${t.prev} → ${t.now}` })))); }
      wrap.append(pc);
    }

    const T = rec.entries.reduce((a, en) => {
      const e = F.data.ex(en.ex);
      if (!e || en.kind) return a;
      for (const z of en.sets) { if (e.log === 'wr' && z.w && z.r) a.vol += z.w * z.r * (e.pair ? 2 : 1); if (e.log === 'h' && z.s) a.hold += z.s * (e.side ? 2 : 1); a.sets++; }
      return a;
    }, { vol: 0, hold: 0, sets: 0 });
    const facts = [];
    if (T.sets) facts.push([T.sets, 'sets']);
    if (T.vol) facts.push([F.ui.compact(F.u.wv(T.vol)), F.u.wu() + ' moved']);
    if (T.hold) facts.push([mmss(T.hold), 'held']);
    if (rec.rounds) facts.push([rec.rounds, 'rounds']);
    if (rec.dist) facts.push([num(F.u.dv(rec.dist), 1), F.u.du()]);
    if (facts.length) wrap.append(h('div', { class: 'card' }, h('div', { class: 'grid3' }, facts.slice(0, 3).map(([v, l]) => h('div', { class: 'stat' }, h('b', { text: String(v) }), h('span', { text: l }))))));

    if ((rec.pain && (rec.pain.knee >= 2 || rec.pain.back >= 2))) {
      wrap.append(h('div', { class: 'callout red' }, h('b', { text: 'Sharp pain logged. ' }), 'Tomorrow, check in honestly and Forge will swap in a recovery day. A knee that stays locked (won’t straighten): don’t force it — see a doctor the same or next day. Catching, giving way, new swelling, or pain/numbness travelling down a leg: call your PT. ', h('a', { href: '#/settings/safety', text: 'Safety guide' })));
    }

    const W = C.weeks[F.ui.weekStart(rec.date)] || C.thisWeek;
    if (W) {
      const wq = h('div', { class: 'wq' });
      for (const q of W.list) if (q.target > 0 && ['count', 'days'].includes(q.kind)) wq.append(h('div', { class: 'w' + (q.met ? ' met' : '') }, h('div', { class: 'top' }, h('span', { text: q.icon + ' ' + q.label })), h('div', { class: 'val', text: `${Math.min(q.done, 99)}` }, h('small', { text: ' / ' + q.target }))));
      wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: W === C.thisWeek ? 'This week' : 'That week' })), wq));
    }
    wrap.append(h('div', { class: 'btngroup mt' },
      past ? h('a', { class: 'btn fire big', href: '#/day/' + rec.date }, 'Back to ' + F.ui.fmtDate(rec.date, SHORT)) : null,
      h('a', { class: 'btn ' + (past ? '' : 'fire big'), href: '#/' }, past ? 'Today' : 'Back to Today'), h('a', { class: 'btn', href: '#/train/history' }, 'History')));
    setTimeout(() => F.game.afterChange(), 900);
    return wrap;
  };
})();
