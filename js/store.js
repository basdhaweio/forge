/* Local state (localStorage), import/export, units. Everything the user logs lives here, on this device. */
window.F = window.F || {};

F.store = (() => {
  const KEY = 'forge.v1';
  let data = null, rev = 0, timer = null;

  const DEFAULTS = () => ({
    version: 1,
    created: F.ui.today(),
    profile: {
      name: '', units: 'imperial', sex: '', birthYear: null, heightIn: null, weightLb: null, hrMax: null,
      injuries: { knee: false, lumbar: false, shoulder: false },
      focus: { arms: false, abs: false, upperBack: false, chest: false, shoulders: false, glutes: false },
      onboarded: false,
    },
    equipment: null,            // {home:[], gym:[], room:[], hotelgym:[]} — seeded from program kits
    settings: {
      theme: 'auto', location: 'home', travelLoc: 'room', phase: 1, sound: true, vibrate: true,
      walkMin: 30, schedule: null, quotas: {}, ptRoutine: null, slotPrefs: {}, runUnlocked: false,
      nutrition: { protein: null, sugarDaily: 36, kcal: null, trackKcal: true },
      fast: { day: 0, targetH: 24 },
      goals: { thresholdLb: null, photoWaist: 2, photoArms: 1 },
      quests: {},
    },
    trips: [],                  // [{start, end|null}]
    days: {},                   // date -> {checkin:{knee,back,energy,ts}}
    sessions: [],               // logged sessions (see game.sessionXP for derived fields)
    food: {},                   // date -> [{id,name,p,sug,kcal,treat,ts}]
    foods: [],                  // saved custom foods
    fasts: [], activeFast: null,
    measurements: [],
    checks: {},                 // quest step self-checks: 'quest.step' -> date
    seen: { init: false, level: 1, ach: {}, steps: {}, weeks: {}, stats: {} },
    active: null,               // in-progress session
    backupAt: null,
  });

  function fill(d) {
    const D = DEFAULTS();
    for (const k of Object.keys(D)) if (d[k] === undefined) d[k] = D[k];
    for (const k of ['profile', 'settings', 'seen']) for (const kk of Object.keys(D[k])) if (d[k][kk] === undefined) d[k][kk] = D[k][kk];
    for (const k of ['injuries', 'focus']) for (const kk of Object.keys(D.profile[k])) if (d.profile[k][kk] === undefined) d.profile[k][kk] = D.profile[k][kk];
    for (const k of ['nutrition', 'fast', 'goals']) for (const kk of Object.keys(D.settings[k])) if (d.settings[k][kk] === undefined) d.settings[k][kk] = D.settings[k][kk];
    return d;
  }
  function load() {
    if (data) return data;
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : DEFAULTS();
    } catch (e) { data = DEFAULTS(); }
    return fill(data);
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn('save failed', e); F.ui.toast('Could not save — is storage full?', 4000); }
  }
  function save() { rev++; clearTimeout(timer); timer = setTimeout(write, 40); }
  function saveNow() { rev++; clearTimeout(timer); write(); }
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); write(); } });

  // ---- sessions ----
  function sortSessions() { data.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0))); }
  function addSession(rec) {
    load();
    rec.id = rec.id || F.ui.uid();
    rec.ts = rec.ts || Date.now();
    data.sessions.push(rec);
    sortSessions();
    save();
    return rec;
  }
  function updateSession(id, patch) { const s = data.sessions.find((x) => x.id === id); if (s) { Object.assign(s, patch); sortSessions(); save(); } return s; }
  function removeSession(id) { data.sessions = data.sessions.filter((x) => x.id !== id); save(); }
  function sessionsOn(date) { return load().sessions.filter((s) => s.date === date); }

  // ---- days ----
  function day(date) { load(); return data.days[date] || (data.days[date] = {}); }
  function checkin(date) { return (load().days[date] || {}).checkin || null; }
  function setCheckin(date, ci) { day(date).checkin = Object.assign({ ts: Date.now() }, ci); save(); }

  // ---- food ----
  function foodOn(date) { return load().food[date] || []; }
  function addFood(date, item) { load(); (data.food[date] || (data.food[date] = [])).push(Object.assign({ id: F.ui.uid(), ts: Date.now() }, item)); save(); }
  function removeFood(date, id) { if (!data.food[date]) return; data.food[date] = data.food[date].filter((x) => x.id !== id); if (!data.food[date].length) delete data.food[date]; save(); }

  // ---- fasts ----
  function startFast(start, targetH) { load().activeFast = { start, targetH }; save(); }
  function endFast(end) {
    const f = load().activeFast;
    if (!f) return null;
    const rec = { id: F.ui.uid(), start: f.start, end, targetH: f.targetH };
    data.fasts.push(rec); data.activeFast = null; save();
    return rec;
  }
  function removeFast(id) { data.fasts = data.fasts.filter((f) => f.id !== id); save(); }

  // ---- measurements ----
  function addMeasurement(m) { load().measurements.push(Object.assign({ id: F.ui.uid() }, m)); data.measurements.sort((a, b) => (a.date < b.date ? -1 : 1)); save(); }
  function updateMeasurement(id, m) { const x = data.measurements.find((y) => y.id === id); if (x) Object.assign(x, m); data.measurements.sort((a, b) => (a.date < b.date ? -1 : 1)); save(); }
  function removeMeasurement(id) { data.measurements = data.measurements.filter((x) => x.id !== id); save(); }

  // ---- travel ----
  function isTravel(date) { return load().trips.some((t) => t.start <= date && (!t.end || t.end >= date)); }
  function startTrip(date) { if (!isTravel(date)) { data.trips.push({ start: date, end: null }); save(); } }
  // Home again: the trip's last day was yesterday. A trip started and ended the same day is dropped.
  function endTrip(date) {
    load();
    data.trips = data.trips.filter((t) => !(t.start === date && !t.end));
    for (const t of data.trips) if (!t.end && t.start < date) t.end = F.ui.addDays(date, -1);
    save();
  }
  function location(date = F.ui.today()) { const S = load(); return isTravel(date) ? S.settings.travelLoc : S.settings.location; }

  // ---- export / import ----
  function exportJSON() { load().backupAt = F.ui.today(); saveNow(); return JSON.stringify(data, null, 1); }
  function importJSON(text, mode = 'merge') {
    const inc = JSON.parse(text);
    if (!inc || typeof inc !== 'object' || !Array.isArray(inc.sessions) || !inc.profile) throw new Error('Not a Forge backup file');
    if (mode === 'replace') { data = fill(inc); saveNow(); return; }
    const d = load();
    const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
    const ses = byId(d.sessions); for (const s of inc.sessions) if (!ses.has(s.id)) d.sessions.push(s);
    sortSessions();
    for (const [date, items] of Object.entries(inc.food || {})) {
      const mine = d.food[date] || (d.food[date] = []); const ids = new Set(mine.map((x) => x.id));
      for (const it of items) if (!ids.has(it.id)) mine.push(it);
    }
    const fm = byId(d.fasts); for (const f of inc.fasts || []) if (!fm.has(f.id)) d.fasts.push(f);
    const mm = byId(d.measurements); for (const m of inc.measurements || []) if (!mm.has(m.id)) d.measurements.push(m);
    d.measurements.sort((a, b) => (a.date < b.date ? -1 : 1));
    const cf = new Set(d.foods.map((x) => x.id)); for (const f of inc.foods || []) if (!cf.has(f.id)) d.foods.push(f);
    for (const [date, dd] of Object.entries(inc.days || {})) {
      const mine = d.days[date] || (d.days[date] = {});
      if (dd.checkin && (!mine.checkin || (dd.checkin.ts || 0) > (mine.checkin.ts || 0))) mine.checkin = dd.checkin;
    }
    Object.assign(d.checks, inc.checks || {});
    for (const t of inc.trips || []) if (!d.trips.some((x) => x.start === t.start)) d.trips.push(t);
    if (!d.profile.onboarded && inc.profile.onboarded) { d.profile = inc.profile; d.settings = inc.settings; d.equipment = inc.equipment; }
    fill(d);
    saveNow();
  }
  function reset() { data = DEFAULTS(); saveNow(); }

  return { load, save, saveNow, rev: () => rev, addSession, updateSession, removeSession, sessionsOn,
    day, checkin, setCheckin, foodOn, addFood, removeFood, startFast, endFast, removeFast,
    addMeasurement, updateMeasurement, removeMeasurement, isTravel, startTrip, endTrip, location,
    exportJSON, importJSON, reset };
})();

/* Units: everything is stored in lb / in / mi; converted only for display and input. */
F.u = (() => {
  const metric = () => F.store.load().profile.units === 'metric';
  const r = (v, d) => (v === null || v === undefined || v === '' || isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    metric,
    wu: () => (metric() ? 'kg' : 'lb'), lu: () => (metric() ? 'cm' : 'in'), du: () => (metric() ? 'km' : 'mi'),
    wv: (lb) => (lb === null || lb === undefined ? null : metric() ? r(lb * 0.45359237, 1) : r(lb, 1)),
    wIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 0.45359237 : +v),
    lv: (inch) => (inch === null || inch === undefined ? null : metric() ? r(inch * 2.54, 1) : r(inch, 2)),
    lIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 2.54 : +v),
    dv: (mi) => (mi === null || mi === undefined ? null : metric() ? r(mi * 1.609344, 2) : r(mi, 2)),
    dIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 1.609344 : +v),
    w(lb, d = 0) { return lb === null || lb === undefined ? '–' : F.ui.num(this.wv(lb), d) + ' ' + this.wu(); },
    l(inch, d = 1) { return inch === null || inch === undefined ? '–' : F.ui.num(this.lv(inch), d) + ' ' + this.lu(); },
    d(mi, d = 1) { return mi === null || mi === undefined ? '–' : F.ui.num(this.dv(mi), d) + ' ' + this.du(); },
  };
})();
