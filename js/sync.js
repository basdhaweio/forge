/* Cross-device sync through a secret GitHub gist, optionally encrypted with a passphrase (AES-GCM, key from PBKDF2).
   The token and passphrase live only in this browser under their own key — never in backups or in the gist.
   Cycle: pull the gist → merge (F.store.merge) → push only if this device has something the gist doesn't. */
window.F = window.F || {};

F.sync = (() => {
  const KEY = 'forge.sync';
  const FILE = 'forge-sync.json';
  const DESC = 'Forge sync — private training data (secret gist; don’t share the link)';
  const API = 'https://api.github.com';
  const ITER = 210000;
  let cfg = read();
  let busy = false, again = false, timer = null, status = 'idle', listeners = [];

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage full or blocked */ } }
  const connected = () => !!(cfg.token && cfg.gistId);
  function setStatus(s) { status = s; for (const fn of listeners.slice()) { try { fn(); } catch (e) { /* view gone */ } } }
  function onStatus(fn) { listeners.push(fn); return () => { listeners = listeners.filter((x) => x !== fn); }; }
  function info() { return { connected: connected(), status, lastSync: cfg.lastSync || null, error: cfg.error || null, gistId: cfg.gistId || null, user: cfg.user || null, encrypted: !!cfg.passphrase }; }

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    let res;
    try {
      res = await fetch(API + path, Object.assign({}, opts, {
        cache: 'no-store',
        headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      }));
    } catch (e) { const err = new Error('Offline — it will retry.'); err.offline = true; throw err; }
    if (res.status === 401) throw new Error('GitHub rejected the token — it may have expired or be missing the gist scope.');
    if (res.status === 403 || res.status === 429) throw new Error('GitHub is rate-limiting or refused access — try again later.');
    if (res.status === 404) { const err = new Error('The sync gist wasn’t found — it may have been deleted.'); err.notFound = true; throw err; }
    if (!res.ok) throw new Error('GitHub error ' + res.status);
    return res.status === 204 ? null : res.json();
  }

  // ---------- encryption ----------
  const te = new TextEncoder(), td = new TextDecoder();
  function b64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encode(obj, pass) {
    const text = JSON.stringify(obj);
    if (!pass) return text;
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt, ITER);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text));
    return JSON.stringify({ forgeEncrypted: 1, cipher: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) });
  }
  async function decode(text, pass) {
    const o = JSON.parse(text);
    if (!o || !o.forgeEncrypted) return o;
    if (!pass) { const e = new Error('The synced data is encrypted — enter the passphrase you set on your other device.'); e.needPass = true; throw e; }
    const key = await deriveKey(pass, unb64(o.salt), o.iter || ITER);
    try { return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data)))); }
    catch (e) { const err = new Error('That passphrase doesn’t unlock the synced data.'); err.needPass = true; throw err; }
  }

  // ---------- gist I/O ----------
  async function readGist(id, pass) {
    const g = await gh('/gists/' + id);
    const f = g.files && g.files[FILE];
    if (!f) return null;
    const text = f.truncated ? await fetch(f.raw_url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('Could not read the gist file'); return r.text(); }) : f.content;
    return decode(text, pass);
  }
  async function writeGist(id, obj, pass) {
    await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: await encode(obj, pass) } } }) });
  }
  async function findGist() {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.files && g.files[FILE]);
      if (hit) return hit;
      if (list.length < 100) return null;
    }
    return null;
  }

  // ---------- sync cycle ----------
  function applyRemoteChanges() {
    F.game.afterChange();
    const el = document.activeElement;
    const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    if (typing || document.querySelector('.sheet-back, .tmr')) { F.app.chrome(); F.ui.toast('Synced changes from your other device', 2400); }
    else F.app.render();
  }
  async function syncNow({ quiet = false } = {}) {
    if (!connected()) return false;
    if (busy) { again = true; return false; }
    busy = true;
    setStatus('syncing');
    let changed = false;
    try {
      const remote = await readGist(cfg.gistId, cfg.passphrase);
      if (remote) changed = F.store.merge(remote);
      const local = F.store.snapshot();
      if (!remote || F.store.digest(remote) !== F.store.digest(local)) await writeGist(cfg.gistId, local, cfg.passphrase);
      cfg.lastSync = Date.now(); cfg.error = null; persist();
      setStatus('ok');
      if (changed) applyRemoteChanges();
      return changed;
    } catch (e) {
      cfg.error = e.message; persist();
      setStatus(e.offline ? 'offline' : 'error');
      if (!quiet && !e.offline) F.ui.toast('Sync: ' + e.message, 4500);
      return false;
    } finally {
      busy = false;
      if (again) { again = false; schedule(1500); }
    }
  }
  function schedule(ms = 6000) {
    if (!connected()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; syncNow({ quiet: true }); }, ms);
  }

  // First connection on a device: find the Forge gist on this GitHub account or create one.
  async function connect(token, passphrase) {
    const prev = cfg;
    cfg = { token: String(token || '').trim(), passphrase: passphrase || null };
    if (!cfg.token) { cfg = prev; throw new Error('Paste a token first.'); }
    setStatus('syncing');
    try {
      const me = await gh('/user');
      const found = await findGist();
      let loaded = 0;
      if (found) {
        cfg.gistId = found.id;
        const remote = await readGist(found.id, cfg.passphrase);
        if (remote) { loaded = (remote.sessions || []).length; F.store.merge(remote, { preferRemotePrefs: true }); }
      } else {
        const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content: await encode(F.store.snapshot(), cfg.passphrase) } } }) });
        cfg.gistId = g.id;
      }
      cfg.user = me.login; cfg.error = null; cfg.lastSync = null;
      persist();
      busy = false;
      await syncNow({ quiet: true });
      if (cfg.error) throw new Error(cfg.error);
      return { existing: !!found, loaded };
    } catch (e) {
      cfg = prev; persist();
      setStatus('idle');
      throw e;
    }
  }
  // Change or remove the passphrase: read with the old one, write with the new one.
  async function setPassphrase(next) {
    if (!connected()) { cfg.passphrase = next || null; persist(); return; }
    setStatus('syncing');
    try {
      const remote = await readGist(cfg.gistId, cfg.passphrase);
      if (remote) F.store.merge(remote);
      cfg.passphrase = next || null; persist();
      await writeGist(cfg.gistId, F.store.snapshot(), cfg.passphrase);
      cfg.lastSync = Date.now(); cfg.error = null; persist();
      setStatus('ok');
    } catch (e) {
      if (e.needPass) { cfg.passphrase = next || null; persist(); return syncNow(); } // this device had the wrong one; try the new one
      setStatus('error');
      throw e;
    }
  }
  function disconnect() { clearTimeout(timer); cfg = {}; persist(); setStatus('idle'); }

  function start() {
    F.store.onChange(() => schedule());
    document.addEventListener('visibilitychange', () => {
      if (!connected()) return;
      if (document.visibilityState === 'visible' && Date.now() - (cfg.lastSync || 0) > 60000) syncNow({ quiet: true });
      if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = null; syncNow({ quiet: true }); }
    });
    window.addEventListener('online', () => schedule(1500));
    if (connected()) setTimeout(() => syncNow({ quiet: true }), 1200);
  }

  return { start, connect, disconnect, syncNow, schedule, setPassphrase, info, onStatus, connected, _codec: { encode, decode } };
})();
