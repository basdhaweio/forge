/* Timers: full-screen intervals (4×4, rounds, AMRAP, steady, stopwatch), isometric holds, guided flows, rest bar.
   Wall-clock based, so a locked phone catches up correctly when you come back. */
window.F = window.F || {};

F.timer = (() => {
  const { h, icon, mmss, hms } = F.ui;

  // ---------- sound, vibration, wake lock ----------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function tone(freq, dur = 0.12, when = 0, vol = 0.22, type = 'sine') {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + when;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function sfx(name) {
    if (!F.store.load().settings.sound) return;
    if (name === 'tick') tone(740, 0.07, 0, 0.16);
    else if (name === 'go') { tone(880, 0.13); tone(1320, 0.24, 0.14); }
    else if (name === 'rest') { tone(660, 0.16); tone(440, 0.3, 0.17); }
    else if (name === 'done') { tone(784, 0.13); tone(988, 0.13, 0.14); tone(1319, 0.42, 0.28); }
    else if (name === 'fanfare') { tone(523, 0.11, 0, 0.14); tone(659, 0.11, 0.11, 0.14); tone(784, 0.11, 0.22, 0.14); tone(1047, 0.5, 0.33, 0.16); }
    else if (name === 'pop') tone(1046, 0.08, 0, 0.12, 'triangle');
  }
  const vib = (p) => F.ui.vibrate(p);
  let wl = null, wantWake = false;
  async function wake(on) {
    wantWake = on;
    try {
      if (on && 'wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
      else if (!on && wl) { await wl.release(); wl = null; }
    } catch (e) { wl = null; }
  }
  document.addEventListener('visibilitychange', () => { if (wantWake && document.visibilityState === 'visible') wake(true); });

  function hrText(kind, zone) {
    const hm = F.game.hrMax();
    if (zone) return hm ? `${Math.round(hm * zone[0])}–${Math.round(hm * zone[1])} bpm` : 'conversational — nose-breathing pace';
    if (kind === 'work') return hm ? `${Math.round(hm * 0.85)}–${Math.round(hm * 0.95)} bpm · RPE 8–9` : 'RPE 8–9 — a word or two at a time';
    if (kind === 'rest') return hm ? `about ${Math.round(hm * 0.7)} bpm` : 'easy — talk in sentences';
    if (kind === 'warm') return hm ? `${Math.round(hm * 0.6)}–${Math.round(hm * 0.7)} bpm` : 'easy, building';
    return '';
  }

  function phasesFrom(t) {
    const P = [];
    if (t.kind === 'intervals') {
      if (t.warm) P.push({ label: t.warmLabel || 'Warm-up', secs: t.warm, kind: 'warm' });
      for (let i = 0; i < t.rounds; i++) {
        P.push({ label: (t.workLabels && t.workLabels[i]) || t.workLabel || 'Work', secs: t.work, kind: 'work', round: i + 1, of: t.rounds });
        if (t.rest && i < t.rounds - 1) P.push({ label: t.restLabel || 'Rest', secs: t.rest, kind: 'rest', round: i + 1, of: t.rounds });
      }
      if (t.cool) P.push({ label: t.coolLabel || 'Cool-down', secs: t.cool, kind: 'cool' });
    } else if (t.kind === 'steady') P.push({ label: t.label || 'Steady', secs: (t.mins || 30) * 60, kind: 'work', zone: t.hrZone });
    else if (t.kind === 'amrap') P.push({ label: t.label || 'AMRAP', secs: (t.mins || 20) * 60, kind: 'work', counter: true });
    else P.push({ label: t.label || 'Go', secs: 0, kind: 'work', up: true });
    return P;
  }

  // ---------- full-screen interval runner ----------
  function run({ title, timer, cue, onDone }) {
    audio(); wake(true);
    const phases = phasesFrom(timer);
    const planned = phases.reduce((a, p) => a + p.secs, 0);
    const counter = phases.some((p) => p.counter);
    let idx = 0, adj = 0, phaseStart = Date.now(), startAll = Date.now(), paused = false, pauseAt = 0, pausedTotal = 0, closed = false, lastBeep = -1, rounds = 0, loop = null;

    const el = h('div', { class: 'tmr work' });
    const roundEl = h('div', { class: 'tmr-round' }), labelEl = h('div', { class: 'tmr-label' }), hrEl = h('div', { class: 'tmr-hr' });
    const clockEl = h('div', { class: 'tmr-clock' }), barI = h('i'), nextEl = h('div', { class: 'tmr-next' }), totalEl = h('div', { class: 'tmr-total' });
    const countEl = h('div', { class: 'tmr-count' });
    const pauseBtn = h('button', { class: 'btn', onClick: togglePause });
    const counterBox = counter ? h('div', { class: 'stack', style: { alignItems: 'center', marginTop: '10px' } },
      countEl,
      h('button', { class: 'btn fire tmr-plus', onClick: () => { rounds++; sfx('pop'); vib(25); paint(); } }, '+1 round'),
      h('button', { class: 'btn xs ghost', text: 'undo', onClick: () => { rounds = Math.max(0, rounds - 1); paint(); } })) : null;
    const upOnly = phases.length === 1 && phases[0].up;
    el.append(
      h('div', { class: 'tmr-top' }, h('button', { class: 'btn sm ghost', onClick: endEarly }, icon('x', 16), 'End'), h('div', { class: 't', text: title })),
      h('div', { class: 'tmr-main' }, roundEl, labelEl, hrEl, clockEl, h('div', { class: 'tmr-bar' }, barI), nextEl, cue ? h('div', { class: 'tmr-cue', text: cue }) : null, counterBox),
      h('div', { class: 'tmr-ctrl' },
        upOnly ? null : h('button', { class: 'btn', text: '−10s', onClick: () => { adj -= 10; paint(); } }),
        pauseBtn,
        upOnly ? null : h('button', { class: 'btn', text: '+10s', onClick: () => { adj += 10; paint(); } }),
        upOnly ? h('button', { class: 'btn primary', onClick: () => finish(false) }, icon('check', 18), 'Done') : h('button', { class: 'btn', onClick: skip }, icon('skip', 18), 'Skip')),
      totalEl);
    document.getElementById('overlay-root').append(el);
    announce(phases[0]);

    function elapsed() { return ((paused ? pauseAt : Date.now()) - phaseStart) / 1000; }
    function totalElapsed() { return ((paused ? pauseAt : Date.now()) - startAll - pausedTotal) / 1000; }
    function announce(p) { sfx(p.kind === 'work' ? 'go' : 'rest'); vib(p.kind === 'work' ? [90, 60, 90] : [200]); }
    function togglePause() {
      if (!paused) { paused = true; pauseAt = Date.now(); }
      else { const d = Date.now() - pauseAt; phaseStart += d; pausedTotal += d; paused = false; }
      paint();
    }
    function skip() {
      if (idx >= phases.length - 1) return finish(false);
      idx++; adj = 0; phaseStart = paused ? pauseAt : Date.now(); lastBeep = -1; announce(phases[idx]); paint();
    }
    function tick() {
      if (closed) return;
      let p = phases[idx];
      let rem = p.up ? 0 : p.secs + adj - elapsed();
      while (!p.up && rem <= 0 && !paused) {
        if (idx >= phases.length - 1) return finish(false);
        const over = -rem;
        idx++; adj = 0; lastBeep = -1;
        phaseStart = Date.now() - over * 1000;
        p = phases[idx];
        announce(p);
        rem = p.up ? 0 : p.secs - over;
      }
      if (!p.up && !paused) {
        const r = Math.ceil(rem);
        if (r <= 3 && r >= 1 && r !== lastBeep) { lastBeep = r; sfx('tick'); }
      }
      paint();
      loop = setTimeout(tick, 200);
    }
    function paint() {
      const p = phases[idx];
      const rem = p.up ? 0 : Math.max(0, p.secs + adj - elapsed());
      el.className = 'tmr ' + p.kind;
      roundEl.textContent = p.round ? `Round ${p.round} of ${p.of}` : p.kind === 'warm' ? 'Warm-up' : p.kind === 'cool' ? 'Cool-down' : phases.length > 1 ? '' : '';
      labelEl.textContent = paused ? 'Paused — ' + p.label : p.label;
      hrEl.textContent = timer.hr || p.zone ? hrText(p.kind, p.zone) : '';
      const shown = p.up ? elapsed() : Math.ceil(rem);
      clockEl.textContent = shown >= 3600 ? hms(shown) : mmss(shown);
      barI.style.width = p.up ? '0%' : Math.min(100, (1 - rem / Math.max(1, p.secs + adj)) * 100) + '%';
      const nx = phases[idx + 1];
      nextEl.textContent = nx ? `Next: ${nx.label} · ${mmss(nx.secs)}` : p.up ? 'Tap Done when you finish' : 'Last one — finish strong';
      pauseBtn.replaceChildren(icon(paused ? 'play' : 'pause', 18), paused ? 'Resume' : 'Pause');
      totalEl.textContent = planned ? `${mmss(totalElapsed())} of ${mmss(planned)}` : mmss(totalElapsed());
      if (counter) countEl.textContent = rounds + (rounds === 1 ? ' round' : ' rounds');
    }
    async function endEarly() {
      const wasPaused = paused;
      if (!paused) togglePause();
      const ok = await F.ui.confirmDlg('End the timer now?', { ok: 'End & log it', sub: 'What you did so far still counts.' });
      if (ok) finish(true); else if (!wasPaused) togglePause();
    }
    function finish(early) {
      if (closed) return;
      closed = true; clearTimeout(loop);
      const total = Math.round(totalElapsed());
      if (!early) { sfx('done'); vib([100, 60, 100, 60, 240]); }
      el.remove(); wake(false);
      onDone && onDone({ secs: total, rounds, early });
    }
    tick();
  }

  // ---------- isometric hold ----------
  function hold({ title, target, pr, side, onDone }) {
    audio(); wake(true);
    let stage = 'lead', t0 = Date.now(), first = null, loop = null, closed = false, chimed = false, lastBeep = -1;
    const el = h('div', { class: 'tmr warm' });
    const stageEl = h('div', { class: 'tmr-round' }), labelEl = h('div', { class: 'tmr-label', text: title });
    const clockEl = h('div', { class: 'tmr-clock' }), infoEl = h('div', { class: 'tmr-hr' }), barI = h('i');
    const doneBtn = h('button', { class: 'btn primary big', onClick: stop }, icon('check', 20), 'Done');
    el.append(
      h('div', { class: 'tmr-top' }, h('button', { class: 'btn sm ghost', onClick: cancel }, icon('x', 16), 'Cancel'), h('div', { class: 't', text: 'Hold' })),
      h('div', { class: 'tmr-main' }, stageEl, labelEl, clockEl, h('div', { class: 'tmr-bar' }, barI), infoEl),
      h('div', { class: 'tmr-ctrl' }, doneBtn));
    document.getElementById('overlay-root').append(el);
    const sideName = () => (side ? (first === null ? 'Left side · ' : 'Right side · ') : '');
    function tick() {
      if (closed) return;
      const e = (Date.now() - t0) / 1000;
      if (stage === 'lead' || stage === 'switch') {
        const lead = stage === 'lead' ? 3 : 5, rem = Math.ceil(lead - e);
        el.className = 'tmr warm';
        stageEl.textContent = stage === 'lead' ? sideName() + 'Get set' : 'Switch sides';
        clockEl.textContent = String(Math.max(0, rem));
        barI.style.width = '0%';
        infoEl.textContent = `Target ${mmss(target)}` + (pr ? ` · PR ${mmss(pr)}` : '');
        if (rem !== lastBeep && rem >= 1) { lastBeep = rem; sfx('tick'); }
        if (e >= lead) { stage = 'hold'; t0 = Date.now(); chimed = false; lastBeep = -1; sfx('go'); vib([80]); }
      } else {
        const over = e - target;
        stageEl.textContent = sideName() + (over >= 0 ? 'Target hit — keep going?' : 'Hold');
        el.className = 'tmr ' + (over >= 0 ? 'over' : 'work');
        clockEl.textContent = over >= 0 ? '+' + mmss(over) : mmss(Math.ceil(-over));
        barI.style.width = Math.min(100, (e / target) * 100) + '%';
        if (over < 0) { const r = Math.ceil(-over); if (r <= 3 && r >= 1 && r !== lastBeep) { lastBeep = r; sfx('tick'); } }
        if (over >= 0 && !chimed) { chimed = true; sfx('done'); vib([100, 50, 100]); }
        infoEl.textContent = `${mmss(e)} held` + (pr ? (e > pr ? ' · NEW PR' : ` · PR in ${mmss(pr - e)}`) : '');
      }
      loop = setTimeout(tick, 150);
    }
    function stop() {
      if (stage !== 'hold') return;
      const secs = Math.floor((Date.now() - t0) / 1000);
      if (side && first === null) { first = secs; stage = 'switch'; t0 = Date.now(); lastBeep = -1; sfx('rest'); return; }
      closed = true; clearTimeout(loop); el.remove(); wake(false);
      onDone && onDone(first === null ? secs : Math.min(first, secs));
    }
    function cancel() { closed = true; clearTimeout(loop); el.remove(); wake(false); }
    tick();
  }

  // ---------- guided flow (yoga, mobility, PT) ----------
  // items: [{name, secs|null, reps|null, side, cue}]
  function flow({ title, items, onItem, onDone }) {
    audio(); wake(true);
    let i = 0, stage = items[0] && items[0].secs ? 'ready' : 'do', t0 = Date.now(), loop = null, closed = false, paused = false, pauseAt = 0, lastBeep = -1, switched = false;
    const el = h('div', { class: 'tmr warm' });
    const stageEl = h('div', { class: 'tmr-round' }), labelEl = h('div', { class: 'tmr-label' }), clockEl = h('div', { class: 'tmr-clock' });
    const cueEl = h('div', { class: 'tmr-cue' }), barI = h('i'), nextEl = h('div', { class: 'tmr-next' });
    const pauseBtn = h('button', { class: 'btn', onClick: togglePause });
    const nextBtn = h('button', { class: 'btn primary', onClick: next });
    el.append(
      h('div', { class: 'tmr-top' }, h('button', { class: 'btn sm ghost', onClick: end }, icon('x', 16), 'End'), h('div', { class: 't', text: title })),
      h('div', { class: 'tmr-main' }, stageEl, labelEl, clockEl, h('div', { class: 'tmr-bar' }, barI), cueEl, nextEl),
      h('div', { class: 'tmr-ctrl' }, h('button', { class: 'btn', onClick: prev }, icon('back', 18)), pauseBtn, nextBtn));
    document.getElementById('overlay-root').append(el);
    const dur = (it) => (it.secs ? it.secs * (it.side ? 2 : 1) : 0);
    function elapsed() { return ((paused ? pauseAt : Date.now()) - t0) / 1000; }
    function go(stg) { stage = stg; t0 = Date.now(); lastBeep = -1; switched = false; if (paused) pauseAt = t0; }
    function togglePause() { if (!paused) { paused = true; pauseAt = Date.now(); } else { t0 += Date.now() - pauseAt; paused = false; } }
    function next() {
      if (stage === 'ready') { go('do'); sfx('go'); return; }
      onItem && onItem(i);
      if (i >= items.length - 1) return finish();
      i++; go(items[i].secs ? 'ready' : 'do');
    }
    function prev() { if (i > 0) i--; go(items[i].secs ? 'ready' : 'do'); }
    function tick() {
      if (closed) return;
      const it = items[i], e = elapsed();
      const nx = items[i + 1];
      nextEl.textContent = nx ? `Next: ${nx.name}` : 'Last one';
      cueEl.textContent = it.cue || '';
      labelEl.textContent = it.name;
      pauseBtn.replaceChildren(icon(paused ? 'play' : 'pause', 18), paused ? 'Resume' : 'Pause');
      if (stage === 'ready') {
        el.className = 'tmr warm';
        stageEl.textContent = `${i + 1} of ${items.length} · get ready`;
        const rem = Math.ceil(4 - e);
        clockEl.textContent = it.secs ? mmss(dur(it)) : it.reps || '';
        barI.style.width = '0%';
        nextBtn.replaceChildren('Start');
        if (it.secs && !paused) {
          if (rem !== lastBeep && rem >= 1 && rem <= 3) { lastBeep = rem; sfx('tick'); }
          if (e >= 4) { go('do'); sfx('go'); vib([80]); }
        }
      } else {
        el.className = 'tmr work';
        nextBtn.replaceChildren(icon('check', 18), i >= items.length - 1 ? 'Finish' : 'Next');
        if (it.secs) {
          const total = dur(it), rem = total - e;
          stageEl.textContent = `${i + 1} of ${items.length}` + (it.side ? (e < it.secs ? ' · first side' : ' · second side') : '');
          clockEl.textContent = mmss(Math.max(0, Math.ceil(rem)));
          barI.style.width = Math.min(100, (e / total) * 100) + '%';
          if (it.side && !switched && e >= it.secs) { switched = true; sfx('rest'); vib([150]); }
          const r = Math.ceil(rem);
          if (!paused && r <= 3 && r >= 1 && r !== lastBeep) { lastBeep = r; sfx('tick'); }
          if (!paused && rem <= 0) { sfx('done'); next(); }
        } else {
          stageEl.textContent = `${i + 1} of ${items.length} · at your pace`;
          clockEl.textContent = it.reps || 'Go';
          barI.style.width = '0%';
        }
      }
      loop = setTimeout(tick, 150);
    }
    function finish() { closed = true; clearTimeout(loop); el.remove(); wake(false); sfx('done'); vib([100, 60, 200]); onDone && onDone(true); }
    function end() { closed = true; clearTimeout(loop); el.remove(); wake(false); onDone && onDone(false); }
    tick();
  }

  // ---------- rest bar ----------
  let restEl = null, restLoop = null;
  function rest(secs, label = 'Rest') {
    stopRest();
    if (!secs) return;
    audio();
    let end = Date.now() + secs * 1000, last = -1;
    const clk = h('span', { class: 'clk' }), lbl = h('span', { class: 'lbl', text: label });
    restEl = h('div', { class: 'restbar' }, lbl, clk,
      h('button', { class: 'btn xs', text: '−15', onClick: () => { end -= 15000; } }),
      h('button', { class: 'btn xs', text: '+15', onClick: () => { end += 15000; } }),
      h('button', { class: 'btn xs ghost', 'aria-label': 'Skip rest', onClick: stopRest }, icon('x', 14)));
    document.body.append(restEl);
    const t = () => {
      const rem = Math.ceil((end - Date.now()) / 1000);
      clk.textContent = mmss(Math.max(0, rem));
      if (rem <= 3 && rem >= 1 && rem !== last) { last = rem; sfx('tick'); }
      if (rem <= 0) {
        clearInterval(restLoop); restLoop = null;
        sfx('go'); vib([120, 60, 120]);
        if (restEl) { restEl.classList.add('go'); lbl.textContent = 'Go'; }
        setTimeout(stopRest, 2200);
      }
    };
    t();
    restLoop = setInterval(t, 250);
  }
  function stopRest() { if (restLoop) clearInterval(restLoop); restLoop = null; if (restEl) restEl.remove(); restEl = null; }

  return { run, hold, flow, rest, stopRest, sfx, wake, hrText };
})();
