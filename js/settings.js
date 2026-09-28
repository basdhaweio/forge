/* Settings and first-run setup. Personal details (injuries, goals, targets) live only in this browser. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, pill, seg } = F.ui;
  const S = () => F.store.load();
  const save = () => F.store.save();

  const INJ = [
    ['knee', 'Knees — meniscus or cartilage', 'Limits deep loaded knee bends, twisting on a planted foot and impact. Squats go to a box at your pain-free depth.'],
    ['lumbar', 'Lower back — disc', 'No loaded spinal flexion (crunches, sit-ups, twists), neutral-spine hinges, chest-supported rows, McGill-style core.'],
    ['shoulder', 'Shoulder — cranky or impinged', 'Flags dips, pike push-ups and deep overhead positions.'],
  ];
  const FOCUS = [['arms', 'Biceps & triceps'], ['abs', 'Abs & core'], ['upperBack', 'Upper back'], ['chest', 'Chest'], ['shoulders', 'Shoulders'], ['glutes', 'Glutes & legs']];

  // ---------- small field helpers ----------
  const numField = (label, value, onSet, opts = {}) => h('label', { class: 'field' }, h('span', { text: label }), F.ui.numIn(value, Object.assign({ onInput: onSet }, opts)));
  function heightField() {
    const p = S().profile;
    if (F.u.metric()) return numField('Height (cm)', p.heightIn ? Math.round(p.heightIn * 2.54) : null, (v) => { p.heightIn = v ? v / 2.54 : null; save(); }, { step: 1 });
    const ft = p.heightIn ? Math.floor(p.heightIn / 12) : null, inch = p.heightIn ? Math.round(p.heightIn % 12) : null;
    const fIn = F.ui.numIn(ft, { placeholder: 'ft', step: 1 }), iIn = F.ui.numIn(inch, { placeholder: 'in', step: 1 });
    const upd = () => { const f = +fIn.value || 0, i = +iIn.value || 0; p.heightIn = f || i ? f * 12 + i : null; save(); };
    fIn.addEventListener('input', upd); iIn.addEventListener('input', upd);
    return h('label', { class: 'field' }, h('span', { text: 'Height' }), h('div', { class: 'row nowrap' }, fIn, h('span', { class: 'muted', text: 'ft' }), iIn, h('span', { class: 'muted', text: 'in' })));
  }
  function injuryCards(onChange) {
    const p = S().profile;
    return h('div', null, INJ.map(([k, label, desc]) => {
      const cb = h('input', { type: 'checkbox', checked: !!p.injuries[k] });
      const card = h('label', { class: 'optcard' + (p.injuries[k] ? ' on' : '') }, cb, h('div', { class: 't' }, h('b', { text: label }), h('small', { text: desc })));
      cb.addEventListener('change', () => { p.injuries[k] = cb.checked; card.classList.toggle('on', cb.checked); save(); onChange && onChange(); });
      return card;
    }));
  }
  function focusChips() {
    const p = S().profile;
    return h('div', { class: 'chips' }, FOCUS.map(([k, label]) => F.ui.chip(label, !!p.focus[k], (on) => { p.focus[k] = on; save(); })));
  }
  function equipEditor(locId) {
    const st = S(), P = F.data.prog();
    if (!st.equipment) st.equipment = JSON.parse(JSON.stringify(P.kits));
    const list = new Set(st.equipment[locId] || []);
    const groups = {};
    for (const q of P.equipment) (groups[q.group] || (groups[q.group] = [])).push(q);
    return h('div', null, Object.entries(groups).map(([g, items]) => h('div', { class: 'eqgroup' }, h('h3', { text: g }), h('div', { class: 'chips' }, items.map((q) => F.ui.chip(q.label, list.has(q.id), (on) => {
      if (on) list.add(q.id); else list.delete(q.id);
      st.equipment[locId] = [...list]; save();
    }, 'small'))))));
  }

  // ---------- onboarding ----------
  F.views.welcome = (stepArg) => {
    const st = S(), P = F.data.prog();
    const step = Math.max(0, Math.min(6, +stepArg || 0));
    const go = (n) => { location.hash = '#/welcome/' + n; };
    const wrap = h('div', { class: 'ob' });
    wrap.append(h('div', { class: 'ob-steps' }, Array.from({ length: 7 }, (_, i) => h('i', { class: i <= step ? 'on' : '' }))));
    const nav = (next, label = 'Next') => h('div', { class: 'btngroup mt', style: { justifyContent: 'space-between' } },
      step ? h('button', { class: 'btn ghost', onClick: () => go(step - 1) }, icon('back', 16), 'Back') : h('span'),
      h('button', { class: 'btn fire big', onClick: next }, label, icon('chevron', 16)));
    if (step === 0) {
      const name = h('input', { type: 'text', placeholder: 'What should Forge call you?', value: st.profile.name || '' });
      name.addEventListener('input', () => { st.profile.name = name.value.trim(); save(); });
      wrap.append(h('div', { class: 'hero' }, h('div', { style: { fontSize: '3rem' }, text: '⚒️' }), h('h1', { text: 'Welcome to Forge' }),
        h('p', { class: 'muted', text: 'Daily PT, holds and mobility; weekly lifting, Krav, 4×4s, yoga and Murph prep; protein, treats and a weekly fast — planned around your injuries, adapted for travel, and turned into a game where the numbers only go up.' })),
        h('div', { class: 'card mt' }, h('label', { class: 'field' }, h('span', { text: 'Name (optional)' }), name),
          h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Units' }), seg([{ v: 'imperial', label: 'lb · in · mi' }, { v: 'metric', label: 'kg · cm · km' }], st.profile.units, (v) => { st.profile.units = v; save(); }))),
        h('p', { class: 'tiny muted mt', text: 'Everything you enter stays in this browser on this device. Nothing is sent anywhere. Back it up from Settings.' }),
        nav(() => go(1), 'Let’s set up'),
        h('p', { class: 'small muted mt center' }, 'Already use Forge on another device? ', h('a', { href: '#/welcome', onClick: (e) => { e.preventDefault(); F.syncSheet(() => { location.hash = F.store.load().profile.onboarded ? '#/' : '#/welcome/1'; }); } }, 'Connect sync to bring your data over')));
    } else if (step === 1) {
      const p = st.profile;
      wrap.append(h('h1', { text: 'About you' }), h('p', { class: 'muted mb', text: 'Used for calorie burn, heart-rate zones for the 4×4 and a protein target. Skip anything you like.' }),
        h('div', { class: 'card' },
          h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Sex (for the calorie estimate)' }), seg([{ v: 'male', label: 'Male' }, { v: 'female', label: 'Female' }, { v: '', label: 'Skip' }], p.sex, (v) => { p.sex = v; save(); })),
          h('div', { class: 'fieldrow' },
            numField('Birth year', p.birthYear, (v) => { p.birthYear = v; save(); }, { step: 1, placeholder: '1988' }),
            heightField(),
            numField(`Weight (${F.u.wu()})`, F.u.wv(p.weightLb), (v) => { p.weightLb = F.u.wIn(v); save(); }))),
        nav(() => go(2)));
    } else if (step === 2) {
      wrap.append(h('h1', { text: 'What are we working around?' }), h('p', { class: 'muted mb', text: 'Every exercise is flagged for knees, back and shoulders. Tick what applies and the plan filters itself — you can still swap anything, and your PT has the final word.' }),
        injuryCards(), h('p', { class: 'small muted mt', text: 'Each morning you’ll check in on how they feel. A flare-up swaps the day to a recovery session with full streak credit.' }), nav(() => go(3)));
    } else if (step === 3) {
      wrap.append(h('h1', { text: 'Priorities' }), h('p', { class: 'muted mb', text: 'Priority areas get an extra set wherever they show up — more volume where you most want to see change.' }),
        h('div', { class: 'card' }, focusChips()), nav(() => go(4)));
    } else if (step === 4) {
      wrap.append(h('h1', { text: 'Home equipment' }), h('p', { class: 'muted mb', text: 'Sessions pick exercises that fit what you have. Gym and travel kits are pre-filled — tweak them in Settings any time.' }),
        h('div', { class: 'card' }, equipEditor('home')), nav(() => go(5)));
    } else if (step === 5) {
      wrap.append(h('h1', { text: 'Where are you starting?' }), h('p', { class: 'muted mb', text: 'Heavy barbell work unlocks in phases through the Iron Return quest, with your PT’s OK at each gate.' }),
        h('div', null, P.phases.map((ph) => {
          const card = h('button', { class: 'optcard' + (st.settings.phase === ph.n ? ' on' : ''), onClick: () => { st.settings.phase = ph.n; save(); F.app.render(); } },
            h('div', { class: 't' }, h('b', { text: `Phase ${ph.n} · ${ph.name}` }), h('small', { text: ph.desc })));
          return card;
        })),
        st.settings.phase > 1 ? h('div', { class: 'callout amber small mt', text: 'Only start above Phase 1 if your PT or doctor has already cleared you for barbell loading.' }) : null,
        nav(() => go(6)));
    } else {
      const n = st.settings.nutrition;
      wrap.append(h('h1', { text: 'Fuel targets' }), h('p', { class: 'muted mb', text: 'Protein builds the muscle; treats run on a weekly budget so baking days balance out; one fast a week.' }),
        h('div', { class: 'card' },
          h('div', { class: 'fieldrow' },
            numField('Protein target (g/day)', n.protein, (v) => { n.protein = v; save(); }, { placeholder: String(F.game.proteinTarget()) + ' (auto)', step: 5 }),
            numField('Treats per week', n.treatsWeek, (v) => { n.treatsWeek = v === null ? 5 : Math.max(0, v); save(); }, { step: 0.5 })),
          h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Weekly fast day' }), h('select', { onChange: (e) => { st.settings.fast.day = +e.target.value; save(); } }, F.ui.DAYS.map((d, i) => h('option', { value: i, selected: st.settings.fast.day === i, text: d })))),
          h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Fast length' }), seg([{ v: 24, label: '24 h' }, { v: 36, label: '36 h' }], st.settings.fast.targetH, (v) => { st.settings.fast.targetH = v; save(); }))),
        h('p', { class: 'small muted mt', text: 'Auto protein is 0.8 g per lb of bodyweight — a solid target for building muscle while leaning out. A treat is a cookie, brownie, muffin or soda; small ones count half, a slice of cake or a big bakery cookie counts double. Fruit and milk don’t count. No weighing, no sugar grams.' }),
        h('div', { class: 'tiny muted mt-s', text: F.data.prog().fastingCaution }),
        nav(() => { st.profile.onboarded = true; if (!st.equipment) st.equipment = JSON.parse(JSON.stringify(P.kits)); F.store.saveNow(); location.hash = '#/'; setTimeout(() => F.ui.celebrate({ icon: '⚒️', eyebrow: 'Character created', title: 'Level 1 · Recruit', sub: 'Check in, knock out your PT, and the numbers start going up.' }), 300); }, 'Start training'));
    }
    return wrap;
  };

  // ---------- settings ----------
  F.views.settings = (section) => {
    const st = S(), P = F.data.prog();
    if (!st.equipment) st.equipment = JSON.parse(JSON.stringify(P.kits));
    const wrap = h('div');
    wrap.append(h('div', { class: 'pagehead' }, h('h1', { text: 'Settings' }), h('div', { class: 'sub', text: 'Everything here stays on this device' })));
    const sec = (id, title, ...kids) => h('div', { class: 'card mt', id: 'sec-' + id }, h('h2', { text: title }), ...kids);
    const p = st.profile, s = st.settings;

    // Profile
    wrap.append(sec('profile', 'Profile',
      h('div', { class: 'fieldrow' },
        h('label', { class: 'field' }, h('span', { text: 'Name' }), (() => { const i = h('input', { type: 'text', value: p.name || '' }); i.addEventListener('input', () => { p.name = i.value.trim(); save(); }); return i; })()),
        numField('Birth year', p.birthYear, (v) => { p.birthYear = v; save(); }, { step: 1 }),
        heightField(),
        numField(`Weight (${F.u.wu()})`, F.u.wv(F.game.weightLb()), (v) => { p.weightLb = F.u.wIn(v); save(); }),
        numField('Max heart rate', p.hrMax, (v) => { p.hrMax = v; save(); }, { step: 1, placeholder: F.game.hrMax() ? F.game.hrMax() + ' (from age)' : 'bpm' })),
      h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Sex (calorie estimate only)' }), seg([{ v: 'male', label: 'Male' }, { v: 'female', label: 'Female' }, { v: '', label: 'Skip' }], p.sex, (v) => { p.sex = v; save(); })),
      h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Units' }), seg([{ v: 'imperial', label: 'lb · in · mi' }, { v: 'metric', label: 'kg · cm · km' }], p.units, (v) => { p.units = v; save(); F.app.render(); })),
      h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Theme' }), seg([{ v: 'auto', label: 'System' }, { v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }], s.theme, (v) => { s.theme = v; save(); F.app.theme(); }))));

    // Injuries & focus
    wrap.append(sec('injuries', 'Injuries & priorities', injuryCards(), h('div', { class: 'eyebrow mt', text: 'Priority areas (extra sets)' }), focusChips()));

    // Program
    const phaseBox = h('div');
    const drawPhase = () => { phaseBox.replaceChildren(seg(P.phases.map((ph) => ({ v: ph.n, label: `${ph.n} · ${ph.name}` })), s.phase, async (v) => {
      if (v > s.phase && !(await confirmDlg(`Move to Phase ${v}?`, { ok: 'Yes — my PT is on board', sub: 'Heavier barbell work unlocks. The Iron Return quest has the checklist.' }))) { drawPhase(); return; }
      s.phase = v; save(); drawPhase();
    }), h('div', { class: 'small muted mt-s', text: P.phases[s.phase - 1].desc })); };
    drawPhase();
    const sched = s.schedule || JSON.parse(JSON.stringify(P.schedule));
    const opts = F.data.sessions().filter((x) => !x.dynamic && x.group !== 'Recovery');
    const selFor = (d, k) => {
      const cur = (sched[String(d)] || [])[k] || '';
      const sel = h('select', { style: { width: '100%' } }, h('option', { value: '', text: k ? '—' : 'Rest' }), opts.map((o) => h('option', { value: o.id, selected: o.id === cur, text: o.name })));
      sel.addEventListener('change', () => { const arr = (sched[String(d)] || []).slice(); arr[k] = sel.value; s.schedule = sched; sched[String(d)] = arr.filter(Boolean); save(); });
      return sel;
    };
    const schedBox = h('div', null, [1, 2, 3, 4, 5, 6, 0].map((d) => h('div', { class: 'row nowrap', style: { padding: '4px 0' } }, h('span', { class: 'small', style: { width: '40px' }, text: F.ui.DAYS[d].slice(0, 3) }), h('div', { class: 'grow' }, selFor(d, 0)), h('div', { class: 'grow' }, selFor(d, 1)))));
    const qBox = h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', { text: 'Weekly quest' }), h('th', { text: 'Home' }), h('th', { text: 'Travel' }))), h('tbody', null, P.quotas.map((q) => {
      const o = s.quotas[q.id] || {};
      const set = (k) => (v) => { s.quotas[q.id] = Object.assign({}, s.quotas[q.id] || {}, { [k]: v === null ? undefined : v }); save(); };
      return h('tr', null, h('td', { text: q.icon + ' ' + q.label }), h('td', null, F.ui.numIn(o.home ?? q.home, { w: '70px', step: 1, onInput: set('home') })), h('td', null, F.ui.numIn(o.travel ?? q.travel, { w: '70px', step: 1, onInput: set('travel') })));
    })));
    wrap.append(sec('program', 'Program',
      h('a', { class: 'btn sm mb', href: '#/plan' }, '🩺 Printable plan for your PT'),
      h('div', { class: 'eyebrow', text: 'Phase' }), phaseBox,
      h('div', { class: 'eyebrow mt', text: 'Weekly schedule (a suggestion — quests count whatever you do)' }), schedBox,
      h('button', { class: 'btn xs ghost mt-s', text: 'Reset schedule', onClick: () => { s.schedule = null; save(); F.app.render(); } }),
      h('div', { class: 'fieldrow mt' },
        numField('Daily walk target (min)', s.walkMin, (v) => { s.walkMin = v || 30; save(); }, { step: 5 })),
      h('details', { class: 'acc mt' }, h('summary', { text: 'Weekly quest targets' }), h('div', { class: 'acc-body', style: { overflowX: 'auto' } }, qBox, h('div', { class: 'tiny muted mt-s', text: 'Travel weeks blend the two by days away. Set a target to 0 to drop it.' }))),
      h('details', { class: 'acc mt' }, h('summary', { text: 'PT routine' }), h('div', { class: 'acc-body' }, ptEditor())),
      h('div', { class: 'mt' }, (() => { const cb = h('input', { type: 'checkbox', checked: s.sound }); cb.addEventListener('change', () => { s.sound = cb.checked; save(); }); return h('label', { class: 'toggle' }, cb, 'Timer sounds'); })(),
        (() => { const cb = h('input', { type: 'checkbox', checked: s.vibrate }); cb.addEventListener('change', () => { s.vibrate = cb.checked; save(); }); return h('label', { class: 'toggle' }, cb, 'Vibration'); })())));

    // Equipment
    let eqLoc = 'home';
    const eqBox = h('div');
    const eqTabs = h('div', { class: 'tabs' });
    const drawEq = () => { eqTabs.replaceChildren(...P.locations.map((l) => h('button', { class: eqLoc === l.id ? 'active' : '', text: l.icon + ' ' + l.label, onClick: () => { eqLoc = l.id; drawEq(); } }))); eqBox.replaceChildren(equipEditor(eqLoc)); };
    drawEq();
    wrap.append(sec('equipment', 'Equipment', h('p', { class: 'small muted mb', text: 'What’s available at each place. Hotel room assumes whatever you pack — a TRX and a band go a long way.' }), eqTabs, eqBox,
      h('button', { class: 'btn xs ghost mt-s', text: 'Reset this kit', onClick: () => { st.equipment[eqLoc] = P.kits[eqLoc].slice(); save(); drawEq(); } })));

    // Nutrition
    const n = s.nutrition;
    const tk = h('input', { type: 'checkbox', checked: n.trackKcal });
    tk.addEventListener('change', () => { n.trackKcal = tk.checked; save(); });
    wrap.append(sec('nutrition', 'Nutrition & fasting',
      h('div', { class: 'fieldrow' },
        numField('Protein (g/day)', n.protein, (v) => { n.protein = v; save(); }, { placeholder: F.game.proteinTarget() + ' auto', step: 5 }),
        numField('Treats per week', n.treatsWeek, (v) => { n.treatsWeek = v === null ? 5 : Math.max(0, v); save(); }, { step: 0.5 }),
        numField('Calorie target (optional)', n.kcal, (v) => { n.kcal = v; save(); }, { step: 50, placeholder: F.game.suggestKcal() ? F.game.suggestKcal() + ' suggested' : 'kcal' })),
      h('label', { class: 'toggle' }, tk, 'Show calories'),
      h('p', { class: 'tiny muted', text: 'Suggested calories = estimated maintenance minus 300 — a gentle deficit that trims the waist while you build. Protein matters more than hitting a calorie number exactly.' }),
      h('div', { class: 'fieldrow mt' },
        h('label', { class: 'field' }, h('span', { text: 'Fast day' }), h('select', { onChange: (e) => { s.fast.day = +e.target.value; save(); } }, F.ui.DAYS.map((d, i) => h('option', { value: i, selected: s.fast.day === i, text: d })))),
        h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Fast length' }), seg([{ v: 24, label: '24 h' }, { v: 36, label: '36 h' }], s.fast.targetH, (v) => { s.fast.targetH = v; save(); })))));

    // Goals
    const g = s.goals;
    wrap.append(sec('goals', 'Goals',
      h('div', { class: 'fieldrow' },
        numField(`Over the Threshold: target (${F.u.wu()})`, F.u.wv(g.thresholdLb), (v) => { g.thresholdLb = F.u.wIn(v); save(); }, { placeholder: 'their weight' }),
        numField(`Photo Day: waist down by (${F.u.lu()})`, F.u.lv(g.photoWaist), (v) => { g.photoWaist = F.u.lIn(v); save(); }),
        numField(`Photo Day: biceps up by (${F.u.lu()})`, F.u.lv(g.photoArms), (v) => { g.photoArms = F.u.lIn(v); save(); })),
      h('div', { class: 'eyebrow mt', text: 'Epic quests shown' }),
      h('div', { class: 'chips' }, P.quests.map((q) => F.ui.chip(q.icon + ' ' + q.name, s.quests[q.id] !== false, (on) => { s.quests[q.id] = on; save(); }, 'small')))));

    // Safety
    const sf = P.safety;
    wrap.append(sec('safety', 'Safety',
      h('p', { class: 'small', text: sf.general }),
      h('div', { class: 'eyebrow mt', text: 'Pain during or after exercise' }),
      sf.pain.map((x) => h('div', { class: 'callout ' + x.tone + ' small mt-s' }, h('b', { text: x.level + ' — ' }), x.text)),
      sf.flags.map((f) => h('div', { class: 'mt' }, h('div', { class: 'eyebrow', text: 'Stop signs · ' + f.title }), f.items.map((t) => h('div', { class: 'callout red small mt-s', text: t }))))));

    // Sync
    wrap.append(syncCard());

    // Data
    const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    let importMode = 'merge';
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files[0];
      if (!f) return;
      try { F.store.importJSON(await f.text(), importMode); toast(importMode === 'merge' ? 'Backup merged' : 'Backup restored'); F.game.afterChange(); F.app.render(); }
      catch (e) { toast('Import failed: ' + e.message, 3500); }
      fileIn.value = '';
    });
    const persistEl = h('span', { class: 'small muted' });
    if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then((v) => { persistEl.textContent = v ? 'Storage is marked persistent — the browser won’t clear it on its own.' : 'Tip: install Forge to your home screen so the browser keeps its data.'; });
    wrap.append(sec('data', 'Your data',
      h('p', { class: 'small muted', text: `${st.sessions.length} sessions, ${Object.keys(st.food).length} days of food, ${st.measurements.length} check-ins, ${st.fasts.length} fasts. Last backup: ${st.backupAt ? F.ui.fmtDate(st.backupAt) : 'never'}.` }),
      persistEl,
      h('div', { class: 'btngroup mt' },
        h('button', { class: 'btn primary', onClick: () => download('forge-backup-' + F.ui.today() + '.json', F.store.exportJSON()) }, icon('download', 16), 'Download backup'),
        h('button', { class: 'btn', onClick: () => { importMode = 'merge'; fileIn.click(); } }, icon('upload', 16), 'Import (merge)'),
        h('button', { class: 'btn', onClick: async () => { if (await confirmDlg('Replace everything on this device with the backup?', { ok: 'Choose file', danger: true })) { importMode = 'replace'; fileIn.click(); } } }, 'Restore (replace)'),
        h('button', { class: 'btn danger', onClick: async () => { if (await confirmDlg('Delete all Forge data on this device?', { ok: 'Delete everything', danger: true, sub: 'Download a backup first if you might want it.' })) { F.store.reset(); location.hash = '#/welcome'; F.app.render(); } } }, 'Reset'),
        fileIn),
      h('p', { class: 'tiny muted mt', text: 'Merge adds sessions, food, fasts and measurements you don’t have yet. Restore overwrites this device.' + (F.sync.connected() ? ' With sync on, Reset clears only this device — your data comes back on the next sync unless you disconnect first.' : '') })));

    // About
    wrap.append(sec('about', 'About',
      h('p', { class: 'small muted', text: `Forge ${F.app.VERSION} · ${F.data.exercises().length} exercises · ${F.data.sessions().length} sessions.` }),
      h('div', { class: 'btngroup mt' },
        h('a', { class: 'btn', href: '#/welcome', text: 'Run setup again' }),
        h('button', { class: 'btn', text: 'Refresh app', onClick: async () => { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage('clear-cache'); if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); } location.reload(); } }),
        F.app.installPrompt ? h('button', { class: 'btn primary', text: 'Install app', onClick: () => F.app.installPrompt.prompt() }) : null)));

    if (section) setTimeout(() => { const el = document.getElementById('sec-' + section); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    return wrap;
  };

  function ptEditor() {
    const st = S(), P = F.data.prog();
    const box = h('div');
    const draw = () => {
      const list = st.settings.ptRoutine || JSON.parse(JSON.stringify(P.ptDefault));
      const commit = () => { st.settings.ptRoutine = list; save(); };
      box.innerHTML = '';
      box.append(h('p', { class: 'small muted', text: 'Match this to what your PT gave you. Each row shows as a set-counter in the daily PT quest.' }));
      const cov = st.settings.formalPtCovers || (st.settings.formalPtCovers = { holds: false, mobility: false });
      box.append(h('div', { class: 'small mt-s' }, 'A formal PT day (🩺 on Today) counts as this routine. Let it also cover:'),
        h('div', { class: 'chips mt-s mb' },
          F.ui.chip('Daily holds', !!cov.holds, (on) => { cov.holds = on; save(); }, 'small'),
          F.ui.chip('Roll & stretch', !!cov.mobility, (on) => { cov.mobility = on; save(); }, 'small')));
      list.forEach((it, i) => {
        const e = F.data.ex(it.ex);
        const sets = F.ui.numIn(it.sets, { w: '56px', step: 1, onInput: (v) => { it.sets = Math.max(1, v || 1); commit(); } });
        const reps = h('input', { type: 'text', value: it.reps || '', style: { width: '130px' } });
        reps.addEventListener('input', () => { it.reps = reps.value; commit(); });
        box.append(h('div', { class: 'row nowrap', style: { padding: '5px 0', borderBottom: '1px solid var(--border)' } },
          h('span', { class: 'grow small', text: e ? e.name : it.ex }), sets, h('span', { class: 'tiny muted', text: 'sets' }), reps,
          h('button', { class: 'btn xs ghost', 'aria-label': 'Move up', onClick: () => { if (i) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; commit(); draw(); } } }, '↑'),
          h('button', { class: 'btn xs ghost', 'aria-label': 'Remove', onClick: () => { list.splice(i, 1); commit(); draw(); } }, icon('x', 14))));
      });
      const choices = F.data.exercises().filter((e) => ['pt', 'core', 'iso', 'mobility'].includes(e.cat) && !(e.tags || []).includes('avoid') && !list.some((x) => x.ex === e.id));
      const sel = h('select', null, h('option', { value: '', text: 'Add an exercise…' }), choices.map((e) => h('option', { value: e.id, text: e.name })));
      sel.addEventListener('change', () => { if (!sel.value) return; list.push({ ex: sel.value, sets: 2, reps: '10 / side' }); commit(); draw(); });
      box.append(h('div', { class: 'row mt-s' }, h('div', { class: 'grow' }, sel), h('button', { class: 'btn xs ghost', text: 'Reset', onClick: () => { st.settings.ptRoutine = null; save(); draw(); } })));
    };
    draw();
    return box;
  }

  // ---------- sync ----------
  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(ts).toLocaleDateString();
  }
  F.syncSheet = (onDone) => {
    const tok = h('input', { type: 'password', placeholder: 'ghp_…', autocomplete: 'off', spellcheck: 'false' });
    const pass = h('input', { type: 'password', placeholder: 'Optional — the same on every device', autocomplete: 'new-password' });
    const msg = h('div', { class: 'small mt-s' });
    const btn = h('button', { class: 'btn fire block mt', text: 'Connect' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Connecting…'; msg.textContent = ''; msg.className = 'small mt-s';
      try {
        const r = await F.sync.connect(tok.value, pass.value);
        sh.close();
        toast(r.existing ? `Connected — pulled your data from your other device (${r.loaded} sessions).` : 'Connected — your private sync gist is set up.', 4200);
        if (onDone) onDone(r); else F.app.render();
      } catch (e) {
        msg.textContent = e.message; msg.className = 'small mt-s red';
        if (e.needPass) pass.focus();
        btn.disabled = false; btn.textContent = 'Connect';
      }
    });
    const sh = sheet(h('div', null,
      h('h2', { text: 'Sync between devices' }),
      h('p', { class: 'small muted', text: 'Forge keeps a copy of your data in a secret gist on your GitHub account, and every device you connect stays in step with it.' }),
      h('ol', { class: 'cues small' },
        h('li', null, 'Create a token with only the ', h('b', { text: 'gist' }), ' scope: ', h('a', { href: 'https://github.com/settings/tokens/new?scopes=gist&description=Forge%20sync', target: '_blank', rel: 'noopener', text: 'open GitHub' }), ', pick an expiry, generate, and copy it.'),
        h('li', { text: 'Paste it below — the same token works on every device.' }),
        h('li', { text: 'Add a passphrase to encrypt the gist (recommended: a secret gist is unlisted, not private). Use the same one everywhere. If it’s ever forgotten, each device still has its own copy.' })),
      h('label', { class: 'field mt' }, h('span', { text: 'GitHub token' }), tok),
      h('label', { class: 'field' }, h('span', { text: 'Passphrase (encrypts the gist)' }), pass),
      h('p', { class: 'tiny muted', text: 'The token and passphrase stay in this browser only — never in the gist or in backups. The token is sent only to api.github.com.' }),
      msg, btn));
    setTimeout(() => tok.focus(), 120);
  };
  function passSheet() {
    const pass = h('input', { type: 'password', placeholder: 'Leave empty to turn encryption off', autocomplete: 'new-password' });
    const msg = h('div', { class: 'small mt-s' });
    const btn = h('button', { class: 'btn primary block mt', text: 'Save passphrase' });
    btn.addEventListener('click', async () => {
      btn.disabled = true; msg.textContent = '';
      try { await F.sync.setPassphrase(pass.value); sh.close(); toast(pass.value ? 'Passphrase saved — the gist is encrypted.' : 'Encryption turned off.', 3200); }
      catch (e) { msg.textContent = e.message; msg.className = 'small mt-s red'; btn.disabled = false; }
    });
    const sh = sheet(h('div', null, h('h2', { text: 'Sync passphrase' }),
      h('p', { class: 'small muted', text: 'Encrypts the gist with AES-GCM before it leaves this device. Set the same passphrase on your other devices — they’ll ask for it on their next sync.' }),
      h('label', { class: 'field mt' }, h('span', { text: 'Passphrase' }), pass), msg, btn));
    setTimeout(() => pass.focus(), 120);
  }
  function syncCard() {
    const card = h('div', { class: 'card mt', id: 'sec-sync' });
    let drawn = false, off = null;
    const draw = () => {
      if (drawn && !card.isConnected) { if (off) off(); return; }
      drawn = true;
      const i = F.sync.info();
      card.replaceChildren(h('h2', { text: 'Sync between devices' }));
      if (!i.connected) {
        card.append(h('p', { class: 'small muted', text: 'Keep your phone and laptop in step through a secret gist on your GitHub account, encrypted with a passphrase if you like.' }),
          h('button', { class: 'btn primary mt-s', text: 'Set up sync', onClick: () => F.syncSheet() }));
        return;
      }
      const state = i.status === 'syncing' ? 'Syncing…' : i.status === 'offline' ? 'Offline — it will retry' : i.error ? '⚠ ' + i.error : '✓ Synced ' + (i.lastSync ? ago(i.lastSync) : '');
      card.append(
        h('div', { class: i.error && i.status !== 'offline' && i.status !== 'syncing' ? 'callout red small' : 'small', text: state }),
        h('div', { class: 'small muted mt-s', text: `${i.user ? '@' + i.user + ' · ' : ''}secret gist ${String(i.gistId).slice(0, 8)}… · ${i.encrypted ? '🔒 encrypted' : 'not encrypted'}` }),
        h('div', { class: 'btngroup mt' },
          h('button', { class: 'btn primary', text: 'Sync now', onClick: () => F.sync.syncNow() }),
          h('button', { class: 'btn', text: i.encrypted ? 'Change passphrase' : i.error && /passphrase|encrypted/.test(i.error) ? 'Enter passphrase' : 'Add passphrase', onClick: passSheet }),
          h('button', { class: 'btn ghost', text: 'Disconnect', onClick: async () => { if (await confirmDlg('Disconnect sync on this device?', { ok: 'Disconnect', sub: 'Your data stays on this device and in the gist. Delete the gist at gist.github.com if you want it gone.' })) F.sync.disconnect(); } })),
        h('p', { class: 'tiny muted mt', text: 'Syncs when Forge opens, when you come back to it, and a few seconds after you log something. If the same setting is changed on two devices, the latest change wins.' }));
    };
    off = F.sync.onStatus(draw);
    draw();
    return card;
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => F.app.render(), 300);
  }
})();
