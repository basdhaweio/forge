/* Today: where you are, how the knees and back feel, today's mission, daily and weekly quests, fuel at a glance. */
(() => {
  const { h, icon, toast, sheet, num, pill, progress } = F.ui;

  function closeIdleActive(src) {
    const S = F.store.load();
    if (S.active && S.active.src === src && !F.activeProgress(S.active)) { S.active = null; F.timer.stopRest(); F.store.save(); }
  }
  function quickComplete(task, date) {
    closeIdleActive(task.session);
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
    toast(`${task.label} logged`, 2600, { label: 'Undo', run: () => { F.store.removeSession(rec.id); F.app.render(); } });
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
    closeIdleActive('pt');
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
    toast(`Formal PT logged · ${minutes} min — PT routine covered`, 3200, { label: 'Edit', run: () => F.formalSheet(date) });
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

  F.quickMenu = () => {
    const S = F.store.load();
    const go = (fn) => () => { sh.close(); fn(); };
    const sh = sheet(h('div', null, h('h2', { text: 'Log something' }), h('div', { class: 'list mt' },
      h('div', { class: 'item', onClick: go(() => F.quickLog()) }, h('span', { class: 'emo', text: '🥋' }), h('div', { class: 't' }, h('b', { text: 'Activity' }), h('small', { text: 'Krav class, walk, ride, run, PT visit, anything' }))),
      h('div', { class: 'item', onClick: go(() => F.quickLog('walk')) }, h('span', { class: 'emo', text: '🚶' }), h('div', { class: 't' }, h('b', { text: 'Walk' }), h('small', { text: 'Minutes, distance or steps' }))),
      h('div', { class: 'item', onClick: go(() => F.foodSheet()) }, h('span', { class: 'emo', text: '🍗' }), h('div', { class: 't' }, h('b', { text: 'Food' }), h('small', { text: 'Meals, protein, treats' }))),
      h('div', { class: 'item', onClick: go(() => { location.hash = '#/fuel'; }) }, h('span', { class: 'emo', text: '⏳' }), h('div', { class: 't' }, h('b', { text: S.activeFast ? 'Fast in progress' : 'Start a fast' }), h('small', { text: 'Timer with body-state stages' }))),
      h('div', { class: 'item', onClick: go(() => F.measureSheet()) }, h('span', { class: 'emo', text: '📏' }), h('div', { class: 't' }, h('b', { text: 'Measurements' }), h('small', { text: 'Monthly tape check-in' }))))));
  };

  F.views.today = () => {
    const S = F.store.load(), P = F.data.prog(), C = F.game.compute();
    const date = F.ui.today();
    const wrap = h('div', { class: 'stack', style: { gap: '14px' } });
    const inj = S.profile.injuries || {};

    // ----- resume banner -----
    if (S.active) {
      const A = S.active;
      const mins = Math.round(F.activeMs(A) / 60000);
      const discard = async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!(await F.ui.confirmDlg(`Discard ${A.plan.title}?`, { ok: 'Discard', danger: true, sub: 'Nothing from it gets logged.' }))) return;
        S.active = null; F.timer.stopRest(); F.store.saveNow(); F.app.render();
      };
      wrap.append(h('a', { class: 'card glow row nowrap', href: '#/play', style: { color: 'inherit' } },
        h('span', { style: { fontSize: '1.6rem' }, text: A.plan.icon }),
        h('div', { class: 'grow' }, h('b', { text: 'Resume ' + A.plan.title }), h('div', { class: 'small muted', text: `${A.pausedAt ? 'Paused · ' : ''}${F.ui.dur(mins)} on the clock · opened ${F.ui.relDay(A.plan.date)}` })),
        h('button', { class: 'btn sm ghost', 'aria-label': 'Discard this session', title: 'Discard', onClick: discard }, icon('x', 14)),
        h('span', { class: 'btn sm primary' }, icon('play', 14), 'Resume')));
    }

    // ----- hero -----
    const hr = new Date().getHours();
    const greet = (hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + (S.profile.name ? ', ' + S.profile.name : '');
    const travel = F.store.isTravel(date);
    const locbar = h('div', { class: 'locbar' });
    const setLoc = (fn) => { fn(); F.store.save(); F.app.render(); };
    const todayLoc = F.store.location(date);
    if (!travel) {
      for (const l of ['home', 'gym']) {
        const L = F.data.loc(l);
        locbar.append(h('button', { class: todayLoc === l ? 'on' : '', onClick: () => { F.store.setLocation(date, l); F.app.render(); } }, L.icon + ' ' + (l === 'gym' ? 'Gym day' : L.label)));
      }
      locbar.append(h('button', { class: 'trip', onClick: () => setLoc(() => { F.store.startTrip(date); toast('Travel mode on — plans use your travel kit and weekly quests scale down.', 3500); }) }, '✈️ Travelling'));
    } else {
      for (const l of ['room', 'hotelgym']) {
        const L = F.data.loc(l);
        locbar.append(h('button', { class: 'trip ' + (S.settings.travelLoc === l ? 'on' : ''), onClick: () => setLoc(() => { S.settings.travelLoc = l; }) }, L.icon + ' ' + L.label));
      }
      locbar.append(h('button', { onClick: () => setLoc(() => { F.store.endTrip(date); toast('Welcome home.'); }) }, '🏠 Back home'));
    }
    wrap.append(h('div', { class: 'hero' },
      h('div', { class: 'greet', text: greet + ' · ' + F.ui.fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) }),
      h('h1', { text: C.streak.current >= 2 ? `Day ${C.streak.current} of the streak` : C.streak.activeToday ? 'On the board today' : 'Let’s get a rep in' }),
      h('div', { class: 'row small muted' }, h('span', { text: `Level ${C.level.level} ${C.level.title}` }), h('span', { text: '·' }), h('span', { text: `${num(C.level.need - C.level.into)} XP to level ${C.level.level + 1}` }),
        C.streak.freezes ? h('span', { title: 'Streak freezes banked — a missed day spends one instead of breaking the streak', text: '· ' + '❄️'.repeat(C.streak.freezes) }) : null),
      h('div', { class: 'mt-s' }, h('div', { class: 'xpbar', style: { height: '8px' } }, h('i', { style: { width: C.level.pct * 100 + '%' } }))),
      locbar,
      travel ? h('div', { class: 'small muted mt-s', text: 'Travel mode: sessions use your travel kit, the 4×4 goes machine-free if needed, and weekly quests scale to the days away.' })
        : todayLoc === 'gym' ? h('div', { class: 'small muted mt-s', text: 'Gym day: today’s strength session becomes a gym session (cables, pulldown, machines). Tomorrow goes back to home.' }) : null));

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
        if (cur.knee >= 2 || cur.back >= 2) ciCard.append(h('div', { class: 'callout red small mt-s', text: `${cur.knee >= 2 ? 'Knees' : 'Back'} flared — today's plan swaps to a recovery session and filters out anything that loads it. Recovery days keep the streak and earn bonus XP.` }));
        else if (cur.knee === 1 || cur.back === 1) ciCard.append(h('div', { class: 'callout amber small mt-s', text: 'Grumpy today — gentler exercise options are picked first. Stop anything sharp.' }));
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
      ciCard.append(h('div', { class: 'eyebrow', text: 'Morning check-in' }), body,
        h('button', { class: 'btn primary block mt', text: 'Save check-in', onClick: () => {
          F.store.setCheckin(date, vals);
          F.ui.xpFloat(10, '📋');
          F.game.afterChange();
          F.app.render();
        } }));
    };
    drawCheckin(false);
    wrap.append(ciCard);

    // ----- today's mission -----
    const sched = F.data.scheduled(date);
    const doneToday = F.store.sessionsOn(date).filter((x) => !x.auto);
    const missions = h('div', { class: 'stack' });
    const missionCard = (res, alt) => {
      const tpl = res.flare && !alt ? res.flare.tpl : res.tpl;
      const done = doneToday.find((x) => x.src === tpl.id || x.tpl === tpl.id);
      const active = S.active && S.active.src === tpl.id;
      const card = h('div', { class: 'card' + (done ? '' : ' clickable') });
      card.append(h('div', { class: 'mission' + (done ? ' done' : '') },
        h('div', { class: 'emo', text: done ? '✅' : tpl.icon }),
        h('div', { class: 't' },
          h('div', { class: 'eyebrow', text: res.flare && !alt ? res.flare.why + ' — recovery instead' : 'Today’s mission' }),
          h('b', { text: tpl.name }),
          h('div', { class: 'small muted', text: done ? `Done · ${F.ui.dur(done.minutes)} · +${num(done.xp)} XP` : `${tpl.sub} · ~${tpl.est} min` })),
        done ? null : h('button', { class: 'btn ' + (active ? 'primary' : 'fire'), onClick: (ev) => { ev.stopPropagation(); F.startSession(tpl.id); } }, icon('play', 14), active ? 'Resume' : 'Start')));
      for (const n of res.notes) card.append(h('div', { class: 'small muted mt-s', text: n }));
      if (res.flare && !alt && !done) card.append(h('div', { class: 'small mt-s' }, h('button', { class: 'btn xs ghost', text: `Do ${res.tpl.name} anyway`, onClick: (ev) => { ev.stopPropagation(); F.startSession(res.tpl.id); } })));
      if (!done) card.addEventListener('click', () => F.previewSession(tpl.id));
      return card;
    };
    if (sched.length) sched.forEach((r) => missions.append(missionCard(r)));
    else missions.append(h('div', { class: 'card' }, h('div', { class: 'mission' }, h('div', { class: 'emo', text: '🌿' }), h('div', { class: 't' }, h('div', { class: 'eyebrow', text: 'Rest day' }), h('b', { text: 'Recover and stay loose' }), h('div', { class: 'small muted', text: 'PT, holds, mobility and a walk still count toward the streak.' })))));
    for (const x of doneToday) if (!sched.some((r) => r.id === x.tpl || r.id === x.src || (r.flare && r.flare.id === x.tpl))) missions.append(h('div', { class: 'card tight row nowrap' }, h('span', { text: x.icon || '✅' }), h('div', { class: 'grow' }, h('b', { text: x.title }), h('div', { class: 'small muted', text: `${F.ui.dur(x.minutes)} · +${num(x.xp)} XP` })), pill('done', 'green')));
    wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: 'Mission' }), h('button', { class: 'btn xs ghost', onClick: () => pickSession(date) }, icon('swap', 14), 'Do something else')), missions));

    // ----- daily quests -----
    const dayRec = C.days[date] || {};
    const tdone = dayRec.tasks || new Set();
    const ql = h('div', { class: 'card tight quests' });
    const protein = dayRec.protein || 0, pT = F.game.proteinTarget(), walked = dayRec.walkMin || 0, walkT = S.settings.walkMin || 30;
    const formal = formalOn(date);
    const cover = S.settings.formalPtCovers || {};
    const covered = new Set(formal ? ['pt'].concat(['holds', 'mobility'].filter((k) => cover[k])) : []);
    const coverText = ['your PT routine', covered.has('holds') ? 'daily holds' : '', covered.has('mobility') ? 'roll & stretch' : ''].filter(Boolean).join(', ');
    const fpt = formal
      ? h('div', { class: 'fpt on', onClick: () => F.formalSheet(date) },
        h('span', { class: 'emo', text: '🩺' }),
        h('div', { class: 't' }, h('b', { text: 'Formal PT day' }), h('small', { text: `${F.ui.dur(formal.minutes)}${formal.notes ? ' · ' + formal.notes : ''} · covers ${coverText}` })),
        h('span', { class: 'pill purple', text: 'Edit' }))
      : h('button', { class: 'fpt', onClick: () => logFormal(date) },
        h('span', { class: 'emo', text: '🩺' }),
        h('div', { class: 't' }, h('b', { text: 'Formal PT today?' }), h('small', { text: 'Tap after PT or PT Pilates — it counts as your PT routine' })),
        icon('plus', 18));
    const holdsTpl = F.data.templateFor('holds', date), c = F.data.ctx(date);
    const holdNames = holdsTpl.blocks[0].items.map((it) => { const r = F.data.resolveSlot(it.slot, c); return r.ex ? r.ex.name : null; }).filter(Boolean).join(' + ');
    const subs = {
      checkin: ci ? 'done' : 'knees · back · energy',
      pt: (S.settings.ptRoutine || P.ptDefault).map((x) => (F.data.ex(x.ex) || {}).name).filter(Boolean).slice(0, 3).join(', ') + '…',
      holds: holdNames || '2 isometric holds',
      mobility: F.data.templateFor('mobility', date).name.replace('Roll & stretch: ', ''),
      walk: `${walked} / ${walkT} min`,
      protein: `${num(protein)} / ${pT} g`,
      food: `${(S.food[date] || []).length} items today`,
    };
    for (const t of P.dailyTasks) {
      const done = tdone.has(t.id);
      const cov = covered.has(t.id);
      const open = () => {
        if (cov) F.formalSheet(date);
        else if (t.kind === 'session') F.startSession(t.session);
        else if (t.kind === 'walk') F.quickLog('walk');
        else if (t.kind === 'protein' || t.kind === 'food') location.hash = '#/fuel';
        else if (t.kind === 'checkin') { drawCheckin(true); ciCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      };
      const tick = h('button', { class: 'tick' + (done ? ' on' : ''), 'aria-label': done ? 'Undo' : 'Mark done', onClick: (ev) => {
        ev.stopPropagation();
        if (cov) F.formalSheet(date);
        else if (t.kind === 'session') { if (done) { if (undoTask(t, date)) F.app.render(); } else { quickComplete(t, date); F.app.render(); } }
        else open();
      } }, icon('check', 16));
      ql.append(h('div', { class: 'qrow' + (done ? ' done' : '') + (cov ? ' covered' : ''), onClick: open },
        h('span', { class: 'emo', text: t.icon }),
        h('div', { class: 't' }, h('b', { text: t.label === 'Walk' ? `Walk ${walkT} min` : t.label }), h('small', { text: cov ? 'Covered by formal PT 🩺' : subs[t.id] || t.sub || '' })),
        h('span', { class: 'pill xp', text: '+' + t.xp }), tick));
    }
    const nDone = P.dailyTasks.filter((t) => tdone.has(t.id)).length;
    wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: 'Daily quests' }), h('span', { class: 'small muted', text: `${nDone} / ${P.dailyTasks.length}` })), fpt, ql));

    // ----- fuel snapshot -----
    const wk = C.thisWeek;
    const treatQ = wk && wk.list.find((q) => q.id === 'sugar');
    const used = treatQ && treatQ.extra ? treatQ.extra.used : 0, budget = F.game.treatBudget();
    const fuel = h('div', { class: 'card' });
    const fs = h('div', { class: 'fuelsnap' },
      F.ui.ring(protein / pT, { size: 92, stroke: 9, label: num(protein), sub: `/ ${pT} g` }),
      h('div', { class: 'stack', style: { gap: '6px' } },
        h('div', null, h('div', { class: 'row between small' }, h('span', { text: '🍪 Treats this week' }), h('b', { text: `${num(used, 1)} / ${num(budget, 1)}` })), progress(budget ? used / budget : 1, used > budget ? 'red' : used > budget * 0.8 ? 'amber' : 'green')),
        h('div', { class: 'small muted', text: `Today: ${F.fmtTreats(dayRec.treats || 0)}${S.settings.nutrition.trackKcal ? ` · ≈ ${num(dayRec.kcalIn || 0)} kcal eaten` : ''} · ≈ ${num(dayRec.kcal || 0)} kcal burned` }),
        h('div', { class: 'btngroup' }, h('button', { class: 'btn sm', onClick: () => F.foodSheet() }, icon('plus', 14), 'Food'), h('a', { class: 'btn sm ghost', href: '#/fuel' }, 'Fuel', icon('chevron', 14)))));
    fuel.append(h('div', { class: 'eyebrow', text: 'Fuel' }), fs);
    const fastMini = F.fastMini(date);
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
      wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: 'Weekly quests' }), h('span', { class: 'small muted', text: `${met} / ${tot} · perfect week +${P.perfectXP} XP` })), grid,
        wk.travelDays ? h('div', { class: 'small muted mt-s', text: `${wk.travelDays} travel day${wk.travelDays > 1 ? 's' : ''} this week — targets scaled.` }) : null));
    }

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
