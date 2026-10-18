/* App startup, home screen, file menu, shortcuts, drag & drop, export. */
window.MAIN = (() => {
  const { $, $$, h, icon, esc } = U;
  const SIZES = [
    { name: 'Square product', w: 1080, h: 1080, note: 'Shopee · Lazada · TikTok Shop' },
    { name: 'Large square', w: 2000, h: 2000, note: 'Extra sharp zoom' },
    { name: 'Portrait 3:4', w: 1080, h: 1440, note: 'Product gallery' },
    { name: 'Story 9:16', w: 1080, h: 1920, note: 'TikTok · Reels · Stories' },
    { name: 'Post 4:5', w: 1080, h: 1350, note: 'Facebook · Instagram' },
    { name: 'Landscape 16:9', w: 1920, h: 1080, note: 'YouTube · slides' },
    { name: 'Shop banner', w: 1200, h: 480, note: 'Store front banner' },
    { name: 'Wide banner 2:1', w: 2000, h: 1000, note: 'Promo / web banner' },
  ];
  let docPath = '';     // where the project is saved
  let dirty = false;

  // ------------------------------------------------------------ home
  async function showHome() {
    $('#home').classList.remove('hidden');
    const cards = $('#sizeCards');
    cards.innerHTML = '';
    const custom = { name: 'Custom size', custom: true, note: 'Any width × height' };
    [...SIZES, custom].forEach(s => {
      const r = s.custom ? 1 : s.w / s.h, bw = r >= 1 ? 70 : 70 * r, bh = r >= 1 ? 70 / r : 70;
      const shape = s.custom ? h('div.shape', { style: { width: '56px', height: '56px', background: 'none', border: '2px dashed #7c5cff' } }) : h('div.shape', { style: { width: bw + 'px', height: bh + 'px' } });
      const c = h('div.size-card', h('div.shape-wrap', shape), h('b', s.name), h('small', s.custom ? s.note : `${s.w} × ${s.h}px · ${s.note}`));
      c.onclick = async () => {
        if (s.custom) { const r = await sizeDialog('Custom size', 1080, 1080); if (!r) return; newDesign(r.w, r.h); }
        else newDesign(s.w, s.h);
      };
      cards.append(c);
    });
    // continue last design
    const cont = $('#homeContinue'); cont.innerHTML = '';
    try {
      const a = await API.call('load_autosave');
      if (a && a.data) {
        const d = JSON.parse(a.data);
        const p0 = d.pages ? d.pages[0] : d;
        const np = d.pages ? d.pages.length : 1;
        const card = h('div.continue-card', a.thumb ? h('img', { src: a.thumb }) : '', h('div', h('b', 'Continue where you left off'), h('div.muted.small', `${esc(d.name || 'Untitled design')} · ${p0.width}×${p0.height}${np > 1 ? ` · ${np} pages` : ''}`)));
        card.onclick = async () => { await openDoc(d, d.path || ''); };
        cont.append(card);
      }
    } catch (e) { /* none */ }
    // recent
    const grid = $('#recentGrid'); grid.innerHTML = '';
    const rec = await API.call('recent').catch(() => []);
    if (!rec || !rec.length) grid.append(h('div.muted', 'Saved projects will show up here.'));
    (rec || []).forEach(r => {
      const card = h('div.recent', h('div.rthumb', r.thumb ? h('img', { src: r.thumb }) : ''), h('div.rname', r.name || r.path));
      card.title = r.path;
      card.onclick = () => openPath(r.path);
      grid.append(card);
    });
    U.hydrateIcons($('#home'));
    UPD.banner();
  }
  const hideHome = () => { $('#home').classList.add('hidden'); setTimeout(() => { window.dispatchEvent(new Event('resize')); E.fit(); }, 30); };

  function newDesign(w, h2) {
    docPath = ''; $('#docName').value = 'Untitled design';
    E.newDesign(w, h2, '#ffffff');
    PAGES.reset();
    hideHome();
    PANELS.show('templates');
    dirty = false; updateTitle();
  }

  // ------------------------------------------------------------ dialogs
  async function sizeDialog(title, w, h0) {
    const wi = h('input.inp', { type: 'number', value: w, min: 50, max: 8000 });
    const hi = h('input.inp', { type: 'number', value: h0, min: 50, max: 8000 });
    const body = h('div', h('div.grid2', h('div.field', h('label', 'Width (px)'), wi), h('div.field', h('label', 'Height (px)'), hi)));
    const quick = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } });
    SIZES.forEach(s => quick.append(h('button.chip-btn', { onclick: () => { wi.value = s.w; hi.value = s.h; } }, `${s.name} ${s.w}×${s.h}`)));
    body.append(quick);
    const r = await U.modal({ title, body, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }] });
    if (!r) return null;
    const W = Math.max(50, Math.min(8000, +wi.value || 1080)), H = Math.max(50, Math.min(8000, +hi.value || 1080));
    return { w: W, h: H };
  }
  async function resizeDialog() {
    const r = await sizeDialog('Resize design', E.W, E.H);
    if (r) { E.resizePage(r.w, r.h, true); updateTitle(); }
  }

  async function exportDialog() {
    const prefs = JSON.parse(U.lsGet('eg_export') || '{"format":"png","mult":1,"quality":0.92,"transparent":false}');
    const st = { ...prefs };
    const body = h('div');
    const fmt = h('div.seg'), size = h('div.seg');
    const qRow = U.slider('Quality', 0.5, 1, 0.01, st.quality, v => st.quality = v, v => Math.round(v * 100));
    const tr = h('input', { type: 'checkbox' }); tr.checked = st.transparent; tr.onchange = () => st.transparent = tr.checked;
    const trRow = h('label.check', tr, 'Transparent background');
    const info = h('div.muted.small');
    const draw = () => {
      fmt.innerHTML = ''; size.innerHTML = '';
      [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']].forEach(([v, l]) => fmt.append(h('button' + (st.format === v ? '.on' : ''), { onclick: () => { st.format = v; draw(); } }, l)));
      [[0.5, '0.5×'], [1, '1×'], [1.5, '1.5×'], [2, '2×'], [3, '3×']].forEach(([v, l]) => size.append(h('button' + (st.mult === v ? '.on' : ''), { onclick: () => { st.mult = v; draw(); } }, l)));
      qRow.style.display = st.format === 'png' ? 'none' : '';
      trRow.style.display = st.format === 'jpg' ? 'none' : '';
      info.textContent = `${Math.round(E.W * st.mult)} × ${Math.round(E.H * st.mult)} px`;
    };
    draw();
    st.all = false;
    const allRow = h('div.field');
    if (PAGES.count > 1) {
      const seg = h('div.seg');
      const drawAll = () => { seg.innerHTML = ''; [[false, 'This page'], [true, `All ${PAGES.count} pages`]].forEach(([v, l]) => seg.append(h('button' + (st.all === v ? '.on' : ''), { onclick: () => { st.all = v; drawAll(); } }, l))); };
      drawAll(); allRow.append(h('label', 'Pages'), seg);
    }
    body.append(allRow, h('div.field', h('label', 'File type'), fmt), h('div.field', h('label', 'Size'), size, info), qRow, trRow,
      h('div.note', 'JPG is smallest and what most marketplaces prefer. PNG keeps transparency.'));
    const ok = await U.modal({ title: 'Download', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Download', value: true, primary: true }] });
    if (!ok) return;
    U.lsSet('eg_export', JSON.stringify({ ...st, all: undefined }));
    const format = st.format === 'jpg' ? 'jpeg' : st.format;
    if (st.all) return exportAll(st, format);
    U.busy('Rendering…');
    let url;
    try { url = await E.exportDataURL({ format, multiplier: st.mult, quality: st.quality, transparent: st.transparent && st.format !== 'jpg' }); }
    finally { U.busy(false); }
    const name = (($('#docName').value || 'design').replace(/[\\/:*?"<>|]+/g, '_')) + '.' + st.format;
    if (API.native()) {
      const types = { png: 'PNG image (*.png)', jpg: 'JPEG image (*.jpg)', webp: 'WebP image (*.webp)' };
      const p = await API.call('pick_save', name, [types[st.format]]);
      if (!p) return;
      await API.call('save_data_url', p, url);
      U.toast('Saved ' + p.split(/[\\/]/).pop(), 'ok');
    } else U.downloadDataURL(name, url);
  }

  async function exportAll(st, format) {
    const base = ($('#docName').value || 'design').replace(/[\\/:*?"<>|]+/g, '_');
    let dir = '';
    if (API.native()) { dir = await API.call('pick_folder'); if (!dir) return; }
    const docs = PAGES.data();
    U.busy('Rendering pages…', 0);
    try {
      for (let i = 0; i < docs.length; i++) {
        U.busyUpdate(`Page ${i + 1} of ${docs.length}`, i / docs.length);
        const url = await E.renderDoc(docs[i], { format, multiplier: st.mult, quality: st.quality, transparent: st.transparent && st.format !== 'jpg' });
        const name = `${base}-${i + 1}.${st.format}`;
        if (dir) await API.call('save_data_url', await API.call('join', dir, name), url);
        else { U.downloadDataURL(name, url); await U.sleep(300); }
      }
    } finally { U.busy(false); }
    U.toast(`Saved ${docs.length} pages`, 'ok');
    if (dir) API.call('open_path', dir);
  }

  function shortcutsDialog() {
    const rows = [['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Copy / Paste / Duplicate', 'Ctrl+C / Ctrl+V / Ctrl+D'], ['Paste a screenshot or photo', 'Ctrl+V'],
      ['Delete', 'Del'], ['Move a little / a lot', 'Arrows / Shift+Arrows'], ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'],
      ['Bring forward / Send backward', '] / ['], ['Select all', 'Ctrl+A'], ['Zoom', 'Ctrl+wheel, Ctrl + / Ctrl -'], ['Fit page', 'Ctrl+0'],
      ['Pan around', 'Space+drag or middle mouse'], ['Edit badge text', 'Double-click the badge'], ['Save / Open', 'Ctrl+S / Ctrl+O'],
      ['Download image', 'Ctrl+E'], ['New design', 'Ctrl+N'], ['Text panel', 'T']];
    U.modal({ title: 'Keyboard shortcuts', body: `<table class="csv">${rows.map(r => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td></tr>`).join('')}</table>`,
      buttons: [{ label: 'Close', value: true, primary: true }] });
  }

  async function settingsDialog() {
    const inf = await API.getInfo(true);
    const g = h('input', { type: 'checkbox' }); g.checked = (inf.settings && inf.settings.use_gpu) !== false;
    const snap = h('input', { type: 'checkbox' }); snap.checked = !window.SNAP_OFF;
    const upd = h('input', { type: 'checkbox' }); upd.checked = !U.lsGet('eg_no_update_check');
    const body = h('div',
      h('label.check', g, 'Use graphics card for AI (Intel Iris Xe / NVIDIA / AMD)'),
      h('label.check', snap, 'Snap objects to page and each other'),
      h('label.check', upd, 'Check for updates when the app opens'),
      h('div.note', `Version ${esc(inf.build || inf.version)} · AI running on: ${esc(inf.device)} · Models: full ${inf.models.full ? '✓' : '✗ not downloaded'}, lite ${inf.models.lite ? '✓' : '✗ not downloaded'}`));
    const ok = await U.modal({ title: 'Settings', body, buttons: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, primary: true }] });
    if (!ok) return;
    window.SNAP_OFF = !snap.checked; U.lsSet('eg_snap_off', window.SNAP_OFF ? '1' : '');
    U.lsSet('eg_no_update_check', upd.checked ? '' : '1');
    await API.call('save_settings', { use_gpu: g.checked });
    U.toast('Settings saved', 'ok');
  }

  // ------------------------------------------------------------ projects
  function projectData() {
    const pages = PAGES.data();
    return { app: 'EG Studio', v: 2, name: $('#docName').value || 'Untitled design', width: pages[0].width, height: pages[0].height, pages, cur: PAGES.cur };
  }
  async function saveProject(as = false) {
    const d = projectData();
    const json = JSON.stringify(d);
    if (!API.native()) {
      U.downloadDataURL(d.name + '.egs', URL.createObjectURL(new Blob([json], { type: 'application/json' })));
      dirty = false; updateTitle(); return;
    }
    let p = docPath;
    if (!p || as) {
      p = await API.call('pick_save', d.name + '.egs', ['EG Studio project (*.egs)']);
      if (!p) return;
      if (!/\.egs$/i.test(p)) p += '.egs';
    }
    U.busy('Saving…');
    try {
      await API.call('write_text', p, json);
      docPath = p;
      const thumb = await E.thumbnail(220);
      await API.call('add_recent', p, d.name, thumb);
    } finally { U.busy(false); }
    dirty = false; updateTitle();
    U.toast('Project saved', 'ok');
  }
  async function openProject() {
    if (API.native()) {
      const p = await API.call('pick_file', ['EG Studio project (*.egs)', 'All files (*.*)']);
      if (p) await openPath(p);
    } else $('#projInput').click();
  }
  async function openPath(p) {
    U.busy('Opening…');
    try {
      const text = await API.call('read_text', p);
      if (!text) throw new Error('File not found');
      await openDoc(JSON.parse(text), p);
    } catch (e) { U.busy(false); U.alert('Could not open', esc(e.message || e)); }
    finally { U.busy(false); }
  }
  async function openDoc(d, path) {
    if (!d || !(d.canvas || d.pages)) throw new Error('Not an EG Studio project');
    await PAGES.loadAll(d.pages || [d], d.cur || 0);
    docPath = path || '';
    $('#docName').value = d.name || 'Untitled design';
    hideHome();
    dirty = false; updateTitle();
  }

  const autosave = U.debounce(async () => {
    try {
      const d = projectData(); d.path = docPath;
      await API.call('autosave', JSON.stringify(d), await E.thumbnail(160));
      $('#saveState').textContent = docPath ? (dirty ? 'Unsaved changes (backed up)' : 'Saved') : 'Backed up';
    } catch (e) { /* ignore */ }
  }, 2500);

  function updateTitle() {
    $('#docSize').textContent = `${E.W} × ${E.H}`;
    $('#saveState').textContent = dirty ? 'Unsaved changes' : (docPath ? 'Saved' : '');
  }

  // ------------------------------------------------------------ drag & drop / paste
  async function addFiles(files, at) {
    const imgs = [...files].filter(f => f.type.startsWith('image/'));
    const proj = [...files].find(f => /\.egs$|\.json$/i.test(f.name));
    if (proj) { try { await openDoc(JSON.parse(await proj.text()), ''); } catch (e) { U.alert('Could not open', esc(e.message)); } return; }
    let target = at ? E.canvas.findTarget(at) : null;
    if (target && !(target.role === 'product' || target.egType === 'placeholder')) target = null;
    for (const f of imgs) {
      let src = await U.fileToDataURL(f);
      if (API.native() && f.size > 6e6) { /* very large photos: let Python downscale */ }
      src = await downscale(src, 4096);
      PANELS.addUpload(src, f.name.replace(/\.[^.]+$/, ''), false);
      if (target) {
        const img = await fabric.FabricImage.fromURL(src);
        img.set({ name: f.name, srcOriginal: src });
        E.replaceWithImage(target, img);
        target = null;
      } else await E.addImage(src, { name: f.name.replace(/\.[^.]+$/, '') });
    }
  }
  async function downscale(src, max) {
    const im = await U.loadImg(src);
    if (Math.max(im.width, im.height) <= max) return src;
    const s = max / Math.max(im.width, im.height);
    const c = h('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL(src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.95);
  }

  function setupDnD() {
    const stage = $('#stage');
    let depth = 0;
    stage.addEventListener('dragenter', e => { e.preventDefault(); depth++; $('#dropHint').classList.add('show'); });
    stage.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('#dropHint').classList.remove('show'); } });
    stage.addEventListener('dragover', e => e.preventDefault());
    stage.addEventListener('drop', async e => {
      e.preventDefault(); depth = 0; $('#dropHint').classList.remove('show');
      const up = e.dataTransfer.getData('text/eg-upload');
      if (up) {
        const u = await PANELS.getUpload(up);
        let target = E.canvas.findTarget(e);
        if (u) {
          if (target && (target.role === 'product' || target.egType === 'placeholder')) {
            const img = await fabric.FabricImage.fromURL(u.src); img.set({ name: u.name, srcOriginal: u.src }); E.replaceWithImage(target, img);
          } else await E.addImage(u.src, { name: u.name });
        }
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length) await addFiles(e.dataTransfer.files, e);
    });
    $('#fileInput').addEventListener('change', async e => { if (e.target.onchange) return; await addFiles(e.target.files); e.target.value = ''; });
    $('#projInput').addEventListener('change', async e => { const f = e.target.files[0]; if (f) await addFiles([f]); e.target.value = ''; });
    document.addEventListener('paste', async e => {
      if (E.isTyping()) return;
      const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); await addFiles(files); }
      else E.paste();
    });
  }

  // ------------------------------------------------------------ shortcuts
  function setupKeys() {
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (!$('#modal').classList.contains('hidden')) { if (k === 'escape') U.closeModal(null); return; }
      if (ctrl && k === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
      if (ctrl && k === 'o') { e.preventDefault(); openProject(); return; }
      if (ctrl && k === 'e') { e.preventDefault(); exportDialog(); return; }
      if (ctrl && k === 'n') { e.preventDefault(); showHome(); return; }
      if (E.isTyping()) return;
      if (!$('#home').classList.contains('hidden')) return;
      const nudge = e.shiftKey ? 10 : 1;
      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); E.history.undo(); }
      else if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) { e.preventDefault(); E.history.redo(); }
      else if (ctrl && k === 'c') { E.copy(); }
      else if (ctrl && k === 'd') { e.preventDefault(); E.duplicate(); }
      else if (ctrl && k === 'a') { e.preventDefault(); E.selectAll(); }
      else if (ctrl && k === 'g' && !e.shiftKey) { e.preventDefault(); E.group(); }
      else if (ctrl && k === 'g' && e.shiftKey) { e.preventDefault(); E.ungroup(); }
      else if (ctrl && (k === '=' || k === '+')) { e.preventDefault(); E.setZoom(E.getZoom() * 1.2, null, false); }
      else if (ctrl && k === '-') { e.preventDefault(); E.setZoom(E.getZoom() / 1.2, null, false); }
      else if (ctrl && k === '0') { e.preventDefault(); E.fit(); }
      else if (k === 'delete' || k === 'backspace') { e.preventDefault(); E.remove(); }
      else if (k === 'arrowleft') { e.preventDefault(); E.nudge(-nudge, 0); }
      else if (k === 'arrowright') { e.preventDefault(); E.nudge(nudge, 0); }
      else if (k === 'arrowup') { e.preventDefault(); E.nudge(0, -nudge); }
      else if (k === 'arrowdown') { e.preventDefault(); E.nudge(0, nudge); }
      else if (k === 'escape') { E.canvas.discardActiveObject(); E.canvas.requestRenderAll(); U.closePop(); }
      else if (k === '[') E.order(e.ctrlKey ? 'back' : 'down');
      else if (k === ']') E.order(e.ctrlKey ? 'front' : 'up');
      else if (k === 't') PANELS.show('text');
    });
  }

  // ------------------------------------------------------------ right-click menu
  function setupContextMenu() {
    E.canvas.on('mouse:down', opt => {
      if (opt.e.button !== 2) return;
      const t = opt.target;
      if (t && t.role !== 'background' && !E.activeList().includes(t)) E.select(t);
      const a = E.active();
      const anchor = h('div', { style: { position: 'fixed', left: opt.e.clientX + 'px', top: opt.e.clientY + 'px', width: '1px', height: '1px' } });
      document.body.append(anchor);
      const item = (ic, label, fn, kbd = '') => h('button', { onclick: () => { U.closePop(); fn(); } , html: icon(ic) + `<span>${label}</span>` + (kbd ? `<kbd>${kbd}</kbd>` : '') });
      const box = h('div.menu.open', { style: { position: 'static', display: 'block', boxShadow: 'none', border: 0, padding: 0, minWidth: '220px' } });
      if (a) {
        box.append(item('copy', 'Copy', () => E.copy(), 'Ctrl+C'), item('clipboard-paste', 'Paste', () => E.paste(), 'Ctrl+V'),
          item('copy-plus', 'Duplicate', () => E.duplicate(), 'Ctrl+D'), item('trash-2', 'Delete', () => E.remove(), 'Del'), h('hr'),
          item('bring-to-front', 'Bring to front', () => E.order('front'), 'Ctrl+]'), item('send-to-back', 'Send to back', () => E.order('back'), 'Ctrl+['),
          item(a.egLocked ? 'lock-open' : 'lock', a.egLocked ? 'Unlock' : 'Lock', () => E.toggleLock()));
        if (a.type === 'activeselection') box.append(item('group', 'Group', () => E.group(), 'Ctrl+G'));
        if (a.type === 'group') box.append(item('ungroup', 'Ungroup', () => E.ungroup(), 'Ctrl+Shift+G'));
        if (a.type === 'image' && !a.bgRemoved) box.append(h('hr'), item('scissors', 'Remove background', () => FX.removeBg(a)));
      } else {
        box.append(item('clipboard-paste', 'Paste', () => E.paste(), 'Ctrl+V'), item('upload', 'Add photo…', () => PANELS.pickImages()),
          item('type', 'Add text', () => PANELS.show('text')), item('frame', 'Resize design…', resizeDialog));
      }
      const pop = U.popover(anchor, box, { onClose: () => anchor.remove() });
      pop.style.padding = '6px';
    });
  }

  // ------------------------------------------------------------ init
  async function init() {
    U.hydrateIcons();
    window.SNAP_OFF = !!U.lsGet('eg_snap_off');
    await FONTS.preloadAll();
    E.init();
    PANELS.init();
    CTX.init();
    PAGES.init();
    PAGES.reset();
    setupDnD();
    setupKeys();
    setupContextMenu();

    // top bar
    $('#btnHome').onclick = () => showHome();
    $('#btnUndo').onclick = () => E.history.undo();
    $('#btnRedo').onclick = () => E.history.redo();
    $('#btnExport').onclick = exportDialog;
    $('#btnBulk').onclick = () => GEN.open();
    const menu = $('#menuFile');
    $('#btnFile').onclick = e => { e.stopPropagation(); menu.classList.toggle('open'); };
    document.addEventListener('click', () => menu.classList.remove('open'));
    menu.onclick = e => {
      const a = e.target.closest('button'); if (!a) return;
      menu.classList.remove('open');
      ({ new: showHome, open: openProject, save: () => saveProject(false), saveas: () => saveProject(true),
        resize: resizeDialog, export: exportDialog, settings: settingsDialog, keys: shortcutsDialog, update: () => UPD.check({ silent: false }) })[a.dataset.act]();
    };
    $('#docName').addEventListener('change', () => { dirty = true; updateTitle(); autosave(); });
    $$('[data-home]').forEach(b => b.onclick = async () => {
      const a = b.dataset.home;
      if (a === 'open') openProject();
      if (a === 'bgtool') GEN.bgTool();
      if (a === 'bulk') { hideHome(); GEN.open(); }
    });

    // zoom controls
    const zr = $('#zoomRange');
    E.on('zoom', z => { $('#zoomLabel').textContent = Math.round(z * 100) + '%'; zr.value = Math.round(z * 100); });
    zr.oninput = () => E.setZoom(zr.value / 100, null, false);
    $('#zoomIn').onclick = () => E.setZoom(E.getZoom() * 1.2, null, false);
    $('#zoomOut').onclick = () => E.setZoom(E.getZoom() / 1.2, null, false);
    $('#zoomFit').onclick = () => E.fit();

    E.on('change', why => {
      if (why === 'placeholder-click') return;
      if (why === 'edit' || why === 'history') { dirty = true; }
      updateTitle();
      autosave();
    });
    E.on('change', (why, t) => { if (why === 'placeholder-click') CTX.replaceImage(t); });
    E.canvas.on('mouse:move', () => {});
    window.addEventListener('beforeunload', e => { if (dirty) { autosave(); } });

    API.getInfo().then(i => API.setDevice(i.device === 'CPU' && !i.models.full && !i.models.lite ? 'ready' : i.device)).catch(() => {});
    showHome();
    setTimeout(() => UPD.check({ silent: true }), 4000);
  }

  return { init, showHome, newDesign, resizeDialog, exportDialog, saveProject, openProject, openDoc, SIZES };
})();

window.addEventListener('DOMContentLoaded', () => MAIN.init().catch(e => { console.error(e); U.alert('Startup error', U.esc(e.stack || e)); }));
