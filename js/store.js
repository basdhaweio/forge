/* Local state (localStorage), merging (backups and sync), units. Everything the user logs lives here, on this device.
   For sync, every record carries a timestamp (ts at creation, u when edited), deletions leave tombstones, and
   profile/settings/equipment/quest checks/trips travel together as one last-writer-wins blob stamped prefsU. */
window.F = window.F || {};

F.store = (() => {
  const KEY = 'forge.v1';
  const PREFS = ['profile', 'settings', 'equipment', 'checks', 'trips'];
  const LOCAL = ['active', 'backupAt'];        // never leaves this device
  const TOMB_DAYS = 400;                       // how long a deletion is remembered
  let data = null, rev = 0, timer = null, lastPrefs = '', dirty = false, listener = null;

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
      nutrition: { protein: null, treatsWeek: 5, kcal: null, trackKcal: true, water: null },   // water: fl oz a day, null = auto
      fast: { day: 0, targetH: 24 },
      goals: { thresholdLb: null, photoWaist: 2, photoArms: 1 },
      quests: {},
      formalPtCovers: { holds: false, mobility: false },   // what a formal PT day also counts for
    },
    trips: [],                  // [{start, end|null}]
    days: {},                   // date -> {checkin:{knee,back,energy,ts}}
    sessions: [],               // logged sessions (see game.sessionXP for derived fields)
    food: {},                   // date -> [{id,name,p,sug,kcal,treat,ts}]
    water: {},                  // date -> [{id,oz,ts}]
    foods: [],                  // saved custom foods
    fasts: [], activeFast: null,
    measurements: [],
    checks: {},                 // quest step self-checks: 'quest.step' -> date
    seen: { init: false, level: 1, ach: {}, steps: {}, weeks: {}, stats: {} },
    deleted: {},                // sync tombstones: kind -> {id: ts}
    prefsU: 0,                  // when the PREFS blob last changed
    activeFastU: 0,             // when a fast was last started, ended or cancelled
    active: null,               // in-progress session
    backupAt: null,
  });

  function fill(d) {
    const D = DEFAULTS();
    for (const k of Object.keys(D)) if (d[k] === undefined || (d[k] === null && D[k] !== null)) d[k] = D[k];
    for (const k of ['profile', 'settings', 'seen']) for (const kk of Object.keys(D[k])) if (d[k][kk] === undefined) d[k][kk] = D[k][kk];
    for (const k of ['injuries', 'focus']) for (const kk of Object.keys(D.profile[k])) if (d.profile[k][kk] === undefined) d.profile[k][kk] = D.profile[k][kk];
    for (const k of ['nutrition', 'fast', 'goals']) for (const kk of Object.keys(D.settings[k])) if (d.settings[k][kk] === undefined) d.settings[k][kk] = D.settings[k][kk];
    return d;
  }
  const prefsKey = () => JSON.stringify(PREFS.map((k) => data[k]));
  function load() {
    if (data) return data;
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : DEFAULTS();
    } catch (e) { data = DEFAULTS(); }
    fill(data);
    lastPrefs = prefsKey();
    return data;
  }
  function write() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn('save failed', e); F.ui.toast('Could not save — is storage full?', 4000); }
  }
  // Every save checks whether the prefs blob changed and tells the sync layer about real edits.
  function track() {
    const p = prefsKey();
    if (p !== lastPrefs) { lastPrefs = p; data.prefsU = Date.now(); dirty = true; }
    if (dirty) { dirty = false; if (listener) listener(); }
  }
  function save() { rev++; track(); clearTimeout(timer); timer = setTimeout(write, 40); }
  function saveNow() { rev++; track(); clearTimeout(timer); write(); }
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); write(); } });
  const touch = () => { dirty = true; };
  function tomb(kind, id) { load(); (data.deleted[kind] || (data.deleted[kind] = {}))[id] = Date.now(); touch(); }
  function onChange(fn) { listener = fn; }

  // ---- sessions ----
  function sortSessions() { data.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts || 0) - (b.ts || 0))); }
  function addSession(rec) {
    load();
    rec.id = rec.id || F.ui.uid();
    rec.ts = rec.ts || Date.now();
    data.sessions.push(rec);
    sortSessions();
    touch(); save();
    return rec;
  }
  function updateSession(id, patch) { const s = data.sessions.find((x) => x.id === id); if (s) { Object.assign(s, patch, { u: Date.now() }); sortSessions(); touch(); save(); } return s; }
  function removeSession(id) { data.sessions = data.sessions.filter((x) => x.id !== id); tomb('sessions', id); save(); }
  function sessionsOn(date) { return load().sessions.filter((s) => s.date === date); }

  // ---- days ----
  function day(date) { load(); return data.days[date] || (data.days[date] = {}); }
  function checkin(date) { return (load().days[date] || {}).checkin || null; }
  function setCheckin(date, ci) { day(date).checkin = Object.assign({}, ci, { ts: Date.now() }); touch(); save(); }

  // ---- food ----
  function foodOn(date) { return load().food[date] || []; }
  function addFood(date, item) { load(); (data.food[date] || (data.food[date] = [])).push(Object.assign({ id: F.ui.uid(), ts: Date.now() }, item)); touch(); save(); }
  function removeFood(date, id) { if (!data.food[date]) return; data.food[date] = data.food[date].filter((x) => x.id !== id); if (!data.food[date].length) delete data.food[date]; tomb('food', id); save(); }
  function addCustomFood(f) { load().foods.push(Object.assign({ id: F.ui.uid(), ts: Date.now() }, f)); touch(); save(); }
  function updateCustomFood(id, patch) { const f = load().foods.find((x) => x.id === id); if (f) { Object.assign(f, patch, { u: Date.now() }); touch(); save(); } return f; }
  function removeCustomFood(id) { data.foods = data.foods.filter((x) => x.id !== id); tomb('foods', id); save(); }

  // ---- water ----
  function waterOn(date) { return load().water[date] || []; }
  function addWater(date, oz) { load(); const rec = { id: F.ui.uid(), ts: Date.now(), oz }; (data.water[date] || (data.water[date] = [])).push(rec); touch(); save(); return rec; }
  function removeWater(date, id) { if (!load().water[date]) return; data.water[date] = data.water[date].filter((x) => x.id !== id); if (!data.water[date].length) delete data.water[date]; tomb('water', id); save(); }

  // ---- fasts ----
  const byStart = (a, b) => (a.start || 0) - (b.start || 0);
  function startFast(start, targetH) { load().activeFast = { start, targetH }; data.activeFastU = Date.now(); touch(); save(); }
  function endFast(end) {
    const f = load().activeFast;
    if (!f) return null;
    const rec = { id: F.ui.uid(), start: f.start, end, targetH: f.targetH, ts: Date.now() };
    data.fasts.push(rec); data.fasts.sort(byStart); data.activeFast = null; data.activeFastU = Date.now(); touch(); save();
    return rec;
  }
  // The timer was started late (or with the wrong time): move the start of the running fast.
  function setFastStart(start) { const f = load().activeFast; if (!f) return; f.start = start; data.activeFastU = Date.now(); touch(); save(); }
  // A fast that was finished but never timed.
  function addFast(start, end, targetH) {
    const rec = { id: F.ui.uid(), start, end, targetH: targetH || 24, ts: Date.now() };
    load().fasts.push(rec); data.fasts.sort(byStart); touch(); save();
    return rec;
  }
  function cancelFast() { load().activeFast = null; data.activeFastU = Date.now(); touch(); save(); }
  function removeFast(id) { data.fasts = data.fasts.filter((f) => f.id !== id); tomb('fasts', id); save(); }

  // ---- measurements ----
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  function addMeasurement(m) { load().measurements.push(Object.assign({ id: F.ui.uid(), ts: Date.now() }, m)); data.measurements.sort(byDate); touch(); save(); }
  function updateMeasurement(id, m) { const x = data.measurements.find((y) => y.id === id); if (x) Object.assign(x, m, { u: Date.now() }); data.measurements.sort(byDate); touch(); save(); }
  function removeMeasurement(id) { data.measurements = data.measurements.filter((x) => x.id !== id); tomb('measurements', id); save(); }

  // ---- travel ----
  // trips: [{start, end|null}], kept sorted and never overlapping or back to back. end null = still away.
  const covers = (t, date) => t.start <= date && (!t.end || t.end >= date);
  const sameTrip = (a, b) => a === b || (a.start === b.start && (a.end || null) === (b.end || null));
  function isTravel(date) { return load().trips.some((t) => covers(t, date)); }
  function tripOn(date) { return load().trips.find((t) => covers(t, date)) || null; }
  function tidyTrips() {
    const out = [];
    for (const t of data.trips.filter((x) => x && x.start && (!x.end || x.end >= x.start)).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))) {
      const last = out[out.length - 1];
      if (last && (!last.end || F.ui.addDays(last.end, 1) >= t.start)) { if (last.end && (!t.end || t.end > last.end)) last.end = t.end || null; }
      else out.push({ start: t.start, end: t.end || null });
    }
    data.trips = out;
  }
  function startTrip(date) { if (!isTravel(date)) { data.trips.push({ start: date, end: null }); tidyTrips(); save(); } }
  // Home again from this day on: the trip covering it ends the day before, or goes if it began that day.
  function endTrip(date) {
    load();
    data.trips = data.trips.filter((t) => !(t.start === date && covers(t, date)));
    for (const t of data.trips) if (t.start < date && covers(t, date)) t.end = F.ui.addDays(date, -1);
    save();
  }
  // Add a trip after the fact, or change the dates of one (pass the trip being edited). Trips that meet are merged.
  function setTrip(old, start, end) {
    load();
    if (old) data.trips = data.trips.filter((t) => !sameTrip(t, old));
    data.trips.push({ start, end: end || null });
    tidyTrips(); save();
  }
  function removeTrip(old) { load(); data.trips = data.trips.filter((t) => !sameTrip(t, old)); save(); }
  // Where a day's plan is built for. Home or gym is picked per day and resets to home. A travel day uses the hotel
  // room or hotel gym picked for that day, else whichever was chosen last while travelling.
  function location(date = F.ui.today()) {
    const S = load(), own = S.days[date] && S.days[date].loc;
    if (isTravel(date)) return own === 'room' || own === 'hotelgym' ? own : S.settings.travelLoc;
    return own === 'gym' ? 'gym' : 'home';
  }
  function setLocation(date, loc) { const d = day(date); d.loc = loc; d.locTs = Date.now(); touch(); save(); }

  // ---- merging: backups and sync use the same rules ----
  const stamp = (x) => x.u || x.ts || 0;
  function mergeList(mine, theirs, kind, dead) {
    const map = new Map();
    for (const x of mine || []) if (x && x.id) map.set(x.id, x);
    for (const x of theirs || []) { if (!x || !x.id) continue; const m = map.get(x.id); if (!m || stamp(x) > stamp(m)) map.set(x.id, x); }
    const gone = dead[kind] || {};
    return [...map.values()].filter((x) => !gone[x.id]);
  }
  function mergeSeen(a, b) {
    if (!b) return;
    a.init = !!(a.init || b.init);
    a.level = Math.max(a.level || 1, b.level || 1);
    for (const k of ['ach', 'steps', 'weeks', 'q']) a[k] = Object.assign({}, b[k] || {}, a[k] || {});
    a.stats = a.stats || {};
    for (const [k, v] of Object.entries(b.stats || {})) a.stats[k] = Math.max(a.stats[k] || 1, v);
  }
  // A cheap fingerprint of everything that syncs, to tell whether two copies differ.
  function digest(d) {
    const ids = (arr) => (arr || []).filter(Boolean).map((x) => x.id + ':' + stamp(x)).sort().join(',');
    const food = d.food || {}, water = d.water || {}, days = d.days || {}, seen = d.seen || {};
    return JSON.stringify([
      ids(d.sessions), ids(d.measurements), ids(d.fasts), ids(d.foods),
      Object.keys(food).sort().map((k) => k + '=' + ids(food[k])).join(';'),
      Object.keys(water).sort().map((k) => k + '=' + ids(water[k])).join(';'),
      Object.keys(days).sort().map((k) => k + '=' + ((days[k] && days[k].checkin && days[k].checkin.ts) || 0) + '/' + ((days[k] && days[k].locTs) || 0)).join(';'),
      Object.entries(d.deleted || {}).map(([k, v]) => k + ':' + Object.keys(v || {}).sort().join(',')).sort().join(';'),
      d.prefsU || 0, d.activeFastU || 0,
      Object.keys(seen.ach || {}).length, Object.keys(seen.steps || {}).length, Object.keys(seen.weeks || {}).length, Object.keys(seen.q || {}).length, seen.level || 1,
    ]);
  }
  // Fold another copy (a backup file or the sync gist) into this one. Returns true if anything here changed.
  function merge(incoming, { preferRemotePrefs = false } = {}) {
    const d = load();
    const before = digest(d);
    const inc = fill(JSON.parse(JSON.stringify(incoming)));
    const cutoff = Date.now() - TOMB_DAYS * 864e5;
    for (const [kind, ids] of Object.entries(inc.deleted || {})) d.deleted[kind] = Object.assign(d.deleted[kind] || {}, ids);
    for (const kind of Object.keys(d.deleted)) for (const [id, t] of Object.entries(d.deleted[kind])) if (t < cutoff) delete d.deleted[kind][id];
    d.sessions = mergeList(d.sessions, inc.sessions, 'sessions', d.deleted); sortSessions();
    d.measurements = mergeList(d.measurements, inc.measurements, 'measurements', d.deleted).sort(byDate);
    d.fasts = mergeList(d.fasts, inc.fasts, 'fasts', d.deleted).sort(byStart);
    d.foods = mergeList(d.foods, inc.foods, 'foods', d.deleted);
    for (const date of new Set([...Object.keys(d.food), ...Object.keys(inc.food || {})])) {
      const list = mergeList(d.food[date], (inc.food || {})[date], 'food', d.deleted).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (list.length) d.food[date] = list; else delete d.food[date];
    }
    for (const date of new Set([...Object.keys(d.water), ...Object.keys(inc.water || {})])) {
      const list = mergeList(d.water[date], (inc.water || {})[date], 'water', d.deleted).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (list.length) d.water[date] = list; else delete d.water[date];
    }
    for (const [date, dd] of Object.entries(inc.days || {})) {
      if (!dd) continue;
      const mine = d.days[date] || (d.days[date] = {});
      if (dd.checkin && (!mine.checkin || (dd.checkin.ts || 0) > (mine.checkin.ts || 0))) mine.checkin = dd.checkin;
      if (dd.loc && (dd.locTs || 0) > (mine.locTs || 0)) { mine.loc = dd.loc; mine.locTs = dd.locTs; }
    }
    if (inc.profile.onboarded && (preferRemotePrefs || !d.profile.onboarded || (inc.prefsU || 0) > (d.prefsU || 0))) {
      for (const k of PREFS) d[k] = inc[k];
      d.prefsU = inc.prefsU || 0;
    }
    if ((inc.activeFastU || 0) > (d.activeFastU || 0)) { d.activeFast = inc.activeFast || null; d.activeFastU = inc.activeFastU; }
    if (inc.created && inc.created < d.created) d.created = inc.created;
    mergeSeen(d.seen, inc.seen);
    fill(d);
    lastPrefs = prefsKey();                    // adopting the other copy's prefs isn't a local edit
    const changed = digest(d) !== before;
    if (changed) { rev++; clearTimeout(timer); write(); }
    return changed;
  }
  // What goes to the gist: everything except device-local bits.
  function snapshot() {
    const d = load(), o = {};
    for (const k of Object.keys(d)) if (!LOCAL.includes(k)) o[k] = d[k];
    return o;
  }

  // ---- export / import ----
  function exportJSON() { load().backupAt = F.ui.today(); saveNow(); return JSON.stringify(data, null, 1); }
  function importJSON(text, mode = 'merge') {
    const inc = JSON.parse(text);
    if (!inc || typeof inc !== 'object' || !Array.isArray(inc.sessions) || !inc.profile) throw new Error('Not a Forge backup file');
    if (mode === 'replace') { data = fill(inc); lastPrefs = prefsKey(); touch(); saveNow(); return; }
    merge(inc);
    touch(); saveNow();
  }
  function reset() { data = DEFAULTS(); lastPrefs = prefsKey(); saveNow(); }

  return { load, save, saveNow, rev: () => rev, onChange, addSession, updateSession, removeSession, sessionsOn,
    day, checkin, setCheckin, foodOn, addFood, removeFood, addCustomFood, updateCustomFood, removeCustomFood, waterOn, addWater, removeWater,
    startFast, endFast, cancelFast, removeFast, setFastStart, addFast, addMeasurement, updateMeasurement, removeMeasurement,
    isTravel, tripOn, startTrip, endTrip, setTrip, removeTrip, location, setLocation, merge, snapshot, digest, exportJSON, importJSON, reset };
})();

/* Units: everything is stored in lb / in / mi / fl oz; converted only for display and input. */
F.u = (() => {
  const metric = () => F.store.load().profile.units === 'metric';
  const r = (v, d) => (v === null || v === undefined || v === '' || isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    metric,
    wu: () => (metric() ? 'kg' : 'lb'), lu: () => (metric() ? 'cm' : 'in'), du: () => (metric() ? 'km' : 'mi'), vu: () => (metric() ? 'ml' : 'oz'),
    wv: (lb) => (lb === null || lb === undefined ? null : metric() ? r(lb * 0.45359237, 1) : r(lb, 1)),
    wIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 0.45359237 : +v),
    lv: (inch) => (inch === null || inch === undefined ? null : metric() ? r(inch * 2.54, 1) : r(inch, 2)),
    lIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 2.54 : +v),
    dv: (mi) => (mi === null || mi === undefined ? null : metric() ? r(mi * 1.609344, 2) : r(mi, 2)),
    dIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 1.609344 : +v),
    vv: (oz) => (oz === null || oz === undefined ? null : metric() ? Math.round(oz * 29.5735) : r(oz, 1)),
    vIn: (v) => (v === null || v === undefined || v === '' ? null : metric() ? v / 29.5735 : +v),
    volN(oz) { return oz === null || oz === undefined ? '–' : F.ui.num(this.vv(oz), metric() ? 0 : 1); },
    vol(oz) { return oz === null || oz === undefined ? '–' : this.volN(oz) + ' ' + this.vu(); },
    w(lb, d = 0) { return lb === null || lb === undefined ? '–' : F.ui.num(this.wv(lb), d) + ' ' + this.wu(); },
    l(inch, d = 1) { return inch === null || inch === undefined ? '–' : F.ui.num(this.lv(inch), d) + ' ' + this.lu(); },
    d(mi, d = 1) { return mi === null || mi === undefined ? '–' : F.ui.num(this.dv(mi), d) + ' ' + this.du(); },
  };
})();
