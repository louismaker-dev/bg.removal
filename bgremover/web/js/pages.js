/* Multiple pages per design (e.g. a full listing set: cover, features, specs). */
window.PAGES = (() => {
  const { $, h, icon } = U;
  let pages = [];   // [{ id, doc, thumb }]
  let cur = 0;
  let busy = false;

  const strip = () => $('#pagesStrip');

  function reset(doc) {
    pages = [{ id: U.uid(), doc: doc || E.toJSON(), thumb: '' }];
    cur = 0;
    render();
    refreshThumb();
  }
  function snapshot() { if (pages[cur]) pages[cur].doc = E.toJSON(); }

  const refreshThumb = U.debounce(async () => {
    if (!pages[cur]) return;
    try { pages[cur].thumb = await E.thumbnail(140); } catch (e) { /* ignore */ }
    const img = strip() && strip().querySelector(`[data-pid="${pages[cur].id}"] img`);
    if (img) img.src = pages[cur].thumb; else render();
  }, 600);

  async function go(i) {
    if (busy || i === cur || i < 0 || i >= pages.length) return;
    busy = true;
    try {
      snapshot();
      pages[cur].thumb = await E.thumbnail(140);
      cur = i;
      await E.load(pages[cur].doc);
      render();
    } finally { busy = false; }
  }

  async function add(duplicate = false) {
    snapshot();
    let doc;
    if (duplicate) doc = JSON.parse(JSON.stringify(pages[cur].doc));
    else {
      const d = E.toJSON();
      doc = { ...d, canvas: { ...d.canvas, objects: d.canvas.objects.filter(o => o.role === 'background').map(o => ({ ...o, fill: '#ffffff' })) } };
    }
    pages.splice(cur + 1, 0, { id: U.uid(), doc, thumb: '' });
    pages[cur].thumb = await E.thumbnail(140);
    cur++;
    await E.load(doc);
    render();
    refreshThumb();
    E.emit('change', 'pages');
  }

  async function remove(i = cur) {
    if (pages.length < 2) { U.toast('A design needs at least one page'); return; }
    const ok = await U.confirm('Delete page', `Delete page ${i + 1}? This can't be undone.`, 'Delete');
    if (!ok) return;
    pages.splice(i, 1);
    cur = Math.min(i, pages.length - 1);
    await E.load(pages[cur].doc);
    render();
    E.emit('change', 'pages');
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= pages.length) return;
    snapshot();
    [pages[i], pages[j]] = [pages[j], pages[i]];
    if (cur === i) cur = j; else if (cur === j) cur = i;
    render();
    E.emit('change', 'pages');
  }

  function render() {
    const s = strip();
    if (!s) return;
    s.innerHTML = '';
    pages.forEach((p, i) => {
      const t = h('div.page-thumb' + (i === cur ? '.cur' : ''), { 'data-pid': p.id, title: `Page ${i + 1}`, onclick: () => go(i) },
        p.thumb ? h('img', { src: p.thumb }) : h('div.ph'), h('span.pn', String(i + 1)));
      t.oncontextmenu = e => {
        e.preventDefault();
        const box = h('div.menu.open', { style: { position: 'static', display: 'block', boxShadow: 'none', border: 0, padding: 0 } });
        const it = (ic, l, fn) => h('button', { html: icon(ic) + l, onclick: () => { U.closePop(); fn(); } });
        box.append(it('copy-plus', 'Duplicate page', async () => { await go(i); await add(true); }),
          it('arrow-up', 'Move left', () => move(i, -1)), it('arrow-down', 'Move right', () => move(i, 1)),
          it('trash-2', 'Delete page', () => remove(i)));
        U.popover(t, box, { side: 'above' });
      };
      s.append(t);
    });
    s.append(h('button.page-add', { title: 'Add a blank page', onclick: () => add(false), html: icon('plus') }),
      h('button.page-add', { title: 'Duplicate this page', onclick: () => add(true), html: icon('copy-plus') }));
    U.hydrateIcons(s);
    const lbl = $('#pageLabel');
    if (lbl) lbl.textContent = pages.length > 1 ? `Page ${cur + 1} of ${pages.length}` : '';
  }

  // project (de)serialisation ------------------------------------------
  function data() {
    snapshot();
    return pages.map(p => p.doc);
  }
  async function loadAll(docs, startAt = 0) {
    pages = docs.map(d => ({ id: U.uid(), doc: d, thumb: '' }));
    cur = Math.min(startAt, pages.length - 1);
    await E.load(pages[cur].doc);
    render();
    // thumbnails for the other pages
    for (const p of pages) {
      if (p === pages[cur]) continue;
      try { p.thumb = await E.renderDoc(p.doc, { format: 'jpeg', multiplier: 140 / Math.max(p.doc.width, p.doc.height), quality: 0.8 }); } catch (e) { /* ignore */ }
    }
    render();
    refreshThumb();
  }

  function init() {
    E.on('change', why => { if (why !== 'load') refreshThumb(); });
  }

  return { init, reset, add, remove, go, data, loadAll, snapshot, get count() { return pages.length; }, get cur() { return cur; } };
})();
