/* Fuel: protein first, treats on a weekly budget (counted, not weighed), optional calories, and the fasting timer. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, pill, progress } = F.ui;

  // ---------- shared food helpers ----------
  const half = (x) => Math.round(x * 2) / 2;
  F.fmtTreats = (x) => {
    x = half(x || 0);
    if (!x) return 'no treats';
    const whole = Math.floor(x), frac = x - whole ? '½' : '';
    return (whole ? whole : '') + frac + (x === 1 ? ' treat' : x < 1 ? ' treat' : ' treats');
  };
  F.foodSummary = (f) => {
    const bits = [];
    if (f.p) bits.push(`${num(f.p)} g protein`);
    const tp = F.game.tpOf(f);
    if (tp) bits.push('🍪 ' + F.fmtTreats(tp));
    if (f.kcal && F.store.load().settings.nutrition.trackKcal) bits.push(`${num(f.kcal)} kcal`);
    return bits.join(' · ') || 'logged';
  };
  function mealTotals(items) {
    const ING = F.data.prog().ingredients;
    const t = { p: 0, kcal: 0, tp: 0 };
    for (const r of items || []) {
      const i = ING.find((x) => x.id === r.ing);
      if (!i) continue;
      const q = +r.qty || 0;
      t.p += i.p * q; t.kcal += i.kcal * q; t.tp += (i.tp || 0) * q;
    }
    return { p: Math.round(t.p), kcal: Math.round(t.kcal), tp: half(t.tp) };
  }

  function logFood(date, f, onAdd) {
    F.store.addFood(date, { name: f.name, p: +f.p || 0, kcal: +f.kcal || 0, tp: half(+f.tp || 0), treat: (+f.tp || 0) > 0 });
    F.timer.sfx('pop');
    toast(`${f.name} · ${F.foodSummary(f)}`, 2400, { label: 'Undo', run: () => { const list = F.store.foodOn(date); const last = list[list.length - 1]; if (last) F.store.removeFood(date, last.id); onAdd && onAdd(); } });
    F.game.afterChange();
    onAdd && onAdd();
  }

  // ---------- meal builder ----------
  F.mealSheet = ({ meal = null, date = null, onDone } = {}) => {
    const P = F.data.prog();
    const ING = Object.fromEntries(P.ingredients.map((i) => [i.id, i]));
    const saved = meal && meal.id && F.store.load().foods.some((x) => x.id === meal.id);
    const rows = meal && meal.items ? meal.items.map((x) => Object.assign({}, x)) : [{ ing: 'whey', qty: 1 }];
    const name = h('input', { type: 'text', placeholder: 'e.g. Morning smoothie', value: meal ? meal.name : '' });
    const list = h('div');
    const totalsEl = h('div', { class: 'callout green small mt-s' });
    const paint = () => { const t = mealTotals(rows); totalsEl.textContent = `${num(t.p)} g protein · ${num(t.kcal)} kcal · ${t.tp ? '🍪 ' + F.fmtTreats(t.tp) : 'no treats'}`; };
    function draw() {
      list.innerHTML = '';
      rows.forEach((r, i) => {
        const unit = h('span', { class: 'tiny muted', style: { width: '58px', flex: 'none' }, text: ING[r.ing] ? ING[r.ing].unit : '' });
        const sel = h('select', { style: { flex: '1', minWidth: '0' } }, P.ingredients.map((x) => h('option', { value: x.id, selected: x.id === r.ing, text: x.name })));
        sel.addEventListener('change', () => { r.ing = sel.value; unit.textContent = ING[r.ing].unit; paint(); });
        const qty = F.ui.numIn(r.qty, { w: '62px', step: 0.5, onInput: (v) => { r.qty = v || 0; paint(); } });
        list.append(h('div', { class: 'row nowrap', style: { padding: '4px 0', gap: '6px' } }, qty, unit, sel,
          h('button', { class: 'btn xs ghost', 'aria-label': 'Remove ingredient', onClick: () => { rows.splice(i, 1); draw(); } }, icon('x', 14))));
      });
      paint();
    }
    const result = () => {
      const t = mealTotals(rows);
      return { name: name.value.trim() || 'My meal', items: rows.filter((r) => ING[r.ing] && +r.qty > 0), p: t.p, kcal: t.kcal, tp: t.tp, meal: true };
    };
    const saveMeal = () => {
      const m = result();
      if (!m.items.length) { toast('Add at least one ingredient'); return null; }
      if (saved) F.store.updateCustomFood(meal.id, m); else F.store.addCustomFood(m);
      return m;
    };
    const sh = sheet(h('div', null,
      h('h2', { text: saved ? 'Edit meal' : 'Build a meal' }),
      h('p', { class: 'small muted', text: 'Pick ingredients and amounts — Forge adds up the protein and calories. Fruit and milk sugar don’t count as treats.' }),
      h('label', { class: 'field mt' }, h('span', { text: 'Name' }), name),
      list,
      h('button', { class: 'btn xs ghost mt-s', onClick: () => { rows.push({ ing: 'banana', qty: 1 }); draw(); } }, icon('plus', 14), 'Ingredient'),
      totalsEl,
      h('div', { class: 'btngroup mt' },
        date ? h('button', { class: 'btn fire', onClick: () => { const m = saveMeal(); if (!m) return; sh.close(); logFood(date, m, onDone); } }, icon('check', 16), 'Save & log it') : null,
        h('button', { class: 'btn ' + (date ? '' : 'primary'), onClick: () => { if (!saveMeal()) return; sh.close(); toast('Saved to My meals'); onDone && onDone(); } }, 'Save meal'),
        saved ? h('button', { class: 'btn danger', onClick: async () => { sh.close(); if (await confirmDlg(`Delete ${meal.name}?`, { ok: 'Delete', danger: true })) { F.store.removeCustomFood(meal.id); onDone && onDone(); } } }, 'Delete') : null)));
    draw();
  };

  // ---------- food picker (Fuel page + the quick sheet) ----------
  let lastTab = 'meals';
  function foodPicker(date, onAdd) {
    const S = F.store.load(), P = F.data.prog();
    let tab = lastTab, manage = false;
    const out = h('div');
    const chip = (f, { onTap, onEdit, cls = '' } = {}) => h('div', { class: 'foodchip ' + cls },
      h('button', { class: 'fc-main', onClick: onTap }, h('b', { text: (manage && f.custom ? '✕ ' : '') + f.name }), h('small', { text: F.foodSummary(f) })),
      onEdit ? h('button', { class: 'fc-edit', 'aria-label': 'Edit ' + f.name, onClick: onEdit }, icon('edit', 14)) : null);
    function draw() {
      out.innerHTML = '';
      const tabs = h('div', { class: 'tabs' });
      for (const [k, l] of [['meals', 'Meals'], ['protein', 'Protein'], ['treats', 'Treats'], ['custom', '+ Other']]) tabs.append(h('button', { class: tab === k ? 'active' : '', text: l, onClick: () => { tab = lastTab = k; draw(); } }));
      out.append(tabs);

      if (tab === 'meals') {
        const mine = S.foods;
        const savedNames = new Set(mine.map((x) => x.name.toLowerCase()));
        const starters = P.starterMeals.filter((m) => !savedNames.has(m.name.toLowerCase())).map((m) => Object.assign({ starter: true }, m, mealTotals(m.items)));
        if (mine.length) out.append(h('div', { class: 'foodchips' }, mine.map((f) => chip(Object.assign({ custom: true }, f), {
          onTap: () => (manage ? (F.store.removeCustomFood(f.id), draw()) : logFood(date, f, onAdd)),
          onEdit: f.items && !manage ? () => F.mealSheet({ meal: f, onDone: () => (onAdd ? onAdd() : draw()) }) : null,
        }))));
        if (starters.length) out.append(h('div', { class: 'eyebrow mt', text: mine.length ? 'Suggested' : 'Suggested — tap to log, ✎ to tweak and save' }),
          h('div', { class: 'foodchips' }, starters.map((m) => chip(m, { onTap: () => logFood(date, m, onAdd), onEdit: () => F.mealSheet({ meal: { name: m.name, items: m.items }, date, onDone: onAdd }) }))));
        out.append(h('div', { class: 'btngroup mt' },
          h('button', { class: 'btn sm', onClick: () => F.mealSheet({ date, onDone: onAdd }) }, icon('plus', 14), 'Build a meal'),
          mine.length ? h('button', { class: 'btn sm ghost', text: manage ? 'Done' : 'Remove meals', onClick: () => { manage = !manage; draw(); } }) : null));
      }
      if (tab === 'protein') {
        out.append(h('p', { class: 'small muted mb', text: 'Rough portions are fine — a palm-sized piece of chicken, meat or fish is about 30 g of protein.' }),
          h('div', { class: 'foodchips' }, P.foods.map((f) => chip(f, { onTap: () => logFood(date, f, onAdd) }))));
      }
      if (tab === 'treats') {
        const what = h('input', { type: 'text', placeholder: 'What was it? (optional)' });
        out.append(h('p', { class: 'small muted mb', text: 'No weighing, no sugar grams — just count them. Fruit, milk and plain yogurt don’t count.' }), what,
          h('div', { class: 'treatbtns mt-s' }, P.treatSizes.map((t) => h('button', { class: 'treatbtn', onClick: () => logFood(date, { name: what.value.trim() || t.label, p: 0, kcal: t.kcal, tp: t.pts }, onAdd) },
            h('span', { class: 'ti', text: t.icon }), h('b', { text: t.label }), h('span', { class: 'pts', text: t.pts === 0.5 ? 'counts ½' : t.pts === 1 ? 'counts 1' : 'counts 2' }), h('small', { text: t.examples })))));
      }
      if (tab === 'custom') {
        const name = h('input', { type: 'text', placeholder: 'e.g. Leftover chili' });
        const p = F.ui.numIn(null, { placeholder: 'g (a guess is fine)' }), kc = F.ui.numIn(null, { placeholder: 'optional' });
        let tp = 0;
        const keep = h('input', { type: 'checkbox' });
        out.append(h('label', { class: 'field' }, h('span', { text: 'Name' }), name),
          h('div', { class: 'fieldrow' }, h('label', { class: 'field' }, h('span', { text: 'Protein (g)' }), p), h('label', { class: 'field' }, h('span', { text: 'Calories' }), kc)),
          h('div', { class: 'field' }, h('span', { class: 'small muted', text: 'Was it a treat?' }), F.ui.seg([{ v: 0, label: 'No' }, { v: 0.5, label: 'Small' }, { v: 1, label: 'Treat' }, { v: 2, label: 'Big' }], 0, (v) => { tp = v; })),
          h('label', { class: 'toggle' }, keep, 'Save to My meals'),
          h('button', { class: 'btn primary block mt-s', text: 'Log it', onClick: () => {
            const f = { name: name.value.trim() || 'Food', p: +p.value || 0, kcal: +kc.value || 0, tp };
            if (keep.checked) F.store.addCustomFood(f);
            logFood(date, f, onAdd);
          } }));
      }
    }
    draw();
    return out;
  }
  F.foodSheet = (date = F.ui.today()) => {
    sheet(h('div', null, h('h2', { text: 'Add food' + (date === F.ui.today() ? '' : ' · ' + F.ui.fmtDate(date)) }), h('p', { class: 'small muted mb', text: 'One tap logs a portion — tap twice for two.' }), foodPicker(date, () => F.app.render())));
  };

  // ---------- water ----------
  // Logged by the glass or bottle against a daily target. Amounts are stored in fl oz and shown in oz or ml.
  const waterSizes = () => (F.u.metric() ? [250, 330, 500, 750, 1000].map((ml) => ml / 29.5735) : [8, 12, 16, 24, 32]);
  const waterTotal = (date) => F.store.waterOn(date).reduce((a, x) => a + (+x.oz || 0), 0);
  // The size the one-tap button on Today adds: the amount logged most often lately (your usual glass or bottle),
  // the newer one on a tie, and 16 oz / 500 ml until there is something to go on.
  F.waterCup = () => {
    const W = F.store.load().water;
    const recent = Object.keys(W).sort().slice(-14).flatMap((d) => W[d]).slice(-24);
    const count = {}, amount = {};
    let best = null;
    for (const x of recent) {
      const k = Math.round(x.oz * 10);
      count[k] = (count[k] || 0) + 1; amount[k] = x.oz;
      if (best === null || count[k] >= count[best]) best = k;
    }
    return best === null ? (F.u.metric() ? 500 / 29.5735 : 16) : amount[best];
  };
  F.logWater = (date, oz, onAdd) => {
    if (!(oz > 0)) return;
    const target = F.game.waterTarget(), before = waterTotal(date);
    const rec = F.store.addWater(date, oz);
    F.timer.sfx('pop');
    const hit = !F.game.waterMet(before, target) && F.game.waterMet(before + oz, target);
    const task = F.data.prog().dailyTasks.find((t) => t.kind === 'water');
    if (hit && task) F.ui.xpFloat(task.xp, '💧');
    toast(`💧 +${F.u.vol(oz)}${hit ? ' — target hit' : ''}`, 2400, { label: 'Undo', run: () => { F.store.removeWater(date, rec.id); F.game.afterChange(); onAdd && onAdd(); } });
    F.game.afterChange();
    onAdd && onAdd();
  };
  function waterBox(date, redraw) {
    const list = F.store.waterOn(date);
    const total = waterTotal(date), target = F.game.waterTarget(), met = F.game.waterMet(total, target), left = Math.max(0, target - total), unit = F.u.vu();
    const other = F.ui.numIn(null, { placeholder: unit, w: '84px', step: 1 });
    const most = F.u.metric() ? 4000 / 29.5735 : 128;   // a gallon in one entry is a typo
    const addOther = () => {
      const v = +other.value, oz = F.u.vIn(v);
      if (!(v > 0)) { toast('Enter an amount'); return; }
      if (oz > most) { toast(`More than ${F.u.vol(most)} in one go? Check the amount.`, 2600); return; }
      F.logWater(date, oz, redraw);
    };
    other.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOther(); });
    return h('div', null,
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow', style: { marginBottom: 0 }, text: '💧 Water' }), h('b', { class: 'num', style: { fontSize: '1.3rem' }, text: `${F.u.volN(total)} / ${F.u.volN(target)} ${unit}` })),
      h('div', { class: 'mt-s' }, progress(total / target, met ? 'green' : 'sky', true)),
      h('div', { class: 'small mt-s ' + (met ? 'green' : 'muted'), text: met ? 'Target hit. Anything more is a bonus.' : `${F.u.vol(left)} to go. Sparkling water, plain tea and black coffee count too.` }),
      h('div', { class: 'waterbtns mt' }, waterSizes().map((oz) => h('button', { type: 'button', 'aria-label': 'Add ' + F.u.vol(oz), onClick: () => F.logWater(date, oz, redraw) },
        h('b', { text: '+' + (F.u.metric() && F.u.vv(oz) >= 1000 ? F.u.vv(oz) / 1000 : F.u.vv(oz)) }), h('small', { text: F.u.metric() && F.u.vv(oz) >= 1000 ? 'L' : unit })))),
      h('div', { class: 'row mt-s', style: { gap: '8px' } }, other, h('button', { class: 'btn sm', onClick: addOther }, icon('plus', 14), 'Other amount')),
      list.length ? h('div', { class: 'mt' }, h('div', { class: 'tiny muted', text: 'Logged — tap one to remove it' }),
        h('div', { class: 'chips mt-s' }, list.map((x) => h('button', { type: 'button', class: 'chip small', 'aria-label': 'Remove ' + F.u.vol(x.oz), onClick: () => { F.store.removeWater(date, x.id); F.game.afterChange(); redraw(); } }, F.u.vol(x.oz) + ' ✕')))) : null);
  }
  F.waterSheet = (date = F.ui.today()) => {
    const body = h('div');
    const draw = () => {
      body.innerHTML = '';
      body.append(waterBox(date, () => { draw(); F.app.render(); }),
        date === F.ui.today() ? null : h('div', { class: 'small muted mt', text: `Saves to ${F.ui.fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}.` }));
    };
    sheet(body);
    draw();
  };

  // ---------- fasting ----------
  function stageAt(hrs) {
    const st = F.data.prog().fastingStages;
    let i = 0;
    for (let k = 0; k < st.length; k++) if (hrs >= st[k].h) i = k;
    return { i, cur: st[i], next: st[i + 1] || null, all: st };
  }
  const hm = (hrs) => { const m = Math.max(0, Math.round(hrs * 60)); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
  const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const dtLocal = (ms) => { const d = new Date(ms), p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const fromDt = (v) => { const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? null : t; };
  const MAX_H = 96;   // longest fast the timer will accept
  // Why the span a..b can't be a fast: it overlaps one already logged, or the one that's running.
  function clash(a, b, running) {
    const S = F.store.load();
    const hit = S.fasts.find((f) => a < f.end && b > f.start);
    if (hit) return `That overlaps the fast you logged from ${when(hit.start)} to ${when(hit.end)}.`;
    return running && S.activeFast && b > S.activeFast.start ? 'That overlaps the fast that’s running now.' : '';
  }

  // The most recent 9, 8, 7 and 6 PM: the usual last meal before a fast the timer wasn't started for.
  function eveningChips(now) {
    const today = F.ui.today();
    return [21, 20, 19, 18].map((hr) => { const d = new Date(now); d.setHours(hr, 0, 0, 0); if (d.getTime() > now) d.setDate(d.getDate() - 1); return d.getTime(); })
      .sort((x, y) => y - x)
      .map((t) => ({ t, label: (F.ui.ymd(new Date(t)) === today ? 'Today ' : 'Last night ') + new Date(t).toLocaleTimeString(undefined, { hour: 'numeric' }) }));
  }
  // Quick picks plus an exact date and time. "Just now" keeps meaning now, however long the sheet stays open.
  function timePicker(value, chips, onChange) {
    const opened = Date.now();
    let t = value;
    const inp = h('input', { type: 'datetime-local', value: dtLocal(t), max: dtLocal(opened), 'aria-label': 'Date and time' });
    const row = h('div', { class: 'chips' });
    const paint = () => row.querySelectorAll('button').forEach((el, i) => el.classList.toggle('on', Math.abs(chips[i].t - t) < 60000));
    chips.forEach((c) => row.append(h('button', { type: 'button', class: 'chip', text: c.label, onClick: () => { t = c.t; inp.value = dtLocal(t); paint(); onChange(); } })));
    inp.addEventListener('input', () => { const v = fromDt(inp.value); if (v === null) return; t = v; paint(); onChange(); });
    paint();
    return { el: h('div', { class: 'stack', style: { gap: '8px' } }, chips.length ? row : null, inp), get: () => (Math.abs(t - opened) < 60000 ? Date.now() : t) };
  }

  // Start a fast from now, or from when the last meal actually ended — the clock and the stages catch up.
  F.fastSheet = ({ earlier = false, target, onDone } = {}) => {
    const S = F.store.load(), P = F.data.prog();
    if (S.activeFast) { location.hash = '#/fuel'; return; }
    const now = Date.now();
    const evenings = eveningChips(now);
    let goal = target || S.settings.fast.targetH || 24;
    const note = h('div', { class: 'callout small' });
    const paint = () => {
      const t = tp.get(), hrs = (Date.now() - t) / 3.6e6;
      const lands = `${goal} h lands ${when(t + goal * 3.6e6)}.`;
      const hit = clash(t, Date.now());
      note.className = 'callout small' + (hrs < 0 || hrs > MAX_H || hit ? ' amber' : hrs >= 0.05 ? ' green' : '');
      note.textContent = hrs < 0 ? 'That’s in the future — pick when you finished eating.'
        : hrs > MAX_H ? 'That’s more than 4 days ago. For a fast that’s already over, use “Log a past fast” on the Fuel page.'
        : hit ? hit
        : hrs < 0.05 ? `Starts now. ${lands}`
        : hrs >= goal ? `${hm(hrs)} fasted already — past ${goal} h. Start it, then end it to log it.`
        : `${hm(hrs)} fasted already · ${stageAt(hrs).cur.icon} ${stageAt(hrs).cur.name}. ${lands}`;
    };
    const tp = timePicker(earlier ? evenings.find((c) => new Date(c.t).getHours() === 20).t : now, [{ t: now, label: 'Just now' }].concat(evenings), paint);
    const sh = sheet(h('div', { class: 'stack' },
      h('h2', { text: '⏳ Start a fast' }),
      h('div', { class: 'row between' }, h('span', { class: 'small muted', text: 'Target' }), F.ui.seg([{ v: 24, label: '24 h' }, { v: 36, label: '36 h' }], goal, (v) => { goal = v; paint(); })),
      h('div', null, h('b', { text: 'When did you finish your last meal?' }), h('div', { class: 'small muted', text: 'Didn’t start the timer at the time? Pick when you stopped eating and the clock catches up.' })),
      tp.el, note,
      h('button', { class: 'btn fire big block', onClick: () => {
        const t = tp.get(), hrs = (Date.now() - t) / 3.6e6, hit = clash(t, Date.now());
        if (hrs < 0 || hrs > MAX_H || hit) { toast(hrs < 0 ? 'Pick a time in the past' : hit || 'That’s more than 4 days ago', 2800); return; }
        F.store.startFast(t, goal);
        F.timer.sfx('go');
        sh.close();
        if (hrs >= 0.05) toast(`Fast running — ${hm(hrs)} in already`, 2600);
        (onDone || (() => F.app.render()))();
      } }, icon('play', 16), 'Start the fast'),
      h('div', { class: 'tiny muted', text: P.fastingCaution })));
    paint();
  };

  F.fastMini = (date) => {
    const S = F.store.load();
    const f = S.activeFast;
    if (f) {
      const hrs = (Date.now() - f.start) / 3.6e6, sa = stageAt(hrs);
      return h('a', { href: '#/fuel', 'data-fastmini': '1', class: 'row nowrap', style: { color: 'inherit' } },
        F.ui.ring(hrs / f.targetH, { size: 54, stroke: 6, label: Math.floor(hrs) + 'h', color: 'var(--purple)' }),
        h('div', { class: 'grow' }, h('b', { text: `${sa.cur.icon} ${sa.cur.name}` }), h('div', { class: 'small muted', text: `${hm(hrs)} fasted · target ${f.targetH} h (${when(f.start + f.targetH * 3.6e6)})` })), icon('chevron', 16));
    }
    const C = F.game.compute();
    const q = C.thisWeek && C.thisWeek.list.find((x) => x.id === 'fast');
    if (!q || !q.target || q.met) return q && q.met ? h('div', { class: 'small green', text: '⏳ This week’s fast is done.' }) : null;
    const fd = S.settings.fast.day;
    const isDay = F.ui.dow(date) === fd, eve = F.ui.dow(F.ui.addDays(date, 1)) === fd;
    const msg = isDay ? '⏳ Fast day — not running yet. Started last night? Tap Start and pick the time.' : eve ? '⏳ Fast starts tonight after dinner — through tomorrow evening.' : `⏳ Weekly fast · planned for ${F.ui.DAYS[fd]}`;
    return h('div', { class: 'row between nowrap' }, h('span', { class: 'small', text: msg }), h('button', { class: 'btn xs' + (isDay || eve ? ' primary' : ''), text: 'Start', onClick: () => F.fastSheet() }));
  };

  function fastCard(rerender) {
    const S = F.store.load(), P = F.data.prog();
    const card = h('div', { class: 'card' });
    const f = S.activeFast;
    if (!f) {
      let target = S.settings.fast.targetH || 24;
      card.append(h('div', { class: 'eyebrow', text: '⏳ Weekly fast' }),
        h('div', { class: 'row between' }, h('b', { text: `Target ${target} h · planned for ${F.ui.DAYS[S.settings.fast.day]}s` }), F.ui.seg([{ v: 24, label: '24 h' }, { v: 36, label: '36 h' }], target, (v) => { target = v; })),
        h('p', { class: 'small muted mt-s', text: 'Start the timer when you finish your last meal. Forgot to? “I started earlier” sets the clock back to when you stopped eating. It walks you through what your body is doing hour by hour.' }),
        h('div', { class: 'btngroup mt' },
          h('button', { class: 'btn fire', onClick: () => { F.store.startFast(Date.now(), target); F.timer.sfx('go'); rerender(); } }, icon('play', 14), 'Start now'),
          h('button', { class: 'btn', onClick: () => F.fastSheet({ earlier: true, target, onDone: rerender }) }, 'I started earlier…')),
        h('div', { class: 'tiny muted mt', text: P.fastingCaution }));
      return card;
    }
    const clock = h('div', { class: 'fastclock' });
    const stageBox = h('div');
    const stagesBar = h('div', { class: 'stages' });
    const meta = h('div', { class: 'small muted' });
    const paint = () => {
      const hrs = (Date.now() - f.start) / 3.6e6, sa = stageAt(hrs);
      clock.textContent = F.ui.hms((Date.now() - f.start) / 1000);
      stagesBar.innerHTML = '';
      sa.all.forEach((st, k) => stagesBar.append(h('i', { class: k < sa.i ? 'on' : k === sa.i ? 'cur' : '', title: `${st.h} h · ${st.name}` })));
      stageBox.replaceChildren(h('div', { class: 'stage-now' }, h('span', { class: 'si', text: sa.cur.icon }), h('div', null, h('b', { text: sa.cur.name + ' · ' + sa.cur.h + ' h+' }), h('div', { class: 'small muted', text: sa.cur.desc }))));
      const endAt = f.start + f.targetH * 3.6e6;
      const xpNow = F.game.fastXP(hrs);
      meta.textContent = (sa.next ? `Next: ${sa.next.name} in ${hm(sa.next.h - hrs)} · ` : '') + (hrs < f.targetH ? `Target ${f.targetH} h at ${when(endAt)}` : `Target reached ${hm(hrs - f.targetH)} ago`)
        + (xpNow ? ` · +${xpNow} XP so far` : ' · XP starts after 12 h');
    };
    paint();
    const iv = setInterval(() => { if (!document.body.contains(card)) { clearInterval(iv); return; } paint(); }, 1000);
    card.append(h('div', { class: 'row between' }, h('div', { class: 'eyebrow', style: { marginBottom: 0 }, text: `⏳ Fasting since ${when(f.start)}` }),
        h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn xs ghost', onClick: () => fixStart(rerender) }, icon('edit', 13), 'Fix start'), pill(`target ${f.targetH} h`, 'purple'))),
      clock, stagesBar, meta, h('div', { class: 'mt' }, stageBox),
      h('details', { class: 'acc mt' }, h('summary', { text: 'Fasting tips' }), h('div', { class: 'acc-body' }, h('ul', { class: 'cues' }, P.fastingTips.map((t) => h('li', { class: 'small', text: t }))))),
      h('div', { class: 'btngroup mt' }, h('button', { class: 'btn primary', onClick: () => endFast(rerender) }, 'End fast'), h('button', { class: 'btn ghost sm', text: 'Cancel (didn’t count)', onClick: async () => { if (await confirmDlg('Cancel this fast without logging it?', { ok: 'Cancel fast', danger: true })) { F.store.cancelFast(); rerender(); } } })));
    return card;
  }
  // The timer was started late, or from the wrong time.
  function fixStart(rerender) {
    const f = F.store.load().activeFast;
    if (!f) return;
    const note = h('div', { class: 'callout small' });
    const paint = () => {
      const t = tp.get(), hrs = (Date.now() - t) / 3.6e6, hit = clash(t, Date.now()), ok = hrs >= 0 && hrs <= MAX_H && !hit;
      note.className = 'callout small' + (ok ? ' green' : ' amber');
      note.textContent = hrs < 0 ? 'That’s in the future.' : hrs > MAX_H ? 'That’s more than 4 days ago.' : hit ? hit
        : `${hm(hrs)} fasted · ${stageAt(hrs).cur.icon} ${stageAt(hrs).cur.name}. ${hrs >= f.targetH ? `Already past ${f.targetH} h.` : `${f.targetH} h lands ${when(t + f.targetH * 3.6e6)}.`}`;
    };
    const tp = timePicker(f.start, eveningChips(Date.now()), paint);
    const sh = sheet(h('div', { class: 'stack' },
      h('h2', { text: 'When did this fast start?' }),
      h('p', { class: 'small muted', text: 'Set when you actually finished your last meal. The clock and stages follow.' }),
      tp.el, note,
      h('button', { class: 'btn primary block', text: 'Save', onClick: () => {
        const t = tp.get(), hrs = (Date.now() - t) / 3.6e6, hit = clash(t, Date.now());
        if (hrs < 0 || hrs > MAX_H || hit) { toast(hit || 'Pick a time in the last 4 days', 2800); return; }
        F.store.setFastStart(t); sh.close(); rerender();
      } })));
    paint();
  }
  // Ending can be set back too: the meal that broke the fast may have been hours before the timer is stopped.
  function endFast(rerender) {
    const f = F.store.load().activeFast;
    if (!f) return;
    const note = h('div', { class: 'callout small' });
    const paint = () => {
      const hrs = (tp.get() - f.start) / 3.6e6, xp = F.game.fastXP(hrs);
      note.className = 'callout small' + (hrs <= 0 ? ' amber' : xp ? ' green' : '');
      note.replaceChildren(h('b', { text: hrs <= 0 ? 'That’s before the fast started.' : hrs >= f.targetH ? `You made it — ${hm(hrs)}.` : hrs >= 24 ? `${hm(hrs)} — past the 24-hour mark.` : `${hm(hrs)} fasted.` }),
        hrs <= 0 ? '' : ' ' + (hrs >= 24 ? `+${xp} XP. Break it with a protein-forward, normal-sized meal.` : xp ? `+${xp} XP for the hours you did. Ending when your body says so is the right call.` : 'The first 12 hours don’t earn fast XP, but it’s logged. No harm in stopping.'));
    };
    const tp = timePicker(Date.now(), [{ t: Date.now(), label: 'Just now' }], paint);
    const sh = sheet(h('div', { class: 'stack' },
      h('h2', { text: 'End the fast' }),
      h('p', { class: 'small muted', text: 'When did you eat? If that was a while ago and the timer kept running, set the time you actually ate.' }),
      tp.el, note,
      h('div', { class: 'btngroup' },
        h('button', { class: 'btn primary', text: 'End fast', onClick: () => {
          const end = tp.get(), hrs = (end - f.start) / 3.6e6;
          if (hrs <= 0 || end > Date.now() + 60000) { toast(hrs <= 0 ? 'The end has to be after the start' : 'Pick a time in the past'); return; }
          F.store.endFast(end);
          sh.close();
          F.timer.sfx('done');
          F.ui.xpFloat(F.game.fastXP(hrs), '🍗');
          F.game.afterChange();
          rerender();
        } }),
        h('button', { class: 'btn ghost', text: 'Keep going', onClick: () => sh.close() }))));
    paint();
  }
  // A fast that's already over and was never timed.
  function pastFast(rerender) {
    const now = Date.now();
    const eve = eveningChips(now).find((c) => new Date(c.t).getHours() === 20).t;
    const startIn = h('input', { type: 'datetime-local', value: dtLocal(eve - 24 * 3.6e6), max: dtLocal(now) });
    const endIn = h('input', { type: 'datetime-local', value: dtLocal(eve), max: dtLocal(now) });
    const note = h('div', { class: 'callout small' });
    const read = () => { const a = fromDt(startIn.value), b = fromDt(endIn.value); return { a, b, hrs: a === null || b === null ? null : (b - a) / 3.6e6 }; };
    const problem = ({ a, b, hrs }) => (hrs === null ? 'Set both times.' : hrs <= 0 ? 'The meal after has to come later than the meal before.' : hrs > MAX_H ? 'That’s more than 4 days — check the dates.' : b > Date.now() + 60000 ? 'The end is in the future — if it’s still going, start the timer instead.' : clash(a, b, true));
    const paint = () => {
      const r = read(), bad = problem(r), xp = bad ? 0 : F.game.fastXP(r.hrs);
      note.className = 'callout small' + (bad ? ' amber' : xp ? ' green' : '');
      note.textContent = bad || `${hm(r.hrs)} fasted${xp ? ` · +${xp} XP` : ' — the first 12 hours earn no fast XP, but it’s logged'}.`;
    };
    startIn.addEventListener('input', paint);
    endIn.addEventListener('input', paint);
    const sh = sheet(h('div', { class: 'stack' },
      h('h2', { text: 'Log a past fast' }),
      h('p', { class: 'small muted', text: 'For a fast that’s already over and was never timed. It counts for the week it started in.' }),
      h('label', { class: 'field' }, h('span', { text: 'Last meal before it' }), startIn),
      h('label', { class: 'field' }, h('span', { text: 'First meal after it' }), endIn),
      note,
      h('button', { class: 'btn primary block', text: 'Log it', onClick: () => {
        const r = read(), bad = problem(r);
        if (bad) { toast(bad, 2600); return; }
        F.store.addFast(r.a, r.b, r.hrs >= 36 ? 36 : 24);
        sh.close();
        F.timer.sfx('done');
        F.ui.xpFloat(F.game.fastXP(r.hrs), '🍗');
        F.game.afterChange();
        rerender();
      } })));
    paint();
  }

  // ---------- view ----------
  F.views.fuel = (dateArg) => {
    const S = F.store.load();
    const date = F.ui.dayArg(dateArg);
    const wrap = h('div');
    const rerender = () => F.app.render();
    const C = F.game.compute();
    const d = C.days[date] || { protein: 0, treats: 0, kcalIn: 0, kcal: 0 };
    const pT = F.game.proteinTarget(), kT = S.settings.nutrition.kcal;
    const isToday = date === F.ui.today();
    wrap.append(h('div', { class: 'pagehead row between' }, h('div', null, h('h1', { text: 'Fuel' }), h('div', { class: 'sub', text: 'Protein and water daily, treats on a weekly budget, one fast a week' })),
      h('div', { class: 'row nowrap' },
        h('a', { class: 'iconbtn', href: '#/fuel/' + F.ui.addDays(date, -1), 'aria-label': 'Previous day' }, icon('back')),
        h('span', { class: 'small', style: { minWidth: '92px', textAlign: 'center' }, text: isToday ? 'Today' : F.ui.fmtDate(date) }),
        isToday ? h('span', { style: { width: '36px' } }) : h('a', { class: 'iconbtn', href: '#/fuel/' + F.ui.addDays(date, 1), 'aria-label': 'Next day' }, icon('chevron')))));
    if (!isToday) wrap.append(h('div', { class: 'callout sky small row between mb' }, h('span', { text: `📅 Food and water here are saved to ${F.ui.fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' })}.` }),
      h('div', { class: 'row', style: { gap: '6px' } }, h('a', { class: 'btn xs', href: '#/day/' + date, text: 'Open that day' }), h('a', { class: 'btn xs primary', href: '#/fuel', text: 'Back to today' }))));

    // Totals. On a fast day there is no protein target.
    const need = Math.max(0, pT - d.protein), fastDay = F.game.fastDay(date);
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'fuelsnap' },
      F.ui.ring(d.protein / pT, { size: 116, stroke: 11, label: num(d.protein), sub: fastDay ? 'fast day' : `/ ${pT} g protein`, color: fastDay ? 'var(--purple)' : undefined }),
      h('div', { class: 'stack', style: { gap: '8px' } },
        fastDay
          ? h('div', null, h('b', { text: '⏳ Fast day — no protein target' }), h('div', { class: 'small muted', text: 'Hit protein and Log food are off for the day. Water still counts, and anything you log still shows here.' }))
          : h('div', null, h('b', { text: need ? `${num(need)} g protein to go` : 'Protein target hit 💪' }), h('div', { class: 'small muted', text: need ? `≈ ${num(need / 24, 1)} scoops of whey, or ${num(need / 30, 1)} palm-sized portions of meat or fish` : 'Muscle has what it needs to grow.' })),
        h('div', { class: 'small' }, '🍪 Treats: ', h('b', { text: F.fmtTreats(d.treats || 0) }), h('span', { class: 'muted', text: isToday ? ' today' : '' })),
        S.settings.nutrition.trackKcal ? h('div', { class: 'small' }, '🔥 Calories: ', h('b', { text: '≈ ' + num(d.kcalIn) }), h('span', { class: 'muted', text: kT ? ` / ${num(kT)} target` : ' eaten' }), h('span', { class: 'muted', text: ` · ≈ ${num(d.kcal)} burned training` })) : null))));

    wrap.append(h('div', { class: 'card' }, waterBox(date, rerender)));

    // Weekly treat budget
    const ws = F.ui.weekStart(date);
    const W = C.weeks[ws] || F.game.weekQuotas(ws, C.days, S);
    const tq = W.list.find((q) => q.id === 'sugar');
    const used = tq && tq.extra ? tq.extra.used : 0, budget = F.game.treatBudget(), left = half(budget - used);
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: 'Treats · week of ' + F.ui.fmtDate(ws, { month: 'short', day: 'numeric' }) }), h('b', { class: 'num', style: { fontSize: '1.3rem' }, text: `${num(used, 1)} / ${num(budget, 1)}` })),
      progress(budget ? used / budget : 1, used > budget ? 'red' : used > budget * 0.8 ? 'amber' : 'green', true),
      h('div', { class: 'small mt-s ' + (left < 0 ? 'red' : 'muted'), text: left > 0 ? `Room for ${F.fmtTreats(left)} more this week — it’s a weekly budget, so a baking day evens out.` : left === 0 ? 'Right at this week’s budget — nicely judged.' : `${F.fmtTreats(-left)} over — no drama, next week resets. An extra walk or a protein-heavy day helps.` })));

    // Add food
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Add food' })), h('div', { class: 'card' }, foodPicker(date, rerender)));

    // Log
    const items = F.store.foodOn(date);
    const log = h('div', { class: 'card tight' });
    if (!items.length) log.append(h('div', { class: 'small muted', text: 'Nothing logged yet.' }));
    for (const it of items.slice().reverse()) log.append(h('div', { class: 'foodrow' },
      h('div', null, h('div', { text: (F.game.tpOf(it) ? '🍪 ' : '') + it.name }), h('div', { class: 'm', text: F.ui.ymd(new Date(it.ts)) === date ? new Date(it.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'added ' + F.ui.fmtDate(F.ui.ymd(new Date(it.ts)), { month: 'short', day: 'numeric' }) })),
      h('div', { class: 'm', text: F.foodSummary(it) }),
      h('button', { class: 'btn xs ghost', 'aria-label': 'Remove', onClick: () => { F.store.removeFood(date, it.id); rerender(); } }, icon('x', 14))));
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: isToday ? 'Today' : F.ui.fmtDate(date) }), h('span', { class: 'small muted', text: `${items.length} item${items.length === 1 ? '' : 's'}` })), log);

    // Fasting
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Fasting' })), fastCard(rerender));
    const past = S.fasts.slice(-8).reverse();
    wrap.append(h('div', { class: 'row between mt' }, h('div', { class: 'eyebrow', style: { marginBottom: 0 }, text: past.length ? 'Recent fasts' : 'Fasted without the timer?' }),
      h('button', { class: 'btn xs ghost', onClick: () => pastFast(rerender) }, icon('plus', 13), 'Log a past fast')));
    if (past.length) {
      const hist = h('div', { class: 'card tight' });
      for (const x of past) {
        const hrs = (x.end - x.start) / 3.6e6;
        hist.append(h('div', { class: 'foodrow' }, h('div', { text: F.ui.fmtDate(F.ui.ymd(new Date(x.start))) }), h('div', { class: 'm', text: hm(hrs) + (hrs >= 24 ? ' ✓' : '') }),
          h('button', { class: 'btn xs ghost', 'aria-label': 'Delete', onClick: async () => { if (await confirmDlg('Delete this fast?', { ok: 'Delete', danger: true })) { F.store.removeFast(x.id); rerender(); } } }, icon('x', 14))));
      }
      hist.classList.add('mt-s');
      wrap.append(hist);
    }
    return wrap;
  };
})();
