/* The Android app (android/): Forge running in the app's WebView, where window.ForgeAndroid exists. Here the page
   hands the home-screen widget a small summary after every change, saves backups through the app (a WebView can't
   download a file), tells the app its theme, and runs the widget's and shortcuts' actions (#/do/water and so on).
   In a browser none of this does anything except the #/do/ actions, which work there too. */
F.native = (() => {
  const bridge = () => window.ForgeAndroid || null;
  const on = () => !!bridge();

  // What the widget draws (ForgeWidget.kt). Plain numbers and display strings only: no injuries, food or history.
  function summary() {
    const S = F.store.load(), C = F.game.compute(), today = F.ui.today();
    const d = C.days[today] || {}, done = d.tasks || new Set(), tasks = F.game.dailyTasksOn(today);
    const logged = new Set(F.store.sessionsOn(today).filter((x) => !x.auto).flatMap((x) => [x.src, x.tpl]));
    const sched = F.data.scheduled(today).map((r) => (r.flare ? r.flare.tpl : r.tpl));
    const next = sched.find((t) => !logged.has(t.id));
    const water = d.water || 0, waterT = F.game.waterTarget(), unit = F.u.vu();
    return {
      v: 1, date: today, at: Date.now(),
      streak: C.streak.current, freezes: C.streak.freezes, activeToday: C.streak.activeToday,
      level: C.level.level, title: C.level.title, pct: Math.round(C.level.pct * 1000) / 1000,
      quests: { done: tasks.filter((t) => done.has(t.id)).length, total: tasks.length },
      mission: next ? next.name : sched.length ? 'mission done ✓' : 'rest day',
      protein: { g: Math.round(d.protein || 0), target: F.game.proteinTarget(), off: F.game.fastDay(today) },
      water: { text: `${F.u.volN(water)} / ${F.u.volN(waterT)} ${unit}`, empty: `0 / ${F.u.volN(waterT)} ${unit}`, pct: waterT ? Math.min(1, water / waterT) : 0, cup: '+' + F.u.vol(F.waterCup()) },
      fast: S.activeFast ? { start: S.activeFast.start, targetH: S.activeFast.targetH } : null,
    };
  }

  // Sent a moment after things settle, and only when something on the widget would change.
  let timer = null, lastSig = '';
  function push(now) {
    if (!on() || !F.data.prog() || !F.store.load().profile.onboarded) return;
    clearTimeout(timer);
    const send = () => {
      try {
        const s = summary(), sig = JSON.stringify(Object.assign({}, s, { at: 0 }));
        if (sig === lastSig) return;
        lastSig = sig;
        bridge().widget(JSON.stringify(s));
      } catch (e) { console.warn('widget', e); }
    };
    if (now) send(); else timer = setTimeout(send, 800);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) push(true); });

  function saveFile(name, text) {
    if (!on()) return false;
    try { bridge().saveFile(name, text); return true; } catch (e) { return false; }
  }
  function theme(dark) { if (on()) try { bridge().theme(!!dark); } catch (e) {} }

  // #/do/<what>: one tap from the widget or a long-press shortcut. Lands on Today, then does the thing there.
  function act(what, arg) {
    if (!F.store.load().profile.onboarded) { location.replace('#/welcome'); return; }
    location.replace('#/');
    setTimeout(() => {
      const today = F.ui.today();
      if (what === 'water') F.logWater(today, +arg > 0 ? F.u.vIn(+arg) : F.waterCup(), () => F.app.render());
      else if (what === 'pt') F.tickTask('pt', today);
      else if (what === 'fast') { if (F.store.load().activeFast) location.hash = '#/fuel'; else F.fastSheet(); }
      else if (what === 'log') F.quickMenu();
    }, 80);
  }

  return { on, summary, push, saveFile, theme, act };
})();
