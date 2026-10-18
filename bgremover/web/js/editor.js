/* Canvas editor core: page, zoom/pan, history, selection, snapping, export. */
window.E = (() => {
  const PROPS = ['id', 'name', 'role', 'egLocked', 'srcOriginal', 'srcCut', 'bgRemoved', 'outline',
    'adjust', 'radius', 'crop', 'curve', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'lockScalingX',
    'lockScalingY', 'lockRotation', 'hasControls', 'visible', 'egType'];
  const ACCENT = '#7c5cff';

  let canvas, W = 1080, H = 1080, bgObj = null;
  let silent = 0;
  const listeners = { selection: [], change: [], zoom: [] };
  const on = (ev, fn) => listeners[ev].push(fn);
  const emit = (ev, ...a) => listeners[ev].forEach(f => { try { f(...a); } catch (e) { console.error(e); } });

  // ------------------------------------------------------------ setup
  function init() {
    Object.assign(fabric.InteractiveFabricObject.ownDefaults, {
      borderColor: ACCENT, cornerColor: '#ffffff', cornerStrokeColor: ACCENT, transparentCorners: false,
      cornerStyle: 'circle', cornerSize: 11, borderScaleFactor: 1.6, padding: 2,
    });
    fabric.FabricObject.customProperties = PROPS;
    canvas = new fabric.Canvas('c', {
      preserveObjectStacking: true, backgroundColor: '#23272f', selectionColor: '#7c5cff22',
      selectionBorderColor: ACCENT, selectionLineWidth: 1.2, stopContextMenu: true, fireRightClick: true,
      enableRetinaScaling: true, targetFindTolerance: 6, controlsAboveOverlay: true,
    });
    resize();
    new ResizeObserver(() => { resize(); }).observe(document.getElementById('stage'));

    canvas.on('before:render', drawPageBack);
    canvas.on('after:render', drawGuides);
    canvas.on('selection:created', selChanged);
    canvas.on('selection:updated', selChanged);
    canvas.on('selection:cleared', selChanged);
    canvas.on('object:modified', changed);
    canvas.on('object:added', e => { ensureId(e.target); changed(); });
    canvas.on('object:removed', changed);
    canvas.on('text:changed', changed);
    canvas.on('object:moving', snap);
    canvas.on('object:scaling', () => { guides = []; });
    canvas.on('mouse:up', () => { if (guides.length) { guides = []; canvas.requestRenderAll(); } });
    canvas.on('mouse:dblclick', e => {
      const t = e.target;
      if (t && t.type === 'group' && !t.egLocked) ungroup();
      if (t && t.role === 'product' && t.egType === 'placeholder') emit('change', 'placeholder-click', t);
    });
    setupPanZoom();
    newDesign(1080, 1080, '#ffffff');
  }

  function resize() {
    const st = document.getElementById('stage');
    if (!canvas || !st.clientWidth) return;
    canvas.setDimensions({ width: st.clientWidth, height: st.clientHeight });
    if (!userZoomed) fit(); else canvas.requestRenderAll();
  }

  function ensureId(o) {
    if (!o) return;
    if (!o.id) o.id = U.uid();
    if (!o.name) o.name = defaultName(o);
    if (o._objects) o._objects.forEach(c => { if (!c.id) c.id = U.uid(); });
  }
  function defaultName(o) {
    if (o.role === 'product') return 'Product photo';
    return ({ textbox: 'Text', 'i-text': 'Text', image: 'Image', rect: 'Rectangle', circle: 'Circle',
      ellipse: 'Ellipse', triangle: 'Triangle', polygon: 'Shape', path: 'Shape', line: 'Line',
      group: 'Group' })[o.type] || 'Element';
  }

  // ------------------------------------------------------------ page
  function makeBg(fill = '#ffffff') {
    return new fabric.Rect({ left: 0, top: 0, width: W, height: H, fill, originX: 'left', originY: 'top',
      selectable: false, evented: false, hasControls: false, role: 'background', name: 'Background',
      strokeWidth: 0, objectCaching: false, hoverCursor: 'default' });
  }
  function page() { return bgObj; }
  function findBg() {
    bgObj = canvas.getObjects().find(o => o.role === 'background') || null;
    if (!bgObj) { bgObj = makeBg(); silent++; canvas.insertAt(0, bgObj); silent--; }
    return bgObj;
  }
  function setClip() {
    canvas.clipPath = new fabric.Rect({ left: 0, top: 0, width: W, height: H, originX: 'left', originY: 'top', absolutePositioned: true });
  }

  function drawPageBack() {
    const ctx = canvas.getContext();
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const r = canvas.getRetinaScaling();
    ctx.scale(r, r);
    const x = v[4], y = v[5], w = W * v[0], h = H * v[3];
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    // checkerboard visible when the background is transparent
    const sq = 10;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#e6e6e6';
    for (let yy = 0; yy < h; yy += sq) for (let xx = (Math.floor(yy / sq) % 2) * sq; xx < w; xx += sq * 2) ctx.fillRect(x + xx, y + yy, sq, sq);
    ctx.restore();
  }

  function newDesign(w, h, bg = '#ffffff') {
    silent++;
    W = Math.round(w); H = Math.round(h);
    canvas.discardActiveObject();
    canvas.clear();
    canvas.backgroundColor = '#23272f';
    bgObj = makeBg(bg);
    canvas.add(bgObj);
    setClip();
    userZoomed = false; fit();
    silent--;
    history.reset();
    emit('change', 'new');
    selChanged();
  }

  // --------------------------------------------------------- serialize
  function toJSON() {
    const o = canvas.toObject(PROPS);
    delete o.clipPath; delete o.background;
    return { app: 'EG Studio', v: 1, width: W, height: H, canvas: o };
  }

  async function load(doc, { keepHistory = false } = {}) {
    silent++;
    try {
      canvas.discardActiveObject();
      W = doc.width; H = doc.height;
      const objs = (doc.canvas && doc.canvas.objects) || [];
      await FONTS.ensureForObjects(objs);
      await canvas.loadFromJSON({ objects: objs, version: doc.canvas.version });
      canvas.backgroundColor = '#23272f';
      findBg();
      bgObj.set({ width: W, height: H, selectable: false, evented: false });
      canvas.getObjects().forEach(o => { ensureId(o); applyLockState(o); });
      setClip();
      if (!keepHistory) { userZoomed = false; fit(); }
      canvas.requestRenderAll();
    } finally { silent--; }
    if (!keepHistory) history.reset();
    emit('change', 'load');
    selChanged();
  }

  // ------------------------------------------------------------ history
  const history = (() => {
    let stack = [], idx = -1;
    const snap = () => canvas.toObject(PROPS);
    const push = () => {
      stack = stack.slice(0, idx + 1);
      stack.push({ obj: snap(), W, H });
      if (stack.length > 60) stack.shift();
      idx = stack.length - 1;
      updateBtns();
    };
    const reset = () => { stack = []; idx = -1; push(); };
    const updateBtns = () => {
      const u = document.getElementById('btnUndo'), r = document.getElementById('btnRedo');
      if (u) u.disabled = idx <= 0; if (r) r.disabled = idx >= stack.length - 1;
    };
    async function go(d) {
      const n = idx + d;
      if (n < 0 || n >= stack.length) return;
      idx = n;
      const s = stack[idx];
      await load({ width: s.W, height: s.H, canvas: s.obj }, { keepHistory: true });
      updateBtns();
      emit('change', 'history');
    }
    return { push, reset, undo: () => go(-1), redo: () => go(1), updateBtns };
  })();

  const pushHistory = U.debounce(() => history.push(), 250);
  function changed() {
    if (silent) return;
    pushHistory();
    emit('change', 'edit');
  }
  function commit() { if (!silent) { history.push(); emit('change', 'edit'); } }
  function withSilent(fn) { silent++; try { return fn(); } finally { silent--; } }

  // ------------------------------------------------------------ zoom/pan
  let userZoomed = false;
  function fit() {
    if (!canvas) return;
    const cw = canvas.getWidth(), ch = canvas.getHeight();
    const z = Math.min((cw - 80) / W, (ch - 80) / H);
    setZoom(z, null, true);
    userZoomed = false;
  }
  function setZoom(z, point, center) {
    z = Math.max(0.03, Math.min(8, z));
    const cw = canvas.getWidth(), ch = canvas.getHeight();
    if (center || !point) {
      canvas.setViewportTransform([z, 0, 0, z, (cw - W * z) / 2, (ch - H * z) / 2]);
    } else {
      canvas.zoomToPoint(new fabric.Point(point.x, point.y), z);
    }
    userZoomed = true;
    emit('zoom', z);
    canvas.requestRenderAll();
  }
  const getZoom = () => canvas.getZoom();

  function setupPanZoom() {
    const el = canvas.upperCanvasEl;
    let panning = false, last = null, space = false;
    canvas.on('mouse:wheel', opt => {
      const e = opt.e;
      e.preventDefault(); e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const z = canvas.getZoom() * Math.pow(0.999, e.deltaY * 1.5);
        setZoom(z, { x: e.offsetX, y: e.offsetY });
      } else {
        const v = canvas.viewportTransform;
        v[4] -= e.shiftKey ? e.deltaY : e.deltaX;
        v[5] -= e.shiftKey ? 0 : e.deltaY;
        canvas.setViewportTransform(v);
        userZoomed = true;
      }
    });
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && !isTyping()) { if (!space) { space = true; canvas.defaultCursor = 'grab'; canvas.selection = false; } e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') { space = false; canvas.defaultCursor = 'default'; canvas.selection = true; }
    });
    canvas.on('mouse:down', opt => {
      const e = opt.e;
      if (space || e.button === 1) { panning = true; last = { x: e.clientX, y: e.clientY }; canvas.setCursor('grabbing'); e.preventDefault(); }
    });
    canvas.on('mouse:move', opt => {
      if (!panning) return;
      const e = opt.e, v = canvas.viewportTransform;
      v[4] += e.clientX - last.x; v[5] += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      canvas.setViewportTransform(v);
      userZoomed = true;
    });
    canvas.on('mouse:up', () => { panning = false; });
    el.addEventListener('auxclick', e => e.preventDefault());
  }

  // ------------------------------------------------------------ snapping
  let guides = [];
  function snap(e) {
    const o = e.target;
    if (!o || window.SNAP_OFF) return;
    const z = canvas.getZoom(), th = 6 / z;
    const b = o.getBoundingRect(); // scene coords in v6
    const xs = [b.left, b.left + b.width / 2, b.left + b.width];
    const ys = [b.top, b.top + b.height / 2, b.top + b.height];
    const tx = [0, W / 2, W], ty = [0, H / 2, H];
    canvas.getObjects().forEach(p => {
      if (p === o || p.role === 'background' || !p.visible || (o.type === 'activeselection' && o.contains(p))) return;
      const r = p.getBoundingRect();
      tx.push(r.left, r.left + r.width / 2, r.left + r.width);
      ty.push(r.top, r.top + r.height / 2, r.top + r.height);
    });
    guides = [];
    let bx = null, by = null;
    xs.forEach((x, i) => tx.forEach(t => { const d = t - x; if (Math.abs(d) < th && (bx === null || Math.abs(d) < Math.abs(bx.d))) bx = { d, t }; }));
    ys.forEach((y, i) => ty.forEach(t => { const d = t - y; if (Math.abs(d) < th && (by === null || Math.abs(d) < Math.abs(by.d))) by = { d, t }; }));
    if (bx) { o.left += bx.d; guides.push({ x: bx.t }); }
    if (by) { o.top += by.d; guides.push({ y: by.t }); }
    if (bx || by) o.setCoords();
  }
  function drawGuides() {
    if (!guides.length) return;
    const ctx = canvas.getTopContext ? canvas.getTopContext() : canvas.contextTop;
    const v = canvas.viewportTransform;
    ctx.save();
    ctx.strokeStyle = '#ff3d9a'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    guides.forEach(g => {
      ctx.beginPath();
      if (g.x !== undefined) { const x = g.x * v[0] + v[4]; ctx.moveTo(x, 0); ctx.lineTo(x, canvas.getHeight()); }
      else { const y = g.y * v[3] + v[5]; ctx.moveTo(0, y); ctx.lineTo(canvas.getWidth(), y); }
      ctx.stroke();
    });
    ctx.restore();
  }

  // ------------------------------------------------------------ selection
  function selChanged() { emit('selection', canvas.getActiveObject()); }
  const active = () => canvas.getActiveObject();
  const activeList = () => canvas.getActiveObjects();
  const userObjects = () => canvas.getObjects().filter(o => o.role !== 'background');
  function select(o) {
    canvas.discardActiveObject();
    if (o) canvas.setActiveObject(o);
    canvas.requestRenderAll();
  }

  // ------------------------------------------------------------ adding
  function add(o, { center = true, select: sel = true, at } = {}) {
    ensureId(o);
    if (center) {
      o.set({ originX: 'center', originY: 'center' });
      const vc = viewCenter();
      o.set({ left: vc.x, top: vc.y });
    }
    if (at != null) canvas.insertAt(at, o); else canvas.add(o);
    o.setCoords();
    if (sel) select(o);
    canvas.requestRenderAll();
    return o;
  }
  function viewCenter() {
    // centre of the page if visible, otherwise centre of what's on screen
    const v = canvas.viewportTransform;
    const cx = (canvas.getWidth() / 2 - v[4]) / v[0], cy = (canvas.getHeight() / 2 - v[5]) / v[3];
    return { x: Math.max(0, Math.min(W, cx)), y: Math.max(0, Math.min(H, cy)) };
  }

  async function addImage(src, { name, fit = 0.6, role, center = true, replace } = {}) {
    const img = await fabric.FabricImage.fromURL(src, { crossOrigin: 'anonymous' });
    img.set({ name: name || 'Image', srcOriginal: src, role: role || undefined });
    const target = replace || (active() && active().role === 'product' && active().egType === 'placeholder' ? active() : null);
    if (target) return replaceWithImage(target, img);
    const s = Math.min((W * fit) / img.width, (H * fit) / img.height, 1.0 * Math.max(W / img.width, H / img.height));
    img.scale(s);
    add(img, { center });
    return img;
  }

  // Fit an image into another object's box (placeholder or existing product).
  function replaceWithImage(target, img) {
    const b = target.getBoundingRect();
    const s = Math.min(b.width / img.width, b.height / img.height);
    img.set({ originX: 'center', originY: 'center', left: b.left + b.width / 2, top: b.top + b.height / 2,
      angle: 0, role: target.role || img.role, name: target.role === 'product' ? 'Product photo' : img.name });
    img.scale(s);
    if (target.shadow && target.type === 'image') img.shadow = target.shadow;
    const idx = canvas.getObjects().indexOf(target);
    withSilent(() => { canvas.remove(target); canvas.insertAt(idx, img); });
    img.setCoords();
    select(img);
    commit();
    return img;
  }

  // ------------------------------------------------------------ actions
  function remove() {
    const list = activeList().filter(o => !o.egLocked);
    if (!list.length) return;
    canvas.discardActiveObject();
    withSilent(() => list.forEach(o => canvas.remove(o)));
    commit();
  }

  let clip = null;
  async function copy() {
    const a = active();
    if (!a) return;
    clip = await a.clone(PROPS);
  }
  async function paste() {
    if (!clip) return;
    const c = await clip.clone(PROPS);
    canvas.discardActiveObject();
    c.set({ left: c.left + 20, top: c.top + 20, evented: true });
    if (c.type === 'activeselection') {
      c.canvas = canvas;
      withSilent(() => c.forEachObject(o => { o.id = U.uid(); canvas.add(o); }));
      c.setCoords();
    } else { c.id = U.uid(); withSilent(() => canvas.add(c)); }
    clip.left += 20; clip.top += 20;
    canvas.setActiveObject(c);
    canvas.requestRenderAll();
    commit();
  }
  async function duplicate() { await copy(); await paste(); }

  function group() {
    const a = active();
    if (!a || a.type !== 'activeselection') return;
    const objs = a.removeAll();
    canvas.discardActiveObject();
    const g = new fabric.Group(objs, { name: 'Group' });
    withSilent(() => { objs.forEach(o => canvas.remove(o)); canvas.add(g); });
    ensureId(g);
    select(g);
    commit();
  }
  function ungroup() {
    const g = active();
    if (!g || g.type !== 'group') return;
    const idx = canvas.getObjects().indexOf(g);
    const items = g.removeAll();
    withSilent(() => {
      canvas.remove(g);
      items.forEach((o, i) => { ensureId(o); canvas.insertAt(idx + i, o); o.setCoords(); });
    });
    const sel = new fabric.ActiveSelection(items, { canvas });
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    commit();
  }

  function order(dir) {
    const a = active();
    if (!a) return;
    const objs = a.type === 'activeselection' ? a.getObjects() : [a];
    objs.forEach(o => {
      const all = canvas.getObjects(), i = all.indexOf(o), minI = 1;
      if (dir === 'front') canvas.bringObjectToFront(o);
      else if (dir === 'back') canvas.moveObjectTo(o, minI);
      else if (dir === 'up') canvas.bringObjectForward(o);
      else if (dir === 'down' && i > minI) canvas.sendObjectBackwards(o);
    });
    keepBgBottom();
    canvas.requestRenderAll();
    commit();
  }
  function keepBgBottom() {
    if (bgObj && canvas.getObjects().indexOf(bgObj) !== 0) canvas.moveObjectTo(bgObj, 0);
  }

  function align(how) {
    const a = active();
    if (!a) return;
    const multi = a.type === 'activeselection';
    const targets = multi ? a.getObjects() : [a];
    let box = { left: 0, top: 0, width: W, height: H };
    if (multi) {
      // align items to each other (within the selection box)
      const r = a.getBoundingRect();
      box = r;
      canvas.discardActiveObject();
    }
    targets.forEach(o => {
      const r = o.getBoundingRect();
      let dx = 0, dy = 0;
      if (how === 'left') dx = box.left - r.left;
      if (how === 'hcenter') dx = box.left + box.width / 2 - (r.left + r.width / 2);
      if (how === 'right') dx = box.left + box.width - (r.left + r.width);
      if (how === 'top') dy = box.top - r.top;
      if (how === 'vcenter') dy = box.top + box.height / 2 - (r.top + r.height / 2);
      if (how === 'bottom') dy = box.top + box.height - (r.top + r.height);
      o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords();
    });
    if (multi) canvas.setActiveObject(new fabric.ActiveSelection(targets, { canvas }));
    canvas.requestRenderAll();
    commit();
  }
  function distribute(axis) {
    const a = active();
    if (!a || a.type !== 'activeselection') return;
    const objs = a.getObjects().slice();
    canvas.discardActiveObject();
    const rs = objs.map(o => ({ o, r: o.getBoundingRect() }));
    const k = axis === 'h' ? 'left' : 'top', s = axis === 'h' ? 'width' : 'height';
    rs.sort((p, q) => p.r[k] - q.r[k]);
    const start = rs[0].r[k], end = rs[rs.length - 1].r[k] + rs[rs.length - 1].r[s];
    const total = rs.reduce((t, x) => t + x.r[s], 0);
    const gap = (end - start - total) / (rs.length - 1);
    let pos = start;
    rs.forEach(({ o, r }) => { o.set(k, o[k] + (pos - r[k])); o.setCoords(); pos += r[s] + gap; });
    canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
    canvas.requestRenderAll();
    commit();
  }

  function applyLockState(o) {
    const l = !!o.egLocked;
    if (o.role === 'background') return;
    o.set({ lockMovementX: l, lockMovementY: l, lockScalingX: l, lockScalingY: l, lockRotation: l,
      hasControls: !l, editable: o.type === 'textbox' ? !l : o.editable, hoverCursor: l ? 'default' : null });
  }
  function toggleLock(o = active()) {
    if (!o) return;
    const list = o.type === 'activeselection' ? o.getObjects() : [o];
    const v = !list[0].egLocked;
    list.forEach(x => { x.egLocked = v; applyLockState(x); });
    canvas.requestRenderAll();
    commit();
    selChanged();
  }

  function flip(axis) {
    const a = active(); if (!a) return;
    a.set(axis === 'x' ? 'flipX' : 'flipY', !a[axis === 'x' ? 'flipX' : 'flipY']);
    canvas.requestRenderAll(); commit();
  }

  function nudge(dx, dy) {
    const a = active(); if (!a || a.egLocked) return;
    a.set({ left: a.left + dx, top: a.top + dy }); a.setCoords();
    canvas.requestRenderAll(); changed();
  }

  function selectAll() {
    const objs = userObjects().filter(o => o.selectable !== false && o.visible && !o.egLocked);
    canvas.discardActiveObject();
    if (objs.length) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
    canvas.requestRenderAll();
  }

  // ------------------------------------------------------------ page edits
  function setBackground(fill) {
    findBg(); bgObj.set('fill', fill); canvas.requestRenderAll(); commit();
  }
  function resizePage(w, h, scaleContent = true) {
    const sx = w / W, sy = h / H, s = Math.min(sx, sy);
    const dx = (w - W * s) / 2, dy = (h - H * s) / 2;
    withSilent(() => {
      userObjects().forEach(o => {
        if (o.role === 'bgimage') {
          const cs = Math.max(w / o.width, h / o.height);
          o.set({ scaleX: cs * (o.flipX ? 1 : 1), scaleY: cs, left: w / 2, top: h / 2, originX: 'center', originY: 'center' });
        } else if (scaleContent) {
          const p = o.getCenterPoint();
          o.set({ scaleX: o.scaleX * s, scaleY: o.scaleY * s });
          o.setPositionByOrigin(new fabric.Point(p.x * s + dx, p.y * s + dy), 'center', 'center');
        }
        o.setCoords();
      });
      W = Math.round(w); H = Math.round(h);
      bgObj.set({ width: W, height: H });
      setClip();
    });
    fit();
    commit();
    emit('change', 'resize');
  }

  // ------------------------------------------------------------ export
  async function exportDataURL({ format = 'png', multiplier = 1, quality = 0.92, transparent = false } = {}) {
    const a = active();
    canvas.discardActiveObject();
    guides = [];
    const vpt = canvas.viewportTransform.slice();
    const bgFill = bgObj.fill;
    const bgImg = userObjects().filter(o => o.role === 'bgimage');
    if (transparent) { bgObj.visible = false; bgImg.forEach(o => o.visible = false); }
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    const prevBg = canvas.backgroundColor;
    canvas.backgroundColor = transparent || format === 'png' ? null : '#ffffff';
    let url;
    try {
      url = canvas.toDataURL({ left: 0, top: 0, width: W, height: H, format: format === 'jpg' ? 'jpeg' : format,
        quality, multiplier, enableRetinaScaling: false });
    } finally {
      canvas.backgroundColor = prevBg;
      bgObj.visible = true; bgImg.forEach(o => o.visible = true); bgObj.fill = bgFill;
      canvas.setViewportTransform(vpt);
      if (a) canvas.setActiveObject(a);
      canvas.requestRenderAll();
    }
    return url;
  }
  async function thumbnail(size = 320) {
    return exportDataURL({ format: 'jpeg', multiplier: size / Math.max(W, H), quality: 0.8 });
  }

  // Render a document JSON off-screen (used by bulk generator & template thumbs).
  async function renderDoc(doc, { format = 'png', multiplier = 1, quality = 0.92, transparent = false, mutate } = {}) {
    const el = document.createElement('canvas');
    const sc = new fabric.StaticCanvas(el, { width: doc.width, height: doc.height, enableRetinaScaling: false, renderOnAddRemove: false });
    await FONTS.ensureForObjects(doc.canvas.objects || []);
    await sc.loadFromJSON({ objects: doc.canvas.objects || [] });
    if (mutate) await mutate(sc);
    if (transparent) sc.getObjects().forEach(o => { if (o.role === 'background' || o.role === 'bgimage') o.visible = false; });
    sc.backgroundColor = (format === 'jpeg' || format === 'jpg') ? '#ffffff' : null;
    sc.renderAll();
    const url = sc.toDataURL({ format: format === 'jpg' ? 'jpeg' : format, quality, multiplier });
    sc.dispose();
    return url;
  }

  const isTyping = () => {
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return true;
    const o = canvas && canvas.getActiveObject();
    return !!(o && o.isEditing);
  };

  const docColors = () => {
    const s = new Set();
    canvas.getObjects().forEach(function walk(o) {
      ['fill', 'stroke'].forEach(k => { if (typeof o[k] === 'string' && o[k] && o[k] !== 'transparent') s.add(U.toHex(o[k])); });
      (o._objects || []).forEach(walk);
    });
    return [...s];
  };

  return {
    init, on, emit, newDesign, load, toJSON, history, commit, changed, withSilent,
    get canvas() { return canvas; }, get W() { return W; }, get H() { return H; },
    page, findBg, fit, setZoom, getZoom, active, activeList, userObjects, select, add, addImage,
    replaceWithImage, remove, copy, paste, duplicate, group, ungroup, order, align, distribute,
    toggleLock, applyLockState, flip, nudge, selectAll, setBackground, resizePage, exportDataURL,
    thumbnail, renderDoc, isTyping, docColors, PROPS, keepBgBottom, viewCenter,
  };
})();
