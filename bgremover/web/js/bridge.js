/* Talks to the Python side: pywebview in the app, HTTP in the dev server. */
window.API = (() => {
  let ready;
  const native = () => window.pywebview && window.pywebview.api;
  const isDev = () => !native() && location.protocol.startsWith('http') && !/pywebview/i.test(navigator.userAgent);

  function whenReady() {
    if (ready) return ready;
    ready = new Promise(res => {
      if (native()) return res();
      let done = false;
      window.addEventListener('pywebviewready', () => { done = true; res(); });
      // dev server (plain browser) never fires pywebviewready
      setTimeout(() => { if (!done) res(); }, 1500);
    });
    return ready;
  }

  async function call(name, ...args) {
    await whenReady();
    if (native()) return window.pywebview.api[name](...args);
    const r = await fetch('/api/' + name, { method: 'POST', body: JSON.stringify(args) });
    return r.json();
  }

  // Poll backend progress while a long call runs.
  async function withProgress(promise, label, { cancel } = {}) {
    U.busy(label, -1, cancel || null);
    let live = true;
    (async () => {
      while (live) {
        await U.sleep(300);
        if (!live) break;
        try {
          const p = await call('progress');
          if (live && p && p.msg) U.busyUpdate(p.msg, p.frac);
          if (p && p.device) setDevice(p.device);
        } catch (e) { /* ignore */ }
      }
    })();
    try { return await promise; } finally { live = false; U.busy(false); }
  }

  function setDevice(d) {
    const el = document.querySelector('#deviceBadge span');
    if (el && d) el.textContent = 'AI: ' + d;
  }

  let info = null;
  async function getInfo(force) {
    if (!info || force) info = await call('info');
    return info;
  }

  // Make sure the model for this quality is downloaded (asks once).
  async function ensureModel(quality) {
    const key = quality === 'Fast' ? 'lite' : 'full';
    const inf = await getInfo(true);
    if (inf.models[key]) return true;
    const mb = inf.sizes[key];
    const ok = await U.confirm('Download AI model',
      `Background removal needs the AI model (about ${mb} MB). It downloads once, then everything works offline.`,
      'Download now');
    if (!ok) return false;
    const r = await withProgress(call('download_model', key), 'Downloading AI model…');
    if (!r.ok) { U.alert('Download failed', U.esc(r.error || 'Unknown error') + '<br><br>Check your internet and try again.'); return false; }
    await getInfo(true);
    return true;
  }

  return { call, withProgress, ensureModel, getInfo, setDevice, isDev, whenReady, native };
})();
