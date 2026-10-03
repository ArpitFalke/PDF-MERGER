'use strict';
/* =====================================================================
   ANTROR media engine — shared by image & video watermark tools
   REQUIRES: core.js. Exposes: RegionEditor, applyMode,
   pickVideoMime, mimeExt.
   ===================================================================== */

class RegionEditor {
  constructor({ layer, onChange }) {
    this.layer = layer;
    this.onChange = onChange || null;
    this.regions = [];
    this.nextId = 1;
    this.enabled = true;
    this._draft = null;
    layer.classList.add('region-layer');
    layer.addEventListener('pointerdown', e => this._down(e));
    layer.addEventListener('pointermove', e => this._move(e));
    window.addEventListener('pointerup', () => this._up());
    window.addEventListener('pointercancel', () => this._up());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._draft) { this._draft.el.remove(); this._draft = null; }
    });
  }
  _pt(e) {
    const r = this.layer.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }
  _down(e) {
    if (!this.enabled || e.button !== 0) return;
    const del = e.target.closest('.region-del');
    if (del) {
      const box = del.closest('.region-box');
      this.remove(+box.dataset.id);
      e.preventDefault();
      return;
    }
    e.preventDefault();
    this.layer.setPointerCapture?.(e.pointerId);
    const p = this._pt(e);
    const elm = document.createElement('div');
    elm.className = 'region-box drafting';
    this.layer.appendChild(elm);
    this._draft = { x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0, el: elm };
  }
  _move(e) {
    if (!this._draft) return;
    const p = this._pt(e), d = this._draft;
    d.x = Math.min(d.x0, p.x); d.y = Math.min(d.y0, p.y);
    d.w = Math.abs(p.x - d.x0); d.h = Math.abs(p.y - d.y0);
    this._style(d.el, d);
  }
  _style(elm, r) {
    elm.style.left = r.x * 100 + '%';
    elm.style.top = r.y * 100 + '%';
    elm.style.width = r.w * 100 + '%';
    elm.style.height = r.h * 100 + '%';
  }
  _up() {
    if (!this._draft) return;
    const d = this._draft; this._draft = null;
    d.el.remove();
    if (d.w < 0.012 || d.h < 0.012) return;
    const x = clamp(d.x, 0, 1), y = clamp(d.y, 0, 1);
    const r = { id: this.nextId++, x, y, w: Math.min(d.w, 1 - x), h: Math.min(d.h, 1 - y) };
    this.regions.push(r);
    this.render();
    this.onChange && this.onChange();
  }
  render() {
    this.layer.innerHTML = '';
    this.regions.forEach(r => {
      const box = document.createElement('div');
      box.className = 'region-box';
      box.dataset.id = r.id;
      this._style(box, r);
      box.innerHTML = `<button type="button" class="region-del" aria-label="Remove this area">${I.x}</button>`;
      this.layer.appendChild(box);
    });
  }
  remove(id) {
    const n = this.regions.length;
    this.regions = this.regions.filter(r => r.id !== id);
    if (this.regions.length !== n) { this.render(); this.onChange && this.onChange(); }
  }
  undo() {
    if (!this.regions.length) return;
    this.regions.pop();
    this.render();
    this.onChange && this.onChange();
  }
  clear() {
    if (!this.regions.length) return;
    this.regions = [];
    this.render();
    this.onChange && this.onChange();
  }
  reset() { this.regions = []; this.nextId = 1; this.render(); }
  pixelRects(w, h) {
    return this.regions.map(r => ({ x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h }));
  }
}

function clampRect(ctx, r) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x = clamp(Math.floor(r.x), 0, W - 1), y = clamp(Math.floor(r.y), 0, H - 1);
  const w = clamp(Math.ceil(r.w), 1, W - x), h = clamp(Math.ceil(r.h), 1, H - y);
  return { x, y, w, h };
}

function smartFillRect(ctx, rect, maxPx = 160000) {
  const { x: rx, y: ry, w: rw, h: rh } = clampRect(ctx, rect);
  if (rw < 2 || rh < 2) return;
  let s = 1;
  if (rw * rh > maxPx) s = Math.sqrt(maxPx / (rw * rh));
  const ww = Math.max(2, Math.round(rw * s)), wh = Math.max(2, Math.round(rh * s));
  const M = Math.max(2, Math.round(28 * s));
  const sx = Math.max(0, rx - M), sy = Math.max(0, ry - M);
  const sw = Math.min(ctx.canvas.width - sx, ww + 2 * M);
  const sh = Math.min(ctx.canvas.height - sy, wh + 2 * M);
  const work = document.createElement('canvas');
  work.width = sw; work.height = sh;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const img = wctx.getImageData(0, 0, sw, sh);
  const D = img.data;
  const ox = rx - sx, oy = ry - sy;
  const cw = sw, ch = sh;
  const at = (x, y) => (y * cw + x) * 4;

  const n = ww * wh;
  const cur = new Float32Array(n * 3);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const a = at(ox + x, oy + y), i = (y * ww + x) * 3;
    cur[i] = D[a]; cur[i + 1] = D[a + 1]; cur[i + 2] = D[a + 2];
  }
  for (let y = 0; y < wh; y++) {
    const yy = oy + y;
    const Li = ox > 0 ? at(ox - 1, yy) : -1;
    const Ri = ox + ww < cw ? at(ox + ww, yy) : -1;
    for (let x = 0; x < ww; x++) {
      const xx = ox + x;
      const Ti = oy > 0 ? at(xx, oy - 1) : -1;
      const Bi = oy + wh < ch ? at(xx, oy + wh) : -1;
      const i = (y * ww + x) * 3;
      const wx = (x + 0.5) / ww, wy = (y + 0.5) / wh;
      for (let c = 0; c < 3; c++) {
        const self = cur[i + c];
        const l = Li < 0 ? self : D[Li + c], r = Ri < 0 ? self : D[Ri + c];
        const t = Ti < 0 ? self : D[Ti + c], b = Bi < 0 ? self : D[Bi + c];
        cur[i + c] = ((l * (1 - wx) + r * wx) + (t * (1 - wy) + b * wy)) * 0.5;
      }
    }
  }
  const area = ww * wh;
  const iters = area > 80000 ? 14 : area > 20000 ? 26 : 44;
  const get = (x, y, c, fb) => {
    if (x >= 0 && x < ww && y >= 0 && y < wh) return cur[(y * ww + x) * 3 + c];
    const gx = ox + x, gy = oy + y;
    if (gx >= 0 && gx < cw && gy >= 0 && gy < ch) return D[at(gx, gy) + c];
    return fb;
  };
  for (let k = 0; k < iters; k++) {
    const nxt = new Float32Array(n * 3);
    for (let y = 0; y < wh; y++) {
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 3;
        for (let c = 0; c < 3; c++) {
          const self = cur[i + c];
          nxt[i + c] = (get(x - 1, y, c, self) + get(x + 1, y, c, self) +
                        get(x, y - 1, c, self) + get(x, y + 1, c, self)) * 0.25;
        }
      }
    }
    cur.set(nxt);
  }
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) {
    const a = at(ox + x, oy + y), i = (y * ww + x) * 3;
    D[a] = cur[i]; D[a + 1] = cur[i + 1]; D[a + 2] = cur[i + 2];
  }
  wctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(work, ox, oy, ww, wh, rx, ry, rw, rh);
  ctx.restore();
}

function blurRect(ctx, rect, strength = 18) {
  const { x: rx, y: ry, w: rw, h: rh } = clampRect(ctx, rect);
  if (rw < 2 || rh < 2) return;
  const k = clamp(Math.round(strength), 4, 64);
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(rw / k));
  t.height = Math.max(1, Math.round(rh / k));
  const tc = t.getContext('2d');
  tc.drawImage(ctx.canvas, rx, ry, rw, rh, 0, 0, t.width, t.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(t, 0, 0, t.width, t.height, rx, ry, rw, rh);
  ctx.restore();
}

function pixelateRect(ctx, rect, blockSize = 14) {
  const { x: rx, y: ry, w: rw, h: rh } = clampRect(ctx, rect);
  if (rw < 2 || rh < 2) return;
  const k = clamp(Math.round(blockSize), 3, 80);
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(rw / k));
  t.height = Math.max(1, Math.round(rh / k));
  const tc = t.getContext('2d');
  tc.drawImage(ctx.canvas, rx, ry, rw, rh, 0, 0, t.width, t.height);
  ctx.save();
  ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(t, 0, 0, t.width, t.height, rx, ry, rw, rh);
  ctx.restore();
}

function applyMode(ctx, r, mode, maxPx) {
  if (mode === 'blur') blurRect(ctx, r);
  else if (mode === 'pixel') pixelateRect(ctx, r);
  else smartFillRect(ctx, r, maxPx);
}

function pickVideoMime() {
  const c = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of c) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
const mimeExt = mime => (mime || '').includes('mp4') ? 'mp4' : 'webm';
