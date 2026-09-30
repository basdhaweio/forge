/* DOM helpers, dates, formatting, tiny SVG charts and celebrations shared by every view. */
window.F = window.F || {};
F.views = F.views || {};

// Views pass optional children (cond ? node : null) and arrays; native append() would render those as
// the text "null" or "a,b". Filter and flatten them once here instead of at every call site.
{
  const nativeAppend = Element.prototype.append;
  Element.prototype.append = function (...nodes) {
    return nativeAppend.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
  };
}

F.ui = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'value') el.value = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    return el;
  }
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v);
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // ---------- Icons (24px stroke) ----------
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    skip: '<path d="M6 5l9 7-9 7zM18 5v14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16l4-5 3 3 5-7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    restart: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  };
  function icon(name, size = 20) {
    const el = document.createElementNS(SVGNS, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('width', size); el.setAttribute('height', size);
    el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('class', 'ico'); el.setAttribute('aria-hidden', 'true');
    el.innerHTML = ICONS[name] || '';
    return el;
  }

  // ---------- Toasts, sheets, dialogs ----------
  function toast(msg, ms = 2000, action) {
    const root = document.getElementById('toast-root');
    const t = h('div', { class: 'toast' }, h('span', { text: msg }));
    if (action) t.append(h('button', { text: action.label, onClick: () => { action.run(); t.remove(); } }));
    root.append(t);
    setTimeout(() => t.remove(), action ? Math.max(ms, 4500) : ms);
  }
  function xpFloat(xp, statIcon) {
    if (!xp) return;
    const el = h('div', { class: 'xpfloat' }, h('span', { text: `+${num(xp)} XP${statIcon ? ' ' + statIcon : ''}` }));
    document.body.append(el);
    setTimeout(() => el.remove(), 1700);
  }
  function sheet(content, { onClose } = {}) {
    const root = document.getElementById('sheet-root');
    const box = h('div', { class: 'sheet', role: 'dialog' }, h('div', { class: 'handle' }), content);
    const back = h('div', { class: 'sheet-back' }, box);
    let closed = false;
    const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    root.append(back);
    return { close, el: box };
  }
  function confirmDlg(message, { ok = 'OK', danger = false, sub } = {}) {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v) => { if (answered) return; answered = true; s1.close(); resolve(v); };
      const s1 = sheet(h('div', { class: 'stack' },
        h('h2', { text: message }),
        sub ? h('p', { class: 'muted', text: sub }) : null,
        h('div', { class: 'btngroup mt' },
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onClick: () => done(true) }, ok),
          h('button', { class: 'btn ghost', onClick: () => done(false) }, 'Cancel'))
      ), { onClose: () => { if (!answered) { answered = true; resolve(false); } } });
    });
  }
  function chip(label, on, onToggle, extra = '') {
    const c = h('button', { class: 'chip ' + (on ? 'on ' : '') + extra, type: 'button', text: label });
    c.addEventListener('click', () => { c.classList.toggle('on'); onToggle && onToggle(c.classList.contains('on'), c); });
    return c;
  }
  function pill(text, kind = '') { return h('span', { class: 'pill ' + kind, text }); }
  function seg(options, value, onChange, cls = '') {
    const wrap = h('div', { class: 'seg ' + cls });
    for (const o of options) {
      const b = h('button', { type: 'button', class: String(o.v) === String(value) ? 'on' : '', text: o.label });
      b.addEventListener('click', () => { wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(o.v); });
      wrap.append(b);
    }
    return wrap;
  }
  function progress(pct, cls = '', thick = false) {
    return h('div', { class: 'progress' + (thick ? ' thick' : '') }, h('i', { class: cls, style: { width: Math.max(0, Math.min(100, pct * 100)) + '%' } }));
  }
  function vibrate(p) {
    try { if (F.store.load().settings.vibrate && navigator.vibrate) navigator.vibrate(p); } catch (e) {}
  }

  // ---------- Dates (local, YYYY-MM-DD) ----------
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return ymd(new Date()); }
  function parse(ds) { return new Date(ds + 'T00:00:00'); }
  function addDays(ds, n) { const d = parse(ds); d.setDate(d.getDate() + n); return ymd(d); }
  function dow(ds) { return parse(ds).getDay(); }
  function weekStart(ds) { const d = parse(ds); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function fmtDate(ds, opts) { return parse(ds).toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' }); }
  const isDate = (ds) => typeof ds === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ds) && !isNaN(parse(ds)) && ymd(parse(ds)) === ds;
  // A day to view or log for: a real date that isn't in the future, else today.
  function dayArg(ds) { const t = today(); return isDate(ds) && ds <= t ? ds : t; }
  function relDay(ds) {
    const n = daysBetween(today(), ds);
    return n === 0 ? 'today' : n === -1 ? 'yesterday' : n === 1 ? 'tomorrow' : n < 0 ? `${-n} days ago` : `in ${n} days`;
  }
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---------- Numbers ----------
  function num(n, d = 0) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  function compact(n) {
    if (n >= 1e6) return num(n / 1e6, n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return num(n / 1e3, 0) + 'k';
    return num(n);
  }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function hms(sec) {
    sec = Math.max(0, Math.floor(sec));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return hh + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }
  function dur(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
  }
  function range(str, def) {
    if (str === null || str === undefined || str === '') return def;
    const m = String(str).match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    return m ? [+m[1], +(m[2] || m[1])] : def;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function numIn(value, { placeholder = '', step = 'any', w, onInput, cls = '' } = {}) {
    const el = h('input', { type: 'number', inputmode: 'decimal', step, placeholder: placeholder === null ? '' : String(placeholder), class: cls });
    if (value !== null && value !== undefined && value !== '') el.value = value;
    if (w) el.style.width = w;
    if (onInput) el.addEventListener('input', () => onInput(el.value === '' ? null : +el.value));
    el.addEventListener('focus', () => { try { el.select(); } catch (e) {} });
    return el;
  }

  // ---------- SVG charts ----------
  function ring(pct, { size = 64, stroke = 7, color = 'var(--accent)', label, sub } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
    const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ring' },
      s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, style: 'stroke: var(--bg3)' }),
      p > 0.002 ? s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': `${(c * p).toFixed(2)} ${c.toFixed(2)}`, transform: `rotate(-90 ${size / 2} ${size / 2})`, style: `stroke: ${color}` }) : null);
    return h('div', { class: 'ringwrap', style: { width: size + 'px', height: size + 'px' } }, svg,
      label !== undefined ? h('div', { class: 'ringlabel' }, h('b', { text: label }), sub ? h('small', { text: sub }) : null) : null);
  }
  function sparkline(vals, { w = 80, h: hh = 24, color = 'var(--accent)' } = {}) {
    const v = vals.filter((x) => x !== null && x !== undefined && !isNaN(x));
    if (v.length < 2) return s('svg', { width: w, height: hh, class: 'spark' });
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    const pts = v.map((y, i) => `${(i / (v.length - 1)) * (w - 4) + 2},${hh - 3 - ((y - lo) / span) * (hh - 6)}`).join(' ');
    return s('svg', { width: w, height: hh, viewBox: `0 0 ${w} ${hh}`, class: 'spark' },
      s('polyline', { points: pts, fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: `stroke: ${color}` }));
  }
  // points: [{x: Date|number, y: number}]
  function lineChart(points, { w = 340, h: hh = 160, color = 'var(--accent)', fmt = (y) => num(y, 1) } = {}) {
    if (!points.length) return h('div', { class: 'empty small', text: 'No data yet' });
    const pl = 36, pr = 10, pt = 10, pb = 22;
    const xs = points.map((p) => +p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) === x0 ? x0 + 1 : Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const padY = (y1 - y0) * 0.15 || Math.abs(y1) * 0.05 || 1; y0 -= padY; y1 += padY;
    const X = (x) => pl + ((x - x0) / (x1 - x0)) * (w - pl - pr);
    const Y = (y) => pt + (1 - (y - y0) / (y1 - y0)) * (hh - pt - pb);
    const svg = s('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'chart' });
    for (let i = 0; i <= 3; i++) {
      const yv = y0 + ((y1 - y0) * i) / 3, yy = Y(yv);
      svg.append(s('line', { x1: pl, x2: w - pr, y1: yy, y2: yy, class: 'gl' }), s('text', { x: pl - 5, y: yy + 3, 'text-anchor': 'end', text: fmt(yv) }));
    }
    const d = points.map((p, i) => (i ? 'L' : 'M') + X(+p.x).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ');
    svg.append(s('path', { d: d + ` L${X(+points[points.length - 1].x).toFixed(1)},${hh - pb} L${X(+points[0].x).toFixed(1)},${hh - pb} Z`, style: `fill: ${color}; opacity: 0.12` }));
    svg.append(s('path', { d, fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', style: `stroke: ${color}` }));
    for (const p of points) svg.append(s('circle', { cx: X(+p.x), cy: Y(p.y), r: 3.2, style: `fill: ${color}` }));
    const lab = (x) => new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    svg.append(s('text', { x: pl, y: hh - 6, text: lab(x0) }), s('text', { x: w - pr, y: hh - 6, 'text-anchor': 'end', text: lab(x1) }));
    return svg;
  }
  // levels: {date: 0..4 | 'fr'}; renders `weeks` columns ending with the current week
  function heatmap(levels, weeks = 18) {
    const t = today(), start = addDays(weekStart(t), -7 * (weeks - 1));
    const g = h('div', { class: 'heat' });
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i), lv = levels[d];
      g.append(h('i', { class: (lv === 'fr' ? 'fr' : lv ? 'l' + lv : '') + (d > t ? ' fut' : '') + (d === t ? ' today' : ''), title: fmtDate(d) }));
    }
    return g;
  }

  // ---------- Celebrations ----------
  function confetti(n = 110) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = h('canvas', { class: 'confetti' });
    const W = (c.width = window.innerWidth * (window.devicePixelRatio || 1));
    const H = (c.height = window.innerHeight * (window.devicePixelRatio || 1));
    document.body.append(c);
    const ctx = c.getContext('2d');
    const cols = ['#ff7a1a', '#ffb020', '#34d399', '#60a5fa', '#a78bfa', '#f87171', '#ffffff'];
    const ps = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.25, y: H * 0.42, vx: (Math.random() - 0.5) * W * 0.018, vy: -Math.random() * H * 0.022 - H * 0.006,
      r: (Math.random() * 5 + 4) * (window.devicePixelRatio || 1), c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
    }));
    const t0 = performance.now();
    (function frame(t) {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.vy += H * 0.0006; p.vx *= 0.99; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, 1 - el / 2200);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 3, p.r, p.r * 0.66); ctx.restore();
      }
      if (el < 2200) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }
  const celebQ = [];
  let celebOpen = false;
  function celebrate(o) { celebQ.push(o); if (!celebOpen) nextCeleb(); }
  function nextCeleb() {
    const o = celebQ.shift();
    if (!o) { celebOpen = false; return; }
    celebOpen = true;
    if (!o.quiet) confetti();
    vibrate([30, 50, 80]);
    try { F.timer.sfx('fanfare'); } catch (e) {}
    const back = h('div', { class: 'celeb-back' });
    const close = () => { back.remove(); setTimeout(nextCeleb, 180); };
    back.append(h('div', { class: 'celeb' },
      h('div', { class: 'celeb-icon', text: o.icon || '🏆' }),
      o.eyebrow ? h('div', { class: 'eyebrow', text: o.eyebrow }) : null,
      h('h2', { text: o.title }),
      o.sub ? h('p', { class: 'muted', text: o.sub }) : null,
      o.xp ? h('div', { class: 'celeb-xp', text: '+' + num(o.xp) + ' XP' }) : null,
      h('button', { class: 'btn fire block', text: o.ok || 'Nice', onClick: close })));
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.getElementById('overlay-root').append(back);
  }
  function countUp(el, to, { from = 0, ms = 1000, fmt = (v) => num(v) } = {}) {
    const t0 = performance.now();
    (function f(t) {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }

  return { h, s, append, icon, toast, xpFloat, sheet, confirmDlg, chip, pill, seg, progress, vibrate,
    ymd, today, parse, addDays, dow, weekStart, daysBetween, fmtDate, relDay, isDate, dayArg, DAYS,
    num, compact, mmss, hms, dur, range, uid, shuffle, numIn,
    ring, sparkline, lineChart, heatmap, confetti, celebrate, countUp };
})();
