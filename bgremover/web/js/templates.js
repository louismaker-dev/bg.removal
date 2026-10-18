/* Listing templates. Each one is built in code so it adapts to any page size. */
window.TPL = (() => {
  function kit(W, H) {
    const k = Math.min(W, H) / 1080;
    const portrait = H / W > 1.15, landscape = W / H > 1.15;
    const objs = [];
    const add = o => { objs.push(o); return o; };
    const text = (t, o = {}) => add(new fabric.Textbox(t, {
      fontFamily: 'Poppins', fontWeight: 800, fill: '#111111', textAlign: 'center', originX: 'center', originY: 'center', left: W / 2,
      ...o, fontSize: (o.fontSize || 60) * k, width: (o.width || 900) * k, charSpacing: o.charSpacing || 0,
      shadow: o.shadow ? new fabric.Shadow({ ...o.shadow, blur: o.shadow.blur * k, offsetX: (o.shadow.offsetX || 0) * k, offsetY: (o.shadow.offsetY || 0) * k }) : null,
    }));
    const rect = (o) => add(new fabric.Rect({ originX: 'center', originY: 'center', ...o }));
    const circle = (o) => add(new fabric.Circle({ originX: 'center', originY: 'center', ...o }));
    const slot = (x, y, w, h) => { const s = EL.productSlot(w, h); s.set({ left: x, top: y, originX: 'center', originY: 'center' }); return add(s); };
    const badge = (id, x, y, scale = 1, patch) => {
      const b = EL.BADGES.find(b => b.id === id).make();
      b.scale(k * scale); b.set({ left: x, top: y, originX: 'center', originY: 'center' });
      if (patch) patch(b);
      return add(b);
    };
    const shape = (id, color, x, y, scale = 1, extra = {}) => {
      const s = EL.SHAPES.find(s => s.id === id).make(color);
      s.set({ left: x, top: y, originX: 'center', originY: 'center', scaleX: (s.scaleX || 1) * scale * k / EL.u(), scaleY: (s.scaleY || 1) * scale * k / EL.u(), ...extra });
      return add(s);
    };
    const grad = (c1, c2, angle = 135) => {
      const a = angle * Math.PI / 180;
      return new fabric.Gradient({ type: 'linear', gradientUnits: 'pixels',
        coords: { x1: W / 2 - Math.cos(a) * W / 2, y1: H / 2 - Math.sin(a) * H / 2, x2: W / 2 + Math.cos(a) * W / 2, y2: H / 2 + Math.sin(a) * H / 2 },
        colorStops: [{ offset: 0, color: c1 }, { offset: 1, color: c2 }] });
    };
    const floor = (x, y, w) => { const f = EL.floorShadow(); f.set({ left: x, top: y, originX: 'center', originY: 'center', scaleX: w / (f.rx * 2), scaleY: w / (f.rx * 2) }); return add(f); };
    return { W, H, k, portrait, landscape, objs, add, text, rect, circle, slot, badge, shape, grad, floor, cx: W / 2, cy: H / 2 };
  }

  const LIST = [
    {
      id: 'hero', name: 'Hero gradient', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = K.grad('#6a3cff', '#00c2d1');
        K.circle({ left: cx, top: H * 0.52, radius: Math.min(W, H) * 0.36, fill: 'rgba(255,255,255,0.14)' });
        K.text('PRODUCT NAME', { top: 105 * k, fontSize: 92, fill: '#ffffff', fontFamily: 'Montserrat', fontWeight: 900 });
        K.text('Your short catchy tagline', { top: 180 * k, fontSize: 40, fill: '#e8e6ff', fontFamily: 'Inter', fontWeight: 400 });
        K.slot(cx, H * 0.53, Math.min(W * 0.7, H * 0.55), Math.min(W * 0.7, H * 0.55));
        K.badge('price', W - 250 * k, H - 170 * k, 0.85);
        K.badge('free-ship', 270 * k, H - 110 * k, 0.7);
        return K;
      }
    },
    {
      id: 'sale', name: 'Mega sale', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = K.grad('#ff2d55', '#ff7a00', 160);
        K.shape('burst', 'rgba(255,255,255,0.12)', cx, H * 0.55, 2.4);
        K.text('MEGA', { top: 80 * k, fontSize: 90, fill: '#ffe600', fontFamily: 'Anton', fontWeight: 400, charSpacing: 120 });
        K.text('SALE', { top: 250 * k, fontSize: 190, fill: '#ffffff', fontFamily: 'Anton', fontWeight: 400, shadow: { color: 'rgba(0,0,0,0.25)', blur: 0, offsetX: 8, offsetY: 8 } });
        K.slot(cx, H * 0.6, Math.min(W * 0.62, H * 0.5), Math.min(W * 0.62, H * 0.5));
        K.badge('off', W - 190 * k, H * 0.45, 0.8);
        K.text('LIMITED TIME ONLY', { top: H - 70 * k, fontSize: 44, fill: '#ffffff', fontWeight: 700, charSpacing: 150 });
        return K;
      }
    },
    {
      id: 'clean', name: 'Clean white', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = '#ffffff';
        K.circle({ left: cx, top: H * 0.5, radius: Math.min(W, H) * 0.38, fill: '#f2f4f8' });
        const s = Math.min(W * 0.66, H * 0.6);
        K.floor(cx, H * 0.5 + s * 0.46, s * 0.8);
        K.slot(cx, H * 0.5, s, s);
        K.text('BRAND', { left: 70 * k, top: 70 * k, originX: 'left', textAlign: 'left', fontSize: 40, fontFamily: 'Montserrat', fontWeight: 900, charSpacing: 300, width: 500 });
        K.badge('new', W - 160 * k, 90 * k, 0.6);
        K.text('Product name · Key spec', { top: H - 80 * k, fontSize: 44, fontFamily: 'Inter', fontWeight: 600, fill: '#333333' });
        return K;
      }
    },
    {
      id: 'features', name: 'Feature callouts', build(W, H) {
        const K = kit(W, H), { k } = K;
        K.bg = '#f4f6fb';
        const side = !K.portrait;
        const sw = side ? W * 0.5 : W * 0.8, sh = side ? H * 0.7 : H * 0.45;
        const sx = side ? W * 0.29 : W / 2, sy = side ? H * 0.55 : H * 0.36;
        K.rect({ left: sx, top: sy, width: sw * 1.02, height: sh * 1.02, rx: 40 * k, ry: 40 * k, fill: '#ffffff' });
        K.slot(sx, sy, sw * 0.92, sh * 0.92);
        const tx = side ? W * 0.76 : W / 2, ty0 = side ? H * 0.3 : H * 0.66;
        K.text('PRODUCT NAME', { left: side ? W * 0.56 : tx, top: side ? H * 0.12 : H * 0.07, originX: side ? 'left' : 'center', textAlign: side ? 'left' : 'center', fontSize: 72, width: side ? 440 : 900, fontFamily: 'Montserrat', fontWeight: 900 });
        const feats = ['Fast charging', 'Long battery life', 'Lightweight design', '1 year warranty'];
        feats.forEach((f, i) => {
          const y = ty0 + i * (side ? 120 : 85) * k;
          K.circle({ left: (side ? W * 0.58 : W * 0.2), top: y, radius: 26 * k, fill: '#7c5cff' });
          K.text('✓', { left: (side ? W * 0.58 : W * 0.2), top: y, fontSize: 34, fill: '#ffffff', width: 60, fontFamily: 'Inter' });
          K.text(f, { left: (side ? W * 0.58 : W * 0.2) + 50 * k, top: y, originX: 'left', textAlign: 'left', fontSize: 40, fontWeight: 600, fill: '#222222', width: side ? 400 : 640 });
        });
        return K;
      }
    },
    {
      id: 'tech', name: 'Dark tech', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = K.grad('#070a14', '#16264a', 90);
        K.circle({ left: cx, top: H * 0.5, radius: Math.min(W, H) * 0.33, fill: 'transparent', stroke: 'rgba(37,244,238,0.5)', strokeWidth: 4 * k });
        K.circle({ left: cx, top: H * 0.5, radius: Math.min(W, H) * 0.25, fill: 'rgba(37,244,238,0.08)' });
        K.text('GAMING GEAR', { top: 110 * k, width: 1000, fontSize: 120, fill: '#ffffff', fontFamily: 'Bebas Neue', fontWeight: 400, charSpacing: 80, shadow: { color: '#25f4ee', blur: 40 } });
        K.slot(cx, H * 0.52, Math.min(W * 0.6, H * 0.5), Math.min(W * 0.6, H * 0.5));
        ['RGB', '144Hz', 'Wireless'].forEach((t, i) => {
          const x = cx + (i - 1) * 300 * k, y = H - 110 * k;
          K.rect({ left: x, top: y, width: 260 * k, height: 80 * k, rx: 40 * k, ry: 40 * k, fill: 'rgba(255,255,255,0.06)', stroke: '#25f4ee', strokeWidth: 3 * k });
          K.text(t, { left: x, top: y, fontSize: 38, fill: '#ffffff', fontWeight: 600, width: 250 });
        });
        return K;
      }
    },
    {
      id: 'pricedrop', name: 'Price drop', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = '#ffd400';
        K.rect({ left: cx, top: 90 * k, width: W, height: 150 * k, fill: '#111111' });
        K.text('PRICE DROP', { top: 90 * k, fontSize: 96, fill: '#ffd400', fontFamily: 'Anton', fontWeight: 400, charSpacing: 100 });
        K.slot(cx, H * 0.5, Math.min(W * 0.6, H * 0.48), Math.min(W * 0.6, H * 0.48));
        K.text('RM 299', { top: H - 245 * k, fontSize: 60, fill: '#555555', fontWeight: 600, linethrough: true });
        K.text('RM 199', { top: H - 110 * k, fontSize: 150, fill: '#d0011b', fontFamily: 'Anton', fontWeight: 400 });
        return K;
      }
    },
    {
      id: 'gift', name: 'Free gift bundle', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = K.grad('#fff0f6', '#ffe3ef', 90);
        K.text('BUNDLE DEAL', { top: H * 0.09, fontSize: 96, fill: '#ff2d87', fontFamily: 'Montserrat', fontWeight: 900 });
        K.slot(cx - 80 * k, H * 0.52, Math.min(W * 0.58, H * 0.52), Math.min(W * 0.58, H * 0.52));
        K.badge('gift', W - 260 * k, H * 0.72, 0.8);
        K.shape('heart', '#ff2d87', W - 170 * k, H * 0.28, 0.35);
        K.text('While stocks last', { top: H - 70 * k, fontSize: 40, fill: '#a0004a', fontFamily: 'Inter', fontWeight: 600 });
        return K;
      }
    },
    {
      id: 'specs', name: 'Specs sheet', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = '#ffffff';
        K.rect({ left: cx, top: H * 0.43, width: W, height: H * 0.86, fill: '#eef2f7' });
        K.text('MODEL X100', { top: H * 0.07, fontSize: 84, fontFamily: 'Montserrat', fontWeight: 900, fill: '#0f146d' });
        K.slot(cx, H * 0.4, Math.min(W * 0.62, H * 0.44), Math.min(W * 0.62, H * 0.44));
        const specs = [['Battery', '5000mAh'], ['Display', '6.7" AMOLED'], ['Storage', '256GB'], ['Charging', '65W Fast']];
        specs.forEach(([a, b], i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = cx + (col ? 1 : -1) * W * 0.22, y = H * 0.76 + row * 120 * k;
          K.rect({ left: x, top: y, width: W * 0.4, height: 100 * k, rx: 18 * k, ry: 18 * k, fill: '#ffffff', stroke: '#d8deea', strokeWidth: 2 * k });
          K.text(a.toUpperCase(), { left: x, top: y - 20 * k, fontSize: 24, fill: '#7a8599', fontWeight: 600, width: W * 0.38 / k, charSpacing: 100 });
          K.text(b, { left: x, top: y + 16 * k, fontSize: 40, fill: '#0f146d', fontWeight: 800, width: W * 0.38 / k });
        });
        return K;
      }
    },
    {
      id: 'minimal', name: 'Minimal frame', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = '#f5f0e6';
        K.rect({ left: cx, top: H / 2, width: W - 80 * k, height: H - 80 * k, fill: 'transparent', stroke: '#2b2b2b', strokeWidth: 3 * k });
        K.text('The Essential', { top: H * 0.13, fontSize: 88, fill: '#2b2b2b', fontFamily: 'Playfair Display', fontWeight: 700 });
        K.text('NEW COLLECTION', { top: H * 0.2, fontSize: 30, fill: '#6b6257', fontFamily: 'Inter', fontWeight: 600, charSpacing: 400 });
        K.slot(cx, H * 0.56, Math.min(W * 0.6, H * 0.52), Math.min(W * 0.6, H * 0.52));
        K.text('shop now', { top: H - 110 * k, fontSize: 40, fill: '#2b2b2b', fontFamily: 'Playfair Display', fontWeight: 400 });
        return K;
      }
    },
    {
      id: 'campaign', name: 'Campaign day', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = K.grad('#ee4d2d', '#ff8a3d', 120);
        K.shape('burst', 'rgba(255,255,255,0.15)', 160 * k, 160 * k, 0.9);
        K.shape('burst', 'rgba(255,255,255,0.15)', W - 140 * k, H - 160 * k, 1.1);
        K.text('11.11', { top: 140 * k, fontSize: 180, fill: '#ffffff', fontFamily: 'Anton', fontWeight: 400, shadow: { color: 'rgba(0,0,0,0.25)', blur: 0, offsetX: 7, offsetY: 7 } });
        K.text('BIG SALE', { top: 270 * k, fontSize: 70, fill: '#ffe600', fontFamily: 'Poppins', fontWeight: 900, charSpacing: 200 });
        K.rect({ left: cx, top: H * 0.62, width: Math.min(W * 0.7, H * 0.55), height: Math.min(W * 0.7, H * 0.55), rx: 50 * k, ry: 50 * k, fill: '#ffffff' });
        K.slot(cx, H * 0.62, Math.min(W * 0.62, H * 0.48), Math.min(W * 0.62, H * 0.48));
        K.badge('cod', cx, H - 60 * k, 0.6);
        return K;
      }
    },
    {
      id: 'compare', name: 'Before / after', build(W, H) {
        const K = kit(W, H), { k } = K;
        K.bg = '#ffffff';
        K.rect({ left: W * 0.25, top: H / 2, width: W / 2, height: H, fill: '#e9ecf1' });
        K.rect({ left: W * 0.75, top: H / 2, width: W / 2, height: H, fill: '#e3f8ee' });
        K.text('BEFORE', { left: W * 0.25, top: 90 * k, fontSize: 64, fill: '#6b7280', fontFamily: 'Montserrat', fontWeight: 900, width: 480 });
        K.text('AFTER', { left: W * 0.75, top: 90 * k, fontSize: 64, fill: '#00a86b', fontFamily: 'Montserrat', fontWeight: 900, width: 480 });
        const s = Math.min(W * 0.42, H * 0.6);
        K.slot(W * 0.25, H * 0.55, s, s).set({ role: 'product2', name: 'Second photo slot' });
        K.slot(W * 0.75, H * 0.55, s, s);
        return K;
      }
    },
    {
      id: 'story', name: 'Live promo', build(W, H) {
        const K = kit(W, H), { k, cx } = K;
        K.bg = K.grad('#14001f', '#3a0a3f', 90);
        K.circle({ left: cx, top: H * 0.48, radius: Math.min(W, H) * 0.42, fill: 'rgba(254,44,85,0.18)' });
        K.rect({ left: 150 * k, top: 90 * k, width: 190 * k, height: 70 * k, rx: 12 * k, ry: 12 * k, fill: '#fe2c55' });
        K.text('● LIVE', { left: 150 * k, top: 90 * k, fontSize: 36, fill: '#ffffff', width: 190 });
        K.text('FLASH DEAL', { top: Math.max(220 * k, H * 0.17), width: 1000, fontSize: 130, fill: '#ffffff', fontFamily: 'Bebas Neue', fontWeight: 400, charSpacing: 60, shadow: { color: '#25f4ee', blur: 0, offsetX: -5, offsetY: 0 } });
        K.slot(cx, H * 0.55, Math.min(W * 0.66, H * 0.48), Math.min(W * 0.66, H * 0.48));
        K.rect({ left: cx, top: H - 120 * k, width: 560 * k, height: 110 * k, rx: 55 * k, ry: 55 * k, fill: '#25f4ee' });
        K.text('SHOP NOW', { top: H - 120 * k, fontSize: 58, fill: '#14001f', width: 540 });
        return K;
      }
    },
  ];

  async function buildDoc(t, W, H) {
    const K = t.build(W, H);
    await FONTS.ensureForObjects(K.objs);
    const bg = new fabric.Rect({ left: 0, top: 0, width: W, height: H, fill: K.bg || '#ffffff', selectable: false, evented: false, role: 'background', name: 'Background', originX: 'left', originY: 'top' });
    const objs = [bg, ...K.objs].map(o => o.toObject(E.PROPS));
    return { width: W, height: H, canvas: { objects: objs } };
  }

  const thumbCache = {};
  async function thumb(t, W = 1080, H = 1080) {
    const key = t.id + W + 'x' + H;
    if (!thumbCache[key]) {
      const doc = await buildDoc(t, W, H);
      thumbCache[key] = await E.renderDoc(doc, { format: 'jpeg', multiplier: 260 / Math.max(W, H), quality: 0.85 });
    }
    return thumbCache[key];
  }

  // Apply a template to the current page, carrying the current product photo over.
  async function apply(t) {
    const W = E.W, H = E.H;
    const existing = E.userObjects();
    const product = existing.find(o => o.type === 'image' && o.role === 'product') || existing.find(o => o.type === 'image');
    if (existing.length && !product) {
      const ok = await U.confirm('Apply template', 'This replaces what is on the page. You can undo with Ctrl+Z.', 'Apply');
      if (!ok) return;
    }
    const doc = await buildDoc(t, W, H);
    await E.load(doc, { keepHistory: true });
    if (product) {
      const slot = E.userObjects().find(o => o.role === 'product');
      if (slot) {
        const img = await product.clone(E.PROPS);
        E.replaceWithImage(slot, img);
      }
    }
    E.commit();
  }

  return { LIST, buildDoc, thumb, apply, kit };
})();
