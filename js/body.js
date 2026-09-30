/* Body: monthly tape check-ins, trends and ratios. Monthly on purpose — the trend is what matters. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, pill } = F.ui;

  const valOf = (m, id) => (id === 'weight' ? m.weight : id === 'bf' ? m.bf : m.sites && m.sites[id]);
  const fmtVal = (kind, v) => (v === null || v === undefined ? '–' : kind === 'w' ? F.u.w(v, 1) : kind === 'l' ? F.u.l(v, F.u.metric() ? 1 : 2) : num(v, 1) + '%');
  const toDisp = (kind, v) => (kind === 'w' ? F.u.wv(v) : kind === 'l' ? F.u.lv(v) : v);
  const fromDisp = (kind, v) => (v === null || v === '' ? null : kind === 'w' ? F.u.wIn(+v) : kind === 'l' ? F.u.lIn(+v) : +v);

  F.measureSheet = (existing, { date } = {}) => {
    const S = F.store.load(), P = F.data.prog();
    const last = S.measurements[S.measurements.length - 1];
    const m = existing ? JSON.parse(JSON.stringify(existing)) : { date: date || F.ui.today(), sites: {} };
    m.sites = m.sites || {};
    const used = new Set(S.measurements.flatMap((x) => Object.keys(x.sites || {})).concat(S.measurements.some((x) => x.bf) ? ['bf'] : []));
    const dateIn = h('input', { type: 'date', value: m.date, max: F.ui.today() });
    const inputs = {};
    const field = (site) => {
      const unit = site.kind === 'w' ? F.u.wu() : site.kind === 'l' ? F.u.lu() : '%';
      const prev = last && last !== existing ? valOf(last, site.id) : null;
      const inp = F.ui.numIn(toDisp(site.kind, valOf(m, site.id)), { placeholder: prev !== null && prev !== undefined ? String(toDisp(site.kind, prev)) : unit });
      inputs[site.id] = inp;
      return h('label', { class: 'field', title: site.guide }, h('span', { text: `${site.label} (${unit})` }), inp);
    };
    const core = P.measureSites.filter((x) => x.core || used.has(x.id));
    const extra = P.measureSites.filter((x) => !x.core && !used.has(x.id));
    const body = h('div', null,
      h('h2', { text: existing ? 'Edit check-in' : 'Monthly measurements' }),
      h('p', { class: 'small muted', text: 'Morning, before eating, relaxed. Same spots every time — placeholders show last month.' }),
      h('label', { class: 'field mt' }, h('span', { text: 'Date' }), dateIn),
      h('div', { class: 'fieldrow' }, core.map(field)),
      extra.length ? h('details', { class: 'acc mb' }, h('summary', { text: 'More sites' }), h('div', { class: 'acc-body fieldrow' }, extra.map(field))) : null,
      h('details', { class: 'acc mb' }, h('summary', { text: 'How to measure' }), h('div', { class: 'acc-body small' }, P.measureSites.map((x) => h('p', { style: { margin: '6px 0' } }, h('b', { text: x.label + ': ' }), x.guide)))),
      h('button', { class: 'btn fire big block', onClick: saveIt }, icon('check', 18), 'Save'),
      existing ? h('button', { class: 'btn danger block mt-s', onClick: async () => { if (await confirmDlg('Delete this check-in?', { ok: 'Delete', danger: true })) { F.store.removeMeasurement(existing.id); sh.close(); F.app.render(); } } }, 'Delete') : null);
    const sh = sheet(body);
    function saveIt() {
      const rec = { date: dateIn.value || F.ui.today(), sites: {} };
      let any = false;
      for (const site of P.measureSites) {
        const raw = inputs[site.id] ? inputs[site.id].value : '';
        const v = raw === '' ? null : fromDisp(site.kind, raw);
        if (v === null || isNaN(v)) continue;
        any = true;
        if (site.id === 'weight') rec.weight = Math.round(v * 10) / 10;
        else if (site.id === 'bf') rec.bf = v;
        else rec.sites[site.id] = Math.round(v * 100) / 100;
      }
      if (!any) { toast('Enter at least one number'); return; }
      if (existing) F.store.updateMeasurement(existing.id, rec);
      else { F.store.addMeasurement(rec); F.ui.xpFloat(50, '📏'); }
      if (rec.weight) { F.store.load().profile.weightLb = rec.weight; F.store.save(); }
      sh.close();
      F.game.afterChange();
      F.app.render();
    }
  };

  function siteChart(site) {
    const S = F.store.load();
    const pts = S.measurements.filter((m) => valOf(m, site.id) !== null && valOf(m, site.id) !== undefined).map((m) => ({ x: F.ui.parse(m.date), y: toDisp(site.kind, valOf(m, site.id)) }));
    const color = site.dir > 0 ? 'var(--green)' : site.dir < 0 ? 'var(--sky)' : 'var(--accent)';
    sheet(h('div', null, h('h2', { text: site.label }), h('p', { class: 'small muted mb', text: site.guide }), F.ui.lineChart(pts, { color, fmt: (y) => num(y, 1) })));
  }

  F.views.body = () => {
    const S = F.store.load(), P = F.data.prog();
    const wrap = h('div');
    const ms = S.measurements;
    const last = ms[ms.length - 1], first = ms[0], prev = ms[ms.length - 2];
    const today = F.ui.today();
    wrap.append(h('div', { class: 'pagehead row between' }, h('div', null, h('h1', { text: 'Body' }), h('div', { class: 'sub', text: 'Monthly tape check-ins — the trend is what matters' })),
      h('button', { class: 'btn fire', onClick: () => F.measureSheet() }, icon('plus', 16), 'Measure')));

    const since = last ? F.ui.daysBetween(last.date, today) : null;
    const due = !last || since >= 28;
    wrap.append(h('div', { class: 'card' + (due ? ' glow' : '') },
      h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'eyebrow', text: due ? 'Check-in due' : 'Next check-in' }),
          h('b', { text: last ? (due ? `It’s been ${since} days — measure this week` : F.ui.fmtDate(F.ui.addDays(last.date, 28), { weekday: 'long', month: 'short', day: 'numeric' }) + ` (${F.ui.relDay(F.ui.addDays(last.date, 28))})`) : 'Take your baseline — every number after this is progress' })),
        h('span', { style: { fontSize: '2rem' }, text: '📏' })),
      h('p', { class: 'small muted mt-s', text: 'Weight and waist swing with water, salt and sleep from day to day. Monthly, same conditions, is how you see the real change.' })));

    if (!ms.length) { wrap.append(h('div', { class: 'empty mt', text: 'No measurements yet.' })); return wrap; }

    const table = h('table', { class: 'table mtable' });
    table.append(h('thead', null, h('tr', null, h('th', { text: 'Site' }), h('th', { text: 'Now' }), h('th', { text: 'vs last' }), h('th', { text: 'vs start' }), h('th', { text: '' }))));
    const tb = h('tbody');
    const delta = (site, a, b) => {
      if (a === null || a === undefined || b === null || b === undefined) return h('span', { class: 'muted', text: '–' });
      const d = a - b;
      if (Math.abs(d) < 0.05) return h('span', { class: 'd muted', text: '±0' });
      const good = site.dir === 0 ? null : Math.sign(d) === site.dir;
      const shown = site.kind === 'w' ? F.u.wv(Math.abs(d)) : site.kind === 'l' ? F.u.lv(Math.abs(d)) : num(Math.abs(d), 1);
      return h('span', { class: 'd ' + (good === null ? 'muted' : good ? 'green' : 'amber'), text: (d > 0 ? '▲ ' : '▼ ') + shown });
    };
    for (const site of P.measureSites) {
      const series = ms.map((m) => valOf(m, site.id)).filter((v) => v !== null && v !== undefined);
      if (!series.length) continue;
      const lastWith = [...ms].reverse().find((m) => valOf(m, site.id) !== null && valOf(m, site.id) !== undefined);
      const prevWith = [...ms].reverse().filter((m) => valOf(m, site.id) !== null && valOf(m, site.id) !== undefined)[1];
      const firstWith = ms.find((m) => valOf(m, site.id) !== null && valOf(m, site.id) !== undefined);
      tb.append(h('tr', { class: 'clickable', style: { cursor: 'pointer' }, onClick: () => siteChart(site) },
        h('td', { text: site.label }),
        h('td', { class: 'n', text: fmtVal(site.kind, valOf(lastWith, site.id)) }),
        h('td', null, prevWith ? delta(site, valOf(lastWith, site.id), valOf(prevWith, site.id)) : h('span', { class: 'muted', text: '–' })),
        h('td', null, firstWith !== lastWith ? delta(site, valOf(lastWith, site.id), valOf(firstWith, site.id)) : h('span', { class: 'muted', text: '–' })),
        h('td', null, F.ui.sparkline(series.map((v) => toDisp(site.kind, v)), { color: site.dir > 0 ? 'var(--green)' : site.dir < 0 ? 'var(--sky)' : 'var(--accent)' }))));
    }
    table.append(tb);
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Latest' }), h('span', { class: 'small muted', text: F.ui.fmtDate(last.date) + (prev ? ` · vs ${F.ui.fmtDate(prev.date, { month: 'short', day: 'numeric' })}` : '') })), h('div', { class: 'card tight', style: { overflowX: 'auto' } }, table),
      h('div', { class: 'tiny muted mt-s', text: 'Green = moving the way you want (arms, chest, shoulders and quads up; waist down). Tap a row for its chart.' }));

    // Ratios
    const ratio = (m) => (m && m.sites && m.sites.shoulders && m.sites.waist ? m.sites.shoulders / m.sites.waist : null);
    const withR = ms.filter((m) => ratio(m));
    const rc = h('div', { class: 'grid2' });
    if (withR.length) {
      const now = ratio(withR[withR.length - 1]), start = ratio(withR[0]);
      rc.append(h('div', { class: 'card' }, h('div', { class: 'eyebrow', text: 'V-taper · shoulders ÷ waist' }), h('div', { class: 'num', style: { fontSize: '2.2rem', fontWeight: 700 }, text: num(now, 2) }),
        h('div', { class: 'small ' + (now > start + 0.005 ? 'green' : 'muted'), text: withR.length > 1 ? `from ${num(start, 2)} at the start` : 'Bigger shoulders or a smaller waist both push this up.' })));
    }
    const hIn = S.profile.heightIn;
    const lw = [...ms].reverse().find((m) => m.sites && m.sites.waist);
    if (hIn && lw) {
      const wh = lw.sites.waist / hIn;
      rc.append(h('div', { class: 'card' }, h('div', { class: 'eyebrow', text: 'Waist ÷ height' }), h('div', { class: 'num', style: { fontSize: '2.2rem', fontWeight: 700 }, text: num(wh, 2) }),
        h('div', { class: 'small ' + (wh < 0.5 ? 'green' : 'muted'), text: wh < 0.5 ? 'Under 0.5 — the healthy range for heart health.' : 'Under 0.5 is the heart-health target; waist is the lever.' })));
    }
    if (rc.childNodes.length) wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Ratios' })), rc);

    // History
    const hist = h('div', { class: 'list' });
    for (const m of ms.slice().reverse()) {
      const n = Object.keys(m.sites || {}).length + (m.weight ? 1 : 0) + (m.bf ? 1 : 0);
      hist.append(h('div', { class: 'item', onClick: () => F.measureSheet(m) }, h('span', { class: 'emo', text: '📏' }), h('div', { class: 't' }, h('b', { text: F.ui.fmtDate(m.date, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) }), h('small', { text: `${n} measurement${n === 1 ? '' : 's'}${m.weight ? ' · ' + F.u.w(m.weight, 1) : ''}${m.sites && m.sites.waist ? ' · waist ' + F.u.l(m.sites.waist) : ''}` })), icon('edit', 16)));
    }
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Check-ins' })), hist);
    return wrap;
  };
})();
