/* Left side panels: templates, elements, text, uploads, background, AI tools, layers. */
window.PANELS = (() => {
  const { $, $$, h, icon } = U;
  let current = 'templates';
  const uploads = []; // {id, src, name}

  function show(name) {
    current = name;
    $$('#rail button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    $('#panel').classList.remove('collapsed');
    $('#panelTitle').textContent = ({ templates: 'Templates', elements: 'Elements', text: 'Text', uploads: 'Uploads',
      background: 'Background', tools: 'AI Tools', layers: 'Layers' })[name];
    const body = $('#panelBody');
    body.innerHTML = '';
    RENDER[name](body);
    U.hydrateIcons(body);
    setTimeout(() => E.canvas && (E.canvas.calcOffset(), window.dispatchEvent(new Event('resize'))), 0);
  }

  // ------------------------------------------------------------ templates
  async function renderTemplates(body) {
    body.append(h('div.note', 'Templates adapt to your page size. Your product photo is moved into the new layout automatically.'));
    const grid = h('div.grid2');
    body.append(grid);
    for (const t of TPL.LIST) {
      const img = h('img', { alt: t.name });
      const tile = h('div.tile.tpl-tile', { title: t.name, onclick: () => TPL.apply(t) }, img, h('div.cap', t.name));
      grid.append(tile);
      TPL.thumb(t, E.W, E.H).then(src => { img.src = src; tile.style.aspectRatio = `${E.W}/${E.H}`; });
    }
  }

  // ------------------------------------------------------------ elements
  let elColor = '#7c5cff';
  function shapeThumb(make) {
    try {
      const o = make(elColor);
      const svg = o.toSVG();
      const b = o.getBoundingRect();
      const pad = 10;
      return `<svg viewBox="${-b.width / 2 - pad} ${-b.height / 2 - pad} ${b.width + pad * 2} ${b.height + pad * 2}" xmlns="http://www.w3.org/2000/svg"><g transform="translate(${-o.left || 0},${-o.top || 0})">${svg}</g></svg>`;
    } catch (e) { return ''; }
  }
  function previewOf(make) {
    const o = make(elColor);
    o.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
    const el = o.toCanvasElement({ multiplier: 120 / Math.max(o.getScaledWidth(), o.getScaledHeight(), 1) });
    return el.toDataURL();
  }
  function renderElements(body) {
    const search = h('input.search', { placeholder: 'Search elements (sale, star, truck…)' });
    const list = h('div');
    body.append(search, list);
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = '';
      const match = s => !q || s.toLowerCase().includes(q);
      const sec = (title, items) => { if (items.length) list.append(h('div.sec-title', title), items.length > 0 ? h('div.grid4', items) : ''); };

      sec('Product helpers', [
        tileImg(previewOf(() => EL.productSlot(400, 400)), 'Product slot', () => E.add(EL.productSlot())),
        tileImg(previewOf(() => EL.floorShadow()), 'Floor shadow', () => { const f = EL.floorShadow(); E.add(f); }),
      ].filter((_, i) => match(['product slot placeholder', 'floor shadow'][i])));

      sec('Badges & stickers', EL.BADGES.filter(b => match(b.label + ' badge sticker')).map(b =>
        tileImg(previewOf(() => b.make()), b.label, () => E.add(b.make()))));

      sec('Shapes', EL.SHAPES.filter(s => match(s.label + ' shape')).map(s =>
        tileImg(previewOf(s.make), s.label, () => E.add(s.make(elColor)))));

      sec('Lines & arrows', EL.LINES.filter(s => match(s.label + ' line arrow')).map(s =>
        tileImg(previewOf(s.make), s.label, () => E.add(s.make(elColor)))));

      const icons = Object.keys(window.ICONS).filter(n => match(n + ' icon'));
      if (icons.length) {
        list.append(h('div.sec-title', 'Icons', h('span.muted.small', 'click to add')));
        const g = h('div.grid4');
        icons.forEach(n => {
          const t = h('div.tile.sq', { title: n, html: window.ICONS[n] });
          t.onclick = async () => { const o = await EL.makeIcon(n, '#111111'); if (o) E.add(o); };
          g.append(t);
        });
        list.append(g);
      }
      U.hydrateIcons(list);
    };
    const colorRow = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' } },
      h('span.muted.small', 'Shape colour'));
    const sw = h('button.swatch-btn', h('span', { style: { background: elColor } }));
    sw.onclick = () => U.colorPicker(sw, elColor, c => { elColor = c; sw.firstChild.style.background = c; }, { onClose: draw });
    sw.addEventListener('click', () => {});
    colorRow.append(sw, h('button.chip-btn', { onclick: draw }, 'Apply to previews'));
    body.insertBefore(colorRow, list);
    search.oninput = U.debounce(draw, 150);
    draw();
  }
  function tileImg(src, title, onclick) {
    return h('div.tile.sq', { title, onclick }, h('img', { src }));
  }

  // ------------------------------------------------------------ text
  function renderText(body) {
    body.append(h('button.big-btn', { onclick: () => addText('Your text here', { fontFamily: 'Poppins', fontWeight: 600, fontSize: 64 }) }, h('span', { html: icon('type') }), 'Add a text box'));
    EL.TEXT_STYLES.forEach(s => body.append(h('button.text-add', { style: { font: s.css }, onclick: () => addText(s.label.replace('Add ', '').replace(/^a /, '').replace(/^./, c => c.toUpperCase()), s.o) }, s.label)));
    body.append(h('div.sec-title', 'Font combinations'));
    const g = h('div.grid2');
    body.append(g);
    EL.TEXT_COMBOS.forEach(async c => {
      const tile = h('div.combo-tile', { title: c.label, onclick: () => EL.addTextCombo(c) });
      g.append(tile);
      const items = c.parts.map(p => EL.makeText(p.t, p.o));
      await FONTS.ensureForObjects(items);
      const doc = { width: 900, height: 560, canvas: { objects: [
        new fabric.Rect({ left: 0, top: 0, width: 900, height: 560, fill: c.id === 'neon' ? '#14001f' : '#ffffff', role: 'background' }).toObject(),
        ...items.map(t => { t.initDimensions(); const k = 900 / 1080; return t.set({ left: 450 + t.left, top: 120 + t.top }).toObject(E.PROPS); })] } };
      const src = await E.renderDoc(doc, { format: 'jpeg', multiplier: 0.4 });
      tile.append(h('img', { src }));
    });
    body.append(h('div.note', 'Tip: for bulk listings, type {{name}} or {{price}} in a text box and it will be filled from your product list.'));
  }
  async function addText(text, o) {
    const t = EL.makeText(text, o);
    await FONTS.ensure(t.fontFamily, t.fontWeight);
    t.initDimensions();
    E.add(t);
  }

  // ------------------------------------------------------------ uploads
  function renderUploads(body) {
    body.append(h('button.big-btn', { onclick: pickImages }, h('span', { html: icon('upload') }), 'Upload images'));
    if (!API.native()) body.append(h('div.note', 'You can also drag images onto the page, or paste with Ctrl+V.'));
    else body.append(h('div.note', 'You can also drag images onto the page, or paste with Ctrl+V.'));
    const grid = h('div.uploads-grid');
    body.append(grid);
    if (!uploads.length) grid.append(h('div.muted.small', { style: { gridColumn: '1/3', padding: '20px 0', textAlign: 'center' } }, 'No uploads yet'));
    uploads.forEach(u => {
      const del = h('button.del', { title: 'Remove from uploads', html: icon('x') });
      del.onclick = e => { e.stopPropagation(); uploads.splice(uploads.indexOf(u), 1); show('uploads'); };
      const t = h('div.tile', { title: u.name, onclick: () => E.addImage(u.src, { name: u.name }) }, h('img', { src: u.src }), del);
      t.draggable = true;
      t.ondragstart = e => e.dataTransfer.setData('text/eg-upload', u.id);
      grid.append(t);
    });
  }
  async function pickImages() {
    if (API.native()) {
      const paths = await API.call('pick_images', true);
      if (!paths || !paths.length) return;
      U.busy('Loading images…');
      try {
        for (const p of paths) {
          const r = await API.call('read_image', p, 4096);
          if (r.ok) addUpload(r.data, r.name, true);
        }
      } finally { U.busy(false); }
    } else {
      $('#fileInput').click();
    }
  }
  function addUpload(src, name, place = false) {
    const u = { id: U.uid(), src, name: name || 'Image' };
    uploads.unshift(u);
    if (current === 'uploads') show('uploads');
    if (place) return E.addImage(src, { name: u.name });
  }
  const getUpload = id => uploads.find(u => u.id === id);

  // ------------------------------------------------------------ background
  function renderBackground(body) {
    const bg = E.page();
    body.append(h('div.sec-title', 'Colour'));
    const cur = typeof bg.fill === 'string' ? bg.fill : '#ffffff';
    const sw = h('button.swatch-btn', { style: { width: '100%', height: '44px' } }, h('span', { style: { background: cur } }));
    sw.onclick = () => U.colorPicker(sw, cur, c => { E.setBackground(c); sw.firstChild.style.background = c; }, { allowNone: true, docColors: E.docColors() });
    body.append(sw);
    const quick = h('div.swatches', { style: { marginTop: '10px' } });
    ['#ffffff', '#f4f6fb', '#f5f0e6', '#111111', '#0f146d', '#ee4d2d', '#ffd400', '#ff2d55', '#00a86b', '#1e88ff', '#7c5cff', '#fe2c55', '#25f4ee', '#ffe3ef', '#e3f8ee', 'transparent']
      .forEach(c => quick.append(h('button', { title: c === 'transparent' ? 'Transparent' : c, style: { background: c === 'transparent' ? 'repeating-conic-gradient(#999 0 25%,#ddd 0 50%) 0 0/8px 8px' : c }, onclick: () => { E.setBackground(c); show('background'); } })));
    body.append(quick);

    body.append(h('div.sec-title', 'Gradients'));
    const gg = h('div.grid4');
    const GR = [['#6a3cff', '#00c2d1'], ['#ff2d55', '#ff7a00'], ['#ee4d2d', '#ff8a3d'], ['#070a14', '#16264a'], ['#fff0f6', '#ffe3ef'],
      ['#e0f7ff', '#ffffff'], ['#ffd400', '#ff7a00'], ['#14001f', '#3a0a3f'], ['#00a86b', '#b8f5d4'], ['#f5f0e6', '#e5dccb'], ['#2b4bff', '#d63bff'], ['#111111', '#555555']];
    GR.forEach(([a, b]) => gg.append(h('div.tile.sq', { style: { background: `linear-gradient(135deg,${a},${b})` }, onclick: () => setGradient(a, b, 135) })));
    body.append(gg);

    const g1 = h('input', { type: 'color', value: '#6a3cff' }), g2 = h('input', { type: 'color', value: '#00c2d1' });
    const ang = h('input', { type: 'range', min: 0, max: 360, value: 135, style: { flex: 1 } });
    const applyG = () => setGradient(g1.value, g2.value, +ang.value);
    [g1, g2].forEach(i => i.onchange = applyG); ang.onchange = applyG;
    body.append(h('div.color-row', g1, g2, ang));

    body.append(h('div.sec-title', 'Photo background'));
    body.append(h('button.big-btn.ghost', { onclick: setBgImage }, h('span', { html: icon('image') }), 'Use a photo as background'));
    const bgi = E.userObjects().find(o => o.role === 'bgimage');
    if (bgi) {
      body.append(U.slider('Blur', 0, 1, 0.01, (bgi.adjust && bgi.adjust.blur) || 0, (v, f) => FX.setAdjust(bgi, { blur: v }, f), v => Math.round(v * 100)));
      body.append(U.slider('Brightness', -0.6, 0.6, 0.01, (bgi.adjust && bgi.adjust.brightness) || 0, (v, f) => FX.setAdjust(bgi, { brightness: v }, f), v => Math.round(v * 100)));
      body.append(h('button.big-btn.ghost', { onclick: () => { E.canvas.remove(bgi); E.commit(); show('background'); } }, 'Remove photo background'));
    }
  }
  function setGradient(a, b, angle) {
    const W = E.W, H = E.H, r = angle * Math.PI / 180;
    E.setBackground(new fabric.Gradient({ type: 'linear', gradientUnits: 'pixels',
      coords: { x1: W / 2 - Math.cos(r) * W / 2, y1: H / 2 - Math.sin(r) * H / 2, x2: W / 2 + Math.cos(r) * W / 2, y2: H / 2 + Math.sin(r) * H / 2 },
      colorStops: [{ offset: 0, color: a }, { offset: 1, color: b }] }));
  }
  async function setBgImage(src) {
    if (typeof src !== 'string') {
      if (API.native()) {
        const p = await API.call('pick_images', false);
        if (!p || !p.length) return;
        const r = await API.call('read_image', p[0], 4096);
        if (!r.ok) return;
        src = r.data;
      } else {
        const f = await new Promise(res => { const i = $('#fileInput'); i.onchange = () => { res(i.files[0]); i.value = ''; i.onchange = null; }; i.click(); });
        if (!f) return;
        src = await U.fileToDataURL(f);
      }
    }
    const img = await fabric.FabricImage.fromURL(src);
    const s = Math.max(E.W / img.width, E.H / img.height);
    img.set({ role: 'bgimage', name: 'Background photo', selectable: false, evented: false, originX: 'center', originY: 'center', left: E.W / 2, top: E.H / 2, scaleX: s, scaleY: s });
    const old = E.userObjects().find(o => o.role === 'bgimage');
    E.withSilent(() => { if (old) E.canvas.remove(old); E.canvas.insertAt(1, img); });
    E.canvas.requestRenderAll();
    E.commit();
    show('background');
  }

  // ------------------------------------------------------------ AI tools
  function renderTools(body) {
    const o = FX.aiOpts();
    const sel = E.active();
    const isImg = sel && sel.type === 'image';
    body.append(h('div.sec-title', 'Remove background'));
    body.append(h('button.big-btn', { onclick: () => FX.removeBg(), disabled: !isImg }, h('span', { html: icon('scissors') }), isImg ? 'Remove background of selected image' : 'Select an image first'));
    const seg = h('div.seg');
    ['Fast', 'Balanced', 'Best'].forEach(q => seg.append(h('button' + (o.quality === q ? '.on' : ''), { onclick: () => { FX.setAiOpts({ quality: q }); show('tools'); } }, q)));
    body.append(h('div.field', h('label', 'Quality'), seg));
    body.append(h('div.note', 'Best reads the image at high resolution for hair, fur and fine edges. Fast is good for quick drafts.'));
    const ck = (label, key) => {
      const i = h('input', { type: 'checkbox' }); i.checked = o[key];
      i.onchange = () => FX.setAiOpts({ [key]: i.checked });
      return h('label.check', i, label);
    };
    body.append(ck('Snap edges to the real outline', 'edge_refine'), ck('Remove background colour from edges', 'decontaminate'), ck('Remove small stray bits', 'remove_specks'));

    body.append(h('div.sec-title', 'Batch tools'));
    body.append(h('button.big-btn.ghost', { onclick: () => GEN.bgTool() }, h('span', { html: icon('images') }), 'Remove backgrounds from many files'));
    body.append(h('button.big-btn.ghost', { onclick: () => GEN.open() }, h('span', { html: icon('files') }), 'Bulk listing generator'));
    body.append(h('div.sec-title', 'Graphics card'));
    const g = h('input', { type: 'checkbox' });
    API.getInfo().then(i => { g.checked = (i.settings && i.settings.use_gpu) !== false; });
    g.onchange = () => API.call('save_settings', { use_gpu: g.checked }).then(() => U.toast('Saved. Applies to the next AI job.'));
    body.append(h('label.check', g, 'Use GPU (Intel / NVIDIA / AMD) when available'));
  }

  // ------------------------------------------------------------ layers
  let dragId = null;
  function renderLayers(body) {
    const objs = E.userObjects().slice().reverse();
    const activeSet = new Set(E.activeList());
    if (!objs.length) { body.append(h('div.note', 'Nothing on the page yet.')); return; }
    objs.forEach(o => {
      const vis = h('button.icon-btn' + (o.visible ? '' : '.on'), { title: o.visible ? 'Hide' : 'Show', html: icon(o.visible ? 'eye' : 'eye-off') });
      vis.onclick = e => { e.stopPropagation(); o.visible = !o.visible; if (!o.visible) E.canvas.discardActiveObject(); E.canvas.requestRenderAll(); E.commit(); show('layers'); };
      const lk = h('button.icon-btn' + (o.egLocked ? '.on' : ''), { title: o.egLocked ? 'Unlock' : 'Lock', html: icon(o.egLocked ? 'lock' : 'lock-open') });
      lk.onclick = e => { e.stopPropagation(); E.toggleLock(o); show('layers'); };
      const th = h('div.thumb');
      try {
        const m = 80 / Math.max(o.getScaledWidth(), o.getScaledHeight(), 1);
        th.append(h('img', { src: o.toDataURL({ multiplier: Math.min(m, 1) }) }));
      } catch (e) { /* ignore */ }
      const label = o.type === 'textbox' ? (o.text || '').slice(0, 40) : o.name;
      const row = h('div.layer' + (activeSet.has(o) ? '.sel' : ''), { draggable: true }, th,
        h('div.nm', label, h('small', o.type === 'textbox' ? 'Text' : (o.role === 'product' ? 'Product' : (o.role === 'bgimage' ? 'Background photo' : ({ image: 'Image', group: 'Group', rect: 'Shape', circle: 'Shape', ellipse: 'Shape', triangle: 'Shape', polygon: 'Shape', path: 'Shape', line: 'Line' })[o.type] || 'Element')))), vis, lk);
      row.onclick = () => { if (o.selectable !== false && o.visible) E.select(o); };
      row.ondragstart = () => { dragId = o.id; };
      row.ondragover = e => { e.preventDefault(); row.classList.add('dragover'); };
      row.ondragleave = () => row.classList.remove('dragover');
      row.ondrop = e => {
        e.preventDefault(); row.classList.remove('dragover');
        const src = E.canvas.getObjects().find(x => x.id === dragId);
        if (!src || src === o) return;
        const to = E.canvas.getObjects().indexOf(o);
        E.canvas.moveObjectTo(src, Math.max(1, to));
        E.keepBgBottom(); E.canvas.requestRenderAll(); E.commit(); show('layers');
      };
      body.append(row);
    });
    body.append(h('div.note', 'Drag layers to reorder. Top of the list = front.'));
  }

  const RENDER = { templates: renderTemplates, elements: renderElements, text: renderText, uploads: renderUploads,
    background: renderBackground, tools: renderTools, layers: renderLayers };

  function init() {
    $$('#rail button').forEach(b => b.onclick = () => {
      if (b.dataset.panel === current && !$('#panel').classList.contains('collapsed')) { $('#panel').classList.add('collapsed'); b.classList.remove('active'); }
      else show(b.dataset.panel);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    });
    $('#btnPanelClose').onclick = () => { $('#panel').classList.add('collapsed'); $$('#rail button').forEach(b => b.classList.remove('active')); };
    const refreshLayers = U.debounce(() => { if (current === 'layers' && !$('#panel').classList.contains('collapsed')) show('layers'); }, 200);
    E.on('change', refreshLayers);
    E.on('selection', () => { refreshLayers(); if (current === 'tools') show('tools'); });
    show('templates');
  }

  const refresh = () => show(current);
  return { init, show, refresh, addUpload, getUpload, pickImages, setBgImage, get current() { return current; } };
})();
