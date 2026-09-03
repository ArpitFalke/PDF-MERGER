'use strict';

/* =====================================================================
   ANTROR PDF Merger — application code
   Sections: icons / state / history / toast / modal / pdf-loader /
   renderer (thumbnails) / selection / sequence / drag & drop /
   merge / download / shortcuts / boot.
   ===================================================================== */

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const delay = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
class UserMsg extends Error {}

/* ---------- icons (inline SVG, stroke-based) ---------- */
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
  undo: svg('<path d="M8.5 13.5 4 9l4.5-4.5"/><path d="M4 9h9.5a6.5 6.5 0 0 1 0 13H10"/>'),
  redo: svg('<path d="M15.5 13.5 20 9l-4.5-4.5"/><path d="M20 9h-9.5a6.5 6.5 0 0 0 0 13H14"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  alert: svg('<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.3"/>'),
  refresh: svg('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 3.5V8h-4.5"/>'),
  download: svg('<path d="M12 4v10.5M7.5 11 12 15.5 16.5 11"/><path d="M4.5 19.5h15"/>'),
  filePlus: svg('<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M13.5 3v5.5H19"/><path d="M12 12v5M9.5 14.5h5"/>'),
};

/* ---------- state ---------- */
const MAX_FILE = 200 * 1048576;
const WARN_FILE = 50 * 1048576;
const ZOOMS = { s: 104, m: 148, l: 208 };
const state = {
  docs: new Map(),      // id -> {id, letter, name, size, bytes, pdf, pageCount, dims, el}
  order: [],            // doc ids, display & rebuild order
  selection: new Map(), // docId -> Set<pageNumber>   (selection state — kept separate)
  sequence: [],         // [{uid, docId, pageNumber}] (final merge order — kept separate)
  zoom: 'm',
  activeUid: null,
};
let uidSeq = 0, docCounter = 0;
const flashUids = new Set(); // rows to highlight after render

/* ---------- history (undo / redo) ---------- */
const History = {
  U: [], R: [],
  snap() {
    return {
      order: state.order.slice(),
      sequence: state.sequence.slice(),
      selection: [...state.selection].map(([k, v]) => [k, new Set(v)]),
    };
  },
  capture() { this.U.push(this.snap()); if (this.U.length > 100) this.U.shift(); this.R.length = 0; this.sync(); },
  restore(s) {
    state.order = s.order.filter(id => state.docs.has(id));
    state.sequence = s.sequence.filter(e => state.docs.has(e.docId));
    state.selection = new Map(s.selection.filter(([k]) => state.docs.has(k)).map(([k, v]) => [k, new Set(v)]));
    if (!state.sequence.some(e => e.uid === state.activeUid)) state.activeUid = null;
    renderDocsList(); afterSelectionChange();
  },
  undo() { if (!this.U.length) return; this.R.push(this.snap()); this.restore(this.U.pop()); this.sync(); },
  redo() { if (!this.R.length) return; this.U.push(this.snap()); this.restore(this.R.pop()); this.sync(); },
  clear() { this.U.length = 0; this.R.length = 0; this.sync(); },
  sync() { $('#btnUndo').disabled = !this.U.length; $('#btnRedo').disabled = !this.R.length; },
};

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

/* ---------- modal system ---------- */
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

/* ---------- pdf.js setup ---------- */
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* ---------- thumbnail rendering (lazy, queued) ---------- */
const thumbCache = new Map();   // "docId:page:zoom" -> dataURL
const visibleThumbs = new Set();
const renderTasks = new Map();
const taskQueue = [];
let activeRenders = 0; const MAX_RENDERS = 5;
let seqThumbDirty = false;

const thumbKey = (docId, page) => docId + ':' + page + ':' + state.zoom;

function dprCap() {
  const total = [...state.docs.values()].reduce((a, d) => a + d.pageCount, 0);
  const d = devicePixelRatio || 1;
  if (total > 300) return 1;
  if (total > 150) return Math.min(d, 1.4);
  return Math.min(d, 2);
}

const thumbObserver = new IntersectionObserver(entries => {
  for (const en of entries) {
    if (en.isIntersecting) { visibleThumbs.add(en.target); enqueueThumb(en.target); }
    else visibleThumbs.delete(en.target);
  }
}, { rootMargin: '520px 0px' });

function enqueueThumb(elm) {
  const docId = elm.dataset.doc, page = +elm.dataset.page;
  const key = thumbKey(docId, page);
  const url = thumbCache.get(key);
  if (url) { applyThumb(elm, url); return; }
  let task = renderTasks.get(key);
  if (task) { task.targets.add(elm); return; }
  task = { key, docId, page, targets: new Set([elm]) };
  renderTasks.set(key, task); taskQueue.push(task);
  pumpRenders();
}
function pumpRenders() {
  while (activeRenders < MAX_RENDERS && taskQueue.length) {
    const task = taskQueue.shift();
    activeRenders++;
    runRender(task).finally(() => { activeRenders--; renderTasks.delete(task.key); pumpRenders(); });
  }
}
async function runRender(task) {
  try {
    const doc = state.docs.get(task.docId);
    if (!doc) return;
    const w = Math.round(ZOOMS[state.zoom] * dprCap());
    const url = await renderPageToDataURL(doc, task.page, w);
    thumbCache.set(task.key, url);
    task.targets.forEach(t => { if (t.isConnected) applyThumb(t, url); });
    scheduleSeqThumbRefresh();
  } catch (err) { console.warn('Thumbnail render failed:', err); }
}
function applyThumb(elm, url) {
  const img = $('img', elm);
  if (!img || img.getAttribute('src') === url) return;
  img.onload = () => { img.hidden = false; elm.classList.add('is-loaded'); };
  img.src = url;
}
async function renderPageToDataURL(doc, pageNumber, targetW) {
  const page = await doc.pdf.getPage(pageNumber);
  const v1 = page.getViewport({ scale: 1 });
  let scale = targetW / v1.width;
  const px = v1.width * scale * v1.height * scale;
  if (px > 4.2e6) scale *= Math.sqrt(4.2e6 / px); // cap canvas pixels
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.85);
  try { page.cleanup(); } catch (_) {}
  canvas.width = canvas.height = 0;
  return url;
}
function scheduleSeqThumbRefresh() {
  if (seqThumbDirty) return;
  seqThumbDirty = true;
  requestAnimationFrame(() => { seqThumbDirty = false; refreshSeqThumbs(); });
}
function refreshSeqThumbs() {
  $$('#seqList .seq-thumb').forEach(th => {
    if ($('img', th)) return;
    const row = th.closest('.seq-row'); if (!row) return;
    const entry = state.sequence.find(e => e.uid === +row.dataset.uid); if (!entry) return;
    const url = thumbCache.get(thumbKey(entry.docId, entry.pageNumber));
    if (url) th.innerHTML = `<img src="${url}" alt="" aria-hidden="true">`;
  });
}

/* ---------- file loading & validation ---------- */
async function addPdf(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let pdf;
  try { pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; }
  catch (err) {
    if (err && err.name === 'PasswordException')
      throw new UserMsg(`“${file.name}” is password-protected. Remove the password and add it again.`);
    throw new UserMsg(`We couldn’t read “${file.name}”. It may be corrupted — try re-exporting it as a PDF and adding it again.`);
  }
  const pageCount = pdf.numPages;
  const dims = new Array(pageCount);
  for (let i = 0; i < pageCount; i += 48) {           // prefetch page dimensions in batches
    const end = Math.min(i + 48, pageCount);
    await Promise.all(Array.from({ length: end - i }, (_, k) =>
      pdf.getPage(i + 1 + k).then(pg => { const v = pg.getViewport({ scale: 1 }); dims[i + k] = { w: v.width, h: v.height }; })
    ));
  }
  const n = ++docCounter;
  const letter = String.fromCharCode(65 + (n - 1) % 26) + (n > 26 ? Math.floor((n - 1) / 26) : '');
  const doc = { id: 'pdf_' + n, letter, name: file.name, size: file.size, bytes, pdf, pageCount, dims, el: null };
  state.docs.set(doc.id, doc);
  state.order.push(doc.id);
  state.selection.set(doc.id, new Set());
  buildDocCard(doc);
  updateDocsMeta(); updateCounts();
  if (file.size > WARN_FILE) toast(`“${file.name}” is large (${fmtBytes(file.size)}). Rendering may take a moment.`);
  return doc;
}

async function handleFiles(list) {
  const files = [...list];
  if (!files.length) return;
  let added = 0;
  for (const f of files) {
    const name = f.name || 'file';
    if (!(f.type === 'application/pdf' || /\.pdf$/i.test(name))) { toast(`“${name}” isn’t a PDF. Please choose .pdf files.`, { type: 'error' }); continue; }
    if (f.size === 0) { toast(`“${name}” is empty.`, { type: 'error' }); continue; }
    if (f.size > MAX_FILE) { toast(`“${name}” is too large to process reliably in your browser (over ${fmtBytes(MAX_FILE)}).`, { type: 'error' }); continue; }
    if ([...state.docs.values()].some(d => d.name === name && d.size === f.size)) { toast(`“${name}” is already in the workspace.`, { type: 'error' }); continue; }
    try { await addPdf(f); added++; }
    catch (err) { toast(err instanceof UserMsg ? err.message : 'Something went wrong while reading this file.', { type: 'error' }); }
  }
  if (added) {
    showWorkspace();
    toast(added === 1 ? 'PDF added — select the pages you want to include.' : `${added} PDFs added — select the pages you want to include.`, { type: 'success' });
  }
}

/* ---------- document cards ---------- */
function buildDocCard(doc) {
  const card = el('article', 'doc-card card-new');
  card.dataset.id = doc.id;
  card.innerHTML = `
    <header class="doc-head">
      <span class="doc-grip" role="button" tabindex="0" aria-label="Drag to reorder ${esc(doc.name)}" title="Drag to reorder documents">${I.grip}</span>
      <span class="doc-chip" aria-hidden="true">${doc.letter}</span>
      <span class="doc-name" title="${esc(doc.name)}">${esc(doc.name)}</span>
      <span class="doc-meta mono">${doc.pageCount} pages · ${fmtBytes(doc.size)}</span>
      <button type="button" class="icon-btn doc-remove" aria-label="Remove ${esc(doc.name)}" title="Remove PDF">${I.trash}</button>
    </header>
    <div class="doc-thumbs" role="group" aria-label="Pages of ${esc(doc.name)}"></div>
    <footer class="doc-foot">
      <div class="doc-ops">
        <button type="button" class="chip-btn" data-op="all" title="Select every page">All</button>
        <button type="button" class="chip-btn" data-op="invert" title="Invert selection">Invert</button>
        <button type="button" class="chip-btn" data-op="range" title="Select pages by range">Range…</button>
        <button type="button" class="chip-btn" data-op="clear" title="Deselect all pages">Clear</button>
      </div>
      <span class="doc-count mono"><b>0</b> / ${doc.pageCount} selected</span>
    </footer>
    <div class="range-row" hidden>
      <input class="input range-input" placeholder="e.g. 1-3, 7, 10-12" aria-label="Page ranges for ${esc(doc.name)}" maxlength="200">
      <button type="button" class="chip-btn accent" data-op="rangeApply">Apply</button>
      <button type="button" class="icon-btn" data-op="rangeClose" aria-label="Cancel range selection">${I.x}</button>
      <p class="range-msg" role="alert"></p>
    </div>`;
  const grid = $('.doc-thumbs', card);
  for (let p = 1; p <= doc.pageCount; p++) grid.appendChild(buildThumb(doc, p));
  card.addEventListener('animationend', () => card.classList.remove('card-new'), { once: true });
  card.addEventListener('keydown', e => {
    const inp = e.target.closest('.range-input');
    if (!inp) return;
    if (e.key === 'Enter') { e.preventDefault(); applyRangeUI(doc); }
    if (e.key === 'Escape') { e.preventDefault(); $('.range-row', card).hidden = true; }
  });
  doc.el = card;
  $('#docsList').appendChild(card);
}
function buildThumb(doc, p) {
  const d = doc.dims[p - 1];
  const b = el('button', 'thumb');
  b.type = 'button';
  b.dataset.doc = doc.id; b.dataset.page = p;
  b.style.aspectRatio = d.w + ' / ' + d.h;
  b.setAttribute('aria-pressed', 'false');
  b.setAttribute('aria-label', `Page ${p} of ${doc.name}`);
  b.title = 'Page ' + p;
  b.innerHTML = `<span class="thumb-skel"></span><img class="thumb-img" alt="" hidden><span class="thumb-no">${p}</span><span class="thumb-check">${I.check}</span>`;
  thumbObserver.observe(b);
  return b;
}
function updateCardSelectionUI(doc) {
  const s = state.selection.get(doc.id);
  const cnt = s ? s.size : 0;
  const counter = $('.doc-count', doc.el);
  $('b', counter).textContent = cnt;
  counter.classList.toggle('has-sel', cnt > 0);
  $$('.thumb', doc.el).forEach(t => {
    const on = s ? s.has(+t.dataset.page) : false;
    t.classList.toggle('sel', on);
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function renderDocsList() {
  const list = $('#docsList');
  state.order.forEach(id => { const d = state.docs.get(id); if (d && d.el) list.appendChild(d.el); });
  updateDocsMeta();
}
function updateDocsMeta() {
  const pages = [...state.docs.values()].reduce((a, d) => a + d.pageCount, 0);
  $('#docsMeta').textContent = state.docs.size ? `${state.docs.size} file${state.docs.size > 1 ? 's' : ''} · ${pages} pages` : '';
}

/* card interactions (delegated) */
 $('#docsList').addEventListener('click', e => {
  const card = e.target.closest('.doc-card'); if (!card) return;
  const doc = state.docs.get(card.dataset.id); if (!doc) return;
  const th = e.target.closest('.thumb');
  if (th) { togglePage(doc.id, +th.dataset.page); return; }
  if (e.target.closest('.doc-remove')) { removeDoc(doc.id); return; }
  const op = e.target.closest('[data-op]'); if (!op) return;
  const o = op.dataset.op;
  if (o === 'all') selectAll(doc);
  else if (o === 'invert') invertSel(doc);
  else if (o === 'clear') clearSel(doc);
  else if (o === 'range') {
    const row = $('.range-row', card);
    const willOpen = row.hidden;
    $$('.range-row').forEach(r => r.hidden = true);
    if (willOpen) {
      row.hidden = false;
      const inp = $('.range-input', row);
      inp.value = ''; $('.range-msg', row).textContent = '';
      inp.focus();
    }
  }
  else if (o === 'rangeApply') applyRangeUI(doc);
  else if (o === 'rangeClose') $('.range-row', card).hidden = true;
});

/* ---------- range parsing ---------- */
function parseRanges(str, max) {
  const s = (str || '').trim();
  if (!s) return { error: 'Enter at least one page or range.' };
  const pages = [];
  for (const raw of s.split(',')) {
    const t = raw.trim();
    if (!t) return { error: `“${raw}” isn’t a valid page or range.` };
    if (/^\d+$/.test(t)) {
      const n = +t;
      if (n < 1 || n > max) return { error: `Page ${n} is out of range (this PDF has ${max} page${max > 1 ? 's' : ''}).` };
      pages.push(n);
    } else if (/^\d+\s*-\s*\d+$/.test(t)) {
      const [a, b] = t.split('-').map(x => parseInt(x, 10));
      if (a < 1 || b > max) return { error: `Range ${a}-${b} is outside 1–${max}.` };
      if (a > b) return { error: `Range ${a}-${b} is reversed — try ${b}-${a}.` };
      for (let p = a; p <= b; p++) pages.push(p);
    } else {
      return { error: `“${t}” isn’t a valid page or range.` };
    }
  }
  return { pages: [...new Set(pages)].sort((a, b) => a - b) };
}
function applyRangeUI(doc) {
  const row = $('.range-row', doc.el);
  const inp = $('.range-input', row), msg = $('.range-msg', row);
  const res = parseRanges(inp.value, doc.pageCount);
  if (res.error) { msg.textContent = res.error; inp.focus(); return; }
  const s = state.selection.get(doc.id) || new Set();
  if (!res.pages.some(p => !s.has(p))) { msg.textContent = 'Those pages are already selected.'; return; }
  row.hidden = true;
  applyRange(doc, res.pages);
}

/* ---------- selection ops (selection ⇄ sequence stay in sync) ---------- */
function selSet(docId) {
  let s = state.selection.get(docId);
  if (!s) { s = new Set(); state.selection.set(docId, s); }
  return s;
}
function afterSelectionChange(docIds) {
  (docIds || [...state.docs.keys()]).forEach(id => { const d = state.docs.get(id); if (d) updateCardSelectionUI(d); });
  renderSequence(); updateCounts();
}
function togglePage(docId, p) {
  const s = selSet(docId);
  History.capture();
  if (s.has(p)) {
    s.delete(p);
    state.sequence = state.sequence.filter(e => !(e.docId === docId && e.pageNumber === p));
  } else {
    s.add(p);
    const entry = { uid: ++uidSeq, docId, pageNumber: p };
    state.sequence.push(entry);
    flashUids.add(entry.uid);
  }
  afterSelectionChange([docId]);
}
function selectAll(doc) {
  const s = selSet(doc.id);
  if (s.size === doc.pageCount) return;
  History.capture();
  for (let p = 1; p <= doc.pageCount; p++) if (!s.has(p)) { s.add(p); state.sequence.push({ uid: ++uidSeq, docId: doc.id, pageNumber: p }); }
  afterSelectionChange([doc.id]);
}
function clearSel(doc) {
  if (!selSet(doc.id).size) return;
  History.capture();
  state.selection.set(doc.id, new Set());
  state.sequence = state.sequence.filter(e => e.docId !== doc.id);
  afterSelectionChange([doc.id]);
}
function invertSel(doc) {
  History.capture();
  const s = selSet(doc.id);
  const next = new Set();
  for (let p = 1; p <= doc.pageCount; p++) if (!s.has(p)) next.add(p);
  state.selection.set(doc.id, next);
  state.sequence = state.sequence.filter(e => e.docId !== doc.id);
  for (let p = 1; p <= doc.pageCount; p++) if (next.has(p)) state.sequence.push({ uid: ++uidSeq, docId: doc.id, pageNumber: p });
  afterSelectionChange([doc.id]);
}
function applyRange(doc, pages) {
  History.capture();
  const s = selSet(doc.id);
  pages.forEach(p => { if (!s.has(p)) { s.add(p); state.sequence.push({ uid: ++uidSeq, docId: doc.id, pageNumber: p }); } });
  afterSelectionChange([doc.id]);
}
function selectAllAll() {
  const any = [...state.docs.values()].some(d => selSet(d.id).size < d.pageCount);
  if (!any) return;
  History.capture();
  for (const id of state.order) {
    const d = state.docs.get(id), s = selSet(id);
    for (let p = 1; p <= d.pageCount; p++) if (!s.has(p)) { s.add(p); state.sequence.push({ uid: ++uidSeq, docId: id, pageNumber: p }); }
  }
  afterSelectionChange();
}

/* ---------- sequence ops ---------- */
function renderSequence() {
  const list = $('#seqList');
  const keep = list.scrollTop;
  list.innerHTML = '';
  if (!state.sequence.length) {
    list.appendChild(el('li', 'seq-empty',
      `${I.filePlus}<p>No pages yet</p><span>Select pages from your documents — they’ll appear here in the exact order they’ll be merged.</span>`));
  } else {
    state.sequence.forEach((entry, i) => {
      const doc = state.docs.get(entry.docId);
      const name = doc ? doc.name : 'Removed PDF';
      const url = doc ? thumbCache.get(thumbKey(entry.docId, entry.pageNumber)) : null;
      const li = el('li', 'seq-row');
      li.dataset.uid = entry.uid;
      li.tabIndex = 0;
      li.setAttribute('aria-label', `Position ${i + 1}: ${name}, page ${entry.pageNumber}`);
      li.innerHTML = `
        <button type="button" class="seq-grip" aria-label="Drag to reorder" title="Drag to reorder">${I.grip}</button>
        <span class="seq-idx" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <span class="seq-thumb">${url ? `<img src="${url}" alt="" aria-hidden="true">` : `<i class="seq-thumb-ph">${entry.pageNumber}</i>`}</span>
        <span class="seq-label">
          <span class="seq-doc"><i class="doc-chip sm" aria-hidden="true">${doc ? doc.letter : '?'}</i><em title="${esc(name)}">${esc(name)}</em></span>
          <span class="seq-page">Page ${entry.pageNumber}</span>
        </span>
        <span class="seq-actions">
          <button type="button" class="icon-btn" data-act="ins" aria-label="Insert a page here" title="Insert page…">${I.plus}</button>
          <button type="button" class="icon-btn" data-act="dup" aria-label="Duplicate this page" title="Duplicate page">${I.copy}</button>
          <button type="button" class="icon-btn" data-act="del" aria-label="Remove from sequence" title="Remove">${I.x}</button>
        </span>`;
      list.appendChild(li);
    });
  }
  list.scrollTop = keep;
  if (flashUids.size) {
    let first = null;
    flashUids.forEach(uid => {
      const r = $(`#seqList .seq-row[data-uid="${uid}"]`);
      if (r) { r.classList.add('row-new'); if (!first) first = r; }
    });
    flashUids.clear();
    if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
function setActiveRow(uid) {
  state.activeUid = uid;
  $$('#seqList .seq-row').forEach(r => r.classList.toggle('is-active', +r.dataset.uid === uid));
}
function removeEntry(uid) {
  const i = state.sequence.findIndex(e => e.uid === uid);
  if (i < 0) return;
  History.capture();
  const e = state.sequence.splice(i, 1)[0];
  selSet(e.docId).delete(e.pageNumber);
  if (state.activeUid === uid) state.activeUid = null;
  afterSelectionChange([e.docId]);
}
function duplicateEntry(uid) {
  const i = state.sequence.findIndex(e => e.uid === uid);
  if (i < 0) return;
  History.capture();
  const src = state.sequence[i];
  const entry = { uid: ++uidSeq, docId: src.docId, pageNumber: src.pageNumber };
  state.sequence.splice(i + 1, 0, entry);
  flashUids.add(entry.uid);
  renderSequence(); updateCounts();
}
function insertPage(docId, page, anchorUid, pos) {
  const idx = state.sequence.findIndex(e => e.uid === anchorUid);
  if (idx < 0) return;
  History.capture();
  selSet(docId).add(page);
  const entry = { uid: ++uidSeq, docId, pageNumber: page };
  state.sequence.splice(pos === 'before' ? idx : idx + 1, 0, entry);
  state.activeUid = entry.uid;
  flashUids.add(entry.uid);
  afterSelectionChange([docId]);
}
function reorderSequence(from, to) {
  History.capture();
  const [en] = state.sequence.splice(from, 1);
  state.sequence.splice(to, 0, en);
  renderSequence(); updateCounts();
}
function rebuildSequence(capture = true) {
  if (capture) History.capture();
  const seq = [];
  for (const id of state.order) {
    const s = state.selection.get(id);
    if (!s) continue;
    [...s].sort((a, b) => a - b).forEach(p => seq.push({ uid: ++uidSeq, docId: id, pageNumber: p }));
  }
  state.sequence = seq;
  renderSequence(); updateCounts();
}
function reorderDocs(from, to) {
  History.capture();
  const [id] = state.order.splice(from, 1);
  state.order.splice(to, 0, id);
  renderDocsList();
  rebuildSequence(false);
  toast('Sequence rebuilt in document order.');
}

/* sequence panel interactions */
 $('#seqList').addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const uid = +act.closest('.seq-row').dataset.uid;
    if (act.dataset.act === 'dup') duplicateEntry(uid);
    else if (act.dataset.act === 'del') removeEntry(uid);
    else if (act.dataset.act === 'ins') openInsertModal(uid);
    return;
  }
  const row = e.target.closest('.seq-row');
  if (row) setActiveRow(+row.dataset.uid);
});
 $('#seqList').addEventListener('focusin', e => {
  const r = e.target.closest('.seq-row');
  if (r) setActiveRow(+r.dataset.uid);
});
 $('#seqList').addEventListener('keydown', e => {
  const row = e.target.closest('.seq-row'); if (!row) return;
  const uid = +row.dataset.uid;
  const i = state.sequence.findIndex(x => x.uid === uid);
  if (i < 0) return;
  const move = newIdx => {
    e.preventDefault();
    History.capture();
    const [en] = state.sequence.splice(i, 1);
    state.sequence.splice(Math.max(0, Math.min(state.sequence.length, newIdx)), 0, en);
    renderSequence(); updateCounts();
    const nr = $(`#seqList .seq-row[data-uid="${en.uid}"]`);
    if (nr) nr.focus();
  };
  if (e.key === 'Home') move(0);                              // move to beginning
  else if (e.key === 'End') move(state.sequence.length - 1);  // move to end
  else if (e.altKey && e.key === 'ArrowUp') move(i - 1);      // keyboard drag alternative
  else if (e.altKey && e.key === 'ArrowDown') move(i + 1);
});

/* ---------- insert-page modal ---------- */
function openInsertModal(anchorUid) {
  const anchor = state.sequence.find(e => e.uid === anchorUid);
  if (!anchor) return;
  let pos = 'after';
  let docId = state.order.includes(anchor.docId) ? anchor.docId : state.order[0];
  if (!docId) return;
  const body = el('div');
  body.innerHTML = `
    <div class="ins-sec"><span class="label">Position</span>
      <div class="seg" role="group" aria-label="Insert position">
        <button type="button" data-pos="before">Before page ${anchor.pageNumber}</button>
        <button type="button" data-pos="after" class="on">After page ${anchor.pageNumber}</button>
      </div></div>
    <div class="ins-sec"><span class="label">Source document</span><div class="ins-chips"></div></div>
    <div class="ins-sec"><span class="label">Page</span><div class="ins-grid"></div></div>`;
  const chips = $('.ins-chips', body), grid = $('.ins-grid', body);
  const drawChips = () => {
    chips.innerHTML = state.order.map(id => {
      const d = state.docs.get(id);
      return `<button type="button" class="ins-chip ${id === docId ? 'on' : ''}" data-id="${id}" title="${esc(d.name)}"><i class="doc-chip sm">${d.letter}</i><em>${esc(d.name)}</em></button>`;
    }).join('');
  };
  const drawGrid = () => {
    const d = state.docs.get(docId);
    const inSeq = new Set(state.sequence.filter(e => e.docId === docId).map(e => e.pageNumber));
    grid.innerHTML = Array.from({ length: d.pageCount }, (_, i) => {
      const p = i + 1;
      return `<button type="button" class="ins-pg ${inSeq.has(p) ? 'in-seq' : ''}" data-p="${p}" title="Page ${p}${inSeq.has(p) ? ' (already in sequence)' : ''}">${p}</button>`;
    }).join('');
  };
  drawChips(); drawGrid();
  body.addEventListener('click', e => {
    const posB = e.target.closest('[data-pos]');
    if (posB) { pos = posB.dataset.pos; $$('[data-pos]', body).forEach(b => b.classList.toggle('on', b === posB)); return; }
    const ch = e.target.closest('.ins-chip');
    if (ch) { docId = ch.dataset.id; drawChips(); drawGrid(); return; }
    const pg = e.target.closest('.ins-pg');
    if (pg) { insertPage(docId, +pg.dataset.p, anchorUid, pos); m.close(); }
  });
  let m;
  m = Modal.open({
    title: 'Insert page', body, width: 520,
    footer: [btn('Cancel', { onClick: () => m.close() })],
  });
}

/* ---------- pointer-based sortable (mouse + touch) ---------- */
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
makeSortable($('#docsList'), { itemSel: '.doc-card', handleSel: '.doc-grip', onReorder: reorderDocs });
makeSortable($('#seqList'), { itemSel: '.seq-row', handleSel: '.seq-grip', onReorder: reorderSequence, scrollEl: $('#seqList') });

/* ---------- document removal ---------- */
function removeDoc(id) {
  const doc = state.docs.get(id); if (!doc) return;
  const saved = { id: doc.id, letter: doc.letter, name: doc.name, size: doc.size, bytes: doc.bytes, pageCount: doc.pageCount, dims: doc.dims, pdf: null, el: null };
  try { doc.pdf.destroy(); } catch (_) {}
  $$('.thumb', doc.el).forEach(t => thumbObserver.unobserve(t));
  state.docs.delete(id);
  state.order = state.order.filter(x => x !== id);
  state.selection.delete(id);
  state.sequence = state.sequence.filter(e => e.docId !== id);
  if (state.activeUid && !state.sequence.some(e => e.uid === state.activeUid)) state.activeUid = null;
  if (doc.el) doc.el.remove();
  if (!state.docs.size) showEmpty(); else renderDocsList();
  renderSequence(); updateCounts();
  toast(`Removed “${doc.name}”.`, { action: { label: 'Undo', fn: () => reAddDoc(saved) } });
}
async function reAddDoc(d) {
  try { d.pdf = await pdfjsLib.getDocument({ data: d.bytes.slice() }).promise; }
  catch (_) { toast('Couldn’t restore that PDF.', { type: 'error' }); return; }
  state.docs.set(d.id, d);
  state.order.push(d.id);
  state.selection.set(d.id, new Set());
  buildDocCard(d);
  showWorkspace(); renderDocsList(); renderSequence(); updateCounts();
}

/* ---------- clear workspace ---------- */
function confirmClear() {
  if (!state.docs.size) return;
  let m;
  m = Modal.open({
    title: 'Clear workspace?', width: 410, confirmOnEnter: true,
    body: '<p class="modal-text">All uploaded PDFs and selections will be removed.</p>',
    footer: [
      btn('Cancel', { onClick: () => m.close() }),
      btn('Clear', { kind: 'danger', onClick: () => { doClear(); m.close(); } }),
    ],
  });
}
function doClear() {
  state.docs.forEach(d => { try { d.pdf.destroy(); } catch (_) {} });
  $$('.thumb').forEach(t => thumbObserver.unobserve(t));
  visibleThumbs.clear();
  state.docs.clear(); state.order.length = 0; state.selection.clear();
  state.sequence.length = 0; state.activeUid = null;
  thumbCache.clear(); flashUids.clear();
  History.clear();
  $('#docsList').innerHTML = '';
  showEmpty(); renderSequence(); updateCounts(); updateDocsMeta();
  toast('Workspace cleared.');
}

/* ---------- preview ---------- */
function openPreview() {
  const seq = state.sequence.filter(e => state.docs.has(e.docId));
  if (!seq.length) { toast('Nothing to preview yet — select some pages first.'); return; }
  const rows = seq.map((e, i) => {
    const d = state.docs.get(e.docId);
    const url = thumbCache.get(thumbKey(e.docId, e.pageNumber));
    const thumb = url
      ? `<img class="pv-thumb" src="${url}" alt="">`
      : `<span class="pv-thumb">${e.pageNumber}</span>`;
    return `<li class="pv-row"><span class="pv-idx mono">${String(i + 1).padStart(2, '0')}</span>${thumb}
      <span class="pv-name"><i class="doc-chip sm">${d.letter}</i><i title="${esc(d.name)}">${esc(d.name)}</i></span>
      <span class="pv-page">Page ${e.pageNumber}</span></li>`;
  }).join('');
  const body = el('div');
  body.innerHTML = `<p class="pv-sub">${seq.length} page${seq.length > 1 ? 's' : ''} in the final document, in this exact order</p><ol class="pv-list">${rows}</ol>`;
  let m;
  m = Modal.open({
    title: 'Final preview', body, width: 560,
    footer: [
      btn('Close', { onClick: () => m.close() }),
      btn('Merge PDFs', { kind: 'primary', icon: I.download, onClick: () => { m.close(); mergePDFs(); } }),
    ],
  });
}

/* ---------- merge + download ---------- */
const CANCEL = Symbol('cancel');
let mergedUrl = null; // object URL of the last merged PDF — kept alive so the download never breaks
function revokeMergedUrl() {
  if (!mergedUrl) return;
  try { URL.revokeObjectURL(mergedUrl); } catch (_) {}
  mergedUrl = null;
}
function sanitizeFilename(n) {
  n = (n || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');
  if (!n) return 'merged-document.pdf';
  if (!/\.pdf$/i.test(n)) n += '.pdf';
  return n;
}
async function mergePDFs() {
  const seq = state.sequence.filter(e => state.docs.has(e.docId));
  if (!seq.length) { toast('Select at least one page before merging.', { type: 'error' }); return; }
  revokeMergedUrl(); // discard any previous result before starting a new merge
  let cancelled = false, mergedBytes = null;
  const body = el('div');
  body.innerHTML = `
    <div class="m-run">
      <ul class="m-stages">
        <li data-stage="prep"><span class="m-dot">${I.check}</span><span>Preparing source files</span><span class="m-meta"></span></li>
        <li data-stage="process"><span class="m-dot">${I.check}</span><span>Processing pages</span><span class="m-meta"></span></li>
        <li data-stage="build"><span class="m-dot">${I.check}</span><span>Building document</span><span class="m-meta"></span></li>
      </ul>
      <div class="m-bar"><div class="m-fill"></div></div>
      <div class="m-runfoot"><span class="m-pct mono">0%</span><button type="button" class="btn ghost sm m-cancel">Cancel</button></div>
    </div>
    <div class="m-done" hidden>
      <div class="m-checkwrap"><svg class="m-checksvg" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15.5 27l7.5 7.5L37 18.5"/></svg></div>
      <h3 class="m-title">PDF merged successfully</h3>
      <p class="m-stats mono"></p>
      <label class="m-namelabel">File name<input class="input m-filename" spellcheck="false" value="merged-document.pdf" maxlength="120"></label>
      <div class="m-donefoot">
        <button type="button" class="btn ghost m-closebtn">Done</button>
        <a class="btn primary m-dl" download="merged-document.pdf" draggable="false">${I.download}<span>Download PDF</span></a>
      </div>
      <p class="m-alt">If the download doesn’t start, <a class="m-open" target="_blank" rel="noopener" download="merged-document.pdf">open the PDF in a new tab</a> and save it from there.</p>
    </div>`;
  const m = Modal.open({
    title: 'Merging PDFs', body, width: 440, dismissable: false,
    // Keep the blob URL alive well past any "Save As" dialog — revoking too early aborts the download.
    onClose: () => setTimeout(revokeMergedUrl, 60000),
  });
  const run = $('.m-run', body), done = $('.m-done', body);
  const fill = $('.m-fill', body), pct = $('.m-pct', body);
  const stages = { prep: $('li[data-stage="prep"]', body), process: $('li[data-stage="process"]', body), build: $('li[data-stage="build"]', body) };
  const prog = p => { fill.style.width = (p * 100).toFixed(1) + '%'; pct.textContent = Math.round(p * 100) + '%'; };
  $('.m-cancel', body).addEventListener('click', e => { cancelled = true; e.currentTarget.disabled = true; });
  const stage = async (k, work) => {
    const li = stages[k];
    li.classList.add('active');
    const t0 = Date.now();
    await work(txt => $('.m-meta', li).textContent = txt);
    const rest = 340 - (Date.now() - t0);
    if (rest > 0) await delay(rest);
    li.classList.remove('active'); li.classList.add('done');
  };
  try {
    prog(.04);
    const out = await PDFLib.PDFDocument.create();
    out.setProducer('ANTROR PDF Merger');
    out.setCreator('ANTROR PDF Merger');
    await stage('prep', async report => {
      const ids = [...new Set(seq.map(e => e.docId))];
      for (let i = 0; i < ids.length; i++) {
        if (cancelled) throw CANCEL;
        const d = state.docs.get(ids[i]);
        report(`Loading ${i + 1} of ${ids.length}`);
        d._src = await PDFLib.PDFDocument.load(d.bytes, { ignoreEncryption: true });
        prog(.04 + .06 * (i + 1) / ids.length);
        await frame();
      }
      report(`${ids.length} source ${ids.length === 1 ? 'file' : 'files'}`);
    });
    if (cancelled) throw CANCEL;
    await stage('process', async report => {
      for (let i = 0; i < seq.length; i++) {
        if (cancelled) throw CANCEL;
        const e = seq[i], d = state.docs.get(e.docId);
        const [pg] = await out.copyPages(d._src, [e.pageNumber - 1]);
        out.addPage(pg);
        if (i % 5 === 0 || i === seq.length - 1) {
          report(`${i + 1} / ${seq.length}`);
          prog(.10 + .80 * (i + 1) / seq.length);
          await frame();
        }
      }
    });
    await stage('build', async report => {
      report('Writing file');
      prog(.97);
      await frame();
      mergedBytes = await out.save({ useObjectStreams: false });
    });
    prog(1);
    // ---- Complete: build the download link ----
    // A real <a href="blob:…"> click is the most reliable way to trigger a download:
    // the browser treats it as a genuine user-initiated action, and the URL stays
    // alive (revoked only 60s after the dialog closes) so no save dialog can race it.
    mergedUrl = URL.createObjectURL(new Blob([mergedBytes], { type: 'application/pdf' }));
    run.hidden = true; done.hidden = false;
    done.classList.add('play');
    const sources = new Set(seq.map(e => e.docId)).size;
    $('.m-stats', body).textContent = `${seq.length} page${seq.length > 1 ? 's' : ''} · ${sources} source ${sources === 1 ? 'document' : 'documents'} · ${fmtBytes(mergedBytes.length)}`;
    const inp = $('.m-filename', body);
    const dl = $('.m-dl', body), openLink = $('.m-open', body);
    dl.href = mergedUrl;
    openLink.href = mergedUrl;
    const setName = () => { const n = sanitizeFilename(inp.value); dl.download = n; openLink.download = n; return n; };
    dl.addEventListener('click', () => toast(`Saving ${setName()}…`, { type: 'success' }));
    inp.addEventListener('input', setName);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dl.click(); } });
    $('.m-closebtn', body).addEventListener('click', () => m.close());
    m.setTitle('Your PDF is ready');
    m.allowClose();
    inp.focus(); inp.select();
  } catch (err) {
    m.close();
    if (err === CANCEL) toast('Merge cancelled.');
    else { console.error(err); toast('Something went wrong while creating the PDF. Your original files are unchanged.', { type: 'error' }); }
  } finally {
    state.docs.forEach(d => { delete d._src; }); // release parsed copies
  }
}

/* ---------- zoom ---------- */
function setZoom(z) {
  state.zoom = z;
  document.documentElement.style.setProperty('--thumb-w', ZOOMS[z] + 'px');
  for (const k of [...thumbCache.keys()]) if (!k.endsWith(':' + z)) thumbCache.delete(k);
  visibleThumbs.forEach(t => enqueueThumb(t));
  scheduleSeqThumbRefresh();
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

/* ---------- view toggles & counts ---------- */
function showWorkspace() {
  $('#emptyState').hidden = true; $('#appLayout').hidden = false; $('#statusBar').hidden = false;
  document.body.classList.add('has-workspace');
}
function showEmpty() {
  $('#emptyState').hidden = false; $('#appLayout').hidden = true; $('#statusBar').hidden = true;
  document.body.classList.remove('has-workspace');
}
function updateCounts() {
  const sel = [...state.selection.values()].reduce((a, s) => a + s.size, 0);
  $('#statDocs').textContent = state.docs.size;
  $('#statSel').textContent = sel;
  $('#statFinal').textContent = state.sequence.length;
  $('#seqCount').textContent = state.sequence.length;
  $('#seqCount').classList.toggle('has', state.sequence.length > 0);
  $('#btnMerge').classList.toggle('is-idle', !state.sequence.length);
}

/* ---------- boot ---------- */
function init() {
  // header controls
  $('#btnUndo').innerHTML = I.undo;
  $('#btnRedo').innerHTML = I.redo;
  $('#btnClearAll').innerHTML = I.trash + '<span>Clear</span>';
  $('#btnSeqReset').innerHTML = I.refresh;
  setTheme(document.documentElement.dataset.theme || 'light', false);
  History.sync();

  $('#btnUndo').addEventListener('click', () => History.undo());
  $('#btnRedo').addEventListener('click', () => History.redo());
  $('#btnClearAll').addEventListener('click', confirmClear);
  $('#btnTheme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#btnSeqReset').addEventListener('click', () => { rebuildSequence(true); toast('Sequence rebuilt from selection in document order.'); });
  $('#btnAddTop').addEventListener('click', () => $('#fileInput').click());
  $('#btnAddEmpty').addEventListener('click', () => $('#fileInput').click());
  $('#btnPreview').addEventListener('click', openPreview);
  $('#btnMerge').addEventListener('click', mergePDFs);
  $('#fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });

  // zoom segment
  $$('#zoomSeg button').forEach(b => b.addEventListener('click', () => {
    if (state.zoom === b.dataset.zoom) return;
    state.zoom = b.dataset.zoom;
    $$('#zoomSeg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    setZoom(state.zoom);
  }));

  // drag & drop files (window level)
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  const overlay = $('#dropOverlay');
  window.addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); depth++; overlay.classList.add('on'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; overlay.classList.remove('on'); } });
  window.addEventListener('drop', e => {
    if (hasFiles(e)) { e.preventDefault(); depth = 0; overlay.classList.remove('on'); handleFiles(e.dataTransfer.files); }
  });

  // keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (Modal.current) return;
    const t = e.target;
    const typing = (t && t.matches && t.matches('input,textarea,select')) || (t && t.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileInput').click(); return; }
    if (typing) {
      if (e.key === 'Escape') $$('.range-row').forEach(r => r.hidden = true);
      return;
    }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); History.undo(); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); History.redo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { if (state.docs.size) { e.preventDefault(); selectAllAll(); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.activeUid != null) { e.preventDefault(); removeEntry(state.activeUid); return; }
    if (e.key === 'Escape') {
      $$('.range-row').forEach(r => r.hidden = true);
      if (state.activeUid != null) { state.activeUid = null; $$('.seq-row.is-active').forEach(r => r.classList.remove('is-active')); }
    }
  });

  // warn before losing an in-progress workspace
  window.addEventListener('beforeunload', e => {
    if (state.docs.size) { e.preventDefault(); e.returnValue = ''; }
  });

  // library check
  if (typeof pdfjsLib === 'undefined' || typeof PDFLib === 'undefined') {
    toast('PDF libraries failed to load. Check your connection and refresh the page.', { type: 'error' });
  }

  renderSequence();
  updateCounts();
}
init();

/* ---------- footer: legal pages ---------- */
const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated — January 2025',
    body: `
      <div class="legal-hero">
        ${I.lock}
        <p><b>The short version:</b> everything happens in your browser. Your files are never uploaded, never transmitted, and never seen by anyone but you.</p>
      </div>
      <div class="legal-body">
        <h4>1. Your documents never leave your device</h4>
        <p>When you add a PDF, the file is read directly from your disk into your browser's memory using standard browser APIs. Page thumbnails are rendered locally by PDF.js, and the merged document is assembled locally by pdf-lib. No part of this process transmits your files, file names, or page contents anywhere.</p>
        <p>Everything is held in memory only. When you close or refresh the tab, all uploaded files, selections, and generated documents are discarded. This application stores no document data on disk.</p>
        <h4>2. What we store (and don't)</h4>
        <p>This application stores exactly one value in your browser's localStorage: the key <b>antror-theme</b>, which remembers whether you prefer the light or dark theme. It contains no personal information and no document data, and you can clear it at any time through your browser's site-data settings.</p>
        <h4>3. Cookies and tracking</h4>
        <p>This app sets no cookies and loads no analytics, advertising, or fingerprinting scripts. There is nothing to opt out of.</p>
        <h4>4. Third-party resources</h4>
        <p>To stay lightweight, the app loads two open-source libraries (PDF.js and pdf-lib) and two typefaces from public content-delivery networks when the page opens. Those requests go to the CDN operators (cdnjs/Cloudflare and Google Fonts), who receive standard technical request data such as your IP address — as with any web resource. Your documents are never part of these requests.</p>
        <p>For maximum privacy, you can download the libraries and host them alongside the app so that no external requests occur at all.</p>
        <h4>5. Your merged file</h4>
        <p>The final PDF is created in memory and handed directly to your browser's own download manager. We have no visibility into what you name it or where you save it.</p>
        <h4>6. Children's privacy</h4>
        <p>Because no personal information is collected from any user, nothing is knowingly collected from children under 13, or the equivalent minimum age in your region.</p>
        <h4>7. Changes to this policy</h4>
        <p>If this policy changes, the revised version will be posted on this page with an updated date. Material changes will be highlighted at the top.</p>
      </div>`
  },
  terms: {
    title: 'Terms & Conditions',
    updated: 'Last updated — January 2025',
    body: `
      <div class="legal-body">
        <h4>1. Acceptance of terms</h4>
        <p>By using ANTROR PDF Merger ("the Service"), you agree to these Terms &amp; Conditions. If you do not agree, please do not use the Service.</p>
        <h4>2. What the Service is</h4>
        <p>ANTROR PDF Merger is a free, browser-based tool that lets you select pages from PDF files, arrange them, and merge them into a new PDF. All processing happens locally on your device; the Service has no servers that receive your files.</p>
        <h4>3. Your documents and your rights</h4>
        <ul>
          <li>You retain <b>full ownership</b> of every file you process. The Service claims no rights or license over your content — it never receives a copy.</li>
          <li>You are responsible for ensuring you have the right to modify the documents you process: they must be yours, licensed to you, or handled with permission.</li>
          <li>Always keep your <b>original files</b>. The Service creates a new document and does not modify your sources.</li>
        </ul>
        <h4>4. Acceptable use</h4>
        <p>You agree to use the Service only for lawful purposes and only with documents you are authorized to handle. You may not use the Service to infringe copyrights, breach confidentiality obligations, or process illegal content.</p>
        <h4>5. No warranty</h4>
        <p>The Service is provided <b>"as is" and "as available"</b>, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that merging will be uninterrupted or error-free.</p>
        <p><b>Please verify your output before relying on it</b> — especially for legal, financial, medical, or official documents. Confirm page order, completeness, and readability after downloading.</p>
        <h4>6. Limitation of liability</h4>
        <p>To the maximum extent permitted by law, ANTROR and its contributors will not be liable for any loss of data, corrupted files, missed deadlines, lost profits, or any indirect, incidental, or consequential damages arising from your use of — or inability to use — the Service.</p>
        <h4>7. Intellectual property</h4>
        <p>The ANTROR name, logo, and interface design are the property of ANTROR. The open-source libraries this app builds on (PDF.js, pdf-lib) remain the property of their respective authors under their own licenses. Your documents remain yours alone.</p>
        <h4>8. Availability and changes</h4>
        <p>The Service is offered free of charge and may be modified, interrupted, or discontinued at any time. These Terms may be updated from time to time; the current version is always posted on this page, and continued use after changes constitutes acceptance.</p>
        <h4>9. Governing law</h4>
        <p>These Terms are governed by the laws of <b>[your jurisdiction]</b>, without regard to conflict-of-law rules.</p>
      </div>`
  },
  about: {
    title: 'About',
    updated: 'ANTROR / PDF Merger',
    body: `
      <div class="legal-body">
        <p>ANTROR PDF Merger is a fast, privacy-first tool for combining PDFs with full control over which pages appear — and in what order. Select pages, drag them into exactly the sequence you need, preview the result, and download a single document.</p>
        <p>Most online PDF mergers upload your documents to a server for processing. This one doesn't need to — so it doesn't. Thumbnails render with PDF.js and merging happens with pdf-lib, both running locally in your browser. There is no backend, no account, and nothing to log in to.</p>
        <p>PDF Merger is the first module of the planned <b>ANTROR document toolkit</b>.</p>
        <div class="legal-contact">
          <b>Version 1.0.0</b> — MVP release<br>
          Built with HTML, CSS, and vanilla JavaScript. No frameworks, no backend, no tracking.
        </div>
      </div>`
  },
  contact: {
    title: 'Contact',
    updated: 'We usually reply within a few business days',
    body: `
      <div class="legal-body">
        <p>Questions, bug reports, and feature requests are all welcome.</p>
        <div class="legal-contact">
          <b>Email</b><br>
          <a href="mailto:support@antror.com">support@antror.com</a>
        </div>
        <h4>Reporting a bug</h4>
        <p>Please include your browser and version, your operating system, the steps you took, and any error message shown. There is no need to attach confidential documents — issues are almost always reproducible with any sample PDF.</p>
        <h4>Feature requests</h4>
        <p>On the roadmap: page rotation, splitting, extraction, and compression. If something would make your workflow easier, tell us — the roadmap is shaped by what users actually need.</p>
      </div>`
  }
};

function openLegal(key) {
  const page = LEGAL[key];
  if (!page) return;
  const body = el('div');
  body.innerHTML = `<p class="legal-updated">${esc(page.updated)}</p>${page.body}`;
  let m;
  m = Modal.open({
    title: page.title, body, width: 640,
    footer: [btn('Close', { onClick: () => m.close() })],
  });
}

 $('#siteFooter').addEventListener('click', e => {
  const b = e.target.closest('[data-legal]');
  if (b) openLegal(b.dataset.legal);
});
 $('#footYear').textContent = new Date().getFullYear();
