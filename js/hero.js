/* Hero: the character sheet — level, stats, epic quests, achievements, records, lifetime totals. */
(() => {
  const { h, icon, toast, sheet, confirmDlg, num, mmss, pill, progress } = F.ui;

  async function toggleCheck(q, st) {
    const S = F.store.load();
    if (S.checks[st.key]) {
      if (!(await confirmDlg('Un-tick this step?', { ok: 'Un-tick' }))) return;
      delete S.checks[st.key];
      delete S.seen.steps[st.key];
      F.store.save(); F.app.render();
      return;
    }
    const clearance = !!st.unlock && st.unlock !== 'none';
    const ok = await confirmDlg(st.label, { ok: 'Mark done', sub: clearance ? 'Only tick this once your PT or doctor has actually given the OK — it unlocks heavier or higher-impact exercises.' : 'Honour system — tick it when it’s true.' });
    if (!ok) return;
    S.checks[st.key] = F.ui.today();
    if (st.unlock === 'phase2' && S.settings.phase < 2) { S.settings.phase = 2; toast('Phase 2 — Build unlocked. Barbell work is now in the mix.', 3500); }
    if (st.unlock === 'phase3' && S.settings.phase < 3) { S.settings.phase = 3; toast('Phase 3 — Return unlocked. The Big 4 are back.', 3500); }
    if (st.unlock === 'run') { S.settings.runUnlocked = true; toast('Running unlocked — start with walk-run.', 3500); }
    F.store.save();
    F.game.afterChange();
    F.app.render();
  }

  function questCard(q) {
    const S = F.store.load();
    const d = h('details', { class: 'quest' + (q.complete ? ' complete' : '') });
    if (!q.complete && q.n > 0) d.open = false;
    d.append(h('summary', null,
      h('span', { class: 'qi', text: q.icon }),
      h('div', { class: 'qt' }, h('b', { text: q.name }), h('div', { class: 'row nowrap small muted' }, h('span', { text: q.complete ? 'Complete' : `${q.n} / ${q.steps.length} steps` }), h('div', { class: 'grow' }, progress(q.pct, q.complete ? 'xp' : '')))),
      icon('chevron', 16)));
    const body = h('div', { class: 'steps' }, h('p', { class: 'small muted', style: { margin: '0 0 8px' }, text: q.desc }));
    if (q.needs === 'thresholdLb' && !S.settings.goals.thresholdLb) body.append(h('div', { class: 'callout amber small mb' }, 'Set the target weight to track the carry steps — ', h('a', { href: '#/settings/goals', text: 'Settings → Goals' }), '. It stays on this device.'));
    const firstOpen = q.steps.findIndex((x) => !x.done);
    q.steps.forEach((st, i) => {
      const right = st.locked
        ? pill(`Phase ${st.phase}+`, 'purple')
        : st.check
          ? h('button', { class: 'btn xs ' + (st.done ? 'ghost' : ''), text: st.done ? 'Undo' : 'Mark done', onClick: () => toggleCheck(q, st) })
          : h('span', { class: 'small muted', text: st.done ? '' : F.game.metricText(st.metric, st.value || 0, st.goal) });
      body.append(h('div', { class: 'step' + (st.done ? ' done' : '') },
        h('span', { class: 'sm' }, st.done ? h('span', { class: 'tick sm on' }, icon('check', 14)) : h('span', { class: 'tick sm', style: i === firstOpen ? { borderColor: 'var(--accent)' } : null })),
        h('div', { class: 't' }, st.label, !st.check && !st.done && !st.locked && st.goal ? h('div', { class: 'mt-s' }, progress(Math.min(1, (st.value || 0) / st.goal))) : null, st.locked ? h('small', { text: 'Unlocks with Phase ' + st.phase + ' (your PT’s OK in Iron Return).' }) : null),
        h('div', { class: 'stack', style: { gap: '4px', alignItems: 'flex-end' } }, h('span', { class: 'px', text: '+' + st.xp }), right)));
    });
    d.append(body);
    return d;
  }

  F.views.hero = () => {
    const S = F.store.load(), C = F.game.compute(), P = F.data.prog();
    const wrap = h('div');
    const L = C.level;

    // Character
    wrap.append(h('div', { class: 'hero' }, h('div', { class: 'charsheet' },
      h('div', { class: 'lvl-badge' }, h('small', { text: 'Level' }), h('b', { text: String(L.level) })),
      h('div', null,
        h('div', { class: 'eyebrow', text: L.title }),
        h('h1', { text: S.profile.name || 'Your hero' }),
        h('div', { class: 'xpbar mt-s' }, h('i', { style: { width: L.pct * 100 + '%' } })),
        h('div', { class: 'row between small muted mt-s' }, h('span', { text: `${num(L.into)} / ${num(L.need)} XP` }), h('span', { text: `${num(C.total)} total` })))),
      h('div', { class: 'grid3 mt' },
        h('div', { class: 'stat' }, h('b', { class: 'accent', text: '🔥 ' + C.streak.current }), h('span', { text: 'day streak' })),
        h('div', { class: 'stat' }, h('b', { text: String(C.streak.best) }), h('span', { text: 'best streak' })),
        h('div', { class: 'stat' }, h('b', { text: C.streak.freezes ? '❄️'.repeat(C.streak.freezes) : '0' }), h('span', { text: 'streak freezes' }))),
      h('div', { class: 'tiny muted center', text: 'Every 7 active days banks a freeze (max 2). A missed day spends one instead of breaking your streak.' })));

    // Stats
    const stats = h('div', { class: 'card' });
    for (const st of Object.values(C.stats)) {
      const bar = progress(st.pct);
      bar.firstChild.style.background = st.color;
      stats.append(h('div', { class: 'statrow' }, h('span', { class: 'ic', text: st.icon }), h('div', { class: 'nm' }, st.name, h('small', { text: st.desc })), bar, h('span', { class: 'lv', text: 'Lv ' + st.level })));
    }
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Stats' }), h('span', { class: 'small muted', text: 'Train it to level it' })), stats);

    // Quests
    const qs = h('div');
    for (const q of C.quests) qs.append(questCard(q));
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Epic quests' }), h('span', { class: 'small muted', text: `${C.quests.filter((q) => q.complete).length} / ${C.quests.length} complete` })), qs);

    // Achievements
    const got = C.achievements.filter((a) => a.unlocked).length;
    const ag = h('div', { class: 'achs' });
    const sorted = C.achievements.slice().sort((a, b) => (b.unlocked - a.unlocked) || (b.pct - a.pct));
    for (const a of sorted) ag.append(h('div', { class: 'ach ' + (a.unlocked ? 'got' : 'locked'), onClick: () => sheet(h('div', { class: 'center' },
      h('div', { style: { fontSize: '3.4rem' }, text: a.icon }), h('h2', { text: a.name }), h('p', { class: 'muted', text: a.desc }),
      h('p', { class: 'mt', text: a.unlocked ? `Unlocked ${S.seen.ach[a.id] ? F.ui.fmtDate(S.seen.ach[a.id]) : ''} · +${a.xp} XP` : `${F.game.metricText(a.metric, a.value, a.gte)} · +${a.xp} XP when unlocked` }))) },
      h('div', { class: 'ai', text: a.icon }), h('b', { text: a.name }), a.unlocked ? null : progress(a.pct)));
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Achievements' }), h('span', { class: 'small muted', text: `${got} / ${C.achievements.length}` })), ag);

    // Records
    const T = C.T;
    const rows = [];
    for (const [id, v] of Object.entries(T.e1rm)) { const e = F.data.ex(id); if (e) rows.push({ e, k: 'Strength', main: 'est. 1RM ' + F.u.w(v), sub: 'heaviest ' + F.u.w(T.maxW[id] || 0) + (e.pair ? ' each' : ''), sort: v }); }
    for (const [id, v] of Object.entries(T.holdBest)) { const e = F.data.ex(id); if (e) rows.push({ e, k: 'Hold', main: mmss(v), sub: e.side ? 'per side' : '', sort: 1000 + v }); }
    for (const [id, v] of Object.entries(T.repsBest)) { const e = F.data.ex(id); if (e && e.log === 'r') rows.push({ e, k: 'Reps', main: v + ' reps', sub: e.side ? 'per side' : 'in one set', sort: 500 + v }); }
    for (const [id, v] of Object.entries(T.carryMax)) { const e = F.data.ex(id); if (e) rows.push({ e, k: 'Carry', main: F.u.w(v), sub: 'total load', sort: v }); }
    if (T.cindyBest) rows.push({ e: { name: 'Cindy', id: '' }, k: 'Benchmark', main: T.cindyBest + ' rounds', sub: '20-min AMRAP', sort: 9999 });
    if (rows.length) {
      const tbl = h('table', { class: 'table prtable' }, h('tbody', null, rows.sort((a, b) => b.sort - a.sort).slice(0, 30).map((r) => h('tr', { class: 'clickable', style: { cursor: r.e.id ? 'pointer' : 'default' }, onClick: () => r.e.id && F.exSheet(r.e.id) },
        h('td', { text: r.e.name }), h('td', null, pill(r.k)), h('td', { class: 'n right', text: r.main }), h('td', { class: 'small muted right', text: r.sub })))));
      wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Personal records' }), h('span', { class: 'small muted', text: `${T.prs} PRs set` })), h('div', { class: 'card tight', style: { overflowX: 'auto' } }, tbl));
    }

    // Lifetime
    const tt = (v, l) => h('div', { class: 'tt' }, h('b', { text: v }), h('span', { text: l }));
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Lifetime' }), h('span', { class: 'small muted', text: 'numbers only go up' })), h('div', { class: 'totals' },
      tt(num(T.realSessions), 'sessions'), tt(num(T.minutes / 60, 1), 'hours trained'), tt(F.ui.compact(T.kcal), `kcal burned ≈ ${F.ui.compact(T.kcal / F.game.COOKIE_KCAL)} cookies`),
      tt(F.ui.compact(F.u.wv(T.volume) || 0), F.u.wu() + ' lifted'), tt(num(T.holdSec / 60), 'minutes of holds'), tt(num(F.u.dv(T.bikeMi) || 0, 1), F.u.du() + ' on the bike'),
      tt(num(F.u.dv(T.walkMi) || 0, 1), F.u.du() + ' walked'), tt(num(T.tagDays.pt ? T.tagDays.pt.size : 0), 'PT days'), tt(num(T.fasts24), 'fasts of 24 h+'),
      tt(num(C.proteinDays), 'protein days'), F.u.metric() ? tt(num(T.waterOz * 0.0295735, 1), 'litres of water') : tt(num(T.waterOz / 128, 1), 'gallons of water'), tt(num(C.perfectWeeks), 'perfect weeks'), tt(num(T.prs), 'personal records')));

    // Heatmap
    const levels = {};
    for (const [d, r] of Object.entries(C.days)) if (r.active) levels[d] = r.xp >= 450 ? 4 : r.xp >= 250 ? 3 : r.xp >= 100 ? 2 : 1;
    for (const d of C.streak.frozen) levels[d] = 'fr';
    wrap.append(h('div', { class: 'section-title' }, h('h2', { text: 'Activity' }), h('span', { class: 'small muted', text: 'last 18 weeks · ❄️ blue = freeze used' })), h('div', { class: 'card' }, F.ui.heatmap(levels, 18)));

    // XP sources
    const src = C.src;
    const bits = [['Sessions', src.sessions], ['Daily quests', src.tasks], ['Weekly quests', src.weeks], ['Fasts', src.fasts], ['Measurements', src.measures], ['Achievements', src.ach], ['Epic quests', src.quests]].filter((x) => x[1]);
    wrap.append(h('details', { class: 'acc mt' }, h('summary', { text: 'Where your XP comes from' }), h('div', { class: 'acc-body' }, bits.map(([l, v]) => h('div', { class: 'row between small', style: { padding: '3px 0' } }, h('span', { text: l }), h('b', { text: num(v) })))),
      h('div', { class: 'acc-body tiny muted', text: 'Sessions earn XP from minutes × intensity, sets and PRs. Level n needs 100 × (n−1)² total XP, so early levels come fast and later ones take real consistency.' })));
    return wrap;
  };
})();
