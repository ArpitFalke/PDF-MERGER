'use strict';
/* =====================================================================
   ANTROR core — shared platform code
   LOAD ORDER: this file FIRST, then tool files, then app.js (boot).
   Exposes (globals): $, $$, el, esc, fmtBytes, delay, frame, clamp,
   fmtTime, canvasToUrl, UserMsg, svg, I, ROUTES, Platform, syncChrome,
   toast, Modal, btn, setTheme, makeSortable.
   Tools self-register: ROUTES[key] = {...} and Platform.syncExtras.push(fn)
   ===================================================================== */

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const delay = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = s => { s = Math.max(0, Math.round(s || 0)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
const canvasToUrl = (canvas, type = 'image/png', q) => new Promise((res, rej) => {
  canvas.toBlob(b => b ? res(URL.createObjectURL(b)) : rej(new Error('blob-failed')), type, q);
});
class UserMsg extends Error {}

/* ---------- icons ---------- */
const svg = inner => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const I = {
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H16"/>'),
  trash: svg('<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.9 11.2A2 2 0 0 0 9.4 20h5.2a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/>'),
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="5.5" r="1.5"/><circle cx="15" cy="5.5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18.5" r="1.5"/><circle cx="15" cy="18.5" r="1.5"/></svg>',
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  alert: svg('<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.3"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3.5V8h-4.5"/>'),
  download: svg('<path d="M12 4v10.5M7.5 11 12 15.5 16.5 11"/><path d="M4.5 19.5h15"/>'),
  filePlus: svg('<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M13.5 3v5.5H19"/><path d="M12 12v5M9.5 14.5h5"/>'),
};

/* ---------- router (tools add their own entries) ---------- */
const ROUTES = {
  'home': { sub: 'Tools', title: 'ANTROR — Browser Tools' },
};
const Platform = {
  route: 'home',
  syncExtras: [], // functions run on every route change (tools push here)
  navigate(r) { location.hash = '#/' + r; },
};
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  return ROUTES[h] ? h : 'home';
}
function applyRoute() {
  Platform.route = parseRoute();
  Object.keys(ROUTES).forEach(k => { const v = $('#view-' + k); if (v) v.hidden = k !== Platform.route; });
  syncChrome();
}
function syncChrome() {
  document.body.dataset.route = Platform.route;
  const meta = ROUTES[Platform.route];
  if ($('#topSub')) $('#topSub').textContent = meta.sub;
  document.title = meta.title;
  Platform.syncExtras.forEach(f => { try { f(); } catch (_) {} });
}
window.addEventListener('hashchange', () => { applyRoute(); window.scrollTo(0, 0); });

/* ---------- toasts ---------- */
function toast(msg, { type = 'info', action } = {}) {
  const box = $('#toasts');
  while (box.children.length >= 4) box.firstChild.remove();
  const t = el('div', 'toast toast-' + type);
  t.innerHTML = `<span class="toast-ic">${type === 'error' ? I.alert : type === 'success' ? I.check : I.info}</span><span class="toast-msg">${esc(msg)}</span>`;
  const close = () => { if (!t.isConnected) return; t.classList.add('out'); setTimeout(() => t.remove(), 180); };
  if (action) {
    const b = el('button', 'toast-act'); b.type = 'button'; b.textContent = action.label;
    b.addEventListener('click', () => { action.fn(); close(); });
    t.appendChild(b);
  }
  const x = el('button', 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.innerHTML = I.x;
  x.addEventListener('click', close); t.appendChild(x);
  box.appendChild(t);
  setTimeout(close, action ? 6500 : 4200);
}

/* ---------- modal ---------- */
let lastFocused = null;
const Modal = {
  current: null,
  open(opts) {
    const { title, body, width = 460, footer = null, dismissable = true, confirmOnEnter = false, onClose = null } = opts;
    let canDismiss = dismissable;
    lastFocused = document.activeElement;
    const ov = el('div', 'modal-ov');
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1" style="max-width:${width}px">
        <header class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn modal-x" aria-label="Close dialog">${I.x}</button></header>
        <div class="modal-body"></div>${footer ? '<footer class="modal-foot"></footer>' : ''}</div>`;
    const modal = $('.modal', ov), bodyEl = $('.modal-body', ov);
    if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    if (footer) footer.forEach(b => $('.modal-foot', ov).appendChild(b));
    const xBtn = $('.modal-x', ov);
    if (!dismissable) xBtn.style.display = 'none';
    const api = {
      close() {
        if (!ov.isConnected) return;
        ov.classList.remove('open');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => ov.remove(), 150);
        Modal.current = null;
        if (lastFocused && lastFocused.focus) lastFocused.focus();
        onClose && onClose();
      },
      allowClose() { canDismiss = true; xBtn.style.display = ''; },
      setTitle(t) { $('h3', modal).textContent = t; },
    };
    const onKey = e => {
      if (e.key === 'Escape' && canDismiss) { e.preventDefault(); api.close(); }
      else if (e.key === 'Enter' && confirmOnEnter && canDismiss) {
        if (e.target.closest && e.target.closest('button,a')) return;
        const p = $('.modal-foot .btn-primary, .modal-foot .btn-danger', ov);
        if (p) { e.preventDefault(); p.click(); }
      }
    };
    document.addEventListener('keydown', onKey);
    xBtn.addEventListener('click', () => canDismiss && api.close());
    ov.addEventListener('pointerdown', e => { if (e.target === ov && canDismiss) api.close(); });
    $('#modalRoot').appendChild(ov);
    Modal.current = api;
    requestAnimationFrame(() => ov.classList.add('open'));
    modal.focus();
    return api;
  }
};
function btn(label, { kind = 'ghost', icon = '', onClick } = {}) {
  const b = el('button', 'btn ' + kind); b.type = 'button';
  b.innerHTML = icon + (label ? '<span>' + esc(label) + '</span>' : '');
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- theme ---------- */
function setTheme(t, save = true) {
  document.documentElement.dataset.theme = t;
  const b = $('#btnTheme');
  b.innerHTML = t === 'dark' ? I.sun : I.moon;
  b.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  b.title = t === 'dark' ? 'Light theme' : 'Dark theme';
  if (save) { try { localStorage.setItem('antror-theme', t); } catch (_) {} }
}

/* ---------- pointer-based sortable (shared: merger + image-to-pdf) ---------- */
function makeSortable(container, opts) {
  let drag = null;
  container.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const handle = e.target.closest(opts.handleSel);
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(opts.itemSel);
    if (!item) return;
    e.preventDefault();
    drag = { item, container, opts, startX: e.clientX, startY: e.clientY, py: e.clientY, active: false };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
  function begin() {
    const { item, container } = drag;
    drag.from = $$(opts.itemSel, container).indexOf(item);
    const r = item.getBoundingClientRect();
    drag.ghost = item.cloneNode(true);
    drag.ghost.classList.add('drag-ghost');
    drag.ghost.style.width = r.width + 'px';
    drag.ghost.style.left = r.left + 'px';
    drag.ghost.style.top = r.top + 'px';
    document.body.appendChild(drag.ghost);
    drag.ph = item.cloneNode(true);
    drag.ph.classList.add('drag-ph');
    drag.ph.style.height = r.height + 'px';
    container.insertBefore(drag.ph, item);
    item.classList.add('drag-src');
    drag.offY = drag.startY - r.top;
    drag.active = true;
    document.body.classList.add('is-dragging');
    placePh(); tick();
  }
  function onMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) < 6) return;
      begin();
    }
    e.preventDefault();
    drag.py = e.clientY;
    if (drag.ghost) drag.ghost.style.top = (e.clientY - drag.offY) + 'px';
  }
  function placePh() {
    if (!drag || !drag.active) return;
    const { container, opts, item, ph, py } = drag;
    const others = $$(opts.itemSel, container).filter(i => i !== item && i !== ph);
    let before = null;
    for (const it of others) {
      const r = it.getBoundingClientRect();
      if (py < r.top + r.height / 2) { before = it; break; }
    }
    if (before) container.insertBefore(ph, before); else container.appendChild(ph);
  }
  function tick() {
    if (!drag || !drag.active) return;
    const { opts, py } = drag;
    const sc = opts.scrollEl;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (py < r.top + 60) sc.scrollTop -= 14;
      else if (py > r.bottom - 60) sc.scrollTop += 14;
    } else {
      if (py < 95) window.scrollBy(0, -14);
      else if (py > innerHeight - 70) window.scrollBy(0, 14);
    }
    placePh();
    requestAnimationFrame(tick);
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    if (!drag) return;
    const d = drag; drag = null;
    document.body.classList.remove('is-dragging');
    if (!d.active) return;
    d.item.classList.remove('drag-src');
    d.container.insertBefore(d.item, d.ph);
    d.ph.remove(); d.ghost.remove();
    const to = $$(d.opts.itemSel, d.container).indexOf(d.item);
    if (to !== d.from) d.opts.onReorder(d.from, to);
  }
}
