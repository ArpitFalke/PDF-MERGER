'use strict';
/* =====================================================================
   ANTROR — Image Watermark Remover
   REQUIRES: core.js, media-tools.js. Self-registers its route.
   ===================================================================== */
ROUTES['image-watermark'] = { sub: 'Image Watermark Remover', title: 'ANTROR — Image Watermark Remover' };

(function () {
  const E = {
    empty: $('#imEmpty'), drop: $('#imDrop'), add: $('#btnImAdd'), file: $('#imFile'),
    editor: $('#imEditor'), canvas: $('#imCanvas'), layer: $('#imLayer'),
    info: $('#imInfo'), replace: $('#btnImReplace'), modeSeg: $('#imModeSeg'),
    undo: $('#btnImUndo'), clear: $('#btnImClear'), count: $('#imRegionCount'),
    run: $('#btnImRun'), hint: $('#imHint'),
    result: $('#imResult'), img: $('#imResultImg'), toggle: $('#imToggleSeg'),
    download: $('#btnImDownload'), back: $('#btnImBack'), reset: $('#btnImReset'),
  };
  const S = { fileName: 'image', fileType: 'image/png', mode: 'fill', origUrl: null, cleanUrl: null, busy: false };
  const editor = new RegionEditor({ layer: E.layer, onChange: sync });

  function show(which) {
    E.empty.hidden = which !== 'empty';
    E.editor.hidden = which !== 'editor';
    E.result.hidden = which !== 'result';
  }
  function sync() {
    const n = editor.regions.length;
    E.count.textContent = n;
    E.undo.disabled = !n; E.clear.disabled = !n;
    E.run.disabled = S.busy;
    E.hint.textContent = n === 0
      ? '— drag on the image to cover each watermark'
      : n === 1
        ? '— add more boxes if there are several watermarks, or run the removal'
        : `— ${n} areas will be reconstructed`;
  }
  function resetAll() {
    editor.reset();
    if (S.origUrl) URL.revokeObjectURL(S.origUrl);
    if (S.cleanUrl) URL.revokeObjectURL(S.cleanUrl);
    S.origUrl = S.cleanUrl = null;
    S.busy = false; E.run.disabled = false;
    show('empty');
  }
  async function loadFile(file) {
    const okType = file.type.startsWith('image/') && /png|jpeg|webp|bmp/.test(file.type);
    if (!okType) { toast('That file isn’t a supported image. Use JPG, PNG or WebP.', { type: 'error' }); return; }
    if (file.size > 30 * 1048576) { toast('That image is too large (over 30 MB).', { type: 'error' }); return; }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('decode'));
        i.src = url;
      });
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('decode');
      const cap = 8000;
      if (Math.max(w, h) > cap) {
        const k = cap / Math.max(w, h);
        w = Math.round(w * k); h = Math.round(h * k);
        toast('Large image scaled down to 8000 px for reliable processing.');
      }
      E.canvas.width = w; E.canvas.height = h;
      const ctx = E.canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      S.fileName = file.name || 'image';
      S.fileType = file.type || 'image/png';
      editor.reset();
      E.info.textContent = `${S.fileName} · ${w}×${h} · ${fmtBytes(file.size)}`;
      sync();
      show('editor');
    } catch (_) {
      toast('We couldn’t read that image. Try re-saving it and adding it again.', { type: 'error' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function run() {
    if (S.busy) return;
    if (!editor.regions.length) { toast('Drag on the image to mark a watermark first.'); return; }
    S.busy = true; E.run.disabled = true;
    const label = E.run.innerHTML;
    E.run.textContent = 'Removing…';
    try {
      await frame();
      const ctx = E.canvas.getContext('2d');
      const isJpg = /jpeg/.test(S.fileType);
      const type = isJpg ? 'image/jpeg' : 'image/png';
      S.origUrl = await canvasToUrl(E.canvas, type, 0.92);
      const rects = editor.pixelRects(E.canvas.width, E.canvas.height);
      for (const r of rects) applyMode(ctx, r, S.mode, 160000);
      S.cleanUrl = await canvasToUrl(E.canvas, type, 0.92);
      editor.reset();
      sync();
      const base = S.fileName.replace(/\.[^.]+$/, '') || 'image';
      const ext = isJpg ? 'jpg' : 'png';
      const name = `${base}-clean.${ext}`;
      E.download.href = S.cleanUrl;
      E.download.download = name;
      E.download.setAttribute('aria-label', `Download ${name}`);
      setToggle('clean');
      show('result');
      toast('Watermark removed — compare and download below.', { type: 'success' });
    } catch (err) {
      console.error(err);
      toast('Something went wrong while processing the image. Your original file is unchanged.', { type: 'error' });
    } finally {
      E.run.innerHTML = label;
      S.busy = false; E.run.disabled = false;
    }
  }
  function setToggle(v) {
    $$('#imToggleSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    E.img.src = v === 'orig' ? S.origUrl : S.cleanUrl;
  }

  const pick = () => E.file.click();
  E.add.addEventListener('click', pick);
  E.drop.addEventListener('click', pick);
  E.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  ['dragover', 'dragenter'].forEach(ev => E.drop.addEventListener(ev, e => { e.preventDefault(); E.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => E.drop.addEventListener(ev, e => { e.preventDefault(); E.drop.classList.remove('over'); }));
  E.drop.addEventListener('drop', e => { const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); });
  E.file.addEventListener('change', e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; });
  E.replace.addEventListener('click', () => E.file.click());
  $$('#imModeSeg button').forEach(b => b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    $$('#imModeSeg button').forEach(x => x.classList.toggle('on', x === b));
  }));
  E.undo.addEventListener('click', () => editor.undo());
  E.clear.addEventListener('click', () => editor.clear());
  E.run.addEventListener('click', run);
  E.toggle.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setToggle(b.dataset.view); });
  E.back.addEventListener('click', () => { show('editor'); sync(); });
  E.reset.addEventListener('click', resetAll);

  document.addEventListener('keydown', e => {
    if (Platform.route !== 'image-watermark' || Modal.current) return;
    const t = e.target;
    if (t.matches && t.matches('input,textarea,select')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !E.editor.hidden) { e.preventDefault(); editor.undo(); }
  });
})();
