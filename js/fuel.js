/* Fuel: protein, sugar budget (weekly, so treat days balance out), optional calories, and the fasting timer. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, pill, progress } = F.ui;

  // ---------- food picker (page + sheet) ----------
  let lastTab = 'protein';
  function foodPicker(date, onAdd) {
    const S = F.store.load(), P = F.data.prog();
    let tab = lastTab, manage = false;
    const out = h('div');
    const add = (f) => {
      F.store.addFood(date, { name: f.name, p: +f.p || 0, sug: +f.sug || 0, kcal: +f.kcal || 0, treat: !!f.treat });
      F.timer.sfx('pop');
      toast(`${f.name} · ${num(f.p)} g protein${f.sug ? ' · ' + num(f.sug) + ' g sugar' : ''}`, 2200, { label: 'Undo', run: () => { const list = F.store.foodOn(date); const last = list[list.length - 1]; if (last) F.store.removeFood(date, last.id); onAdd && onAdd(); } });
      F.game.afterChange();
      onAdd && onAdd();
    };
    const chip = (f, treat) => h('button', { class: 'foodchip' + (treat ? ' treat' : ''), onClick: () => (manage && f.custom ? removeCustom(f) : add(Object.assign({ treat }, f))) },
      h('b', { text: (manage && f.custom ? '✕ ' : '') + f.name }), h('small', { text: `${num(f.p)}g P · ${num(f.sug)}g sugar${f.kcal ? ' · ' + num(f.kcal) + ' kcal' : ''}` }));
    function removeCustom(f) { S.foods = S.foods.filter((x) => x.id !== f.id); F.store.save(); draw(); }
    function draw() {
      out.innerHTML = '';
      const tabs = h('div', { class: 'tabs' });
      for (const [k, l] of [['protein', 'Protein'], ['treats', 'Treats'], ['mine', 'My foods'], ['custom', '+ Custom']]) tabs.append(h('button', { class: tab === k ? 'active' : '', text: l, onClick: () => { tab = lastTab = k; draw(); } }));
      out.append(tabs);
      if (tab === 'protein') out.append(h('div', { class: 'foodchips' }, P.foods.map((f) => chip(f, false))));
      if (tab === 'treats') out.append(h('p', { class: 'small muted mb', text: 'Rough numbers for typical homemade bakes — add the real ones from your kitchen under Custom and they’ll live in My foods.' }), h('div', { class: 'foodchips' }, P.treats.map((f) => chip(f, true))));
      if (tab === 'mine') {
        if (!S.foods.length) out.append(h('div', { class: 'empty small', text: 'Nothing saved yet. Use + Custom and tick “Save to My foods”.' }));
        else out.append(h('div', { class: 'foodchips' }, S.foods.map((f) => chip(Object.assign({ custom: true }, f), f.treat))), h('button', { class: 'btn xs ghost mt-s', text: manage ? 'Done' : 'Remove foods', onClick: () => { manage = !manage; draw(); } }));
      }
      if (tab === 'custom') {
        const name = h('input', { type: 'text', placeholder: 'e.g. Snickerdoodle (the good ones)' });
        const p = F.ui.numIn(null, { placeholder: 'g' }), sug = F.ui.numIn(null, { placeholder: 'g' }), kc = F.ui.numIn(null, { placeholder: 'kcal' });
        const treat = h('input', { type: 'checkbox' }), keep = h('input', { type: 'checkbox', checked: true });
        out.append(h('label', { class: 'field' }, h('span', { text: 'Name' }), name),
          h('div', { class: 'fieldrow' }, h('label', { class: 'field' }, h('span', { text: 'Protein (g)' }), p), h('label', { class: 'field' }, h('span', { text: 'Added sugar (g)' }), sug), h('label', { class: 'field' }, h('span', { text: 'Calories' }), kc)),
          h('label', { class: 'toggle' }, treat, 'It’s a treat'), h('label', { class: 'toggle' }, keep, 'Save to My foods'),
          h('button', { class: 'btn primary block mt-s', text: 'Add', onClick: () => {
            const f = { name: name.value.trim() || 'Food', p: +p.value || 0, sug: +sug.value || 0, kcal: +kc.value || 0, treat: treat.checked };
            if (keep.checked) { S.foods.push(Object.assign({ id: F.ui.uid() }, f)); F.store.save(); }
            add(f); tab = lastTab = keep.checked ? 'mine' : 'protein'; draw();
          } }));
      }
    }
    draw();
    return out;
  }
  F.foodSheet = (date = F.ui.today()) => {
    sheet(h('div', null, h('h2', { text: 'Add food' }), h('p', { class: 'small muted mb', text: 'One tap adds a portion; tap twice for two.' }), foodPicker(date, () => F.app.render())));
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
    const msg = isDay ? '⏳ Fast day — if it isn’t running yet, start it after your last meal.' : eve ? '⏳ Fast starts tonight after dinner — through tomorrow evening.' : `⏳ Weekly fast · planned for ${F.ui.DAYS[fd]}`;
    return h('div', { class: 'row between' }, h('span', { class: 'small', text: msg }), h('a', { class: 'btn xs' + (isDay || eve ? ' primary' : ''), href: '#/fuel', text: isDay || eve ? 'Start' : 'Fasting' }));
  };

  function fastCard(rerender) {
    const S = F.store.load(), P = F.data.prog();
    const card = h('div', { class: 'card' });
    const f = S.activeFast;
    if (!f) {
      let target = S.settings.fast.targetH || 24;
      card.append(h('div', { class: 'eyebrow', text: '⏳ Weekly fast' }),
        h('div', { class: 'row between' }, h('b', { text: `Target ${target} h · planned for ${F.ui.DAYS[S.settings.fast.day]}s` }), F.ui.seg([{ v: 24, label: '24 h' }, { v: 36, label: '36 h' }], target, (v) => { target = v; })),
        h('p', { class: 'small muted mt-s', text: 'Start the timer when you finish your last meal. It walks you through what your body is doing hour by hour.' }),
        h('div', { class: 'btngroup mt' },
          h('button', { class: 'btn fire', onClick: () => { F.store.startFast(Date.now(), target); F.timer.sfx('go'); rerender(); } }, icon('play', 14), 'Start now'),
          h('button', { class: 'btn', onClick: () => startedEarlier(target, rerender) }, 'Started earlier…')),
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
      meta.textContent = (sa.next ? `Next: ${sa.next.name} in ${hm(sa.next.h - hrs)} · ` : '') + (hrs < f.targetH ? `Target ${f.targetH} h at ${when(endAt)}` : `Target reached ${hm(hrs - f.targetH)} ago`);
    };
    paint();
    const iv = setInterval(() => { if (!document.body.contains(card)) { clearInterval(iv); return; } paint(); }, 1000);
    card.append(h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: `⏳ Fasting since ${when(f.start)}` }), pill(`target ${f.targetH} h`, 'purple')),
      clock, stagesBar, meta, h('div', { class: 'mt' }, stageBox),
      h('details', { class: 'acc mt' }, h('summary', { text: 'Fasting tips' }), h('div', { class: 'acc-body' }, h('ul', { class: 'cues' }, P.fastingTips.map((t) => h('li', { class: 'small', text: t }))))),
      h('div', { class: 'btngroup mt' }, h('button', { class: 'btn primary', onClick: () => endFast(rerender) }, 'End fast'), h('button', { class: 'btn ghost sm', text: 'Cancel (didn’t count)', onClick: async () => { if (await confirmDlg('Cancel this fast without logging it?', { ok: 'Cancel fast', danger: true })) { S.activeFast = null; F.store.save(); rerender(); } } })));
    return card;
  }
  function startedEarlier(target, rerender) {
    const d = new Date(Date.now() - 2 * 3.6e6);
    const pad = (n) => String(n).padStart(2, '0');
    const inp = h('input', { type: 'datetime-local', value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` });
    const sh = sheet(h('div', { class: 'stack' }, h('h2', { text: 'When was your last meal?' }), inp,
      h('button', { class: 'btn primary', text: 'Start from then', onClick: () => { const t = new Date(inp.value).getTime(); if (!t || t > Date.now()) { toast('Pick a time in the past'); return; } F.store.startFast(t, target); sh.close(); rerender(); } })));
  }
  async function endFast(rerender) {
    const f = F.store.load().activeFast;
    const hrs = (Date.now() - f.start) / 3.6e6;
    const msg = hrs >= f.targetH ? `You made it — ${hm(hrs)}.` : hrs >= 24 ? `${hm(hrs)} — past the 24-hour mark.` : `${hm(hrs)} logged.`;
    const sub = hrs >= 24 ? 'Break it with a protein-forward, normal-sized meal.' : hrs >= 16 ? 'Short of 24 h but it still counts (+60 XP). Ending when your body says so is the right call.' : 'Under 16 hours doesn’t earn fast XP, but it’s logged. No harm in stopping.';
    if (!(await confirmDlg(msg, { ok: 'End fast', sub }))) return;
    F.store.endFast(Date.now());
    F.timer.sfx('done');
    if (hrs >= 24) F.ui.xpFloat(hrs >= 36 ? 200 : 150, '🍗'); else if (hrs >= 16) F.ui.xpFloat(60, '🍗');
    F.game.afterChange();
    rerender();
  }

  // ---------- view ----------
  F.views.fuel = (dateArg) => {
    const S = F.store.load();
    const date = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : F.ui.today();
    const wrap = h('div');
    const rerender = () => F.app.render();
    const C = F.game.compute();
    const d = C.days[date] || { protein: 0, sugar: 0, kcalIn: 0, kcal: 0 };
    const pT = F.game.proteinTarget(), sD = F.game.sugarDaily(), kT = S.settings.nutrition.kcal;
    const isToday = date === F.ui.today();
    wrap.append(h('div', { class: 'pagehead row between' }, h('div', null, h('h1', { text: 'Fuel' }), h('div', { class: 'sub', text: 'Protein first, sugar on a weekly budget, one fast a week' })),
      h('div', { class: 'row nowrap' },
        h('a', { class: 'iconbtn', href: '#/fuel/' + F.ui.addDays(date, -1), 'aria-label': 'Previous day' }, icon('back')),
        h('span', { class: 'small', style: { minWidth: '92px', textAlign: 'center' }, text: isToday ? 'Today' : F.ui.fmtDate(date) }),
        isToday ? h('span', { style: { width: '36px' } }) : h('a', { class: 'iconbtn', href: '#/fuel/' + F.ui.addDays(date, 1), 'aria-label': 'Next day' }, icon('chevron')))));

    // Totals
    const need = Math.max(0, pT - d.protein);
    const card = h('div', { class: 'card' }, h('div', { class: 'fuelsnap' },
      F.ui.ring(d.protein / pT, { size: 116, stroke: 11, label: num(d.protein), sub: `/ ${pT} g protein` }),
      h('div', { class: 'stack', style: { gap: '8px' } },
        h('div', null, h('b', { text: need ? `${num(need)} g protein to go` : 'Protein target hit 💪' }), h('div', { class: 'small muted', text: need ? `≈ ${num(need / 25, 1)} shakes, or ${num(need / 53, 1)} chicken breasts` : 'Muscle has what it needs to grow.' })),
        h('div', { class: 'small' }, `🍪 Added sugar: `, h('b', { text: num(d.sugar) + ' g' }), h('span', { class: 'muted', text: ` · daily pace ${sD} g` })),
        S.settings.nutrition.trackKcal ? h('div', { class: 'small' }, '🔥 Calories: ', h('b', { text: num(d.kcalIn) }), h('span', { class: 'muted', text: kT ? ` / ${num(kT)} target` : ' eaten' }), h('span', { class: 'muted', text: ` · ≈ ${num(d.kcal)} burned training` })) : null)));
    wrap.append(card);

    // Weekly sugar budget
    const ws = F.ui.weekStart(date);
    const W = C.weeks[ws] || F.game.weekQuotas(ws, C.days, S);
    const sq = W.list.find((q) => q.id === 'sugar');
    const used = sq && sq.extra ? sq.extra.used : 0, budget = sD * 7, left = budget - used;
    wrap.append(h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: 'Sugar budget · week of ' + F.ui.fmtDate(ws, { month: 'short', day: 'numeric' }) }), h('b', { class: 'num', style: { fontSize: '1.3rem' }, text: `${num(used)} / ${budget} g` })),
      progress(used / budget, used > budget ? 'red' : used > budget * 0.8 ? 'amber' : 'green', true),
      h('div', { class: 'small mt-s ' + (left < 0 ? 'red' : 'muted'), text: left >= 0 ? `Room for about ${num(Math.floor(left / 12))} more homemade cookies this week 🍪 — the budget is weekly so a baking day evens out.` : `${num(-left)} g over — no drama, next week resets. Extra walks and a protein-heavy day help.` })));

    // Add food
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Add food' })), h('div', { class: 'card' }, foodPicker(date, rerender)));

    // Log
    const items = F.store.foodOn(date);
    const log = h('div', { class: 'card tight' });
    if (!items.length) log.append(h('div', { class: 'small muted', text: 'Nothing logged yet.' }));
    for (const it of items.slice().reverse()) log.append(h('div', { class: 'foodrow' },
      h('div', null, h('div', { text: (it.treat ? '🍪 ' : '') + it.name }), h('div', { class: 'm', text: new Date(it.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) })),
      h('div', { class: 'm', text: `${num(it.p)}g P · ${num(it.sug)}g S${it.kcal ? ' · ' + num(it.kcal) : ''}` }),
      h('button', { class: 'btn xs ghost', 'aria-label': 'Remove', onClick: () => { F.store.removeFood(date, it.id); rerender(); } }, icon('x', 14))));
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: isToday ? 'Today' : F.ui.fmtDate(date) }), h('span', { class: 'small muted', text: `${items.length} item${items.length === 1 ? '' : 's'}` })), log);

    // Fasting
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Fasting' })), fastCard(rerender));
    const past = S.fasts.slice(-8).reverse();
    if (past.length) {
      const hist = h('div', { class: 'card tight' });
      for (const x of past) {
        const hrs = (x.end - x.start) / 3.6e6;
        hist.append(h('div', { class: 'foodrow' }, h('div', { text: F.ui.fmtDate(F.ui.ymd(new Date(x.start))) }), h('div', { class: 'm', text: hm(hrs) + (hrs >= 24 ? ' ✓' : '') }),
          h('button', { class: 'btn xs ghost', 'aria-label': 'Delete', onClick: async () => { if (await confirmDlg('Delete this fast?', { ok: 'Delete', danger: true })) { F.store.removeFast(x.id); rerender(); } } }, icon('x', 14))));
      }
      wrap.append(h('div', { class: 'eyebrow mt', text: 'Recent fasts' }), hist);
    }
    return wrap;
  };
})();
