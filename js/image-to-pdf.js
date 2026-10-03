'use strict';
/* =====================================================================
   ANTROR — Image to PDF
   REQUIRES: core.js (makeSortable), pdf-lib (CDN). Self-registers route.
   ===================================================================== */
ROUTES['image-to-pdf'] = { sub: 'Image to PDF', title: 'ANTROR — Image to PDF' };

(function () {
  const E = {
    empty: $('#ipEmpty'), drop: $('#ipDrop'), add: $('#btnIpAdd'), file: $('#ipFile'),
    editor: $('#ipEditor'), list: $('#ipList'), info: $('#ipInfo'),
    addMore: $('#btnIpAddMore'), clear: $('#btnIpClear'),
    sizeSeg: $('#ipSizeSeg'), orientSeg: $('#ipOrientSeg'), marginSeg: $('#ipMarginSeg'),
    count: $('#ipCount'), hint: $('#ipHint'), run: $('#btnIpRun'),
    result: $('#ipResult'), frame: $('#ipFrame'), meta: $('#ipResultMeta'),
    filename: $('#ipFilename'), download: $('#btnIpDownload'),
    open: $('#btnIpOpen'), reset: $('#btnIpReset'),
  };
  const A4 = [595.28, 841.89], LETTER = [612, 792]; // pt
  const S = { items: [], url: null, busy: false, nextId: 1 };
  const ipSanitize = n => {
    n = (n || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ');
    if (!n) n = 'images.pdf';
    if (!/\.pdf$/i.test(n)) n += '.pdf';
    return n;
  };

  function show(which) {
    E.empty.hidden = which !== 'empty';
    E.editor.hidden = which !== 'editor';
    E.result.hidden = which !== 'result';
  }
  function sync() {
    const n = S.items.length;
    E.count.textContent = n;
    E.info.textContent = n ? `${n} image${n > 1 ? 's' : ''} → ${n} page${n > 1 ? 's' : ''}` : '';
    E.run.disabled = S.busy || !n;
    E.clear.disabled = !n;
    const auto = $('.on', E.sizeSeg).dataset.size === 'auto';
    [...E.marginSeg.children].forEach(b => b.disabled = auto);
    E.marginSeg.style.opacity = auto ? .45 : 1;
    E.hint.textContent = n === 0 ? '— add images to begin'
      : n === 1 ? '— drag the card to reorder, or create the PDF'
      : `— ${n} pages · drag cards to set the order`;
  }

  /* ----- loading ----- */
  const isImg = f => (f.type && f.type.startsWith('image/')) || /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(f.name || '');
  async function loadFiles(list) {
    const all = [...list], files = all.filter(isImg);
    const rejected = all.length - files.length;
    if (rejected) toast(`${rejected} file${rejected > 1 ? 's were' : ' was'} skipped — only images can become PDF pages.`, { type: 'error' });
    let added = 0;
    for (const f of files) {
      if (f.size > 25 * 1048576) { toast(`“${f.name}” is too large (over 25 MB).`, { type: 'error' }); continue; }
      try { await addItem(f); added++; }
      catch (err) { console.warn(err); toast(`We couldn’t read “${f.name}”.`, { type: 'error' }); }
    }
    if (added) show('editor');
    sync();
  }
  async function addItem(file) {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('decode');
    const kind = /jpeg/.test(file.type) ? 'jpg' : /png/.test(file.type) ? 'png' : 'convert';
    const item = { id: S.nextId++, name: file.name || 'image', bytes: null, url, w, h, kind, el: null };
    item.bytes = new Uint8Array(await file.arrayBuffer());
    buildItem(item);
    S.items.push(item);
    E.list.appendChild(item.el);
  }
  function buildItem(item) {
    const d = el('div', 'ip-item');
    d.dataset.id = item.id;
    d.innerHTML = `
      <span class="doc-grip" role="button" tabindex="0" aria-label="Drag to reorder" title="Drag to reorder">${I.grip}</span>
      <div class="ip-thumb"><img src="${item.url}" alt=""></div>
      <div class="ip-item-meta">
        <span class="ip-name" title="${esc(item.name)}">${esc(item.name)}</span>
        <span class="ip-dims mono">${item.w} × ${item.h}</span>
      </div>
      <button type="button" class="icon-btn ip-remove" aria-label="Remove ${esc(item.name)}" title="Remove image">${I.trash}</button>`;
    item.el = d;
  }

  /* ----- remove / clear / reorder ----- */
  E.list.addEventListener('click', e => {
    const rm = e.target.closest('.ip-remove');
    if (!rm) return;
    const itemEl = rm.closest('.ip-item');
    const i = S.items.findIndex(x => x.id === +itemEl.dataset.id);
    if (i < 0) return;
    URL.revokeObjectURL(S.items[i].url);
    S.items.splice(i, 1);
    itemEl.remove();
    sync();
    if (!S.items.length) show('empty');
  });
  E.clear.addEventListener('click', () => {
    if (!S.items.length) return;
    S.items.forEach(it => URL.revokeObjectURL(it.url));
    S.items = [];
    E.list.innerHTML = '';
    show('empty'); sync();
  });
  makeSortable(E.list, {
    itemSel: '.ip-item', handleSel: '.doc-grip',
    onReorder: (from, to) => {
      const [it] = S.items.splice(from, 1);
      S.items.splice(to, 0, it);
      sync();
    },
  });

  /* ----- settings ----- */
  const segPick = (seg, attr) => e => {
    const b = e.target.closest(`[${attr}]`);
    if (!b || b.disabled) return;
    [...seg.children].forEach(x => x.classList.toggle('on', x === b));
    if (attr === 'data-size') sync();
  };
  E.sizeSeg.addEventListener('click', segPick(E.sizeSeg, 'data-size'));
  E.orientSeg.addEventListener('click', segPick(E.orientSeg, 'data-orient'));
  E.marginSeg.addEventListener('click', segPick(E.marginSeg, 'data-margin'));

  /* ----- generate ----- */
  function applyName() {
    const n = ipSanitize(E.filename.value);
    E.download.download = n;
    E.open.download = n;
    return n;
  }
  async function run() {
    if (S.busy || !S.items.length) return;
    S.busy = true; E.run.disabled = true;
    const label = E.run.innerHTML;
    try {
      await frame();
      const out = await PDFLib.PDFDocument.create();
      out.setProducer('ANTROR Tools');
      out.setCreator('ANTROR Tools');
      const sizeMode = $('.on', E.sizeSeg).dataset.size;
      const orient = $('.on', E.orientSeg).dataset.orient;
      const margin = +$('.on', E.marginSeg).dataset.margin;
      for (let i = 0; i < S.items.length; i++) {
        const item = S.items[i];
        E.run.textContent = `Creating PDF… (${i + 1}/${S.items.length})`;
        let img;
        if (item.kind === 'jpg') img = await out.embedJpg(item.bytes);
        else if (item.kind === 'png') img = await out.embedPng(item.bytes);
        else {
          const bmp = await new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => rej(new Error('decode'));
            im.src = item.url;
          });
          const c = document.createElement('canvas');
          c.width = item.w; c.height = item.h;
          c.getContext('2d').drawImage(bmp, 0, 0);
          const blob = await new Promise(r => c.toBlob(r, 'image/png'));
          img = await out.embedPng(new Uint8Array(await blob.arrayBuffer()));
        }
        let pw, ph;
        if (sizeMode === 'auto') { pw = img.width; ph = img.height; }
        else {
          const base = sizeMode === 'a4' ? A4 : LETTER;
          pw = orient === 'landscape' ? base[1] : base[0];
          ph = orient === 'landscape' ? base[0] : base[1];
        }
        const page = out.addPage([pw, ph]);
        const m = sizeMode === 'auto' ? 0 : margin;
        const availW = Math.max(1, pw - 2 * m), availH = Math.max(1, ph - 2 * m);
        const scale = Math.min(availW / img.width, availH / img.height);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        await frame();
      }
      const bytes = await out.save();
      if (S.url) URL.revokeObjectURL(S.url);
      S.url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      E.frame.src = S.url;
      E.download.href = S.url;
      E.open.href = S.url;
      E.filename.value = 'images.pdf';
      applyName();
      E.meta.textContent = `${S.items.length} page${S.items.length > 1 ? 's' : ''} · ${fmtBytes(bytes.length)}`;
      show('result');
      toast('PDF created — preview and download below.', { type: 'success' });
    } catch (err) {
      console.error(err);
      toast('Something went wrong while creating the PDF. Your images are unchanged.', { type: 'error' });
    } finally {
      E.run.innerHTML = label;
      S.busy = false; sync();
    }
  }

  /* ----- wiring ----- */
  const pick = () => E.file.click();
  E.add.addEventListener('click', pick);
  E.addMore.addEventListener('click', pick);
  E.drop.addEventListener('click', pick);
  E.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  ['dragover', 'dragenter'].forEach(ev => E.drop.addEventListener(ev, e => { e.preventDefault(); E.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => E.drop.addEventListener(ev, e => { e.preventDefault(); E.drop.classList.remove('over'); }));
  E.drop.addEventListener('drop', e => { if (e.dataTransfer.files?.length) loadFiles(e.dataTransfer.files); });
  E.file.addEventListener('change', e => { if (e.target.files?.length) loadFiles(e.target.files); e.target.value = ''; });
  E.run.addEventListener('click', run);
  E.filename.addEventListener('input', applyName);
  E.filename.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); E.download.click(); } });
  E.reset.addEventListener('click', () => {
    if (S.url) { URL.revokeObjectURL(S.url); S.url = null; }
    S.items.forEach(it => URL.revokeObjectURL(it.url));
    S.items = [];
    E.list.innerHTML = '';
    show('empty'); sync();
  });

  sync();
})();
