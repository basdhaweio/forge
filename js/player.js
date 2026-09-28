/* Session player: start/resume, guided logging for every block type, finish sheet, and the XP summary. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, mmss, pill } = F.ui;

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

  // ---------- start / preview ----------
  F.startSession = async (id, { date, loc } = {}) => {
    const S = F.store.load();
    date = date || F.ui.today();
    if (S.active) {
      if (S.active.src === id && S.active.plan.date === date) { location.hash = '#/play'; return; }
      const ok = await confirmDlg(`${S.active.plan.title} is still in progress.`, { ok: 'Discard it and start', danger: true, sub: 'Or cancel and resume it from Today.' });
      if (!ok) { location.hash = '#/play'; return; }
    }
    try {
      S.active = { src: id, plan: F.data.buildPlan(id, date, { loc }), start: Date.now(), express: false };
    } catch (e) { toast(e.message, 3000); return; }
    F.store.saveNow();
    location.hash = '#/play';
  };

  F.previewSession = (id, { date } = {}) => {
    date = date || F.ui.today();
    let plan;
    try { plan = F.data.buildPlan(id, date); } catch (e) { toast(e.message); return; }
    const body = h('div');
    body.append(h('div', { class: 'eyebrow', text: F.data.loc(plan.loc).icon + ' ' + F.data.loc(plan.loc).label + ' · ~' + plan.est + ' min' }),
      h('h2', { text: plan.icon + ' ' + plan.title }), h('p', { class: 'muted small', text: plan.sub }),
      plan.desc ? h('p', { class: 'small mt-s', text: plan.desc }) : null);
    for (const b of plan.blocks) {
      const names = b.items.map((it) => { const e = F.data.ex(it.ex); return e ? (it.why ? `(${e.name} — ${it.why})` : e.name + (it.sets && it.sets.length ? ` ${it.sets.length}×` : '')) : null; }).filter(Boolean);
      body.append(h('div', { class: 'mt' }, h('div', { class: 'eyebrow', text: b.name + (b.core ? '' : ' · optional') }), h('div', { class: 'small', text: b.timer ? (b.timer.label || b.timer.workLabel || '') + (names.length ? ' — ' + names.join(', ') : '') : names.join(' · ') })));
    }
    const sh = sheet(h('div', null, body, h('div', { class: 'btngroup mt' },
      h('button', { class: 'btn fire big', onClick: () => { sh.close(); F.startSession(id, { date }); } }, icon('play', 16), 'Start'),
      h('button', { class: 'btn ghost', text: 'Close', onClick: () => sh.close() }))));
  };

  // ---------- player ----------
  F.views.play = () => {
    const S = F.store.load();
    const A = S.active;
    if (!A) return h('div', { class: 'empty' }, 'No session in progress. ', h('a', { href: '#/', text: 'Back to Today' }));
    const plan = A.plan;
    const save = () => F.store.save();
    const wrap = h('div', { class: 'player' });
    const clock = h('span', { class: 'clock' });
    const tickClock = () => { const s = (Date.now() - A.start) / 1000; clock.textContent = s >= 3600 ? F.ui.hms(s) : mmss(s); };
    tickClock();
    const iv = setInterval(tickClock, 1000);
    wrap._cleanup = () => clearInterval(iv);
    const L = F.data.loc(plan.loc);
    wrap.append(h('div', { class: 'player-head' },
      h('a', { class: 'iconbtn', href: '#/', 'aria-label': 'Back to Today (session stays open)' }, icon('back')),
      h('div', { class: 't' }, h('b', { text: plan.icon + ' ' + plan.title }), h('small', { class: 'muted', text: `${L.icon} ${L.label} · Phase ${plan.phase}` })),
      clock,
      h('button', { class: 'btn sm primary', text: 'Finish', onClick: () => finish() })));
    if (plan.desc) wrap.append(h('div', { class: 'callout mb small', text: plan.desc }));
    const ci = F.store.checkin(plan.date) || {};
    if (ci.knee >= 1 || ci.back >= 1) wrap.append(h('div', { class: 'callout amber mb small', text: `Adjusted for today's check-in (${[ci.knee >= 1 ? 'knees' : '', ci.back >= 1 ? 'back' : ''].filter(Boolean).join(' & ')}): gentler options are picked first. Stop anything sharp.` }));
    if (plan.blocks.some((b) => !b.core)) {
      const cb = h('input', { type: 'checkbox', checked: A.express });
      cb.addEventListener('change', () => { A.express = cb.checked; save(); renderBlocks(); });
      wrap.append(h('label', { class: 'toggle' }, cb, 'Short on time — main blocks only (still full credit)'));
    }
    const blocksEl = h('div');
    wrap.append(blocksEl);
    wrap.append(h('div', { class: 'mt', style: { marginTop: '22px' } }, h('button', { class: 'btn fire big block', onClick: () => finish() }, icon('check', 18), 'Finish session')));

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
      card.append(h('div', { class: 'target' }, it.last ? h('span', null, 'Last ' + it.last + '  →  ') : null, h('span', null, 'Today ', h('b', { text: tgt })), it.target && it.target.why ? h('span', { text: ' · ' + it.target.why }) : null));
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
        if (z.done) ins.append(h('button', { class: 'holdval', title: 'Edit', onClick: () => editHold(z, bi) }, mmss(z.s || 0)), h('span', { class: 'u', text: e.side ? 'per side' : '' }));
        else ins.append(h('button', { class: 'holdbtn', onClick: () => F.timer.hold({ title: e.name, target: z.s || (it.target && it.target.s) || 30, pr: bestHold(e.id), side: e.side, onDone: (secs) => { z.s = secs; z.done = true; afterSet(it, bi); } }) }, icon('timer', 16), 'Hold ' + mmss(z.s || 30)));
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
      if (it.rest) F.timer.rest(it.sets.some((z) => !z.done) ? it.rest : Math.min(it.rest, 60), it.sets.some((z) => !z.done) ? 'Rest' : 'Next up');
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
      if (live.some((it) => !it.done)) card.append(h('button', { class: 'btn fire block mb', onClick: () => startFlow(pb, bi) }, icon('play', 16), `Guided — about ${Math.max(1, Math.round(secs / 60))} min`));
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
      if (!pb.done) card.append(h('button', { class: 'btn fire block mt', onClick: () => F.timer.run({ title: plan.title + ' · ' + pb.name, timer: t, cue: t.kind === 'amrap' && names.length ? names.map((e, i) => (live[i].reps || '') + ' ' + e.name).join(' · ') : '', onDone: ({ secs, rounds }) => { pb.done = true; pb.vals.secs = secs; if (t.kind === 'amrap') pb.vals.rounds = rounds; save(); refresh(bi); } }) }, icon('play', 16), 'Start timer'));
      else card.append(h('div', { class: 'row mt-s' }, pill('Done · ' + mmss(pb.vals.secs || 0), 'green'), h('button', { class: 'btn xs ghost', text: 'Run again', onClick: () => { pb.done = false; save(); refresh(bi); } })));
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
        if (pb.roundsDone > was) { F.timer.sfx('pop'); F.ui.vibrate(20); if (pb.rest) F.timer.rest(pb.rest); }
      } }));
      card.append(h('div', { class: 'row between mt-s' }, h('span', { class: 'small muted', text: `Tap each round as you finish it · target ${pb.target}` + (pb.lastRounds ? ` (last time ${pb.lastRounds} + 1)` : '') + (pb.capped ? ` · Phase ${plan.phase} cap ${pb.max}` : '') }), h('span', { class: 'num', style: { fontSize: '1.4rem', fontWeight: 700 }, text: pb.roundsDone + ' / ' + pb.target })));
      card.append(grid);
      return card;
    }
    function swapCircuit(bi, it) {
      const list = it.alts.map(F.data.ex).filter(Boolean);
      const sh = sheet(h('div', null, h('h2', { text: 'Swap exercise' }), h('div', { class: 'list mt' }, list.map((e) => h('div', { class: 'item', onClick: () => { it.ex = e.id; F.store.load().settings.slotPrefs[it.slot] = e.id; save(); sh.close(); refresh(bi); } }, h('div', { class: 't' }, h('b', { text: e.name }), h('small', { text: e.cues[0] })), e.id === it.ex ? pill('current', 'acc') : null)))));
    }

    // ---------- finish ----------
    function anyDone() {
      return plan.blocks.some((pb) => (pb.type === 'sets' && pb.items.some((it) => it.sets.some((z) => z.done))) || ((pb.type === 'list' || pb.type === 'flow') && pb.items.some((it) => it.done || (it.bubbles && it.bubbles.some(Boolean)))) || (pb.type === 'circuit' && pb.roundsDone) || (pb.type === 'timer' && pb.done));
    }
    function finish() {
      const P = F.store.load().profile;
      const mins = Math.max(1, Math.round((Date.now() - A.start) / 60000));
      const minIn = F.ui.numIn(mins, { step: 1 });
      let rpe = null, knee = 0, back = 0;
      const checks = {};
      const notes = h('textarea', { placeholder: 'Notes (optional)' });
      const rpeOpts = Array.from({ length: 10 }, (_, i) => ({ v: i + 1, label: String(i + 1) }));
      const painOpts = [{ v: 0, label: 'Fine' }, { v: 1, label: 'Achy' }, { v: 2, label: 'Sharp / catching' }];
      const sh = sheet(h('div', { class: 'stack' },
        h('h2', { text: 'Finish ' + plan.title }),
        !anyDone() ? h('div', { class: 'callout amber small', text: "Nothing is ticked yet — it'll still be logged as a session with the minutes below." }) : null,
        h('label', { class: 'field' }, h('span', { text: 'Minutes' }), minIn),
        h('div', null, h('div', { class: 'eyebrow', text: 'How hard was it? (1 easy – 10 max)' }), F.ui.seg(rpeOpts, null, (v) => { rpe = v; })),
        P.injuries.knee ? h('div', null, h('div', { class: 'eyebrow', text: 'Knees during the session' }), F.ui.seg(painOpts, 0, (v) => { knee = v; })) : null,
        P.injuries.lumbar ? h('div', null, h('div', { class: 'eyebrow', text: 'Back during the session' }), F.ui.seg(painOpts, 0, (v) => { back = v; })) : null,
        (plan.finishChecks || []).map((c) => { const cb = h('input', { type: 'checkbox' }); cb.addEventListener('change', () => { checks[c.id] = cb.checked; }); return h('label', { class: 'toggle' }, cb, c.label); }),
        notes,
        h('div', { class: 'btngroup' },
          h('button', { class: 'btn fire big', onClick: () => { sh.close(); commit(Math.max(1, +minIn.value || mins), { rpe, pain: { knee, back }, checks, notes: notes.value.trim() }); } }, icon('check', 18), 'Save session'),
          h('button', { class: 'btn danger', text: 'Discard', onClick: async () => { sh.close(); if (await confirmDlg('Discard this session?', { ok: 'Discard', danger: true })) { F.store.load().active = null; F.timer.stopRest(); F.store.saveNow(); location.hash = '#/'; } } }))));
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
    return wrap;
  };

  // ---------- summary ----------
  F.views.done = (id) => {
    const S = F.store.load();
    const rec = S.sessions.find((x) => x.id === id);
    if (!rec) return h('div', { class: 'empty' }, 'Session not found. ', h('a', { href: '#/', text: 'Today' }));
    const C = F.game.compute();
    const wrap = h('div', { class: 'stack' });
    const xpEl = h('div', { class: 'summary-xp', text: '+0' });
    wrap.append(h('div', { class: 'hero center' },
      h('div', { style: { fontSize: '3rem' }, text: rec.icon || '🔥' }),
      h('div', { class: 'eyebrow', text: 'Session complete' }),
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

    const W = C.thisWeek;
    if (W) {
      const wq = h('div', { class: 'wq' });
      for (const q of W.list) if (q.target > 0 && ['count', 'days'].includes(q.kind)) wq.append(h('div', { class: 'w' + (q.met ? ' met' : '') }, h('div', { class: 'top' }, h('span', { text: q.icon + ' ' + q.label })), h('div', { class: 'val', text: `${Math.min(q.done, 99)}` }, h('small', { text: ' / ' + q.target }))));
      wrap.append(h('div', null, h('div', { class: 'section-title' }, h('h2', { text: 'This week' })), wq));
    }
    wrap.append(h('div', { class: 'btngroup mt' }, h('a', { class: 'btn fire big', href: '#/' }, 'Back to Today'), h('a', { class: 'btn', href: '#/train/history' }, 'History')));
    setTimeout(() => F.game.afterChange(), 900);
    return wrap;
  };
})();
