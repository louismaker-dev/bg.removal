/* Context toolbar above the canvas: changes with what's selected. */
window.CTX = (() => {
  const { $, h, icon } = U;
  const bar = () => $('#ctxbar');
  const isText = o => o && (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');
  const isImg = o => o && o.type === 'image';
  const isPlaceholder = o => o && o.egType === 'placeholder';
  const R = () => E.canvas.requestRenderAll();

  const btn = (content, title, onclick, cls = '') => {
    const b = h('button.cx-btn' + cls, { title, onclick });
    if (typeof content === 'string' && content.startsWith('i:')) { b.classList.add('icon'); b.innerHTML = icon(content.slice(2)); }
    else b.innerHTML = content;
    return b;
  };
  const group = (...kids) => h('div.cx-group', kids);

  // apply a property to every selected text object (or the object itself)
  function setAll(o, props, commit = true) {
    const list = o.type === 'activeselection' ? o.getObjects() : [o];
    list.forEach(x => {
      // when text is being edited with a partial selection, style just that range
      if (isText(x) && x.isEditing && x.selectionStart !== x.selectionEnd) x.setSelectionStyles(props);
      else x.set(props);
      if (isText(x)) x.initDimensions();
      x.dirty = true; x.setCoords();
    });
    if (o.type === 'activeselection') o.setCoords();
    R();
    if (commit) E.commit();
  }

  function render(o) {
    const b = bar();
    b.innerHTML = '';
    if (!o) return renderPage(b);
    if (o.type === 'activeselection') return renderMulti(b, o);
    if (isPlaceholder(o)) renderPlaceholder(b, o);
    else if (isText(o)) renderText(b, o);
    else if (isImg(o)) renderImage(b, o);
    else if (o.type === 'group') renderGroup(b, o);
    else renderShape(b, o);
    renderCommon(b, o);
    U.hydrateIcons(b);
  }

  // ------------------------------------------------------------ page
  function renderPage(b) {
    const bg = E.page();
    const sw = h('button.swatch-btn', { title: 'Background colour' }, h('span', { style: { background: typeof bg.fill === 'string' ? bg.fill : '#888' } }));
    sw.onclick = () => U.colorPicker(sw, typeof bg.fill === 'string' ? bg.fill : '#ffffff', c => { E.setBackground(c); sw.firstChild.style.background = c; }, { allowNone: true, docColors: E.docColors() });
    b.append(group(h('span.cx-label', 'Page'), sw, btn(icon('frame') + 'Resize', 'Resize design', () => MAIN.resizeDialog()),
      btn(icon('layout-template') + 'Templates', 'Browse templates', () => PANELS.show('templates'))),
      group(btn(icon('upload') + 'Add photo', 'Upload images', () => PANELS.pickImages()),
        btn(icon('type') + 'Add text', 'Add text', () => PANELS.show('text'))),
      h('span.muted.small', { style: { marginLeft: '8px' } }, 'Tip: double-click a template’s product slot to add your photo'));
    U.hydrateIcons(b);
  }

  // ------------------------------------------------------------ text
  function renderText(b, o) {
    const font = h('select.sel.font-sel', { title: 'Font' });
    FONTS.all().forEach(f => font.append(h('option', { value: f, style: { fontFamily: `"${f}"` } }, f)));
    if (!FONTS.all().includes(o.fontFamily)) font.append(h('option', { value: o.fontFamily }, o.fontFamily));
    font.value = o.fontFamily;
    font.onchange = async () => { await FONTS.ensure(font.value, o.fontWeight); await FONTS.ensure(font.value, 400); setAll(o, { fontFamily: font.value }); };

    const size = h('input.num', { type: 'number', min: 4, max: 2000, value: Math.round(o.fontSize * (o.scaleY || 1)), title: 'Font size' });
    const applySize = v => { v = Math.max(4, v); o.set({ scaleX: 1, scaleY: 1 }); setAll(o, { fontSize: v }); size.value = v; };
    size.onchange = () => applySize(+size.value);
    const minus = btn('i:minus', 'Smaller', () => applySize(Math.round(+size.value * 0.9)));
    const plus = btn('i:plus', 'Bigger', () => applySize(Math.round(+size.value * 1.1)));

    const col = h('button.swatch-btn.text-sw', { title: 'Text colour' }, h('b', 'A'), h('span', { style: { background: typeof o.fill === 'string' ? o.fill : '#000' } }));
    col.onclick = () => U.colorPicker(col, o.fill, c => { setAll(o, { fill: c }, false); col.lastChild.style.background = c; }, { docColors: E.docColors(), onClose: () => E.commit() });

    const bold = btn('i:bold', 'Bold', () => setAll(o, { fontWeight: (+o.fontWeight >= 700 || o.fontWeight === 'bold') ? 400 : 800 }) || render(o), (+o.fontWeight >= 700 || o.fontWeight === 'bold') ? '.on' : '');
    const ital = btn('i:italic', 'Italic', () => setAll(o, { fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' }) || render(o), o.fontStyle === 'italic' ? '.on' : '');
    const und = btn('i:underline', 'Underline', () => setAll(o, { underline: !o.underline }) || render(o), o.underline ? '.on' : '');
    const strike = btn('i:strikethrough', 'Strikethrough (old price)', () => setAll(o, { linethrough: !o.linethrough }) || render(o), o.linethrough ? '.on' : '');
    const aligns = ['left', 'center', 'right'];
    const al = btn('i:align-' + (aligns.includes(o.textAlign) ? o.textAlign : 'center'), 'Alignment', () => { setAll(o, { textAlign: aligns[(aligns.indexOf(o.textAlign) + 1) % 3] }); render(o); });
    const caps = btn('<b style="font-size:12px">aA</b>', 'UPPERCASE / lowercase', () => {
      const t = o.text; setAll(o, { text: t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()) : t.toUpperCase() });
    });

    const spacing = btn(icon('sliders-horizontal') + 'Spacing', 'Letter spacing, line height, curve', e => {
      const box = h('div');
      box.append(U.slider('Letter spacing', -200, 1000, 10, o.charSpacing || 0, (v, f) => setAll(o, { charSpacing: v }, f)));
      box.append(U.slider('Line height', 0.6, 2.5, 0.05, o.lineHeight || 1.16, (v, f) => setAll(o, { lineHeight: v }, f), v => v.toFixed(2)));
      if (o.type === 'textbox') box.append(U.slider('Curve', -100, 100, 1, o.curve || 0, (v, f) => { FX.setCurve(o, v); if (f) E.commit(); }));
      U.popover(e.currentTarget, box);
    });
    const fx = btn(icon('sparkles') + 'Effects', 'Text effects', e => textEffects(e.currentTarget, o));
    b.append(group(font, minus, size, plus), group(col, bold, ital, und, strike, caps, al), group(spacing, fx));
  }

  function textEffects(anchor, o) {
    const box = h('div');
    box.append(h('h4', 'Style'));
    const g = h('div.preset-grid');
    const names = { none: 'None', shadow: 'Shadow', lift: 'Lift', outline: 'Outline', hollow: 'Hollow', neon: 'Neon', sticker: 'Sticker', highlight: 'Highlight' };
    Object.entries(names).forEach(([k, label]) => {
      const sample = h('span', { style: { fontWeight: 800, fontSize: '18px', fontFamily: 'Poppins' } }, 'Ab');
      const st = { shadow: 'text-shadow:2px 2px 3px #000a', lift: 'text-shadow:0 4px 10px #0009', outline: '-webkit-text-stroke:1.5px #000;color:#fff', hollow: '-webkit-text-stroke:1.2px #fff;color:transparent', neon: 'color:#25f4ee;text-shadow:0 0 8px #25f4ee', sticker: '-webkit-text-stroke:3px #fff;paint-order:stroke;color:#222', highlight: 'background:#ffe600;color:#111;padding:0 3px' }[k];
      if (st) sample.setAttribute('style', sample.getAttribute('style') + ';' + st);
      g.append(h('button', { onclick: () => { FX.textEffect(o, k); U.closePop(); render(E.active()); } }, h('div', sample, h('div', { style: { fontSize: '11px', marginTop: '4px' } }, label))));
    });
    box.append(g);
    // fine tuning
    if (o.strokeWidth) {
      box.append(h('h4', 'Outline'));
      box.append(U.slider('Thickness', 0, Math.max(40, o.fontSize * 0.3), 0.5, o.strokeWidth, (v, f) => setAll(o, { strokeWidth: v }, f)));
      const sc = h('button.swatch-btn', h('span', { style: { background: o.stroke || '#000' } }));
      sc.onclick = () => U.colorPicker(sc, o.stroke, c => { setAll(o, { stroke: c }); sc.firstChild.style.background = c; });
      box.append(h('div.row', h('label', 'Colour'), sc));
    }
    if (o.shadow) {
      box.append(h('h4', 'Shadow'));
      const s = o.shadow;
      const upd = (p, f) => { o.shadow = new fabric.Shadow({ color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY, ...p }); Object.assign(s, p); o.dirty = true; R(); if (f) E.commit(); };
      box.append(U.slider('Blur', 0, o.fontSize, 1, s.blur, (v, f) => upd({ blur: v }, f)));
      box.append(U.slider('Offset X', -o.fontSize / 2, o.fontSize / 2, 1, s.offsetX, (v, f) => upd({ offsetX: v }, f)));
      box.append(U.slider('Offset Y', -o.fontSize / 2, o.fontSize / 2, 1, s.offsetY, (v, f) => upd({ offsetY: v }, f)));
      const sc = h('button.swatch-btn', h('span', { style: { background: s.color } }));
      sc.onclick = () => U.colorPicker(sc, s.color, c => { upd({ color: c }, true); sc.firstChild.style.background = c; });
      box.append(h('div.row', h('label', 'Colour'), sc));
    }
    if (o.textBackgroundColor) {
      const sc = h('button.swatch-btn', h('span', { style: { background: o.textBackgroundColor } }));
      sc.onclick = () => U.colorPicker(sc, o.textBackgroundColor, c => { setAll(o, { textBackgroundColor: c }); sc.firstChild.style.background = c; });
      box.append(h('div.row', h('label', 'Highlight colour'), sc));
    }
    U.popover(anchor, box);
  }

  // ------------------------------------------------------------ image
  function renderImage(b, o) {
    const g1 = group();
    if (o.role !== 'bgimage') {
      if (!o.bgRemoved) g1.append(btn(icon('scissors') + 'Remove background', 'AI background removal', () => FX.removeBg(o), '.primary'));
      else g1.append(btn(icon('rotate-ccw') + 'Restore original', 'Bring the original background back', () => FX.restoreOriginal(o)));
    }
    g1.append(btn(icon('sliders-horizontal') + 'Adjust', 'Brightness, contrast, filters', e => adjustPop(e.currentTarget, o)));
    if (o.bgRemoved) {
      g1.append(btn(icon('scan') + 'Outline', 'Sticker outline around the cut-out', e => outlinePop(e.currentTarget, o)));
      g1.append(btn(icon('crop') + 'Trim', 'Trim empty space around the cut-out', () => trim(o)));
    }
    g1.append(btn(icon('crop') + 'Crop', 'Crop the photo', e => cropPop(e.currentTarget, o)));
    g1.append(btn(icon('blend') + 'Shadow', 'Drop shadow', e => shadowPop(e.currentTarget, o)));
    g1.append(btn(icon('square') + 'Frame', 'Rounded corners or a shape frame', e => {
      const box = h('div', h('h4', 'Shape'));
      const g = h('div.preset-grid');
      FX.MASKS.forEach(m => g.append(h('button' + (((o.adjust && o.adjust.mask) || 'none') === m ? '.on' : ''), { onclick: () => {
        o.adjust = { ...(o.adjust || {}), mask: m === 'none' ? undefined : m }; FX.applyRadius(o); R(); E.commit(); U.closePop(); } }, m[0].toUpperCase() + m.slice(1))));
      box.append(g, h('h4', 'Corners'), U.slider('Corner radius', 0, 50, 1, o.radius || 0, (v, f) => { o.radius = v; FX.applyRadius(o); R(); if (f) E.commit(); }, v => v + '%'));
      U.popover(e.currentTarget, box);
    }));
    const g2 = group(
      btn('i:flip-horizontal-2', 'Flip horizontal', () => E.flip('x')),
      btn('i:flip-vertical-2', 'Flip vertical', () => E.flip('y')),
      btn(icon('image') + 'Replace', 'Replace image, keep size & position', () => replaceImage(o)),
      btn(icon('package') + (o.role === 'product' ? 'Product slot ✓' : 'Set as product'), 'Bulk generator puts each product photo here', () => {
        o.role = o.role === 'product' ? undefined : 'product'; o.name = o.role ? 'Product photo' : 'Image'; E.commit(); render(o);
      }, o.role === 'product' ? '.on' : ''),
    );
    b.append(g1, g2);
  }

  function adjustPop(anchor, o) {
    const a = o.adjust || {};
    const box = h('div');
    box.append(h('h4', 'Filters'));
    const pg = h('div.preset-grid');
    Object.keys(FX.FILTER_PRESETS).forEach(k => pg.append(h('button', { onclick: () => { o.adjust = { ...FX.FILTER_PRESETS[k], mask: (o.adjust || {}).mask }; FX.applyAdjust(o); R(); E.commit(); U.closePop(); adjustPop(anchor, o); } }, k[0].toUpperCase() + k.slice(1))));
    box.append(pg, h('h4', 'Adjust'));
    const pct = v => Math.round(v * 100);
    box.append(U.slider('Brightness', -0.5, 0.5, 0.01, a.brightness || 0, (v, f) => FX.setAdjust(o, { brightness: v }, f), pct));
    box.append(U.slider('Contrast', -0.5, 0.5, 0.01, a.contrast || 0, (v, f) => FX.setAdjust(o, { contrast: v }, f), pct));
    box.append(U.slider('Saturation', -1, 1, 0.01, a.saturation || 0, (v, f) => FX.setAdjust(o, { saturation: v }, f), pct));
    box.append(U.slider('Vibrance', -1, 1, 0.01, a.vibrance || 0, (v, f) => FX.setAdjust(o, { vibrance: v }, f), pct));
    box.append(U.slider('Warmth', -0.2, 0.2, 0.005, -(a.hue || 0), (v, f) => FX.setAdjust(o, { hue: -v }, f), v => Math.round(v * 500)));
    box.append(U.slider('Blur', 0, 1, 0.01, a.blur || 0, (v, f) => FX.setAdjust(o, { blur: v }, f), pct));
    box.append(U.slider('Remove white', 0, 0.5, 0.01, a.removeWhite || 0, (v, f) => FX.setAdjust(o, { removeWhite: v }, f), pct));
    box.append(U.slider('Transparency', 0, 1, 0.01, o.opacity, (v, f) => { o.opacity = v; R(); if (f) E.commit(); }, pct));
    box.append(h('button.chip-btn', { onclick: () => { o.adjust = { mask: (o.adjust || {}).mask }; FX.applyAdjust(o); R(); E.commit(); U.closePop(); } }, 'Reset'));
    U.popover(anchor, box);
  }

  function cropPop(anchor, o) {
    const c = { l: 0, t: 0, r: 0, b: 0, ...(o.crop || {}) };
    const box = h('div', h('h4', 'Crop (% of photo)'));
    const s = (label, k) => U.slider(label, 0, 90, 1, c[k], (v, f) => { c[k] = v; if (c.l + c.r > 95) c[k] = 95 - (k === 'l' ? c.r : c.l); if (c.t + c.b > 95) c[k] = 95 - (k === 't' ? c.b : c.t); FX.setCrop(o, { ...c }, f); }, v => v + '%');
    box.append(s('Left', 'l'), s('Right', 'r'), s('Top', 't'), s('Bottom', 'b'));
    box.append(h('button.chip-btn', { onclick: () => { FX.setCrop(o, null, true); U.closePop(); } }, 'Reset crop'));
    U.popover(anchor, box);
  }

  function outlinePop(anchor, o) {
    const cur = o.outline || { w: 0, color: '#ffffff' };
    const box = h('div', h('h4', 'Sticker outline'));
    let w = cur.w, color = cur.color;
    const apply = U.debounce(async final => { await FX.setOutline(o, w, color); if (final) E.commit(); }, 120);
    box.append(U.slider('Thickness', 0, 8, 0.1, w, (v, f) => { w = v; apply(f); }, v => v.toFixed(1)));
    const sc = h('button.swatch-btn', h('span', { style: { background: color } }));
    sc.onclick = () => U.colorPicker(sc, color, c => { color = c; sc.firstChild.style.background = c; apply(true); });
    box.append(h('div.row', h('label', 'Colour'), sc));
    U.popover(anchor, box);
  }

  function shadowPop(anchor, o) {
    const box = h('div', h('h4', 'Shadow'));
    const g = h('div.preset-grid');
    Object.keys(FX.SHADOWS).forEach(k => g.append(h('button', { onclick: () => { FX.setShadow(o, k); E.commit(); U.closePop(); shadowPop(anchor, o); } }, k[0].toUpperCase() + k.slice(1))));
    box.append(g);
    if (o.shadow) {
      const s = o.shadow, m = Math.max(o.width, o.height);
      const upd = (p, f) => { FX.setShadow(o, null, { color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY, ...p }); if (f) E.commit(); };
      box.append(h('h4', 'Fine tune'));
      box.append(U.slider('Blur', 0, m * 0.2, 1, s.blur, (v, f) => upd({ blur: v }, f)));
      box.append(U.slider('Distance X', -m * 0.15, m * 0.15, 1, s.offsetX, (v, f) => upd({ offsetX: v }, f)));
      box.append(U.slider('Distance Y', -m * 0.15, m * 0.15, 1, s.offsetY, (v, f) => upd({ offsetY: v }, f)));
      const sc = h('button.swatch-btn', h('span', { style: { background: s.color } }));
      sc.onclick = () => U.colorPicker(sc, s.color, c => { upd({ color: c }, true); sc.firstChild.style.background = c; });
      box.append(h('div.row', h('label', 'Colour'), sc));
    }
    U.popover(anchor, box);
  }

  async function trim(o) {
    const el = o.getElement();
    const cv = document.createElement('canvas');
    cv.width = el.naturalWidth || el.width; cv.height = el.naturalHeight || el.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      if (d[(y * cv.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return;
    const w = x1 - x0 + 1, hh = y1 - y0 + 1;
    if (w === cv.width && hh === cv.height) { U.toast('Nothing to trim'); return; }
    const out = document.createElement('canvas'); out.width = w; out.height = hh;
    out.getContext('2d').drawImage(cv, x0, y0, w, hh, 0, 0, w, hh);
    // keep the visible pixels where they are
    const tl = o.calcTransformMatrix();
    const cx = x0 + w / 2 - cv.width / 2, cy = y0 + hh / 2 - cv.height / 2;
    const p = fabric.util.transformPoint(new fabric.Point(o.flipX ? -cx : cx, o.flipY ? -cy : cy), tl);
    const url = out.toDataURL('image/png');
    // trimming bakes the outline in; base becomes the trimmed cut
    if (!o.outline) o.srcCut = url;
    await o.setSrc(url);
    o.setPositionByOrigin(p, 'center', 'center');
    FX.applyAdjust(o); FX.applyRadius(o);
    o.setCoords(); R(); E.commit();
  }

  async function replaceImage(o) {
    let src, name;
    if (API.native()) {
      const p = await API.call('pick_images', false);
      if (!p || !p.length) return;
      const r = await API.call('read_image', p[0], 4096);
      if (!r.ok) return; src = r.data; name = r.name;
    } else {
      const f = await new Promise(res => { const i = $('#fileInput'); i.onchange = () => { res(i.files[0]); i.value = ''; i.onchange = null; }; i.click(); });
      if (!f) return; src = await U.fileToDataURL(f); name = f.name;
    }
    const img = await fabric.FabricImage.fromURL(src);
    img.set({ name, srcOriginal: src });
    E.replaceWithImage(o, img);
  }

  // ------------------------------------------------------------ placeholder
  function renderPlaceholder(b, o) {
    b.append(group(btn(icon('image') + 'Add product photo', 'Pick a photo for this slot', () => replaceImage(o), '.primary'),
      h('span.muted.small', { style: { margin: '0 8px' } }, 'or drag an image onto the slot')));
  }

  // ------------------------------------------------------------ shapes
  function fillOf(o) { return typeof o.fill === 'string' ? o.fill : (o.fill && o.fill.colorStops ? o.fill.colorStops[0].color : '#000'); }
  function renderShape(b, o) {
    const g = group();
    const isLine = o.type === 'line' || (o.type === 'path' && (!o.fill || o.fill === ''));
    if (!isLine) {
      const sw = h('button.swatch-btn', { title: 'Fill colour' }, h('span', { style: { background: fillOf(o) } }));
      sw.onclick = () => U.colorPicker(sw, fillOf(o), c => { o.set('fill', c); sw.firstChild.style.background = c; R(); }, { allowNone: true, docColors: E.docColors(), onClose: () => E.commit() });
      g.append(h('span.cx-label', 'Fill'), sw);
    }
    const st = h('button.swatch-btn', { title: 'Border colour' }, h('span', { style: { background: o.stroke || 'transparent' } }));
    st.onclick = () => U.colorPicker(st, o.stroke || '#000000', c => { o.set({ stroke: c, strokeWidth: o.strokeWidth || Math.max(2, o.width * 0.02) }); st.firstChild.style.background = c; R(); }, { allowNone: true, docColors: E.docColors(), onClose: () => E.commit() });
    g.append(h('span.cx-label', isLine ? 'Colour' : 'Border'), st);
    const bw = btn(icon('sliders-horizontal') + 'Style', 'Border style', e => {
      const box = h('div');
      box.append(U.slider('Thickness', 0, Math.max(60, Math.max(o.width, o.height) * 0.15), 0.5, o.strokeWidth || 0, (v, f) => { o.set('strokeWidth', v); R(); if (f) E.commit(); }));
      const dashes = h('div.seg');
      [['Solid', null], ['Dashed', [3, 2]], ['Dotted', [0.1, 2]]].forEach(([l, d]) => dashes.append(h('button', { onclick: () => {
        const w = Math.max(1, o.strokeWidth || 1);
        o.set({ strokeDashArray: d ? d.map(x => x * w * 2) : null, strokeLineCap: d && d[0] < 1 ? 'round' : o.strokeLineCap }); R(); E.commit(); } }, l)));
      box.append(h('div.row', h('label', 'Line'), dashes));
      if (o.type === 'rect') box.append(U.slider('Corner radius', 0, Math.min(o.width, o.height) / 2, 1, o.rx || 0, (v, f) => { o.set({ rx: v, ry: v }); R(); if (f) E.commit(); }));
      U.popover(e.currentTarget, box);
    });
    g.append(bw);
    b.append(g, group(btn(icon('blend') + 'Shadow', 'Shadow', e => shadowPop(e.currentTarget, o))));
  }

  // ------------------------------------------------------------ groups (badges)
  function renderGroup(b, o) {
    const colors = new Map();
    o.getObjects().forEach(c => ['fill', 'stroke'].forEach(k => {
      if (typeof c[k] === 'string' && c[k] && c[k] !== 'transparent') {
        const hx = U.toHex(c[k]); if (!colors.has(hx)) colors.set(hx, []); colors.get(hx).push([c, k]);
      }
    }));
    const g = group(h('span.cx-label', 'Colours'));
    [...colors.entries()].slice(0, 6).forEach(([hex, uses]) => {
      const sw = h('button.swatch-btn', { title: hex }, h('span', { style: { background: hex } }));
      sw.onclick = () => U.colorPicker(sw, hex, c => { uses.forEach(([obj, k]) => obj.set(k, c)); o.dirty = true; sw.firstChild.style.background = c; R(); }, { docColors: E.docColors(), onClose: () => E.commit() });
      g.append(sw);
    });
    b.append(g, group(btn(icon('ungroup') + 'Edit text / ungroup', 'Split into separate parts so you can edit the text (or double-click)', () => E.ungroup()),
      btn(icon('blend') + 'Shadow', 'Shadow', e => shadowPop(e.currentTarget, o))));
  }

  // ------------------------------------------------------------ multi
  function renderMulti(b, o) {
    b.append(group(h('span.cx-label', `${o.getObjects().length} selected`),
      btn(icon('group') + 'Group', 'Group (Ctrl+G)', () => E.group())));
    const texts = o.getObjects().filter(isText);
    if (texts.length) {
      const col = h('button.swatch-btn.text-sw', { title: 'Text colour' }, h('b', 'A'), h('span', { style: { background: texts[0].fill } }));
      col.onclick = () => U.colorPicker(col, texts[0].fill, c => { texts.forEach(t => t.set('fill', c)); col.lastChild.style.background = c; R(); }, { onClose: () => E.commit() });
      const font = h('select.sel.font-sel');
      FONTS.all().forEach(f => font.append(h('option', { value: f, style: { fontFamily: `"${f}"` } }, f)));
      font.value = texts[0].fontFamily;
      font.onchange = async () => { await FONTS.ensure(font.value, 700); await FONTS.ensure(font.value, 400); texts.forEach(t => { t.set('fontFamily', font.value); t.initDimensions(); }); R(); E.commit(); };
      b.append(group(font, col));
    }
    renderCommon(b, o);
    U.hydrateIcons(b);
  }

  // ------------------------------------------------------------ common
  function renderCommon(b, o) {
    const pos = btn('i:align-center-horizontal', 'Position: align & arrange', e => {
      const multi = o.type === 'activeselection';
      const box = h('div');
      box.append(h('h4', 'Arrange'));
      const ar = h('div.preset-grid');
      [['Forward', 'up', 'arrow-up'], ['Backward', 'down', 'arrow-down'], ['To front', 'front', 'bring-to-front'], ['To back', 'back', 'send-to-back']].forEach(([l, d, ic]) =>
        ar.append(h('button', { onclick: () => E.order(d), html: icon(ic) + `<div style="font-size:11px;margin-top:3px">${l}</div>` })));
      box.append(ar, h('h4', multi ? 'Align items' : 'Align to page'));
      const al = h('div.preset-grid');
      [['Left', 'left', 'align-start-vertical'], ['Center', 'hcenter', 'align-center-vertical'], ['Right', 'right', 'align-end-vertical'],
        ['Top', 'top', 'align-start-horizontal'], ['Middle', 'vcenter', 'align-center-horizontal'], ['Bottom', 'bottom', 'align-end-horizontal']]
        .forEach(([l, d, ic]) => al.append(h('button', { onclick: () => E.align(d), html: icon(ic) + `<div style="font-size:11px;margin-top:3px">${l}</div>` })));
      box.append(al);
      if (multi && o.getObjects().length > 2) {
        box.append(h('h4', 'Spacing'));
        box.append(h('div.preset-grid', h('button', { onclick: () => E.distribute('h') }, 'Space evenly ↔'), h('button', { onclick: () => E.distribute('v') }, 'Space evenly ↕')));
      }
      U.popover(e.currentTarget, box);
    });
    const op = btn('i:droplets', 'Transparency', e => U.popover(e.currentTarget,
      U.slider('Transparency', 0, 1, 0.01, o.opacity, (v, f) => { o.set('opacity', v); R(); if (f) E.commit(); }, v => Math.round(v * 100) + '%')));
    const lockOn = o.type === 'activeselection' ? o.getObjects().every(x => x.egLocked) : o.egLocked;
    b.append(group(pos, op,
      btn('i:' + (lockOn ? 'lock' : 'lock-open'), lockOn ? 'Unlock' : 'Lock', () => E.toggleLock(), lockOn ? '.on' : ''),
      btn('i:copy-plus', 'Duplicate (Ctrl+D)', () => E.duplicate()),
      btn('i:trash-2', 'Delete (Del)', () => E.remove())));
  }

  function init() {
    E.on('selection', o => { U.closePop(); render(o); });
    E.on('change', (why) => { if (why === 'new' || why === 'load' || why === 'resize') render(E.active()); });
    render(null);
  }
  return { init, render, replaceImage };
})();
