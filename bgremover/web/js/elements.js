/* Element library: shapes, lines, badges, icons, text styles, product slot. */
window.EL = (() => {
  const u = () => Math.min(E.W, E.H) / 1080; // scale presets to the page size

  // ------------------------------------------------------------ geometry
  function starPts(n, outer, inner) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? inner : outer, a = (Math.PI / n) * i - Math.PI / 2;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return pts;
  }
  function polyPts(n, r, rot = -Math.PI / 2) {
    return Array.from({ length: n }, (_, i) => ({ x: Math.cos(rot + i * 2 * Math.PI / n) * r, y: Math.sin(rot + i * 2 * Math.PI / n) * r }));
  }
  const poly = (pts, opts) => new fabric.Polygon(pts, { strokeLineJoin: 'round', ...opts });

  // ------------------------------------------------------------ shapes
  const SHAPES = [
    { id: 'rect', label: 'Square', make: c => new fabric.Rect({ width: 400 * u(), height: 400 * u(), fill: c }) },
    { id: 'rounded', label: 'Rounded', make: c => new fabric.Rect({ width: 420 * u(), height: 300 * u(), rx: 40 * u(), ry: 40 * u(), fill: c }) },
    { id: 'pill', label: 'Pill', make: c => new fabric.Rect({ width: 520 * u(), height: 140 * u(), rx: 70 * u(), ry: 70 * u(), fill: c }) },
    { id: 'circle', label: 'Circle', make: c => new fabric.Circle({ radius: 200 * u(), fill: c }) },
    { id: 'triangle', label: 'Triangle', make: c => new fabric.Triangle({ width: 400 * u(), height: 360 * u(), fill: c }) },
    { id: 'star', label: 'Star', make: c => poly(starPts(5, 220 * u(), 95 * u()), { fill: c }) },
    { id: 'burst', label: 'Burst', make: c => poly(starPts(16, 230 * u(), 190 * u()), { fill: c }) },
    { id: 'seal', label: 'Seal', make: c => poly(starPts(24, 220 * u(), 200 * u()), { fill: c }) },
    { id: 'hexagon', label: 'Hexagon', make: c => poly(polyPts(6, 210 * u(), 0), { fill: c }) },
    { id: 'diamond', label: 'Diamond', make: c => poly(polyPts(4, 220 * u()), { fill: c }) },
    { id: 'pentagon', label: 'Pentagon', make: c => poly(polyPts(5, 210 * u()), { fill: c }) },
    { id: 'arrowShape', label: 'Arrow', make: c => poly([{ x: 0, y: 70 }, { x: 260, y: 70 }, { x: 260, y: 0 }, { x: 420, y: 140 }, { x: 260, y: 280 }, { x: 260, y: 210 }, { x: 0, y: 210 }].map(p => ({ x: p.x * u(), y: p.y * u() })), { fill: c }) },
    { id: 'ribbon', label: 'Ribbon', make: c => poly([{ x: 0, y: 0 }, { x: 560, y: 0 }, { x: 520, y: 60 }, { x: 560, y: 120 }, { x: 0, y: 120 }, { x: 40, y: 60 }].map(p => ({ x: p.x * u(), y: p.y * u() })), { fill: c }) },
    { id: 'tagShape', label: 'Tag', make: c => poly([{ x: 0, y: 70 }, { x: 70, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 140 }, { x: 70, y: 140 }].map(p => ({ x: p.x * u(), y: p.y * u() })), { fill: c }) },
    { id: 'bubble', label: 'Speech', make: c => new fabric.Path('M 40 0 H 360 Q 400 0 400 40 V 200 Q 400 240 360 240 H 140 L 70 310 L 90 240 H 40 Q 0 240 0 200 V 40 Q 0 0 40 0 Z', { fill: c, scaleX: u(), scaleY: u() }) },
    { id: 'heart', label: 'Heart', make: c => new fabric.Path('M 200 360 C 60 260 0 190 0 110 C 0 40 55 0 110 0 C 150 0 180 20 200 55 C 220 20 250 0 290 0 C 345 0 400 40 400 110 C 400 190 340 260 200 360 Z', { fill: c, scaleX: u(), scaleY: u() }) },
    { id: 'blob', label: 'Blob', make: c => new fabric.Path('M 230 10 C 330 20 410 90 400 200 C 390 300 300 380 190 370 C 80 360 0 290 10 180 C 20 70 120 0 230 10 Z', { fill: c, scaleX: u(), scaleY: u() }) },
    { id: 'frameRing', label: 'Ring', make: c => new fabric.Circle({ radius: 200 * u(), fill: 'transparent', stroke: c, strokeWidth: 24 * u() }) },
    { id: 'frameBox', label: 'Frame', make: c => new fabric.Rect({ width: 420 * u(), height: 420 * u(), fill: 'transparent', stroke: c, strokeWidth: 20 * u(), rx: 24 * u(), ry: 24 * u() }) },
  ];

  const LINES = [
    { id: 'line', label: 'Line', make: c => new fabric.Line([0, 0, 500 * u(), 0], { stroke: c, strokeWidth: 8 * u(), strokeLineCap: 'round' }) },
    { id: 'dash', label: 'Dashed', make: c => new fabric.Line([0, 0, 500 * u(), 0], { stroke: c, strokeWidth: 8 * u(), strokeDashArray: [24 * u(), 18 * u()], strokeLineCap: 'round' }) },
    { id: 'dots', label: 'Dotted', make: c => new fabric.Line([0, 0, 500 * u(), 0], { stroke: c, strokeWidth: 10 * u(), strokeDashArray: [0.1, 24 * u()], strokeLineCap: 'round' }) },
    { id: 'arrow', label: 'Arrow', make: c => new fabric.Path('M 0 40 H 420 M 360 0 L 430 40 L 360 80', { fill: '', stroke: c, strokeWidth: 10, strokeLineCap: 'round', strokeLineJoin: 'round', scaleX: u(), scaleY: u() }) },
    { id: 'curveArrow', label: 'Curved', make: c => new fabric.Path('M 10 200 Q 150 0 380 60 M 320 20 L 385 62 L 330 120', { fill: '', stroke: c, strokeWidth: 10, strokeLineCap: 'round', strokeLineJoin: 'round', scaleX: u(), scaleY: u() }) },
  ];

  // ------------------------------------------------------------ badges
  const T = (text, o = {}) => new fabric.Textbox(text, {
    fontFamily: 'Poppins', fontWeight: 800, fontSize: 64, fill: '#ffffff', textAlign: 'center',
    originX: 'center', originY: 'center', left: 0, top: 0, width: 400, splitByGrapheme: false, ...o,
  });
  const S = (o, x = 0, y = 0) => { o.set({ originX: 'center', originY: 'center', left: x, top: y }); return o; };
  const grp = (items, name) => {
    const g = new fabric.Group(items, { name: 'Badge: ' + name });
    g.scale(u());
    return g;
  };

  const BADGES = [
    { id: 'sale', label: 'SALE burst', make: () => grp([S(poly(starPts(18, 200, 165), { fill: '#ff2d55' })), T('SALE', { fontSize: 92, width: 320, fontFamily: 'Anton', fontWeight: 400 })], 'SALE') },
    { id: 'off', label: '-50% circle', make: () => grp([S(new fabric.Circle({ radius: 170, fill: '#ffd400' })), T('-50%', { fontSize: 104, fill: '#111', width: 320, top: -18, fontFamily: 'Anton', fontWeight: 400 }), T('OFF', { fontSize: 46, fill: '#111', width: 300, top: 70 })], '-50%') },
    { id: 'free-ship', label: 'Free shipping', make: () => grp([S(new fabric.Rect({ width: 640, height: 120, rx: 60, ry: 60, fill: '#00a86b' })), T('FREE SHIPPING', { fontSize: 54, width: 600 })], 'Free shipping') },
    { id: 'new', label: 'NEW tag', make: () => grp([S(poly([{ x: -170, y: 0 }, { x: -110, y: -70 }, { x: 170, y: -70 }, { x: 170, y: 70 }, { x: -110, y: 70 }], { fill: '#1e88ff' })), S(new fabric.Circle({ radius: 14, fill: '#fff' }), -110, 0), T('NEW', { fontSize: 72, width: 260, left: 30 })], 'NEW') },
    { id: 'best', label: 'Best seller ribbon', make: () => grp([S(poly([{ x: -330, y: -60 }, { x: 330, y: -60 }, { x: 290, y: 0 }, { x: 330, y: 60 }, { x: -330, y: 60 }, { x: -290, y: 0 }], { fill: '#ff6b00' })), T('BEST SELLER', { fontSize: 58, width: 560 })], 'Best seller') },
    { id: 'original', label: '100% Original seal', make: () => grp([S(poly(starPts(28, 190, 172), { fill: '#0f146d' })), S(new fabric.Circle({ radius: 150, fill: 'transparent', stroke: '#ffd400', strokeWidth: 8 })), T('100%', { fontSize: 88, width: 300, top: -30, fill: '#ffd400', fontFamily: 'Anton', fontWeight: 400 }), T('ORIGINAL', { fontSize: 44, width: 300, top: 50 })], '100% Original') },
    { id: 'warranty', label: 'Warranty shield', make: () => grp([S(new fabric.Path('M 0 -190 L 160 -130 L 160 20 C 160 120 80 180 0 210 C -80 180 -160 120 -160 20 L -160 -130 Z', { fill: '#2b4bff' })), T('1 YEAR', { fontSize: 64, width: 300, top: -20 }), T('WARRANTY', { fontSize: 36, width: 300, top: 50, fontWeight: 700 })], 'Warranty') },
    { id: 'cod', label: 'COD available', make: () => grp([S(new fabric.Rect({ width: 560, height: 120, rx: 18, ry: 18, fill: '#111111' })), T('COD AVAILABLE', { fontSize: 54, width: 520, fill: '#ffd400' })], 'COD') },
    { id: 'stock', label: 'Ready stock', make: () => grp([S(new fabric.Rect({ width: 520, height: 120, rx: 60, ry: 60, fill: '#ffffff', stroke: '#ee4d2d', strokeWidth: 8 })), T('READY STOCK', { fontSize: 54, width: 480, fill: '#ee4d2d' })], 'Ready stock') },
    { id: 'local', label: 'Local stock', make: () => grp([S(new fabric.Rect({ width: 620, height: 120, rx: 18, ry: 18, fill: '#0f146d' })), T('MALAYSIA STOCK', { fontSize: 52, width: 600, fill: '#ffffff' })], 'Local stock') },
    { id: 'hot', label: 'HOT', make: () => grp([S(poly(starPts(12, 150, 118), { fill: '#ff3b30' })), T('HOT', { fontSize: 80, width: 240, fontFamily: 'Anton', fontWeight: 400 })], 'HOT') },
    { id: 'limited', label: 'Limited time', make: () => grp([S(new fabric.Rect({ width: 600, height: 110, fill: '#000000' })), T('LIMITED TIME ONLY', { fontSize: 48, width: 580, fill: '#ffffff' })], 'Limited time') },
    { id: 'b1f1', label: 'Buy 1 Free 1', make: () => grp([S(new fabric.Circle({ radius: 180, fill: '#d63bff' })), T('BUY 1', { fontSize: 72, width: 320, top: -48 }), T('FREE 1', { fontSize: 72, width: 320, top: 44, fill: '#ffe600' })], 'Buy 1 Free 1') },
    { id: 'official', label: 'Official store', make: () => grp([S(new fabric.Rect({ width: 560, height: 110, rx: 14, ry: 14, fill: '#d0011b' })), T('OFFICIAL STORE', { fontSize: 50, width: 520 })], 'Official store') },
    { id: 'price', label: 'Price tag', make: () => grp([S(new fabric.Rect({ width: 440, height: 220, rx: 30, ry: 30, fill: '#ee4d2d' })), T('RM 199', { fontSize: 96, width: 420, top: 20, fontFamily: 'Anton', fontWeight: 400 }), T('RM 299', { fontSize: 44, width: 400, top: -68, fill: '#ffe0d6', linethrough: true, fontWeight: 600 })], 'Price') },
    { id: 'gift', label: 'Free gift', make: () => grp([S(new fabric.Rect({ width: 480, height: 120, rx: 60, ry: 60, fill: '#ff2d87' })), T('+ FREE GIFT', { fontSize: 56, width: 440 })], 'Free gift') },
  ];

  // ------------------------------------------------------------ icons
  async function makeIcon(name, color = '#111111') {
    let svg = (window.ICONS[name] || window.UI_ICONS[name]);
    if (!svg) return null;
    svg = svg.replace(/currentColor/g, color);
    const { objects, options } = await fabric.loadSVGFromString(svg);
    const g = fabric.util.groupSVGElements(objects.filter(Boolean), options);
    g.set({ name: 'Icon: ' + name });
    g.scale((140 * u()) / Math.max(g.width, g.height));
    return g;
  }

  // ------------------------------------------------------------ specials
  function floorShadow() {
    const w = 600 * u(), h = 90 * u();
    return new fabric.Ellipse({ rx: w / 2, ry: h / 2, name: 'Floor shadow',
      fill: new fabric.Gradient({ type: 'radial', gradientUnits: 'percentage',
        coords: { x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5, r1: 0, r2: 0.5 },
        colorStops: [{ offset: 0, color: 'rgba(0,0,0,0.45)' }, { offset: 1, color: 'rgba(0,0,0,0)' }] }) });
  }

  function productSlot(w = 600 * u(), h = 600 * u()) {
    const m = Math.min(w, h);
    const r = new fabric.Rect({ width: w, height: h, rx: m * 0.04, ry: m * 0.04, fill: 'rgba(124,92,255,0.08)',
      stroke: '#7c5cff', strokeWidth: Math.max(2, m * 0.008), strokeDashArray: [m * 0.03, m * 0.02], originX: 'center', originY: 'center' });
    const t = new fabric.Textbox('Product photo\nDouble-click or drop image', { fontFamily: 'Inter', fontWeight: 600,
      fontSize: m * 0.055, fill: '#7c5cff', textAlign: 'center', width: w * 0.9, originX: 'center', originY: 'center' });
    return new fabric.Group([r, t], { role: 'product', egType: 'placeholder', name: 'Product slot' });
  }

  // ------------------------------------------------------------ text
  const TEXT_STYLES = [
    { id: 'h', label: 'Add a heading', css: 'font:800 26px Poppins', o: { fontFamily: 'Poppins', fontWeight: 800, fontSize: 110 } },
    { id: 'sh', label: 'Add a subheading', css: 'font:600 19px Poppins', o: { fontFamily: 'Poppins', fontWeight: 600, fontSize: 64 } },
    { id: 'b', label: 'Add body text', css: 'font:400 14px Inter', o: { fontFamily: 'Inter', fontWeight: 400, fontSize: 40 } },
  ];
  const TEXT_COMBOS = [
    { id: 'bigsale', label: 'BIG SALE', parts: [{ t: 'MEGA', o: { fontFamily: 'Anton', fontWeight: 400, fontSize: 90, fill: '#111' } }, { t: 'SALE', o: { fontFamily: 'Anton', fontWeight: 400, fontSize: 210, fill: '#ff2d55', top: 150 } }] },
    { id: 'price', label: 'Price', parts: [{ t: 'RM 299', o: { fontFamily: 'Poppins', fontWeight: 600, fontSize: 56, fill: '#888888', linethrough: true } }, { t: 'RM 199', o: { fontFamily: 'Anton', fontWeight: 400, fontSize: 150, fill: '#ee4d2d', top: 110 } }] },
    { id: 'feature', label: 'Feature list', parts: [{ t: '✔ Fast charging\n✔ 2 year warranty\n✔ Free shipping', o: { fontFamily: 'Poppins', fontWeight: 600, fontSize: 54, fill: '#111', textAlign: 'left', lineHeight: 1.35, width: 700 } }] },
    { id: 'title', label: 'Product title', parts: [{ t: 'PRODUCT NAME', o: { fontFamily: 'Montserrat', fontWeight: 900, fontSize: 96, fill: '#111' } }, { t: 'Short catchy tagline here', o: { fontFamily: 'Inter', fontWeight: 400, fontSize: 44, fill: '#555', top: 95 } }] },
    { id: 'script', label: 'Script', parts: [{ t: 'Special', o: { fontFamily: 'Pacifico', fontWeight: 400, fontSize: 120, fill: '#d63bff' } }, { t: 'OFFER', o: { fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: 150, fill: '#111', top: 120, charSpacing: 200 } }] },
    { id: 'neon', label: 'Neon', parts: [{ t: 'FLASH DEAL', o: { fontFamily: 'Bebas Neue', fontWeight: 400, fontSize: 160, fill: '#25f4ee', shadow: { color: '#25f4ee', blur: 60 } } }] },
  ];

  function makeText(text, o = {}) {
    const k = u();
    const fs = (o.fontSize || 60) * k;
    const t = new fabric.Textbox(text, {
      fontFamily: 'Poppins', fill: '#111111', textAlign: 'center', ...o, fontSize: fs,
      width: o.width ? o.width * k : Math.min(E.W * 0.85, Math.max(fs * text.split('\n').reduce((m, l) => Math.max(m, l.length), 1) * 0.62, fs * 2)),
      top: (o.top || 0) * k, left: (o.left || 0) * k, originX: 'center', originY: 'top',
      shadow: o.shadow ? new fabric.Shadow({ ...o.shadow, blur: o.shadow.blur * k }) : null,
      charSpacing: o.charSpacing || 0,
    });
    return t;
  }

  async function addTextCombo(c) {
    const items = c.parts.map(p => makeText(p.t, p.o));
    await FONTS.ensureForObjects(items);
    items.forEach(t => t.initDimensions && t.initDimensions());
    if (items.length === 1) { E.add(items[0]); return; }
    const vc = E.viewCenter();
    const top0 = Math.min(...items.map(i => i.top));
    E.withSilent(() => items.forEach(t => { t.set({ left: vc.x + t.left, top: vc.y - 120 * u() + (t.top - top0) }); E.canvas.add(t); t.setCoords(); }));
    E.canvas.setActiveObject(new fabric.ActiveSelection(items, { canvas: E.canvas }));
    E.canvas.requestRenderAll();
    E.commit();
  }

  return { SHAPES, LINES, BADGES, TEXT_STYLES, TEXT_COMBOS, makeIcon, floorShadow, productSlot, makeText, addTextCombo, u, starPts, polyPts };
})();
