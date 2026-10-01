/* App shell: router, top-bar chrome, theme, boot, service worker. */
F.app = (() => {
  const { h } = F.ui;
  const VERSION = '1.0.0';
  let current = null, lastHash = null, lastDay = F.ui.today();

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    return { seg: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }

  function render() {
    const { seg } = parse();
    const S = F.store.load();
    if (!S.profile.onboarded && seg[0] !== 'welcome') { location.replace('#/welcome'); return; }
    if (seg[0] === 'do') { F.native.act(seg[1], seg[2]); return; }   // widget / shortcut actions
    const view = document.getElementById('view');
    const same = lastHash === location.hash;
    const y = window.scrollY;
    if (current && current._cleanup) current._cleanup();
    let el, nav = seg[0] || 'today';
    try {
      switch (seg[0]) {
        case undefined: case '': el = F.views.today(); nav = 'today'; break;
        case 'day': el = F.views.today(seg[1]); nav = 'today'; break;
        case 'train': el = F.views.train(seg[1]); break;
        case 'fuel': el = F.views.fuel(seg[1]); break;
        case 'body': el = F.views.body(); break;
        case 'hero': el = F.views.hero(); break;
        case 'settings': el = F.views.settings(seg[1]); break;
        case 'play': el = F.views.play(); nav = 'train'; break;
        case 'done': el = F.views.done(seg[1]); nav = 'train'; break;
        case 'welcome': el = F.views.welcome(seg[1]); nav = ''; break;
        case 'plan': el = F.views.plan(); nav = 'settings'; break;
        default: el = h('div', { class: 'empty', text: 'Page not found.' });
      }
    } catch (e) {
      console.error(e);
      el = h('div', { class: 'empty' }, 'Something went wrong rendering this page. ', h('code', { text: e.message }));
    }
    view.innerHTML = '';
    view.append(el);
    current = el;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    document.body.classList.toggle('onboarding', seg[0] === 'welcome');
    if (same) window.scrollTo(0, y); else window.scrollTo(0, 0);
    lastHash = location.hash;
    chrome();
  }

  // The day on screen: a past day opened from Today or Fuel, else today. The quick-log sheets default to it.
  function viewDate() {
    const { seg } = parse();
    return seg[0] === 'day' || seg[0] === 'fuel' ? F.ui.dayArg(seg[1]) : F.ui.today();
  }

  function chrome() {
    const S = F.store.load();
    const lvl = document.getElementById('lvl-chip'), stk = document.getElementById('streak-chip'), logb = document.getElementById('log-btn');
    const on = S.profile.onboarded && !!F.data.prog() && !document.body.classList.contains('onboarding');
    logb.hidden = !on;
    if (!on) { lvl.hidden = true; stk.hidden = true; return; }
    const C = F.game.compute();
    lvl.hidden = false;
    lvl.replaceChildren(h('span', { class: 'lv', text: 'Lv ' + C.level.level }), h('span', { class: 'mini' }, h('i', { style: { width: Math.round(C.level.pct * 100) + '%' } })));
    lvl.title = `${C.level.title} · ${C.level.into}/${C.level.need} XP`;
    stk.hidden = false;
    stk.textContent = '🔥 ' + C.streak.current;
    stk.classList.toggle('cold', !C.streak.activeToday);
    stk.title = C.streak.activeToday ? 'Active today' : 'Log anything today to keep the streak';
    F.native.push();
  }

  function theme() {
    const t = F.store.load().settings.theme;
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    F.native.theme(dark);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = dark ? '#0d0e11' : '#f5f3ef';
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);

  async function boot() {
    const S = F.store.load();
    theme();
    try { await F.data.load(); }
    catch (e) {
      document.getElementById('view').replaceChildren(h('div', { class: 'empty' }, 'Could not load the program data. ', h('code', { text: e.message })));
      return;
    }
    if (!S.equipment && S.profile.onboarded) { S.equipment = JSON.parse(JSON.stringify(F.data.prog().kits)); F.store.save(); }
    // One-time (2026-09-28): John's home has a rack and a heavy bag; kits saved before they were defaults lack them.
    if (S.equipment && S.profile.onboarded && !S.settings.migHomeRackBag) {
      const home = new Set(S.equipment.home || []);
      const added = ['rack', 'bag'].filter((x) => !home.has(x));
      added.forEach((x) => home.add(x));
      S.equipment.home = [...home]; S.settings.migHomeRackBag = true; F.store.save();
      if (added.length) setTimeout(() => F.ui.toast('Added your rack and heavy bag to Home equipment — Settings → Equipment to adjust', 4500), 1500);
    }
    document.getElementById('log-btn').addEventListener('click', () => F.quickMenu());
    window.addEventListener('hashchange', render);
    render();
    if (S.profile.onboarded) setTimeout(() => F.game.afterChange(), 700);
    F.sync.start();
    // New day while the app sits open (or comes back from the background): refresh the pages that depend on the date.
    const rollover = () => {
      const d = F.ui.today();
      if (d === lastDay) return;
      lastDay = d;
      const { seg } = parse();
      if (!seg[0] || seg[0] === 'day' || seg[0] === 'fuel') render(); else chrome();
    };
    setInterval(rollover, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) rollover(); });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    // No service worker on localhost (it serves stale scripts while developing) unless ?sw is in the URL.
    const devHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw\b/.test(location.search);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !devHost) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('./sw.js').then((reg) => reg.update().catch(() => {})).catch((e) => console.warn('sw', e));
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return;
        reloaded = true;
        if (F.store.load().active) { F.ui.toast('Update ready — it applies next time you open Forge', 3500); return; }
        location.reload();
      });
    }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); F.app.installPrompt = e; });
  }

  setTimeout(boot, 0);
  return { VERSION, render, chrome, theme, viewDate, installPrompt: null };
})();
