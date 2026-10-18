/* Image + text effects: AI cut-out, adjustments, outline, shadow, corners. */
window.FX = (() => {
  fabric.config.textureSize = 4096;

  // ---------------------------------------------------------- AI cut-out
  const aiOpts = () => {
    const s = JSON.parse(U.lsGet('eg_ai') || '{}');
    return { quality: s.quality || 'Best', edge_refine: s.edge_refine !== false,
      decontaminate: s.decontaminate !== false, remove_specks: s.remove_specks !== false };
  };
  const setAiOpts = o => U.lsSet('eg_ai', JSON.stringify({ ...aiOpts(), ...o }));

  async function removeBg(img = E.active()) {
    if (!img || img.type !== 'image') { U.toast('Select an image first'); return; }
    const opts = aiOpts();
    if (!(await API.ensureModel(opts.quality))) return;
    const src = img.srcOriginal || img.getSrc();
    const r = await API.withProgress(API.call('remove_bg', src, opts), 'Removing background…');
    if (!r.ok) {
      if (r.need_model) { await API.ensureModel(opts.quality); return; }
      U.alert('Background removal failed', U.esc(r.error || 'Unknown error'));
      return;
    }
    if (!img.srcOriginal) img.srcOriginal = src;
    img.srcCut = r.data;
    img.bgRemoved = true;
    await rebuildImage(img);
    API.setDevice(r.device);
    U.toast(`Background removed in ${r.secs}s`, 'ok');
    E.commit();
    E.emit('selection', E.active());
  }

  async function restoreOriginal(img = E.active()) {
    if (!img || !img.srcOriginal) return;
    img.srcCut = null; img.bgRemoved = false; img.outline = null;
    await rebuildImage(img);
    E.commit();
    E.emit('selection', E.active());
  }

  // Re-create the image element from its base source + outline, keep size/position.
  async function rebuildImage(img) {
    const base = img.srcCut || img.srcOriginal || img.getSrc();
    const c = img.getCenterPoint();
    const sx = img.scaleX, sy = img.scaleY;
    let url = base;
    let pad = 0;
    if (img.outline && img.outline.w > 0 && img.bgRemoved) {
      const r = await makeOutline(base, img.outline.w, img.outline.color);
      url = r.url; pad = r.pad;
    }
    await img.setSrc(url);
    img.set({ scaleX: sx, scaleY: sy });
    applyCrop(img);
    img.setPositionByOrigin(c, 'center', 'center');
    applyAdjust(img);
    applyRadius(img);
    img.setCoords();
    E.canvas.requestRenderAll();
  }

  // Sticker-style outline around the cut-out silhouette.
  async function makeOutline(src, widthPct, color) {
    const im = await U.loadImg(src);
    const w = Math.max(1, Math.round(Math.max(im.width, im.height) * widthPct / 100));
    const cv = document.createElement('canvas');
    cv.width = im.width + w * 2; cv.height = im.height + w * 2;
    const ctx = cv.getContext('2d');
    const steps = Math.max(16, Math.min(72, w * 2));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      ctx.drawImage(im, w + Math.cos(a) * w, w + Math.sin(a) * w);
    }
    ctx.drawImage(im, w, w); // fill holes inside
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(im, w, w);
    return { url: cv.toDataURL('image/png'), pad: w };
  }

  async function setOutline(img, w, color) {
    img.outline = w > 0 ? { w, color } : null;
    await rebuildImage(img);
  }

  // ---------------------------------------------------------- adjustments
  const FILTER_PRESETS = {
    none: {}, vivid: { saturation: 0.35, contrast: 0.12 }, bright: { brightness: 0.1, contrast: 0.08 },
    warm: { hue: -0.03, saturation: 0.15, brightness: 0.03 }, cool: { hue: 0.04, saturation: 0.05 },
    mono: { grayscale: 1, contrast: 0.1 }, vintage: { sepia: 0.6, contrast: -0.05 }, fade: { contrast: -0.2, brightness: 0.08 },
    punch: { contrast: 0.25, saturation: 0.2, vibrance: 0.2 },
  };
  function applyAdjust(img) {
    const a = img.adjust || {};
    const F = fabric.filters, list = [];
    if (a.brightness) list.push(new F.Brightness({ brightness: a.brightness }));
    if (a.contrast) list.push(new F.Contrast({ contrast: a.contrast }));
    if (a.saturation) list.push(new F.Saturation({ saturation: a.saturation }));
    if (a.vibrance) list.push(new F.Vibrance({ vibrance: a.vibrance }));
    if (a.hue) list.push(new F.HueRotation({ rotation: a.hue }));
    if (a.blur) list.push(new F.Blur({ blur: a.blur }));
    if (a.grayscale) list.push(new F.Grayscale());
    if (a.sepia) list.push(new F.Sepia());
    if (a.removeWhite) list.push(new F.RemoveColor({ color: '#ffffff', distance: a.removeWhite }));
    img.filters = list;
    try { img.applyFilters(); } catch (e) { console.warn(e); }
  }
  function setAdjust(img, patch, final) {
    img.adjust = { ...(img.adjust || {}), ...patch };
    applyAdjust(img);
    E.canvas.requestRenderAll();
    if (final) E.commit();
  }

  // ---------------------------------------------------------- crop
  // crop = {l,t,r,b} in % of the natural image
  function applyCrop(img) {
    const c = img.crop;
    const el = img.getElement();
    const nw = el.naturalWidth || el.width, nh = el.naturalHeight || el.height;
    if (!c) { img.set({ cropX: 0, cropY: 0, width: nw, height: nh }); return; }
    const x = nw * c.l / 100, y = nh * c.t / 100;
    img.set({ cropX: x, cropY: y, width: Math.max(4, nw - x - nw * c.r / 100), height: Math.max(4, nh - y - nh * c.b / 100) });
    img.dirty = true;
  }
  function setCrop(img, c, final) {
    const before = img.getCenterPoint();
    const oldW = img.width, oldH = img.height, oldX = img.cropX || 0, oldY = img.cropY || 0;
    img.crop = c;
    applyCrop(img);
    // keep the visible pixels in place while cropping
    const dx = ((img.cropX - oldX) + (img.width - oldW) / 2) * img.scaleX * (img.flipX ? -1 : 1);
    const dy = ((img.cropY - oldY) + (img.height - oldH) / 2) * img.scaleY * (img.flipY ? -1 : 1);
    const a = fabric.util.degreesToRadians(img.angle || 0);
    img.setPositionByOrigin(new fabric.Point(before.x + dx * Math.cos(a) - dy * Math.sin(a), before.y + dx * Math.sin(a) + dy * Math.cos(a)), 'center', 'center');
    applyRadius(img);
    img.setCoords();
    E.canvas.requestRenderAll();
    if (final) E.commit();
  }

  // ---------------------------------------------------------- corners
  // Photo frames: rounded corners or a shape mask (circle, star, heart…)
  const MASKS = ['none', 'circle', 'oval', 'hexagon', 'star', 'heart', 'blob', 'diamond', 'arch'];
  function applyRadius(o) {
    if (o.type !== 'image') return;
    const w = o.width, hh = o.height, m = Math.min(w, hh);
    const mask = o.adjust && o.adjust.mask;
    const r = o.radius || 0;
    let cp;
    // scale an all-coordinate-pairs path (M/C/L/Z only) to the image size
    const fitPath = (d, bw, bh) => {
      let i = 0;
      const sd = d.replace(/-?\d+(\.\d+)?/g, n => (i++ % 2 === 0 ? (+n) * w / bw : (+n) * hh / bh).toFixed(2));
      const p = new fabric.Path(sd, { originX: 'center', originY: 'center' });
      p.set({ left: 0, top: 0 });
      return p;
    };
    if (mask === 'circle') cp = new fabric.Circle({ radius: m / 2, originX: 'center', originY: 'center' });
    else if (mask === 'oval') cp = new fabric.Ellipse({ rx: w / 2, ry: hh / 2, originX: 'center', originY: 'center' });
    else if (mask === 'hexagon') cp = new fabric.Polygon(EL.polyPts(6, m / 2, 0), { originX: 'center', originY: 'center' });
    else if (mask === 'diamond') cp = new fabric.Polygon(EL.polyPts(4, m / 2), { originX: 'center', originY: 'center' });
    else if (mask === 'star') cp = new fabric.Polygon(EL.starPts(5, m / 2, m / 4.4), { originX: 'center', originY: 'center' });
    else if (mask === 'heart') cp = fitPath('M 200 360 C 60 260 0 190 0 110 C 0 40 55 0 110 0 C 150 0 180 20 200 55 C 220 20 250 0 290 0 C 345 0 400 40 400 110 C 400 190 340 260 200 360 Z', 400, 360);
    else if (mask === 'blob') cp = fitPath('M 230 10 C 330 20 410 90 400 200 C 390 300 300 380 190 370 C 80 360 0 290 10 180 C 20 70 120 0 230 10 Z', 410, 372);
    else if (mask === 'arch') { const rx = w / 2, ry = Math.min(w / 2, hh / 2); cp = new fabric.Path(`M 0 ${hh} V ${ry} A ${rx} ${ry} 0 0 1 ${w} ${ry} V ${hh} Z`, { originX: 'center', originY: 'center' }); cp.set({ left: 0, top: 0 }); }
    else if (r) { const px = m * r / 100; cp = new fabric.Rect({ width: w, height: hh, rx: px, ry: px, originX: 'center', originY: 'center' }); }
    o.clipPath = cp || undefined;
    o.dirty = true;
  }

  // ---------------------------------------------------------- shadows
  const SHADOWS = {
    none: null,
    soft: { color: 'rgba(0,0,0,0.25)', blur: 30, offsetX: 0, offsetY: 12 },
    drop: { color: 'rgba(0,0,0,0.45)', blur: 12, offsetX: 8, offsetY: 10 },
    float: { color: 'rgba(0,0,0,0.3)', blur: 60, offsetX: 0, offsetY: 40 },
    hard: { color: 'rgba(0,0,0,0.9)', blur: 0, offsetX: 8, offsetY: 8 },
    glow: { color: 'rgba(255,255,255,0.9)', blur: 40, offsetX: 0, offsetY: 0 },
  };
  function setShadow(o, preset, custom) {
    const s = custom || SHADOWS[preset];
    if (!s) { o.shadow = null; } else {
      // scale shadow with the object so it looks the same at any size
      const k = 1 / Math.max(0.05, o.scaleX || 1);
      o.shadow = new fabric.Shadow({ ...s, blur: s.blur * (custom ? 1 : Math.min(k, 6)), offsetX: s.offsetX * (custom ? 1 : Math.min(k, 6)), offsetY: s.offsetY * (custom ? 1 : Math.min(k, 6)) });
    }
    o.dirty = true;
    E.canvas.requestRenderAll();
  }

  // ---------------------------------------------------------- text effects
  const TEXT_FX = {
    none: o => o.set({ shadow: null, stroke: null, strokeWidth: 0, textBackgroundColor: '' }),
    shadow: o => o.set({ shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.45)', blur: o.fontSize * 0.12, offsetX: o.fontSize * 0.05, offsetY: o.fontSize * 0.06 }), stroke: null, strokeWidth: 0 }),
    lift: o => o.set({ shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: o.fontSize * 0.35, offsetX: 0, offsetY: o.fontSize * 0.08 }), stroke: null, strokeWidth: 0 }),
    outline: o => o.set({ stroke: '#000000', strokeWidth: Math.max(2, o.fontSize * 0.08), paintFirst: 'stroke', strokeLineJoin: 'round', shadow: null }),
    hollow: o => o.set({ stroke: o.fill && o.fill !== 'transparent' ? o.fill : '#000000', strokeWidth: Math.max(1.5, o.fontSize * 0.04), fill: 'transparent', paintFirst: 'fill', shadow: null }),
    neon: o => o.set({ shadow: new fabric.Shadow({ color: o.fill || '#00e5ff', blur: o.fontSize * 0.5, offsetX: 0, offsetY: 0 }), stroke: null, strokeWidth: 0 }),
    sticker: o => o.set({ stroke: '#ffffff', strokeWidth: Math.max(3, o.fontSize * 0.14), paintFirst: 'stroke', strokeLineJoin: 'round', shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: o.fontSize * 0.15, offsetX: 0, offsetY: o.fontSize * 0.05 }) }),
    highlight: o => o.set({ textBackgroundColor: '#ffe600', shadow: null, stroke: null, strokeWidth: 0 }),
  };
  function textEffect(o, name) {
    const list = o.type === 'activeselection' ? o.getObjects() : [o];
    list.filter(t => t.type === 'textbox' || t.type === 'i-text' || t.type === 'text').forEach(t => {
      TEXT_FX.none(t);
      if (TEXT_FX[name]) TEXT_FX[name](t);
      t.dirty = true;
    });
    E.canvas.requestRenderAll();
    E.commit();
  }

  // ---------------------------------------------------------- curved text
  function setCurve(t, c) {
    t.curve = c;
    if (!c) { t.set({ path: null }); t.initDimensions(); t.setCoords(); E.canvas.requestRenderAll(); return; }
    // measure the text on a straight line first
    t.set({ path: null }); t.initDimensions();
    const w = Math.max(...t._textLines.map((_, i) => t.getLineWidth(i)));
    const theta = Math.min(Math.abs(c), 100) / 100 * Math.PI * 1.6;
    const R = w / theta;
    const a0 = -Math.PI / 2 - theta / 2, a1 = -Math.PI / 2 + theta / 2;
    let d;
    if (c > 0) d = `M ${R * Math.cos(a0)} ${R * Math.sin(a0) + R} A ${R} ${R} 0 ${theta > Math.PI ? 1 : 0} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1) + R}`;
    else {
      const b0 = Math.PI / 2 + theta / 2, b1 = Math.PI / 2 - theta / 2;
      d = `M ${R * Math.cos(b0)} ${R * Math.sin(b0) - R} A ${R} ${R} 0 ${theta > Math.PI ? 1 : 0} 0 ${R * Math.cos(b1)} ${R * Math.sin(b1) - R}`;
    }
    const path = new fabric.Path(d, { visible: false, fill: '', stroke: '' });
    t.set({ path, pathAlign: 'center', pathSide: 'left', pathStartOffset: 0 });
    t.initDimensions(); t.setCoords();
    E.canvas.requestRenderAll();
  }

  return { setCurve, MASKS, applyCrop, setCrop, removeBg, restoreOriginal, rebuildImage, makeOutline, setOutline, applyAdjust, setAdjust,
    FILTER_PRESETS, applyRadius, SHADOWS, setShadow, TEXT_FX, textEffect, aiOpts, setAiOpts };
})();
