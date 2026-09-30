/* Today: where you are, how the knees and back feel, the day's mission, daily and weekly quests, fuel at a glance.
   The same page opens for a past day (#/day/2026-09-29) to catch up on anything that wasn't logged at the time. */
(() => {
  const { h, icon, toast, sheet, num, pill, progress } = F.ui;
  const LONG = { weekday: 'long', month: 'long', day: 'numeric' };
  const SHORT = { weekday: 'short', month: 'short', day: 'numeric' };
  const MD = { month: 'short', day: 'numeric' };
  const PLANE = String.fromCharCode(0x2708, 0xFE0E);   // the plane as a text glyph, so it takes the label's colour
  const forDay = (date) => (date === F.ui.today() ? '' : ' · ' + F.ui.fmtDate(date, SHORT));
  const tripText = (t) => (!t.end ? 'since ' + F.ui.fmtDate(t.start, MD) : t.start === t.end ? F.ui.fmtDate(t.start, MD) : F.ui.fmtDate(t.start, MD) + ' – ' + F.ui.fmtDate(t.end, MD));

  // Logging something another way supersedes the same session sitting open with nothing ticked — but only one for
  // that day, or a live one abandoned on an earlier day. Never today's session from a past day's page, or the reverse.
  function closeIdleActive(src, date) {
    const S = F.store.load(), A = S.active;
    if (!A || A.src !== src || F.activeProgress(A)) return;
    if (A.plan.date === date || (!A.backfill && A.plan.date < date)) { S.active = null; F.timer.stopRest(); F.store.save(); }
  }
  function quickComplete(task, date) {
    closeIdleActive(task.session, date);
    const tpl = F.data.templateFor(task.session, date);
    const c = F.data.ctx(date);
    const entries = task.session === 'pt'
      ? (F.store.load().settings.ptRoutine || F.data.prog().ptDefault).map((x) => ({ ex: x.ex, kind: 'list', sets: Array.from({ length: x.sets || 1 }, () => ({ done: true })) }))
      : [];
    const rec = { date, tpl: tpl.id, src: task.session, title: tpl.name, icon: tpl.icon, tags: tpl.tags, stat: tpl.stat, met: tpl.met, phase: c.phase, loc: c.loc,
      minutes: task.min || tpl.est, kcal: F.game.kcal(tpl.met, task.min || tpl.est), entries, auto: true, taskId: task.id };
    const x = F.game.sessionXP(rec);
    rec.xp = x.xp; rec.split = x.split;
    F.store.addSession(rec);
    F.ui.xpFloat(rec.xp + task.xp, F.data.stat(task.stat).icon);
    F.timer.sfx('pop');
    toast(`${task.label} logged${forDay(date)}`, 2600, { label: 'Undo', run: () => { F.store.removeSession(rec.id); F.app.render(); } });
    F.game.afterChange();
  }
  function undoTask(task, date) {
    const S = F.store.load();
    const autos = S.sessions.filter((x) => x.date === date && x.auto && x.taskId === task.id);
    if (!autos.length) { toast('Logged from a full session — edit it in Train → History', 3000); return false; }
    autos.forEach((x) => F.store.removeSession(x.id));
    return true;
  }

  // Formal PT (a clinic or PT Pilates session) counts as PT: it satisfies the PT-routine daily and logs as exercise.
  // Settings → Program can let it cover the daily holds and roll & stretch too.
  const isFormal = (x) => x.act === 'pt_visit' || (x.tags || []).includes('formalpt');
  const formalOn = (date) => F.store.sessionsOn(date).find(isFormal) || null;
  function formalMinutes() {
    const ss = F.store.load().sessions;
    for (let i = ss.length - 1; i >= 0; i--) if (isFormal(ss[i])) return ss[i].minutes || 60;
    return 60;
  }
  function logFormal(date) {
    closeIdleActive('pt', date);
    const P = F.data.prog(), S = F.store.load();
    const act = P.activities.find((a) => a.id === 'pt_visit');
    const minutes = formalMinutes();
    const rec = { date, tpl: null, act: act.id, title: act.label, icon: act.icon, tags: act.tags.slice(), stat: act.stat, met: act.met, phase: S.settings.phase,
      loc: F.store.location(date), minutes, kcal: F.game.kcal(act.met, minutes), entries: [], prs: [] };
    const x = F.game.sessionXP(rec);
    rec.xp = x.xp; rec.split = x.split;
    F.store.addSession(rec);
    const ptTask = P.dailyTasks.find((t) => t.id === 'pt');
    F.ui.xpFloat(rec.xp + (ptTask ? ptTask.xp : 0), '🛡️');
    F.timer.sfx('pop');
    toast(`Formal PT logged${forDay(date)} · ${minutes} min — PT routine covered`, 3200, { label: 'Edit', run: () => F.formalSheet(date) });
    F.game.afterChange();
    F.app.render();
  }
  F.formalSheet = (date) => {
    const rec = formalOn(date);
    if (!rec) return;
    const minIn = F.ui.numIn(rec.minutes, { step: 5 });
    const notes = h('textarea', { placeholder: 'Notes (optional)', style: { minHeight: '50px' } });
    notes.value = rec.notes || '';
    const sh = sheet(h('div', { class: 'stack' },
      h('h2', { text: '🩺 Formal PT' }),
      h('p', { class: 'small muted', text: 'Counts as your PT for the day, so the home PT routine is covered.' }),
      h('label', { class: 'field' }, h('span', { text: 'Minutes' }), minIn), notes,
      h('div', { class: 'btngroup' },
        h('button', { class: 'btn primary', text: 'Save', onClick: () => {
          const minutes = Math.max(5, +minIn.value || rec.minutes);
          const patch = { minutes, kcal: F.game.kcal(rec.met, minutes), notes: notes.value.trim() };
          const x = F.game.sessionXP(Object.assign({}, rec, patch));
          F.store.updateSession(rec.id, Object.assign(patch, { xp: x.xp, split: x.split }));
          sh.close(); F.game.afterChange(); F.app.render();
        } }),
        h('button', { class: 'btn danger', text: 'Not a PT day', onClick: () => { F.store.removeSession(rec.id); sh.close(); F.app.render(); } }))));
  };

  // When travel mode was on: add a trip after the fact, or change or remove one. Days away use the travel kit and
  // scale that week's quests, exactly as if travel mode had been on at the time.
  F.tripSheet = ({ trip = null, date } = {}) => {
    const today = F.ui.today();
    date = date || today;
    const startIn = h('input', { type: 'date', value: trip ? trip.start : date, max: today });
    const endIn = h('input', { type: 'date', value: trip ? trip.end || today : date, max: today });
    const still = h('input', { type: 'checkbox', checked: trip ? !trip.end : date === today });
    const endField = h('label', { class: 'field' }, h('span', { text: 'Last day away' }), endIn);
    const note = h('div', { class: 'callout small' });
    const read = () => ({ a: F.ui.isDate(startIn.value) ? startIn.value : null, b: still.checked ? null : F.ui.isDate(endIn.value) ? endIn.value : '' });
    const problem = ({ a, b }) => (!a || b === '' ? 'Set the dates.'
      : a > today || (b && b > today) ? 'A trip can’t be in the future here — tap Travelling on the day you leave.'
      : b && b < a ? 'The last day away has to be on or after the first.' : '');
    const paint = () => {
      endField.hidden = still.checked;
      const r = read(), bad = problem(r);
      const n = bad ? 0 : F.ui.daysBetween(r.a, r.b || today) + 1;
      note.className = 'callout small' + (bad ? ' amber' : ' sky');
      note.textContent = bad || `${n} day${n === 1 ? '' : 's'} in travel mode${r.b ? '' : ' so far, and it stays on until you tap Back home'}. Plans for those days use your travel kit, and the weekly quests scale to the days away.`;
    };
    for (const el of [startIn, endIn, still]) { el.addEventListener('input', paint); el.addEventListener('change', paint); }
    const done = (msg) => { sh.close(); toast(msg, 2600); F.game.afterChange(); F.app.render(); };
    const sh = sheet(h('div', { class: 'stack' },
      h('h2', { text: trip ? '✈️ Trip dates' : '✈️ When were you away?' }),
      h('p', { class: 'small muted', text: trip ? 'Change when this trip started or ended, or remove it if you weren’t travelling.' : 'Travel mode wasn’t on at the time? Set the days you were away.' }),
      h('div', { class: 'fieldrow' }, h('label', { class: 'field' }, h('span', { text: 'First day away' }), startIn), endField),
      h('label', { class: 'toggle' }, still, 'Still away'),
      note,
      h('div', { class: 'btngroup' },
        h('button', { class: 'btn primary', text: 'Save', onClick: () => {
          const r = read(), bad = problem(r);
          if (bad) { toast(bad, 2600); return; }
          F.store.setTrip(trip, r.a, r.b);
          done('Travel mode set: ' + tripText({ start: r.a, end: r.b }));
        } }),
        trip ? h('button', { class: 'btn danger', text: 'Wasn’t away — remove', onClick: () => { F.store.removeTrip(trip); done('Trip removed'); } }) : null)));
    paint();
  };

  // The + button. It logs for the day on screen, and can be pointed at yesterday or any earlier day.
  F.quickMenu = () => {
    const S = F.store.load(), today = F.ui.today(), yest = F.ui.addDays(today, -1);
    let date = F.app.viewDate();
    const body = h('div');
    const sh = sheet(body);
    const item = (emo, title, sub, fn) => h('div', { class: 'item', onClick: () => { sh.close(); fn(); } }, h('span', { class: 'emo', text: emo }), h('div', { class: 't' }, h('b', { text: title }), h('small', { text: sub })));
    function draw() {
      const past = date !== today, other = past && date !== yest;
      const dateIn = h('input', { type: 'date', class: 'dayjump', value: date, max: today, 'aria-label': 'Day to log for' });
      dateIn.addEventListener('change', () => { date = F.ui.dayArg(dateIn.value); draw(); });
      body.innerHTML = '';
      body.append(h('h2', { text: 'Log something' }),
        h('div', { class: 'row', style: { gap: '8px' } },
          F.ui.seg([{ v: today, label: 'Today' }, { v: yest, label: 'Yesterday' }, { v: 'other', label: 'Another day' }], other ? 'other' : date,
            (v) => { date = v !== 'other' ? v : other ? date : F.ui.addDays(today, -2); draw(); }),
          other ? dateIn : null),
        past ? h('div', { class: 'small muted mt-s', text: `Saves to ${F.ui.fmtDate(date, LONG)}.` }) : null,
        h('div', { class: 'list mt' },
          item('🥋', 'Activity', 'Krav class, walk, ride, run, PT visit, anything', () => F.quickLog(null, { date })),
          item('🚶', 'Walk', 'Minutes, distance or steps', () => F.quickLog('walk', { date })),
          item('🍗', 'Food', 'Meals, protein, treats', () => F.foodSheet(date)),
          item('💧', 'Water', 'A glass, a bottle, any amount', () => F.waterSheet(date)),
          S.activeFast
            ? item('⏳', 'Fast in progress', 'Stages, end it, or fix when it started', () => { location.hash = '#/fuel'; })
            : item('⏳', 'Start a fast', 'From now, or from when you last ate', () => F.fastSheet()),
          item('📏', 'Measurements', 'Monthly tape check-in', () => F.measureSheet(null, { date })),
          past ? item('📅', 'Open ' + F.ui.fmtDate(date, SHORT), 'Tick that day’s PT, holds, check-in and sessions', () => { location.hash = '#/day/' + date; }) : null));
    }
    draw();
  };

  // Seven days at a glance: what each earned, which were missed or covered by a freeze. Tap one to open it.
  function dayStrip(date, C) {
    const today = F.ui.today();
    const end = F.ui.daysBetween(date, today) <= 6 ? today : F.ui.addDays(date, 3);
    const strip = h('nav', { class: 'daystrip', 'aria-label': 'Pick a day' });
    const empty = [];
    for (let i = 6; i >= 0; i--) {
      const d = F.ui.addDays(end, -i), rec = C.days[d];
      const state = rec && rec.active ? 'done' : C.streak.frozen.has(d) ? 'frozen' : d === today ? 'open' : d < C.firstDay ? 'pre' : 'miss';
      if (state === 'miss' || state === 'frozen') empty.push(d);
      const xp = rec ? Math.round(rec.xp) : 0;
      const mark = state === 'frozen' ? '❄️' : xp ? '+' + F.ui.compact(xp) : state === 'pre' ? '' : '○';
      const says = { done: `${num(xp)} XP`, frozen: 'covered by a streak freeze', open: 'no activity logged yet', pre: 'before you started', miss: 'no activity logged' }[state];
      const away = F.store.isTravel(d);   // a small plane marks the days travel mode covers
      strip.append(h('a', { class: `ds-day ${state}${d === date ? ' sel' : ''}${d === today ? ' today' : ''}${away ? ' trip' : ''}`, href: d === today ? '#/' : '#/day/' + d,
        'aria-label': `${F.ui.fmtDate(d, LONG)}: ${says}${away ? ', travel day' : ''}`, 'aria-current': d === date ? 'date' : null },
        h('small', { text: d === today ? 'Today' : (away ? PLANE : '') + F.ui.DAYS[F.ui.dow(d)].slice(0, 3) }), h('b', { text: String(F.ui.parse(d).getDate()) }), h('i', { text: mark })));
    }
    return { strip, empty };
  }

  F.views.today = (dateArg) => {
    const S = F.store.load(), P = F.data.prog(), C = F.game.compute();
    const today = F.ui.today();
    const date = F.ui.dayArg(dateArg), past = date !== today;
    // The day an action lands on: this page's day for a past day, otherwise today as of the tap — a Today page
    // left open past midnight must not log to yesterday.
    const D = () => (past ? date : F.ui.today());
    const start = (id) => (past ? F.startSession(id, { date }) : F.startSession(id));
    const wrap = h('div', { class: 'stack', style: { gap: '14px' } });
    const inj = S.profile.injuries || {};

    // ----- the week, and the way back to a day that wasn't logged -----
    const ds = dayStrip(date, C);
    const names = ds.empty.filter((d) => F.ui.daysBetween(d, today) <= 3).map((d) => F.ui.DAYS[F.ui.dow(d)].slice(0, 3));
    wrap.append(h('div', null, ds.strip,
      !past && names.length ? h('div', { class: 'small muted mt-s', text: `No activity logged on ${names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]} — if you did something, tap the day to fill it in.` }) : null));

    // ----- resume banner -----
    if (S.active && (!past || S.active.plan.date === date)) {
      const A = S.active;
      const fill = A.backfill || past;
      const mins = Math.round(F.activeMs(A) / 60000);
      const discard = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!(await F.ui.confirmDlg(`Discard ${A.plan.title}?`, { ok: 'Discard', danger: true, sub: 'Nothing from it gets logged.' }))) return;
        S.active = null; F.timer.stopRest(); F.store.saveNow(); F.app.render();
      };
      wrap.append(h('a', { class: 'card glow row nowrap', href: '#/play', style: { color: 'inherit' }, onClick: past ? (ev) => { ev.preventDefault(); F.startSession(A.src, { date }); } : null },
        h('span', { style: { fontSize: '1.6rem' }, text: A.plan.icon }),
        h('div', { class: 'grow' }, h('b', { text: (fill ? 'Finish logging ' : 'Resume ') + A.plan.title }),
          h('div', { class: 'small muted', text: fill ? `For ${F.ui.fmtDate(A.plan.date, SHORT)} — not saved until you finish` : `${A.pausedAt ? 'Paused · ' : ''}${F.ui.dur(mins)} on the clock · opened ${F.ui.relDay(A.plan.date)}` })),
        h('button', { class: 'btn sm ghost', 'aria-label': 'Discard this session', title: 'Discard', onClick: discard }, icon('x', 14)),
        h('span', { class: 'btn sm primary' }, icon('play', 14), 'Resume')));
    }

    // ----- hero -----
    const travel = F.store.isTravel(date);
    const trip = travel ? F.store.tripOn(date) : null;
    const locbar = h('div', { class: 'locbar' });
    const setLoc = (fn) => { fn(); F.store.save(); F.app.render(); };
    const todayLoc = F.store.location(date);
    if (!travel) {
      for (const l of ['home', 'gym']) {
        const L = F.data.loc(l);
        locbar.append(h('button', { class: todayLoc === l ? 'on' : '', onClick: () => { F.store.setLocation(D(), l); F.app.render(); } }, L.icon + ' ' + (l === 'gym' ? 'Gym day' : L.label)));
      }
      locbar.append(past
        ? h('button', { class: 'trip', onClick: () => F.tripSheet({ date }) }, '✈️ Was away')
        : h('button', { class: 'trip', onClick: () => setLoc(() => {
          F.store.startTrip(D());
          toast('Travel mode on — plans use your travel kit and weekly quests scale down.', 4500, { label: 'Left earlier?', run: () => F.tripSheet({ trip: F.store.tripOn(F.ui.today()) }) });
        }) }, '✈️ Travelling'));
    } else {
      // The kit is kept per day, so a past day can differ; on Today it also becomes the default for the rest of the trip.
      for (const l of ['room', 'hotelgym']) {
        const L = F.data.loc(l);
        locbar.append(h('button', { class: 'trip ' + (todayLoc === l ? 'on' : ''), onClick: () => setLoc(() => { if (!past) S.settings.travelLoc = l; F.store.setLocation(D(), l); }) }, L.icon + ' ' + L.label));
      }
      locbar.append(past
        ? h('button', { onClick: () => F.tripSheet({ trip, date }) }, '✈️ Away ' + tripText(trip), icon('edit', 13))
        : h('button', { onClick: () => setLoc(() => { F.store.endTrip(D()); toast('Welcome home.'); }) }, '🏠 Back home'));
    }
    const gymHint = `Gym day: ${past ? 'this day’s' : 'today’s'} strength session ${past ? 'is' : 'becomes'} a gym session (cables, pulldown, machines).${past ? '' : ' Tomorrow goes back to home.'}`;
    if (past) {
      const rec = C.days[date];
      const next = F.ui.addDays(date, 1);
      const dateIn = h('input', { type: 'date', class: 'dayjump', value: date, max: today, 'aria-label': 'Jump to a date' });
      dateIn.addEventListener('change', () => { const d = F.ui.dayArg(dateIn.value); location.hash = d === today ? '#/' : '#/day/' + d; });
      const status = rec && rec.active
        ? h('div', { class: 'small green mt-s', text: `Logged so far: ${F.ui.dur(rec.min)} · +${num(rec.xp)} XP` })
        : C.streak.frozen.has(date)
          ? h('div', { class: 'small mt-s', text: '❄️ A streak freeze covered this day. Log what you did and the freeze comes back.' })
          : h('div', { class: 'small muted mt-s', text: 'No activity logged for this day yet. A session, PT or a walk here counts toward your streak and that week’s quests.' });
      wrap.append(h('div', { class: 'hero past' },
        h('div', { class: 'greet', text: 'Catching up · ' + F.ui.relDay(date) }),
        h('h1', { text: F.ui.fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' }) }),
        h('div', { class: 'small muted', text: 'Anything you tick or log on this page is saved to this day.' }),
        h('div', { class: 'row mt', style: { gap: '8px' } },
          h('a', { class: 'btn sm', href: '#/day/' + F.ui.addDays(date, -1) }, icon('back', 14), 'Day before'),
          next === today ? null : h('a', { class: 'btn sm', href: '#/day/' + next }, 'Day after', icon('chevron', 14)),
          h('a', { class: 'btn sm primary', href: '#/' }, 'Back to today'),
          dateIn),
        locbar,
        travel ? h('div', { class: 'small muted mt-s', text: 'Travel day: plans use the travel kit picked here, and that week’s quests scale to the days away.' })
          : todayLoc === 'gym' ? h('div', { class: 'small muted mt-s', text: gymHint }) : null,
        status));
    } else {
      const hr = new Date().getHours();
      const greet = (hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (S.profile.name ? ', ' + S.profile.name : '');
      wrap.append(h('div', { class: 'hero' },
        h('div', { class: 'greet', text: greet + ' · ' + F.ui.fmtDate(date, LONG) }),
        h('h1', { text: C.streak.current >= 2 ? `Day ${C.streak.current} of the streak` : C.streak.activeToday ? 'On the board today' : 'Let’s get a rep in' }),
        h('div', { class: 'row small muted' }, h('span', { text: `Level ${C.level.level} ${C.level.title}` }), h('span', { text: '·' }), h('span', { text: `${num(C.level.need - C.level.into)} XP to level ${C.level.level + 1}` }),
          C.streak.freezes ? h('span', { title: 'Streak freezes banked — a missed day spends one instead of breaking the streak', text: '· ' + '❄️'.repeat(C.streak.freezes) }) : null),
        h('div', { class: 'mt-s' }, h('div', { class: 'xpbar', style: { height: '8px' } }, h('i', { style: { width: C.level.pct * 100 + '%' } }))),
        locbar,
        travel ? h('div', { class: 'small muted mt-s' }, `Travel mode ${tripText(trip)}: sessions use your travel kit, the 4×4 goes machine-free if needed, and weekly quests scale to the days away. `,
          h('button', { class: 'btn xs ghost', text: 'Change dates', onClick: () => F.tripSheet({ trip: F.store.tripOn(F.ui.today()) }) }))
          : todayLoc === 'gym' ? h('div', { class: 'small muted mt-s', text: gymHint }) : null));
    }

    // ----- check-in -----
    const ci = F.store.checkin(date);
    const ciCard = h('div', { class: 'card' });
    const drawCheckin = (editing) => {
      ciCard.innerHTML = '';
      const cur = Object.assign({ knee: 0, back: 0, energy: 1 }, F.store.checkin(date) || {});
      if (F.store.checkin(date) && !editing) {
        const face = (v) => ['🙂', '😐', '😣'][v];
        const bits = [];
        if (inj.knee) bits.push('Knees ' + face(cur.knee));
        if (inj.lumbar) bits.push('Back ' + face(cur.back));
        bits.push('Energy ' + ['😴', '🙂', '⚡'][cur.energy]);
        ciCard.append(h('div', { class: 'row between' }, h('div', null, h('div', { class: 'eyebrow', text: 'Checked in' }), h('div', { text: bits.join('   ') })), h('button', { class: 'btn xs ghost', text: 'Edit', onClick: () => drawCheckin(true) })));
        if (cur.knee >= 2 || cur.back >= 2) ciCard.append(h('div', { class: 'callout red small mt-s', text: `${cur.knee >= 2 ? 'Knees' : 'Back'} flared — ${past ? 'this day’s' : 'today’s'} plan swaps to a recovery session and filters out anything that loads it. Recovery days keep the streak and earn bonus XP.` }));
        else if (cur.knee === 1 || cur.back === 1) ciCard.append(h('div', { class: 'callout amber small mt-s', text: past ? 'Grumpy that day — gentler exercise options are picked first.' : 'Grumpy today — gentler exercise options are picked first. Stop anything sharp.' }));
        if (cur.energy === 0) ciCard.append(h('div', { class: 'callout sky small mt-s', text: 'Low energy: optional sets are trimmed. Showing up counts — full credit.' }));
        return;
      }
      const vals = Object.assign({}, cur);
      const row = (key, label, opts) => {
        const box = h('div', { class: 'ci-opts' });
        opts.forEach(([v, emo, txt, tone]) => box.append(h('button', { class: (vals[key] === v ? 'on ' : '') + tone, onClick: () => { vals[key] = v; box.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === opts.findIndex((o) => o[0] === v))); } }, h('b', { text: emo }), txt)));
        return h('div', { class: 'ci-row' }, h('span', { text: label }), box);
      };
      const body = h('div', { class: 'checkin' });
      const pain = [[0, '🙂', 'Good', 'g'], [1, '😐', 'Grumpy', 'a'], [2, '😣', 'Flared', 'r']];
      if (inj.knee) body.append(row('knee', 'Knees', pain));
      if (inj.lumbar) body.append(row('back', 'Back', pain));
      body.append(row('energy', 'Energy', [[0, '😴', 'Low', 'a'], [1, '🙂', 'OK', 'g'], [2, '⚡', 'High', 'g']]));
      ciCard.append(h('div', { class: 'eyebrow', text: past ? 'Check-in · how that day felt' : 'Morning check-in' }), body,
        h('button', { class: 'btn primary block mt', text: 'Save check-in', onClick: () => {
          F.store.setCheckin(D(), vals);
          F.ui.xpFloat(10, '📋');
          F.game.afterChange();
          F.app.render();
        } }));
    };
    drawCheckin(false);
    wrap.append(ciCard);

    // ----- the day's mission -----
    // On a past day nothing is started: a session is either filled in afterwards or just marked done.
    const sched = F.data.scheduled(date);
    const doneToday = F.store.sessionsOn(date).filter((x) => !x.auto);
    const open = (id) => (!past || (S.active && S.active.src === id && S.active.plan.date === date) ? start(id) : F.previewSession(id, { date }));
    const missions = h('div', { class: 'stack' });
    const missionCard = (res, alt) => {
      const tpl = res.flare && !alt ? res.flare.tpl : res.tpl;
      const done = doneToday.find((x) => x.src === tpl.id || x.tpl === tpl.id);
      const active = S.active && S.active.src === tpl.id && (past ? S.active.plan.date === date : !S.active.backfill);
      const card = h('div', { class: 'card' + (done ? '' : ' clickable') });
      card.append(h('div', { class: 'mission' + (done ? ' done' : '') },
        h('div', { class: 'emo', text: done ? '✅' : tpl.icon }),
        h('div', { class: 't' },
          h('div', { class: 'eyebrow', text: res.flare && !alt ? res.flare.why + ' — recovery instead' : past ? 'Planned for this day' : 'Today’s mission' }),
          h('b', { text: tpl.name }),
          h('div', { class: 'small muted', text: done ? `Done · ${F.ui.dur(done.minutes)} · +${num(done.xp)} XP` : `${tpl.sub} · ~${tpl.est} min` })),
        done ? null : h('button', { class: 'btn ' + (active ? 'primary' : past ? '' : 'fire'), onClick: (ev) => { ev.stopPropagation(); open(tpl.id); } },
          icon(past && !active ? 'check' : 'play', 14), active ? 'Resume' : past ? 'Log it' : 'Start')));
      for (const n of res.notes) card.append(h('div', { class: 'small muted mt-s', text: n }));
      if (res.flare && !alt && !done) card.append(h('div', { class: 'small mt-s' }, h('button', { class: 'btn xs ghost', text: past ? `Log ${res.tpl.name} instead` : `Do ${res.tpl.name} anyway`, onClick: (ev) => { ev.stopPropagation(); open(res.tpl.id); } })));
      if (!done) card.addEventListener('click', () => F.previewSession(tpl.id, { date: D() }));
      return card;
    };
    if (sched.length) sched.forEach((r) => missions.append(missionCard(r)));
    else missions.append(h('div', { class: 'card' }, h('div', { class: 'mission' }, h('div', { class: 'emo', text: '🌿' }), h('div', { class: 't' }, h('div', { class: 'eyebrow', text: 'Rest day' }), h('b', { text: 'Recover and stay loose' }), h('div', { class: 'small muted', text: 'PT, holds, mobility and a walk still count toward the streak.' })))));
    for (const x of doneToday) if (!sched.some((r) => r.id === x.tpl || r.id === x.src || (r.flare && r.flare.id === x.tpl))) missions.append(h('div', { class: 'card tight row nowrap' }, h('span', { text: x.icon || '✅' }), h('div', { class: 'grow' }, h('b', { text: x.title }), h('div', { class: 'small muted', text: `${F.ui.dur(x.minutes)} · +${num(x.xp)} XP` })), pill('done', 'green')));
    wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: 'Mission' }), h('button', { class: 'btn xs ghost', onClick: () => pickSession(D()) }, icon('swap', 14), past ? 'Did something else' : 'Do something else')), missions));

    // ----- daily quests -----
    // On a fast day the protein and food-log quests are off.
    const fastToday = F.game.fastDay(date), tasks = F.game.dailyTasksOn(date);
    const dayRec = C.days[date] || {};
    const tdone = dayRec.tasks || new Set();
    const ql = h('div', { class: 'card tight quests' });
    const protein = dayRec.protein || 0, pT = F.game.proteinTarget(), walked = dayRec.walkMin || 0, walkT = S.settings.walkMin || 30;
    const water = dayRec.water || 0, waterT = F.game.waterTarget(), cup = F.waterCup();
    const formal = formalOn(date);
    const cover = S.settings.formalPtCovers || {};
    const covered = new Set(formal ? ['pt'].concat(['holds', 'mobility'].filter((k) => cover[k])) : []);
    const coverText = ['your PT routine', covered.has('holds') ? 'daily holds' : '', covered.has('mobility') ? 'roll & stretch' : ''].filter(Boolean).join(', ');
    const fpt = formal
      ? h('div', { class: 'fpt on', onClick: () => F.formalSheet(D()) },
        h('span', { class: 'emo', text: '🩺' }),
        h('div', { class: 't' }, h('b', { text: 'Formal PT day' }), h('small', { text: `${F.ui.dur(formal.minutes)}${formal.notes ? ' · ' + formal.notes : ''} · covers ${coverText}` })),
        h('span', { class: 'pill purple', text: 'Edit' }))
      : h('button', { class: 'fpt', onClick: () => logFormal(D()) },
        h('span', { class: 'emo', text: '🩺' }),
        h('div', { class: 't' }, h('b', { text: past ? 'Formal PT that day?' : 'Formal PT today?' }), h('small', { text: past ? 'Tap if you had PT or PT Pilates — it counts as your PT routine' : 'Tap after PT or PT Pilates — it counts as your PT routine' })),
        icon('plus', 18));
    const holdsTpl = F.data.templateFor('holds', date), c = F.data.ctx(date);
    const holdNames = holdsTpl.blocks[0].items.map((it) => { const r = F.data.resolveSlot(it.slot, c); return r.ex ? r.ex.name : null; }).filter(Boolean).join(' + ');
    const fuelHref = past ? '#/fuel/' + date : '#/fuel';
    const subs = {
      checkin: ci ? 'done' : 'knees · back · energy',
      pt: (S.settings.ptRoutine || P.ptDefault).map((x) => (F.data.ex(x.ex) || {}).name).filter(Boolean).slice(0, 3).join(', ') + '…',
      holds: holdNames || '2 isometric holds',
      mobility: F.data.templateFor('mobility', date).name.replace('Roll & stretch: ', ''),
      walk: `${walked} / ${walkT} min`,
      protein: `${num(protein)} / ${pT} g`,
      water: `${F.u.volN(water)} / ${F.u.volN(waterT)} ${F.u.vu()}`,
      food: `${(S.food[date] || []).length} items${past ? '' : ' today'}`,
    };
    for (const t of tasks) {
      const done = tdone.has(t.id);
      const cov = covered.has(t.id);
      const openTask = () => {
        if (cov) F.formalSheet(D());
        else if (t.kind === 'session') start(t.session);
        else if (t.kind === 'walk') F.quickLog('walk', { date: D() });
        else if (t.kind === 'protein' || t.kind === 'food') location.hash = fuelHref;
        else if (t.kind === 'water') F.waterSheet(D());
        else if (t.kind === 'checkin') { drawCheckin(true); ciCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      };
      const tick = h('button', { class: 'tick' + (done ? ' on' : ''), 'aria-label': done ? 'Undo' : 'Mark done', onClick: (ev) => {
        ev.stopPropagation();
        if (cov) F.formalSheet(D());
        else if (t.kind === 'session') { if (done) { if (undoTask(t, D())) F.app.render(); } else { quickComplete(t, D()); F.app.render(); } }
        else openTask();
      } }, icon('check', 16));
      ql.append(h('div', { class: 'qrow' + (done ? ' done' : '') + (cov ? ' covered' : ''), onClick: openTask },
        h('span', { class: 'emo', text: t.icon }),
        h('div', { class: 't' }, h('b', { text: t.label === 'Walk' ? `Walk ${walkT} min` : t.label }), h('small', { text: cov ? 'Covered by formal PT 🩺' : subs[t.id] || t.sub || '' })),
        h('span', { class: 'pill xp', text: '+' + t.xp }), tick));
    }
    const nDone = tasks.filter((t) => tdone.has(t.id)).length;
    wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: 'Daily quests' }), h('span', { class: 'small muted', text: `${nDone} / ${tasks.length}` })), fpt, ql,
      fastToday ? h('div', { class: 'small muted mt-s', text: `⏳ Fast day: Hit protein and Log food are off ${past ? 'for this day' : 'today'}. Water still counts.` }) : null));

    // ----- fuel snapshot -----
    const ws = F.ui.weekStart(date), thisWeek = ws === F.ui.weekStart(today);
    const wk = C.weeks[ws] || F.game.weekQuotas(ws, C.days, S);
    const treatQ = wk && wk.list.find((q) => q.id === 'sugar');
    const used = treatQ && treatQ.extra ? treatQ.extra.used : 0, budget = F.game.treatBudget();
    const fuel = h('div', { class: 'card' });
    const fs = h('div', { class: 'fuelsnap' },
      F.ui.ring(protein / pT, { size: 92, stroke: 9, label: num(protein), sub: fastToday ? 'fast day' : `/ ${pT} g`, color: fastToday ? 'var(--purple)' : undefined }),
      h('div', { class: 'stack', style: { gap: '6px' } },
        h('div', null, h('div', { class: 'row between small' }, h('span', { text: thisWeek ? '🍪 Treats this week' : '🍪 Treats that week' }), h('b', { text: `${num(used, 1)} / ${num(budget, 1)}` })), progress(budget ? used / budget : 1, used > budget ? 'red' : used > budget * 0.8 ? 'amber' : 'green')),
        h('div', null, h('div', { class: 'row between small' }, h('span', { text: '💧 Water' }), h('b', { text: `${F.u.volN(water)} / ${F.u.volN(waterT)} ${F.u.vu()}` })), progress(water / waterT, F.game.waterMet(water, waterT) ? 'green' : 'sky')),
        h('div', { class: 'small muted', text: `${past ? 'This day' : 'Today'}: ${F.fmtTreats(dayRec.treats || 0)}${S.settings.nutrition.trackKcal ? ` · ≈ ${num(dayRec.kcalIn || 0)} kcal eaten` : ''} · ≈ ${num(dayRec.kcal || 0)} kcal burned` }),
        h('div', { class: 'btngroup' }, h('button', { class: 'btn sm', onClick: () => F.foodSheet(D()) }, icon('plus', 14), 'Food'),
          h('button', { class: 'btn sm', onClick: () => F.logWater(D(), cup, () => F.app.render()) }, '💧 +' + F.u.vol(cup)),
          h('a', { class: 'btn sm ghost', href: fuelHref }, 'Fuel', icon('chevron', 14)))));
    fuel.append(h('div', { class: 'eyebrow', text: 'Fuel' }), fs);
    const fastMini = past ? null : F.fastMini(date);
    if (fastMini) fuel.append(h('div', { class: 'divider' }), fastMini);
    wrap.append(fuel);

    // ----- weekly quests -----
    if (wk) {
      const grid = h('div', { class: 'wq' });
      for (const q of wk.list) {
        if (!q.target) continue;
        let val, pct;
        if (q.kind === 'sugar') { val = h('div', { class: 'val', text: num(q.extra ? q.extra.used : 0, 1) }, h('small', { text: ` / ${num(budget, 1)} treats` })); pct = q.extra && budget ? Math.min(1, q.extra.used / budget) : 0; }
        else { val = h('div', { class: 'val', text: num(q.done) }, h('small', { text: ' / ' + q.target })); pct = q.done / q.target; }
        grid.append(h('div', { class: 'w' + (q.met ? ' met' : '') }, h('div', { class: 'top' }, h('span', { text: q.icon + ' ' + q.label }), q.met ? h('span', { text: '✓' }) : null), val, progress(pct, q.kind === 'sugar' ? (pct > 1 ? 'red' : 'green') : q.met ? 'green' : '')));
      }
      const met = wk.list.filter((q) => q.target && q.met).length, tot = wk.list.filter((q) => q.target).length;
      wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: thisWeek ? 'Weekly quests' : 'Quests · week of ' + F.ui.fmtDate(ws, { month: 'short', day: 'numeric' }) }), h('span', { class: 'small muted', text: `${met} / ${tot} · perfect week +${P.perfectXP} XP` })), grid,
        wk.travelDays ? h('div', { class: 'small muted mt-s', text: `${wk.travelDays} travel day${wk.travelDays > 1 ? 's' : ''} ${thisWeek ? 'this' : 'that'} week — targets scaled.` }) : null,
        wk.fastDays ? h('div', { class: 'small muted mt-s', text: `${wk.fastDays} fast day${wk.fastDays > 1 ? 's' : ''} ${thisWeek ? 'this' : 'that'} week — the protein target is lower to match.` }) : null));
    }
    if (past) return wrap;

    // ----- nudges -----
    const nudges = h('div', { class: 'stack' });
    const lastM = S.measurements[S.measurements.length - 1];
    const daysSinceM = lastM ? F.ui.daysBetween(lastM.date, date) : null;
    if (!lastM || daysSinceM >= 28) nudges.append(h('div', { class: 'callout sky row between' }, h('span', { text: lastM ? `📏 Monthly measurements are due (${daysSinceM} days since the last).` : '📏 Log baseline measurements — the numbers you’ll beat.' }), h('button', { class: 'btn sm', text: 'Measure', onClick: () => F.measureSheet() })));
    const real = S.sessions.filter((x) => !x.auto).length;
    if (real >= 8 && !F.sync.connected() && (!S.backupAt || F.ui.daysBetween(S.backupAt, date) >= 14)) nudges.append(h('div', { class: 'callout row between' }, h('span', { text: '💾 Your progress lives only on this device. Turn on sync or save a backup.' }), h('a', { class: 'btn sm', href: '#/settings/sync', text: 'Sync' })));
    if (nudges.childNodes.length) wrap.append(nudges);

    const iv = setInterval(() => { const el = document.querySelector('[data-fastmini]'); if (el && S.activeFast) el.replaceWith(F.fastMini(date)); }, 30000);
    wrap._cleanup = () => clearInterval(iv);
    return wrap;
  };

  function pickSession(date) {
    const groups = {};
    for (const s of F.data.sessions()) { if (s.gate === 'run' && !F.store.load().settings.runUnlocked) continue; (groups[s.group] || (groups[s.group] = [])).push(s); }
    const sh = sheet(h('div', null, h('h2', { text: 'Pick a session' }), h('p', { class: 'small muted', text: 'Weekly quests count whatever you actually do — the schedule is only a suggestion.' }),
      Object.entries(groups).map(([g, list]) => h('div', { class: 'mt' }, h('div', { class: 'eyebrow', text: g }), h('div', { class: 'list' }, list.map((s) => h('div', { class: 'item', onClick: () => { sh.close(); F.previewSession(s.id, { date }); } },
        h('span', { class: 'emo', text: s.icon }), h('div', { class: 't' }, h('b', { text: s.name }), h('small', { text: `${s.sub} · ~${s.est} min` })), icon('chevron', 16))))))));
  }
  F.pickSession = pickSession;
})();
