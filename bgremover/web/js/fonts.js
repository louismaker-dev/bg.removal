/* Fonts: bundled (always available offline) + common Windows fonts. */
window.FONTS = (() => {
  const bundled = [
    { name: 'Inter', w: [400, 600, 700, 800] },
    { name: 'Poppins', w: [400, 600, 700, 800, 900] },
    { name: 'Montserrat', w: [400, 700, 900] },
    { name: 'Bebas Neue', w: [400] },
    { name: 'Oswald', w: [400, 600, 700] },
    { name: 'Anton', w: [400] },
    { name: 'Roboto Condensed', w: [400, 700] },
    { name: 'Playfair Display', w: [400, 700] },
    { name: 'Pacifico', w: [400] },
    { name: 'Lobster', w: [400] },
  ];
  // Fonts that ship with Windows (incl. Chinese / Malay friendly ones).
  const system = ['Arial', 'Arial Black', 'Segoe UI', 'Impact', 'Verdana', 'Tahoma', 'Georgia',
    'Times New Roman', 'Trebuchet MS', 'Comic Sans MS', 'Microsoft YaHei', 'SimHei', 'SimSun',
    'Microsoft JhengHei', 'KaiTi', 'DengXian'];

  const all = () => [...bundled.map(f => f.name), ...system];

  async function ensure(family, weight = 400, style = 'normal') {
    if (!document.fonts) return;
    try { await document.fonts.load(`${style} ${weight} 40px "${family}"`); } catch (e) { /* ignore */ }
  }
  async function preloadAll() {
    const jobs = [];
    bundled.forEach(f => f.w.forEach(w => jobs.push(ensure(f.name, w))));
    await Promise.all(jobs);
    try { fabric.cache.clearFontCache(); } catch (e) { /* ignore */ }
  }
  // Make sure all fonts used by a list of fabric objects are ready before render.
  async function ensureForObjects(objs) {
    const jobs = [];
    const walk = o => {
      if (!o) return;
      if (o.fontFamily) jobs.push(ensure(o.fontFamily, o.fontWeight || 400, o.fontStyle || 'normal'));
      (o.objects || o._objects || []).forEach(walk);
    };
    objs.forEach(walk);
    await Promise.all(jobs);
    clearCache();
  }
  // Fabric caches glyph widths per font; drop them once real fonts have loaded
  const loadedOnce = new Set();
  function clearCache() {
    if (!document.fonts) return;
    document.fonts.forEach(f => {
      if (f.status === 'loaded' && !loadedOnce.has(f.family)) {
        loadedOnce.add(f.family);
        try { fabric.cache.clearFontCache(f.family.replace(/"/g, '')); } catch (e) { /* ignore */ }
      }
    });
  }
  return { bundled, system, all, ensure, preloadAll, ensureForObjects, clearCache };
})();
