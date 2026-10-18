/* Small UI helpers shared by every module. */
window.U = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function icon(name, cls = '') {
    const svg = (window.UI_ICONS[name] || window.ICONS[name] || '');
    return `<i data-i="${name}" class="${cls}">${svg}</i>`;
  }
  function hydrateIcons(root = document) {
    $$('i[data-i]', root).forEach(i => {
      if (!i.innerHTML.trim()) i.innerHTML = window.UI_ICONS[i.dataset.i] || window.ICONS[i.dataset.i] || '';
    });
  }

  // tiny element builder: h('div.cls#id', {attrs}, children...)
  function h(sel, attrs, ...kids) {
    const m = sel.match(/^([a-z0-9]+)?([^]*)$/i);
    const e = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][^.#]+/g) || []).forEach(p => p[0] === '.' ? e.classList.add(p.slice(1)) : e.id = p.slice(1));
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    kids.flat().forEach(k => k != null && k !== false && e.append(k instanceof Node ? k : document.createTextNode(k)));
    return e;
  }

  function toast(msg, type = '', ms = 3200) {
    const t = h('div.toast' + (type ? '.' + type : ''), msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------------------------------------------------------- modal
  let modalResolve = null;
  function modal({ title, body, buttons = [], wide = false, onOpen }) {
    closeModal(null);
    $('#modalTitle').textContent = title;
    const mb = $('#modalBody'); mb.innerHTML = '';
    if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.append(body);
    const mf = $('#modalFoot'); mf.innerHTML = '';
    $('.modal-box').classList.toggle('wide', wide);
    return new Promise(res => {
      modalResolve = res;
      buttons.forEach(b => {
        const btn = h('button' + (b.primary ? '.btn-accent' : '.tb-btn'), b.label);
        btn.onclick = async () => {
          if (b.onClick) { const r = await b.onClick(); if (r === false) return; }
          closeModal(b.value !== undefined ? b.value : b.label);
        };
        mf.append(btn);
      });
      $('#modal').classList.remove('hidden');
      hydrateIcons(mb);
      onOpen && onOpen(mb);
    });
  }
  function closeModal(v) {
    $('#modal').classList.add('hidden');
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(v); }
  }
  const confirm = (title, text, ok = 'OK') => modal({ title, body: `<p>${text}</p>`,
    buttons: [{ label: 'Cancel', value: false }, { label: ok, value: true, primary: true }] });
  const alert = (title, text) => modal({ title, body: `<p>${text}</p>`, buttons: [{ label: 'OK', value: true, primary: true }] });

  // ----------------------------------------------------------- busy
  function busy(msg, frac = -1, onCancel = null) {
    if (msg === false) { $('#busy').classList.add('hidden'); return; }
    $('#busy').classList.remove('hidden');
    $('#busyMsg').textContent = msg;
    $('#busyBar').style.width = frac < 0 ? '0' : (frac * 100).toFixed(1) + '%';
    $('#busyBar').parentElement.style.visibility = frac < 0 ? 'hidden' : 'visible';
    const c = $('#busyCancel');
    c.hidden = !onCancel;
    c.onclick = onCancel;
  }
  const busyUpdate = (msg, frac = -1) => {
    if (msg) $('#busyMsg').textContent = msg;
    $('#busyBar').style.width = frac < 0 ? '0' : (frac * 100).toFixed(1) + '%';
    $('#busyBar').parentElement.style.visibility = frac < 0 ? 'hidden' : 'visible';
  };
  const busyEnd = () => $('#busy').classList.add('hidden');

  // -------------------------------------------------------- popover
  let openPop = null;
  function popover(anchor, content, { onClose, side = 'below' } = {}) {
    closePop();
    const p = h('div.pop');
    if (typeof content === 'string') p.innerHTML = content; else p.append(content);
    document.body.append(p);
    hydrateIcons(p);
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let x = Math.min(r.left, innerWidth - pw - 8), y = side === 'below' ? r.bottom + 6 : r.top - ph - 6;
    if (y + ph > innerHeight - 8) y = Math.max(8, innerHeight - ph - 8);
    p.style.left = Math.max(8, x) + 'px'; p.style.top = y + 'px';
    openPop = { el: p, anchor, onClose };
    setTimeout(() => document.addEventListener('mousedown', popOutside, true), 0);
    return p;
  }
  function popOutside(e) {
    if (!openPop) return;
    if (openPop.el.contains(e.target) || openPop.anchor.contains(e.target)) return;
    closePop();
  }
  function closePop() {
    document.removeEventListener('mousedown', popOutside, true);
    if (openPop) { const o = openPop; openPop = null; o.el.remove(); o.onClose && o.onClose(); }
  }

  // --------------------------------------------------------- colors
  const PALETTE = ['#000000', '#3a3a3a', '#7a7a7a', '#bdbdbd', '#ffffff', '#ff3b30', '#ff6b00', '#ffb300',
    '#ffe600', '#34c759', '#00a86b', '#00c2d1', '#1e88ff', '#2b4bff', '#7c5cff', '#d63bff',
    '#ff2d87', '#ee4d2d', '#0f146d', '#f57224', '#fe2c55', '#25f4ee', '#1a1a2e', '#f5f0e6'];
  // Shopee orange, Lazada navy/orange, TikTok pink/cyan sit in the palette above.
  let recentColors = JSON.parse(localStorageGet('eg_recent_colors') || '[]');
  function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  function toHex(c) {
    if (!c || c === 'transparent') return '#ffffff';
    try { return '#' + new fabric.Color(c).toHex().toLowerCase(); } catch (e) { return '#000000'; }
  }

  function colorPicker(anchor, value, onChange, { allowNone = false, docColors = [], onClose } = {}) {
    const box = h('div');
    const cur = toHex(value);
    const inp = h('input', { type: 'color', value: cur });
    const txt = h('input', { type: 'text', value: cur, maxlength: 9 });
    const pick = (c, final = true) => {
      inp.value = toHex(c); txt.value = c === 'transparent' ? 'none' : toHex(c);
      onChange(c);
      if (final && c !== 'transparent') {
        recentColors = [c, ...recentColors.filter(x => x !== c)].slice(0, 8);
        localStorageSet('eg_recent_colors', JSON.stringify(recentColors));
      }
    };
    inp.oninput = () => pick(inp.value, false);
    inp.onchange = () => pick(inp.value);
    txt.onchange = () => { let v = txt.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{3,8}$/i.test(v)) pick(v); };
    const row = h('div.color-row', inp, txt);
    if (window.EyeDropper) {
      const ed = h('button.icon-btn', { title: 'Pick colour from screen', html: U.icon('pipette') });
      ed.onclick = async () => { try { const r = await new EyeDropper().open(); pick(r.sRGBHex); } catch (e) { /* cancelled */ } };
      row.append(ed);
    }
    box.append(row);
    const sw = (list) => { const g = h('div.swatches'); list.forEach(c => g.append(h('button', { style: { background: c }, title: c, onclick: () => pick(c) }))); return g; };
    if (allowNone) box.append(h('button.chip-btn', { style: { margin: '2px 0 8px' }, onclick: () => pick('transparent') }, 'No colour'));
    if (docColors.length) { box.append(h('h4', 'Document colours'), sw(docColors.slice(0, 16))); }
    if (recentColors.length) { box.append(h('h4', 'Recent'), sw(recentColors)); }
    box.append(h('h4', 'Colours'), sw(PALETTE));
    return popover(anchor, box, { onClose });
  }

  function slider(label, min, max, step, value, onInput, fmt = v => v) {
    const val = h('span.val', fmt(value));
    const r = h('input', { type: 'range', min, max, step, value });
    r.oninput = () => { val.textContent = fmt(+r.value); onInput(+r.value, false); };
    r.onchange = () => onInput(+r.value, true);
    return h('div.row', h('label', label), r, val);
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function downloadDataURL(name, url) {
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  }

  return { $, $$, h, icon, hydrateIcons, toast, modal, closeModal, confirm, alert, busy, busyUpdate, busyEnd,
    popover, closePop, colorPicker, toHex, slider, debounce, fileToDataURL, loadImg, sleep, uid, esc,
    downloadDataURL, PALETTE, lsGet: localStorageGet, lsSet: localStorageSet };
})();
