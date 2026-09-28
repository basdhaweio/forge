/* Train: session catalogue, quick activity log, history, and the exercise library. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, mmss, pill } = F.ui;
  const CATS = [['all', 'All'], ['pt', 'PT'], ['strength', 'Strength'], ['core', 'Core'], ['iso', 'Holds'], ['carry', 'Carries'], ['mobility', 'Mobility'], ['yoga', 'Yoga'], ['krav', 'Krav'], ['conditioning', 'Conditioning'], ['cardio', 'Cardio']];
  const FLAGTXT = { ok: 'fine', caution: 'caution', avoid: 'avoid' };

  // ---------- quick activity log ----------
  F.quickLog = (actId, { date } = {}) => {
    const P = F.data.prog(), S = F.store.load();
    let act = P.activities.find((a) => a.id === actId) || null;
    const body = h('div');
    const sh = sheet(body);
    function draw() {
      body.innerHTML = '';
      if (!act) {
        body.append(h('h2', { text: 'Log an activity' }), h('p', { class: 'small muted', text: 'Anything you did outside a guided session — it all counts.' }),
          h('div', { class: 'list mt' }, P.activities.map((a) => h('div', { class: 'item', onClick: () => { act = a; draw(); } }, h('span', { class: 'emo', text: a.icon }), h('div', { class: 't' }, h('b', { text: a.label }), h('small', { text: F.data.stat(a.stat).name + (a.tags.length ? ' · counts toward ' + a.tags.filter((t) => t !== 'cardio').join(', ') : '') })), icon('chevron', 16)))));
        return;
      }
      const today = F.ui.today();
      const dateIn = h('input', { type: 'date', value: date || today, max: today });
      const minIn = F.ui.numIn(act.id === 'walk' ? S.settings.walkMin || 30 : act.id === 'krav_class' ? 60 : act.id === 'pt_visit' ? 45 : 30, { step: 1 });
      const distIn = act.fields.includes('dist') ? F.ui.numIn(null, { placeholder: F.u.du() }) : null;
      const hrIn = act.fields.includes('hr') ? F.ui.numIn(null, { placeholder: 'bpm', step: 1 }) : null;
      const stepsIn = act.fields.includes('steps') ? F.ui.numIn(null, { placeholder: 'steps', step: 1 }) : null;
      const notes = h('textarea', { placeholder: 'Notes (optional)', style: { minHeight: '50px' } });
      body.append(
        h('button', { class: 'btn xs ghost mb', onClick: () => { act = null; draw(); } }, icon('back', 14), 'All activities'),
        h('h2', { text: act.icon + ' ' + act.label }),
        h('div', { class: 'fieldrow mt' },
          h('label', { class: 'field' }, h('span', { text: 'Date' }), dateIn),
          h('label', { class: 'field' }, h('span', { text: 'Minutes' }), minIn),
          distIn ? h('label', { class: 'field' }, h('span', { text: 'Distance (' + F.u.du() + ')' }), distIn) : null,
          hrIn ? h('label', { class: 'field' }, h('span', { text: 'Avg heart rate' }), hrIn) : null,
          stepsIn ? h('label', { class: 'field' }, h('span', { text: 'Steps' }), stepsIn) : null),
        notes,
        h('button', { class: 'btn fire big block mt', onClick: saveIt }, icon('check', 18), 'Log it'));
      function saveIt() {
        let minutes = +minIn.value || 0;
        const steps = stepsIn && stepsIn.value ? Math.round(+stepsIn.value) : null;
        if (!minutes && steps) minutes = Math.round(steps / 110);
        if (!minutes) { toast('Add the minutes'); return; }
        const tags = act.tags.slice();
        if (act.z2At && minutes >= act.z2At && !tags.includes('z2')) tags.push('z2');
        const rec = { date: dateIn.value || today, tpl: null, act: act.id, title: act.label, icon: act.icon, tags, stat: act.stat, met: act.met, phase: S.settings.phase, loc: F.store.location(dateIn.value || today),
          minutes, kcal: F.game.kcal(act.met, minutes), dist: distIn && distIn.value ? F.u.dIn(+distIn.value) : null, hr: hrIn && hrIn.value ? +hrIn.value : null, steps,
          mode: act.id === 'bike' ? 'bike' : act.id === 'run' ? 'run' : tags.includes('walk') ? 'walk' : null, entries: [], notes: notes.value.trim() };
        rec.prs = [];
        const x = F.game.sessionXP(rec);
        rec.xp = x.xp; rec.split = x.split;
        F.store.addSession(rec);
        sh.close();
        F.ui.xpFloat(rec.xp, F.data.stat(act.stat).icon);
        F.timer.sfx('pop');
        toast(`${act.label} logged · ${F.ui.dur(minutes)}`, 2400, { label: 'Undo', run: () => { F.store.removeSession(rec.id); F.app.render(); } });
        F.game.afterChange();
        F.app.render();
      }
    }
    draw();
  };

  // ---------- exercise sheet ----------
  F.exSheet = (id) => {
    const e = F.data.ex(id);
    if (!e) return;
    const c = F.data.ctx();
    const T = F.game.compute().T;
    const why = F.data.blocked(e, c);
    const flag = (label, v) => (v ? h('span', { class: 'flag ' + v, text: `${label}: ${FLAGTXT[v]}` }) : null);
    const body = h('div');
    body.append(h('div', { class: 'eyebrow', text: `${(CATS.find((x) => x[0] === e.cat) || [0, e.cat])[1]} · ${F.data.stat(e.stat).icon} ${F.data.stat(e.stat).name}` }),
      h('h2', { text: e.name }),
      h('div', { class: 'exflags' }, flag('Knee', e.knee), flag('Back', e.back), flag('Shoulder', e.sh), (e.phase || 1) > 1 ? pill('Phase ' + e.phase + '+', 'purple') : null, e.gate === 'run' ? pill('Run Again quest', 'purple') : null),
      h('div', { class: 'small muted mt-s', text: e.equip.length ? 'Needs: ' + e.equip.map((r) => r.split('|').map(F.data.equipLabel).join(' or ')).join(' + ') : 'No equipment' }),
      h('ol', { class: 'cues' }, e.cues.map((cu) => h('li', { text: cu }))),
      e.note ? h('div', { class: 'callout mt small', text: e.note }) : null,
      h('div', { class: 'small mt ' + (why ? 'amber' : 'green'), text: why ? 'Right now: ' + why : `Available at ${F.data.loc(c.loc).label.toLowerCase()}.` }));
    const best = [];
    if (T.e1rm[id]) best.push('est. 1RM ' + F.u.w(T.e1rm[id]));
    if (T.maxW[id]) best.push('heaviest ' + F.u.w(T.maxW[id]));
    if (T.repsBest[id]) best.push('most reps ' + T.repsBest[id]);
    if (T.holdBest[id]) best.push('longest hold ' + mmss(T.holdBest[id]));
    if (T.carryMax[id]) best.push('heaviest carry ' + F.u.w(T.carryMax[id]));
    if (best.length) body.append(h('div', { class: 'callout green mt small' }, h('b', { text: 'Your records: ' }), best.join(' · ')));
    const hist = F.store.load().sessions.filter((s) => (s.entries || []).some((en) => en.ex === id && !en.kind)).slice(-5).reverse();
    if (hist.length) {
      body.append(h('div', { class: 'eyebrow mt', text: 'Recent' }));
      for (const s of hist) {
        const en = s.entries.find((x) => x.ex === id && !x.kind);
        const txt = en.sets.map((z) => e.log === 'wr' ? `${z.w ? F.u.wv(z.w) + '×' : ''}${z.r || 0}` : e.log === 'h' ? mmss(z.s || 0) : e.log === 'ws' ? `${F.u.wv(z.w)}${F.u.wu()}·${z.s}s` : String(z.r || 0)).join(', ');
        body.append(h('div', { class: 'row between small', style: { padding: '4px 0' } }, h('span', { class: 'muted', text: F.ui.fmtDate(s.date) }), h('span', { text: txt })));
      }
    }
    const slots = Object.entries(F.data.prog().slots).filter(([, sl]) => sl.cands.includes(id)).map(([k, sl]) => [k, sl.name]);
    if (slots.length) {
      const prefs = F.store.load().settings.slotPrefs;
      body.append(h('div', { class: 'eyebrow mt', text: 'Used for' }), h('div', { class: 'chips' }, slots.map(([k, name]) => h('button', { class: 'chip small' + (prefs[k] === id ? ' on' : ''), title: 'Make this my go-to for ' + name, text: (prefs[k] === id ? '★ ' : '') + name, onClick: (ev) => {
        if (prefs[k] === id) delete prefs[k]; else prefs[k] = id;
        F.store.save(); ev.target.classList.toggle('on', prefs[k] === id); ev.target.textContent = (prefs[k] === id ? '★ ' : '') + name;
        toast(prefs[k] === id ? `${e.name} is now your go-to for ${name}` : 'Preference cleared');
      } }))), h('div', { class: 'tiny muted mt-s', text: 'Tap a slot to make this your go-to whenever it fits your equipment and today’s check-in.' }));
    }
    sheet(body);
  };

  // ---------- views ----------
  F.views.train = (tab = 'sessions') => {
    const wrap = h('div');
    wrap.append(h('div', { class: 'pagehead row between' }, h('div', null, h('h1', { text: 'Train' }), h('div', { class: 'sub', text: 'Sessions, your log and the exercise library' })),
      h('button', { class: 'btn fire', onClick: () => F.quickLog() }, icon('plus', 16), 'Log activity')));
    const tabs = h('div', { class: 'tabs' });
    for (const [k, label] of [['sessions', 'Sessions'], ['history', 'History'], ['library', 'Library']]) tabs.append(h('a', { href: '#/train/' + k, class: tab === k ? 'active' : '', text: label }));
    wrap.append(tabs);
    if (tab === 'history') wrap.append(history());
    else if (tab === 'library') wrap.append(library());
    else wrap.append(sessionsTab());
    return wrap;
  };

  function sessionsTab() {
    const S = F.store.load(), P = F.data.prog();
    const out = h('div');
    const sched = S.settings.schedule || P.schedule;
    const week = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: 'Your week' }), h('a', { class: 'btn xs ghost', href: '#/settings/program', text: 'Edit' })));
    const todayDow = F.ui.dow(F.ui.today());
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
      const names = (sched[String(d)] || []).map((id) => (F.data.session(id) || {}).name).filter(Boolean);
      week.append(h('div', { class: 'row nowrap small', style: { padding: '5px 0', fontWeight: d === todayDow ? 700 : 400 } },
        h('span', { style: { width: '44px' }, class: d === todayDow ? 'accent' : 'muted', text: F.ui.DAYS[d].slice(0, 3) }),
        h('span', { class: 'grow', text: names.join(' + ') || 'Rest' }),
        d === S.settings.fast.day ? pill('fast day', 'purple') : null));
    }
    out.append(week);
    const groups = {};
    for (const s of F.data.sessions()) (groups[s.group] || (groups[s.group] = [])).push(s);
    for (const [g, list] of Object.entries(groups)) {
      out.append(h('div', { class: 'section-title' }, h('h2', { text: g })));
      const grid = h('div', { class: 'grid' });
      for (const s of list) {
        const locked = s.gate === 'run' && !S.settings.runUnlocked;
        grid.append(h('div', { class: 'card clickable' + (locked ? ' dim' : ''), style: locked ? { opacity: 0.55 } : null, onClick: () => (locked ? toast('Unlocks at the clearance step of the Run Again quest') : F.previewSession(s.id)) },
          h('div', { class: 'row nowrap' }, h('span', { style: { fontSize: '1.7rem' }, text: s.icon }), h('div', { class: 'grow' }, h('b', { text: s.name }), h('div', { class: 'small muted', text: `${s.sub} · ~${s.est} min` })), locked ? pill('locked') : null)));
      }
      out.append(grid);
    }
    return out;
  }

  function history() {
    const S = F.store.load();
    const out = h('div');
    const list = S.sessions.slice().reverse();
    if (!list.length) { out.append(h('div', { class: 'empty', text: 'Nothing logged yet. Your first rep is waiting on the Today tab.' })); return out; }
    let cur = '';
    let box = null;
    for (const s of list.slice(0, 250)) {
      if (s.date !== cur) {
        cur = s.date;
        out.append(h('div', { class: 'eyebrow mt', text: F.ui.fmtDate(s.date, { weekday: 'long', month: 'short', day: 'numeric' }) + ' · ' + F.ui.relDay(s.date) }));
        box = h('div', { class: 'list' });
        out.append(box);
      }
      box.append(h('div', { class: 'item', onClick: () => detail(s) },
        h('span', { class: 'emo', text: s.icon || '•' }),
        h('div', { class: 't' }, h('b', { text: s.title }), h('small', { text: [F.ui.dur(s.minutes), s.dist ? F.u.d(s.dist) : null, s.rounds ? s.rounds + ' rounds' : null, s.auto ? 'quick tick' : null].filter(Boolean).join(' · ') })),
        s.prs && s.prs.length ? pill('🎉 ' + s.prs.length + ' PR', 'amber') : null,
        h('span', { class: 'pill xp', text: '+' + num(s.xp || 0) })));
    }
    return out;
  }

  function detail(s) {
    const body = h('div');
    const L = F.data.loc(s.loc);
    body.append(h('div', { class: 'eyebrow', text: F.ui.fmtDate(s.date) + (s.loc ? ' · ' + L.icon + ' ' + L.label : '') }), h('h2', { text: (s.icon || '') + ' ' + s.title }),
      h('div', { class: 'small muted', text: `${F.ui.dur(s.minutes)} · ≈ ${num(s.kcal)} kcal · +${num(s.xp)} XP${s.rpe ? ' · RPE ' + s.rpe : ''}` }));
    for (const en of s.entries || []) {
      const e = F.data.ex(en.ex);
      if (!e) continue;
      const done = en.sets.filter((z) => z.done);
      const txt = en.kind === 'list' ? `${done.length} set${done.length > 1 ? 's' : ''}` : en.kind === 'flow' ? 'done' : en.kind === 'circuit' ? `${done.length} rounds × ${en.sets[0] && en.sets[0].r ? en.sets[0].r : ''}`
        : done.map((z) => e.log === 'wr' ? `${z.w ? F.u.wv(z.w) + '×' : ''}${z.r || 0}` : e.log === 'h' ? mmss(z.s || 0) : e.log === 'ws' ? `${F.u.wv(z.w)}·${z.s}s` : String(z.r || 0)).join(', ');
      body.append(h('div', { class: 'row between small', style: { padding: '5px 0', borderBottom: '1px solid var(--border)' } }, h('span', { text: e.name }), h('span', { class: 'muted', text: txt })));
    }
    if (s.prs && s.prs.length) body.append(h('div', { class: 'callout green small mt' }, s.prs.map((p) => { const t = F.game.prText(p); return h('div', { text: `📈 ${t.name}: ${t.prev} → ${t.now}` }); })));
    if (s.notes) body.append(h('p', { class: 'small mt', text: s.notes }));
    const dateIn = h('input', { type: 'date', value: s.date, max: F.ui.today() });
    const minIn = F.ui.numIn(s.minutes, { step: 1 });
    body.append(h('div', { class: 'fieldrow mt' }, h('label', { class: 'field' }, h('span', { text: 'Date' }), dateIn), h('label', { class: 'field' }, h('span', { text: 'Minutes' }), minIn)));
    const sh = sheet(h('div', null, body, h('div', { class: 'btngroup' },
      h('button', { class: 'btn primary', text: 'Save changes', onClick: () => {
        const minutes = Math.max(1, +minIn.value || s.minutes);
        const patch = { date: dateIn.value || s.date, minutes, kcal: F.game.kcal(s.met, minutes) };
        const x = F.game.sessionXP(Object.assign({}, s, patch));
        F.store.updateSession(s.id, Object.assign(patch, { xp: x.xp, split: x.split }));
        sh.close(); F.game.afterChange(); F.app.render();
      } }),
      h('button', { class: 'btn danger', onClick: async () => { if (await confirmDlg('Delete this session?', { ok: 'Delete', danger: true, sub: 'Its XP and records come off too.' })) { F.store.removeSession(s.id); sh.close(); F.app.render(); } } }, icon('trash', 15), 'Delete'))));
  }

  function library() {
    const out = h('div');
    const S = F.store.load();
    let cat = 'all', q = '', fits = false, safe = !!(S.profile.injuries.knee || S.profile.injuries.lumbar);
    const input = h('input', { type: 'search', placeholder: 'Search exercises', autocomplete: 'off' });
    const chips = h('div', { class: 'chips mt-s' });
    const draw = () => {
      chips.innerHTML = '';
      for (const [k, label] of CATS) chips.append(h('button', { class: 'chip small' + (cat === k ? ' on' : ''), text: label, onClick: () => { cat = k; draw(); } }));
      chips.append(F.ui.chip('Fits here', fits, (on) => { fits = on; run(); }, 'small'), F.ui.chip('Safe for me', safe, (on) => { safe = on; run(); }, 'small'));
      run();
    };
    const results = h('div', { class: 'list exlist mt' });
    const count = h('div', { class: 'small muted mt' });
    function run() {
      const c = F.data.ctx();
      const inj = S.profile.injuries;
      const ql = q.toLowerCase();
      const list = F.data.exercises().filter((e) => {
        if (cat !== 'all' && e.cat !== cat) return false;
        if (ql && !(e.name.toLowerCase().includes(ql) || (e.tags || []).some((t) => t.includes(ql)))) return false;
        if (fits && !F.data.hasEquip(e, c.kit)) return false;
        if (safe && ((inj.knee && e.knee !== 'ok') || (inj.lumbar && e.back !== 'ok') || (inj.shoulder && e.sh && e.sh !== 'ok'))) return false;
        return true;
      });
      count.textContent = `${list.length} exercise${list.length === 1 ? '' : 's'}` + (safe ? ' · only ones flagged fine for your knees/back' : '');
      results.innerHTML = '';
      for (const e of list) results.append(h('div', { class: 'item', onClick: () => F.exSheet(e.id) },
        h('span', { class: 'emo', text: F.data.stat(e.stat).icon }),
        h('div', { class: 't' }, h('b', { text: e.name }), h('small', { text: e.cues[0] })),
        F.flagsRow(e), (e.tags || []).includes('avoid') ? pill('not programmed', 'red') : null));
    }
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = input.value.trim(); run(); }, 120); });
    out.append(input, chips, count, results);
    draw();
    return out;
  }
})();

/* A printable summary of the current plan — for showing a physical therapist. */
(() => {
  const { h, pill } = F.ui;
  F.views.plan = () => {
    const S = F.store.load(), P = F.data.prog(), today = F.ui.today();
    const loc = S.settings.location;
    const c = F.data.ctx(today, { loc, knee: 0, back: 0 });
    const inj = S.profile.injuries;
    const flag = (label, v) => (v && v !== 'ok' ? h('span', { class: 'flag ' + v, text: `${label} ${v}` }) : null);
    const wrap = h('div', { class: 'planpage' });
    wrap.append(h('div', { class: 'row between noprint mb' }, h('a', { class: 'btn sm ghost', href: '#/settings/program', text: '← Settings' }), h('button', { class: 'btn sm primary', text: 'Print / save PDF', onClick: () => window.print() })),
      h('h1', { text: 'Training plan' + (S.profile.name ? ' — ' + S.profile.name : '') }),
      h('p', { class: 'muted', text: `${F.ui.fmtDate(today, { month: 'long', day: 'numeric', year: 'numeric' })} · Phase ${S.settings.phase} (${P.phases[S.settings.phase - 1].name}) · equipment: ${F.data.loc(loc).label.toLowerCase()}` }),
      h('p', { class: 'small', text: 'Programmed around: ' + ([inj.knee ? 'knees (meniscus/cartilage)' : '', inj.lumbar ? 'lower back (disc)' : '', inj.shoulder ? 'shoulder' : ''].filter(Boolean).join(', ') || 'no injuries flagged') + '. Flags show exercises marked caution for those; anything marked avoid is never programmed. Every exercise can be swapped.' }));
    const sched = S.settings.schedule || P.schedule;
    const week = h('table', { class: 'table mt' }, h('tbody', null, [1, 2, 3, 4, 5, 6, 0].map((d) => h('tr', null, h('td', { text: F.ui.DAYS[d] }), h('td', { text: (sched[String(d)] || []).map((id) => (F.data.session(id) || {}).name).filter(Boolean).join(' + ') || 'Rest' })))));
    wrap.append(h('h2', { class: 'mt', text: 'Week' }), week, h('p', { class: 'small muted', text: 'Daily: PT routine, two isometric holds, 10 min rolling/stretching, a walk. Weekly: one 24–36 h fast.' }));
    const ids = ['pt', 'holds'].concat([...new Set([1, 2, 3, 4, 5, 6, 0].flatMap((d) => sched[String(d)] || []))]);
    for (const id of ids) {
      let plan;
      try { plan = F.data.buildPlan(id, today, { loc, knee: 0, back: 0 }); } catch (e) { continue; }
      const sec = h('div', { class: 'card mt' }, h('h3', { text: plan.title + (id === 'holds' ? ' (today’s rotation)' : '') }));
      for (const b of plan.blocks) {
        const rows = b.items.filter((it) => it.ex && !it.why).map((it) => {
          const e = F.data.ex(it.ex);
          const dose = it.sets && it.sets.length ? `${it.sets.length} × ${e.log === 'h' ? (it.hold || '') + ' s' : e.log === 'ws' ? (it.secs || '30-40') + ' s' : it.reps || ''}` : it.secs ? it.secs + ' s' : it.dose || it.reps || '';
          return h('tr', null, h('td', { text: e.name }), h('td', { class: 'small muted', text: dose }), h('td', null, inj.knee ? flag('knee', e.knee) : null, ' ', inj.lumbar ? flag('back', e.back) : null));
        });
        if (b.timer) rows.unshift(h('tr', null, h('td', { colspan: 3, class: 'small', text: b.timer.label || b.timer.workLabel || '' })));
        if (rows.length) sec.append(plan.blocks.length > 1 ? h('div', { class: 'eyebrow mt-s', text: b.name }) : null, h('table', { class: 'table' }, h('tbody', null, rows)));
      }
      wrap.append(sec);
    }
    wrap.append(h('h2', { class: 'mt', text: 'Rules the app follows' }), h('ul', { class: 'cues small' },
      h('li', { text: 'Squats go to a box at pain-free depth; deep loaded knee flexion, twisting on a planted knee, jumping and deep kneeling are avoided.' }),
      h('li', { text: 'No loaded spinal flexion (crunches, sit-ups, twists); neutral-spine hinges from an elevated start; chest-supported rows; McGill Big 3 core.' }),
      h('li', { text: 'Progression: reps to the top of the range, then +5 lb (upper) / +10 lb (lower). Holds: best + 5 s.' }),
      h('li', { text: 'Barbell lifts unlock in phases only after the user confirms PT/doctor clearance.' }),
      h('li', { text: 'Daily check-in: a “flared” knee or back swaps the day to a recovery session and filters out anything not marked fine for that joint.' }),
      P.safety.pain.map((x) => h('li', { text: `Pain ${x.level}: ${x.text}` }))));
    return wrap;
  };
})();
