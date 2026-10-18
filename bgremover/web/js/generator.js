/* Bulk listing generator + batch background remover. */
window.GEN = (() => {
  const { $, h, icon, esc } = U;

  // ------------------------------------------------------------ CSV
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const clean = rows.filter(r => r.some(x => x.trim()));
    if (!clean.length) return { cols: [], rows: [] };
    const cols = clean[0].map(c => c.trim());
    return { cols, rows: clean.slice(1).map(r => Object.fromEntries(cols.map((c, i) => [c, (r[i] || '').trim()]))) };
  }

  const baseName = p => (p.split(/[\\/]/).pop() || '').replace(/\.[^.]+$/, '');
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'image';

  // ------------------------------------------------------------ state
  const st = { items: [], csv: null, map: {}, outdir: '', removeBg: true, format: 'jpg', size: 1, naming: 'name', shrink: true, preview: [] };

  function textObjects(doc) {
    const out = [];
    const walk = (o, path) => {
      if (o.egType === 'placeholder') return;
      const ty = String(o.type || '').toLowerCase();
      if ((ty === 'textbox' || ty === 'i-text' || ty === 'itext' || ty === 'text') && o.id) out.push({ id: o.id, text: o.text, path });
      (o.objects || []).forEach((c, i) => walk(c, path.concat(i)));
    };
    doc.canvas.objects.forEach((o, i) => walk(o, [i]));
    return out;
  }
  const varsIn = texts => [...new Set(texts.flatMap(t => [...(t.text || '').matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(m => m[1])))];

  // ------------------------------------------------------------ open
  async function open() {
    const doc = E.toJSON();
    const slots = doc.canvas.objects.filter(o => o.role === 'product');
    if (!slots.length) {
      const ok = await U.modal({ title: 'Bulk listing generator',
        body: `<p>First design <b>one</b> listing image to use as the template.</p>
        <p class="muted">The generator needs to know where each product photo goes. Either:</p>
        <ul class="muted"><li>use a <b>template</b> (they all have a product slot), or</li>
        <li>select a photo on your design and click <b>Set as product</b> in the toolbar.</li></ul>`,
        buttons: [{ label: 'Close', value: false }, { label: 'Browse templates', value: true, primary: true }] });
      if (ok) PANELS.show('templates');
      return;
    }
    const texts = textObjects(doc);
    const body = h('div.gen-steps');
    const left = h('div'), right = h('div');
    body.append(left, right);

    // ---- products
    const count = h('div.muted.small');
    const list = h('div.gen-list');
    const refreshList = () => {
      count.textContent = st.items.length ? `${st.items.length} product photo(s)` : 'No photos chosen yet';
      list.innerHTML = '';
      st.items.slice(0, 200).forEach((it, i) => {
        const row = rowFor(it, i);
        list.append(h('div', h('span', it.name), h('span.muted', row ? (row[st.map.__title] || '') : '')));
      });
    };
    const pickBtns = h('div', { style: { display: 'flex', gap: '6px', margin: '6px 0' } },
      h('button.tb-btn', { onclick: async () => { await pickItems(false); refreshList(); } }, h('span', { html: icon('images') }), 'Choose photos'),
      API.native() ? h('button.tb-btn', { onclick: async () => { await pickItems(true); refreshList(); } }, h('span', { html: icon('folder-open') }), 'Choose folder') : '',
      h('button.tb-btn', { onclick: () => { st.items = []; refreshList(); } }, 'Clear'));
    left.append(h('div.sec-title', '1 · Product photos'), pickBtns, count, list);

    // ---- data
    const csvInfo = h('div.muted.small', st.csv ? `${st.csv.rows.length} rows · columns: ${st.csv.cols.join(', ')}` : 'Optional: a CSV with product names, prices etc. (Excel → Save As → CSV)');
    const mapBox = h('div');
    const drawMap = () => {
      mapBox.innerHTML = '';
      if (!st.csv) return;
      const vars = varsIn(texts);
      if (vars.length) mapBox.append(h('div.field', h('label', 'Placeholders found in your text'), h('div.vars', vars.map(v => h('code', `{{${v}}}`)))));
      mapBox.append(h('div.field', h('label', 'Or replace whole text boxes with a column:')));
      texts.forEach(t => {
        const sel = h('select.sel', { style: { width: '100%' } }, h('option', { value: '' }, 'Keep as designed'), st.csv.cols.map(c => h('option', { value: c }, 'Column: ' + c)));
        sel.value = st.map[t.id] || '';
        sel.onchange = () => { st.map[t.id] = sel.value; if (!st.map.__title) st.map.__title = sel.value; refreshList(); };
        mapBox.append(h('div', { style: { margin: '4px 0' } }, h('div.small', { style: { marginBottom: '2px' } }, '“' + (t.text || '').slice(0, 40) + '”'), sel));
      });
      const match = h('div.note', `Rows are matched to photos by file name (column ${guessFileCol() ? '“' + guessFileCol() + '”' : 'image/file/photo'}) or, if there's no such column, in order.`);
      mapBox.append(match);
    };
    left.append(h('div.sec-title', '2 · Product details (optional)'),
      h('button.tb-btn', { onclick: async () => { await pickCSV(); csvInfo.textContent = st.csv ? `${st.csv.rows.length} rows · columns: ${st.csv.cols.join(', ')}` : ''; drawMap(); refreshList(); } }, h('span', { html: icon('table-2') }), 'Choose CSV file'),
      csvInfo, mapBox);

    // ---- options
    const ck = (label, key) => { const i = h('input', { type: 'checkbox' }); i.checked = st[key]; i.onchange = () => st[key] = i.checked; return h('label.check', i, label); };
    const fmt = h('div.seg');
    const drawFmt = () => { fmt.innerHTML = ''; [['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']].forEach(([v, l]) => fmt.append(h('button' + (st.format === v ? '.on' : ''), { onclick: () => { st.format = v; drawFmt(); } }, l))); };
    drawFmt();
    const size = h('div.seg');
    const drawSize = () => { size.innerHTML = ''; [[1, `${E.W}px`], [1.5, '1.5×'], [2, '2×']].forEach(([v, l]) => size.append(h('button' + (st.size === v ? '.on' : ''), { onclick: () => { st.size = v; drawSize(); } }, l))); };
    drawSize();
    const naming = h('select.sel', { style: { width: '100%' } }, h('option', { value: 'name' }, 'Same as photo file name'), h('option', { value: 'title' }, 'From product name column'), h('option', { value: 'number' }, 'Numbered (listing-001)'));
    naming.value = st.naming; naming.onchange = () => st.naming = naming.value;
    const out = h('div.muted.small', st.outdir || (API.native() ? 'A “listings” folder next to the photos' : 'Images will download'));
    const q = FX.aiOpts().quality;
    right.append(h('div.sec-title', '3 · Options'),
      ck(`Remove background (AI, ${q})`, 'removeBg'),
      ck('Shrink long text to fit its box', 'shrink'),
      h('div.field', h('label', 'Format'), fmt),
      h('div.field', h('label', 'Size'), size),
      h('div.field', h('label', 'File names'), naming),
      h('div.field', h('label', 'Save to'), out,
        API.native() ? h('button.chip-btn', { style: { marginTop: '6px' }, onclick: async () => { const d = await API.call('pick_folder'); if (d) { st.outdir = d; out.textContent = d; } } }, 'Change folder') : ''),
      h('div.sec-title', 'Preview'), h('div.gen-preview#genPrev'));

    refreshList(); drawMap();
    const res = await U.modal({ title: 'Bulk listing generator', body, wide: true, buttons: [
      { label: 'Close', value: null },
      { label: 'Preview 3', onClick: async () => { await run(doc, 3, true); return false; } },
      { label: 'Generate all', primary: true, value: 'go' },
    ] });
    if (res === 'go') await run(doc, Infinity, false);
  }

  function guessFileCol() {
    if (!st.csv) return null;
    return st.csv.cols.find(c => /^(image|file|photo|filename|picture|img|sku)$/i.test(c)) || null;
  }
  function rowFor(it, i) {
    if (!st.csv) return null;
    const fc = guessFileCol();
    if (fc) {
      const n = it.name.toLowerCase();
      const r = st.csv.rows.find(r => (r[fc] || '').toLowerCase().replace(/\.[^.]+$/, '') === n || baseName(r[fc] || '').toLowerCase() === n);
      if (r) return r;
    }
    return st.csv.rows[i] || null;
  }

  async function pickItems(folder) {
    if (API.native()) {
      let paths = [];
      if (folder) { const d = await API.call('pick_folder'); if (d) paths = await API.call('list_images', d, false); }
      else paths = await API.call('pick_images', true);
      (paths || []).forEach(p => { if (!st.items.find(x => x.path === p)) st.items.push({ path: p, name: baseName(p) }); });
    } else {
      const files = await new Promise(res => { const i = $('#fileInput'); i.onchange = () => { res([...i.files]); i.value = ''; i.onchange = null; }; i.click(); });
      files.forEach(f => st.items.push({ file: f, name: f.name.replace(/\.[^.]+$/, '') }));
    }
    st.items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  async function pickCSV() {
    let text = '';
    if (API.native()) {
      const p = await API.call('pick_file', ['CSV files (*.csv;*.txt)', 'All files (*.*)']);
      if (!p) return;
      text = await API.call('read_text', p);
    } else {
      const f = await new Promise(res => { const i = h('input', { type: 'file', accept: '.csv,.txt' }); i.onchange = () => res(i.files[0]); i.click(); });
      if (!f) return; text = await f.text();
    }
    st.csv = parseCSV(text.replace(/^﻿/, ''));
    st.map = {};
  }

  async function loadSrc(it) {
    if (it.path) { const r = await API.call('read_image', it.path, 3000); if (!r.ok) throw new Error(r.error); return r.data; }
    return U.fileToDataURL(it.file);
  }

  // ------------------------------------------------------------ run
  let cancelled = false;
  async function run(doc, limit, preview) {
    if (!st.items.length) { U.toast('Choose some product photos first'); return; }
    if (st.removeBg && !(await API.ensureModel(FX.aiOpts().quality))) return;
    const items = st.items.slice(0, limit);
    cancelled = false;
    const prev = $('#genPrev');
    if (preview && prev) prev.innerHTML = '';
    let ok = 0; const errors = [];
    const t0 = Date.now();
    U.busy('Starting…', 0, () => { cancelled = true; API.call('cancel_batch'); U.busyUpdate('Stopping after this one…'); });
    try {
      for (let i = 0; i < items.length; i++) {
        if (cancelled) break;
        const it = items[i];
        const eta = i ? Math.round((Date.now() - t0) / i * (items.length - i) / 1000) : null;
        U.busyUpdate(`${i + 1}/${items.length} · ${it.name}${eta ? ` · about ${eta}s left` : ''}`, i / items.length);
        try {
          let src = await loadSrc(it);
          let cut = false;
          if (st.removeBg) {
            const r = await API.call('remove_bg', src, FX.aiOpts());
            if (!r.ok) throw new Error(r.error || 'background removal failed');
            src = r.data; cut = true; API.setDevice(r.device);
          }
          const row = rowFor(it, i);
          const url = await E.renderDoc(doc, {
            format: preview ? 'jpeg' : st.format, quality: 0.92, multiplier: preview ? 0.35 : st.size,
            mutate: sc => fillDesign(sc, src, cut, row, it),
          });
          if (preview) { prev && prev.append(h('img', { src: url })); }
          else await save(url, it, row, i);
          ok++;
        } catch (e) {
          console.error(e); errors.push(`${it.name}: ${e.message || e}`);
        }
      }
    } finally { U.busy(false); }
    if (!preview) {
      const where = st.outdir || (API.native() ? lastDir : 'your downloads');
      const btns = [{ label: 'Close', value: false }];
      if (API.native() && where) btns.push({ label: 'Open folder', value: true, primary: true });
      const r = await U.modal({ title: 'Done', body: `<p>Created <b>${ok}</b> listing image(s)${cancelled ? ' (stopped early)' : ''}.</p>
        ${where ? `<p class="muted small">Saved to ${esc(where)}</p>` : ''}
        ${errors.length ? `<div class="note">${errors.slice(0, 10).map(esc).join('<br>')}</div>` : ''}`, buttons: btns });
      if (r && where) API.call('open_path', where);
    } else if (errors.length) U.toast(errors[0], 'err', 6000);
  }

  let lastDir = '';
  async function save(url, it, row, i) {
    const ext = st.format === 'jpg' ? 'jpg' : st.format;
    let name = it.name;
    if (st.naming === 'number') name = `listing-${String(i + 1).padStart(3, '0')}`;
    if (st.naming === 'title' && row && st.map.__title && row[st.map.__title]) name = row[st.map.__title];
    name = safeName(name) + '.' + ext;
    if (API.native()) {
      const dir = st.outdir || (it.path ? it.path.replace(/[\\/][^\\/]*$/, '') + (it.path.includes('\\') ? '\\' : '/') + 'listings' : '');
      lastDir = dir;
      await API.call('save_data_url', await API.call('join', dir, name), url);
    } else {
      U.downloadDataURL(name, url);
      await U.sleep(250);
    }
  }

  // put the product photo + texts into an off-screen copy of the design
  async function fillDesign(sc, src, cut, row, it) {
    const objs = sc.getObjects();
    const slot = objs.find(o => o.role === 'product');
    if (slot) {
      let url = src;
      if (cut && slot.type === 'image' && slot.outline && slot.outline.w > 0) url = (await FX.makeOutline(src, slot.outline.w, slot.outline.color)).url;
      const img = await fabric.FabricImage.fromURL(url);
      const b = slot.getBoundingRect();
      const s = Math.min(b.width / img.width, b.height / img.height);
      img.set({ originX: 'center', originY: 'center', left: b.left + b.width / 2, top: b.top + b.height / 2, scaleX: s, scaleY: s, role: 'product' });
      if (slot.shadow) {
        const k = (slot.scaleX || 1) / s, sh = slot.shadow;
        img.shadow = new fabric.Shadow({ color: sh.color, blur: sh.blur * k, offsetX: sh.offsetX * k, offsetY: sh.offsetY * k });
      }
      if (slot.adjust && slot.type === 'image') { img.adjust = slot.adjust; FX.applyAdjust(img); }
      const idx = objs.indexOf(slot);
      sc.remove(slot);
      sc.insertAt(idx, img);
    }
    // texts
    const vars = { name: it.name, ...(row || {}) };
    const walk = o => {
      if (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text') {
        const h0 = o.height;
        let t = o.text;
        if (o.id && st.map[o.id] && row && row[st.map[o.id]] != null) t = row[st.map[o.id]];
        t = t.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => {
          const key = Object.keys(vars).find(x => x.toLowerCase() === k.toLowerCase());
          return key != null ? vars[key] : '';
        });
        if (t !== o.text) {
          o.set('text', t); o.initDimensions();
          if (st.shrink && o.type === 'textbox') {
            let guard = 40;
            while (o.height > h0 * 1.05 && o.fontSize > 8 && guard--) { o.set('fontSize', o.fontSize * 0.93); o.initDimensions(); }
          }
        }
      }
      (o._objects || []).forEach(walk);
    };
    sc.getObjects().forEach(walk);
  }

  // ------------------------------------------------------------ batch BG tool
  const bg = { items: [], output: 'Transparent PNG', outdir: '' };
  async function bgTool() {
    if (!API.native()) {
      U.alert('Batch background removal', 'In the browser preview, use Uploads + “Remove background” per image. The desktop app processes whole folders.');
      return;
    }
    const body = h('div');
    const list = h('div.gen-list');
    const count = h('div.muted.small');
    const draw = () => { count.textContent = `${bg.items.length} file(s)`; list.innerHTML = ''; bg.items.forEach(p => list.append(h('div', h('span', baseName(p))))); };
    body.append(h('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } },
      h('button.tb-btn', { onclick: async () => { const p = await API.call('pick_images', true); (p || []).forEach(x => !bg.items.includes(x) && bg.items.push(x)); draw(); } }, h('span', { html: icon('images') }), 'Add photos'),
      h('button.tb-btn', { onclick: async () => { const d = await API.call('pick_folder'); if (d) (await API.call('list_images', d, false)).forEach(x => !bg.items.includes(x) && bg.items.push(x)); draw(); } }, h('span', { html: icon('folder-open') }), 'Add folder'),
      h('button.tb-btn', { onclick: () => { bg.items = []; draw(); } }, 'Clear')), count, list);
    const outSel = h('select.sel', { style: { width: '100%' } }, ['Transparent PNG', 'White background JPG', 'White square (marketplace)'].map(o => h('option', { value: o }, o)));
    outSel.value = bg.output; outSel.onchange = () => bg.output = outSel.value;
    const od = h('div.muted.small', bg.outdir || 'A “nobg” folder next to each photo');
    const q = h('div.seg');
    const drawQ = () => { q.innerHTML = ''; ['Fast', 'Balanced', 'Best'].forEach(x => q.append(h('button' + (FX.aiOpts().quality === x ? '.on' : ''), { onclick: () => { FX.setAiOpts({ quality: x }); drawQ(); } }, x))); };
    drawQ();
    body.append(h('div.field', h('label', 'Quality'), q), h('div.field', h('label', 'Output'), outSel),
      h('div.field', h('label', 'Save to'), od, h('button.chip-btn', { style: { marginTop: '6px' }, onclick: async () => { const d = await API.call('pick_folder'); if (d) { bg.outdir = d; od.textContent = d; } } }, 'Change folder')));
    draw();
    const go = await U.modal({ title: 'Remove backgrounds (batch)', body, buttons: [{ label: 'Close', value: false }, { label: 'Start', value: true, primary: true }] });
    if (!go || !bg.items.length) return;
    const opts = { ...FX.aiOpts(), output: bg.output };
    if (!(await API.ensureModel(opts.quality))) return;
    const r = await API.withProgress(API.call('batch_remove', bg.items, bg.outdir, opts), 'Removing backgrounds…', { cancel: () => API.call('cancel_batch') });
    if (r.need_model) return;
    const dir = bg.outdir || (r.done[0] ? r.done[0].replace(/[\\/][^\\/]*$/, '') : '');
    const again = await U.modal({ title: 'Done', body: `<p>Processed <b>${r.done.length}</b> image(s) on ${esc(r.device)}.</p>${r.errors.length ? `<div class="note">${r.errors.map(esc).join('<br>')}</div>` : ''}`,
      buttons: [{ label: 'Close', value: false }, ...(dir ? [{ label: 'Open folder', value: true, primary: true }] : [])] });
    if (again) API.call('open_path', dir);
  }

  return { open, bgTool, parseCSV, fillDesign, st };
})();
