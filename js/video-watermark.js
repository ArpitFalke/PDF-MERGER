'use strict';
/* =====================================================================
   ANTROR — Video Watermark Remover
   REQUIRES: core.js, media-tools.js. Self-registers its route.
   ===================================================================== */
ROUTES['video-watermark'] = { sub: 'Video Watermark Remover', title: 'ANTROR — Video Watermark Remover' };

(function () {
  const E = {
    empty: $('#vmEmpty'), drop: $('#vmDrop'), add: $('#btnVmAdd'), file: $('#vmFile'),
    editor: $('#vmEditor'), video: $('#vmVideo'), layer: $('#vmLayer'),
    info: $('#vmInfo'), replace: $('#btnVmReplace'), modeSeg: $('#vmModeSeg'),
    undo: $('#btnVmUndo'), clear: $('#btnVmClear'), count: $('#vmRegionCount'),
    run: $('#btnVmRun'), hint: $('#vmHint'), note: $('#vmRunNote'),
    play: $('#btnVmPlay'), seek: $('#vmSeek'), time: $('#vmTime'),
    result: $('#vmResult'), rvideo: $('#vmResultVideo'), rmeta: $('#vmResultMeta'),
    download: $('#btnVmDownload'), open: $('#btnVmOpen'), back: $('#btnVmBack'),
  };
  const IVP = {
    play: svg('<path d="M8 5.5v13l11-6.5z"/>'),
    pause: svg('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  };
  const S = {
    url: null, fileName: 'video', mode: 'fill',
    processing: false, cancelFlag: false,
    resultUrl: null, resultExt: 'webm', audio: null, rec: null,
  };
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
    E.hint.textContent = n === 0
      ? '— pause on a frame, then drag a box over the watermark'
      : `— ${n} area${n > 1 ? 's' : ''} will be cleaned in every frame`;
    E.run.disabled = S.processing;
    E.play.innerHTML = E.video.paused ? IVP.play : IVP.pause;
  }
  function loadFile(file) {
    const okType = (file.type && file.type.startsWith('video/')) || /\.(mp4|webm|mov|m4v)$/i.test(file.name || '');
    if (!okType) { toast('That file isn’t a supported video. Use MP4 or WebM.', { type: 'error' }); return; }
    cleanupMedia();
    const url = URL.createObjectURL(file);
    E.video.src = url;
    S.url = url;
    S.fileName = file.name || 'video';
    const fail = () => toast('We couldn’t read that video. Your browser may not support its codec — try an MP4 (H.264).', { type: 'error' });
    const timeout = setTimeout(fail, 12000);
    E.video.onerror = () => { clearTimeout(timeout); fail(); show('empty'); };
    E.video.onloadedmetadata = () => {
      clearTimeout(timeout);
      E.video.onerror = null;
      const d = E.video.duration;
      if (!isFinite(d) || d <= 0) { toast('That video’s duration couldn’t be determined.', { type: 'error' }); return; }
      editor.reset();
      E.info.textContent = `${S.fileName} · ${E.video.videoWidth}×${E.video.videoHeight} · ${fmtTime(d)} · ${fmtBytes(file.size)}`;
      E.note.textContent = `Processing plays the video once in real time (about ${fmtTime(d)}) and records the cleaned result.`;
      sync();
      show('editor');
      if (d > 300) toast(`Heads up: a ${fmtTime(d)} video takes about ${fmtTime(d)} to process, in real time.`);
    };
  }
  function cleanupMedia() {
    if (S.resultUrl) { URL.revokeObjectURL(S.resultUrl); S.resultUrl = null; }
    if (S.url) { URL.revokeObjectURL(S.url); S.url = null; }
    E.video.removeAttribute('src'); E.video.load();
  }

  E.play.addEventListener('click', () => { E.video.paused ? E.video.play() : E.video.pause(); });
  E.video.addEventListener('play', sync);
  E.video.addEventListener('pause', sync);
  E.video.addEventListener('timeupdate', () => {
    const d = E.video.duration || 0;
    if (d > 0) E.seek.value = Math.round((E.video.currentTime / d) * 1000);
    E.time.textContent = `${fmtTime(E.video.currentTime)} / ${fmtTime(E.video.duration)}`;
  });
  E.seek.addEventListener('input', () => {
    const d = E.video.duration || 0;
    if (d > 0) E.video.currentTime = (E.seek.value / 1000) * d;
  });

  async function run() {
    if (S.processing) return;
    if (!editor.regions.length) { toast('Draw a box over the watermark first.'); return; }
    const d = E.video.duration;
    if (d > 150) {
      let cm;
      cm = Modal.open({
        title: 'Ready to process?', width: 430, confirmOnEnter: true,
        body: `<p class="modal-text">Processing runs in real time — this ${fmtTime(d)} video takes about <b>${fmtTime(d)}</b>. You can cancel anytime.</p>`,
        footer: [
          btn('Cancel', { onClick: () => cm.close() }),
          btn('Start processing', { kind: 'primary', onClick: () => { cm.close(); startProcessing(); } }),
        ],
      });
    } else {
      startProcessing();
    }
  }

  async function startProcessing() {
    const v = E.video;
    const vw = v.videoWidth, vh = v.videoHeight, dur = v.duration;
    if (!vw || !vh || !isFinite(dur)) { toast('This video can’t be processed.', { type: 'error' }); return; }
    const mime = pickVideoMime();
    if (!mime) { toast('This browser can’t record video locally. Try Chrome, Edge or Firefox.', { type: 'error' }); return; }

    S.processing = true; S.cancelFlag = false;
    editor.enabled = false;
    v.pause();

    const body = el('div');
    body.innerHTML = `
      <ul class="m-stages">
        <li class="active"><span class="m-dot">${I.check}</span><span>Cleaning frames &amp; recording</span><span class="m-meta mono" id="vmStageMeta"></span></li>
      </ul>
      <div class="m-bar"><div class="m-fill" id="vmFill"></div></div>
      <div class="m-runfoot"><span class="m-pct mono" id="vmPct">0%</span><button type="button" class="btn ghost sm" id="vmCancel">Cancel</button></div>`;
    const m = Modal.open({ title: 'Processing video', body, width: 440, dismissable: false });
    const fill = $('#vmFill', body), pct = $('#vmPct', body), meta = $('#vmStageMeta', body);
    const cancelBtn = $('#vmCancel', body);
    cancelBtn.addEventListener('click', () => { S.cancelFlag = true; cancelBtn.disabled = true; });
    const prog = t => {
      const p = clamp(t / dur, 0, 1);
      fill.style.width = (p * 100).toFixed(1) + '%';
      pct.textContent = Math.round(p * 100) + '%';
      meta.textContent = `${fmtTime(t)} / ${fmtTime(dur)}`;
    };

    const c = document.createElement('canvas');
    c.width = vw; c.height = vh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    const rects = editor.pixelRects(vw, vh);
    const maxPx = 36000;

    const draw = () => {
      ctx.drawImage(v, 0, 0, vw, vh);
      for (const r of rects) applyMode(ctx, r, S.mode, maxPx);
    };

    const stream = c.captureStream(30);
    try {
      if (!S.audio) {
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const src = actx.createMediaElementSource(v);
        const dest = actx.createMediaStreamDestination();
        src.connect(dest);
        src.connect(actx.destination);
        S.audio = { actx, dest };
      }
      await S.audio.actx.resume();
      S.audio.dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    } catch (_) { /* proceed without audio */ }

    const chunks = [];
    let rec;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: clamp(vw * vh * 6, 2500000, 16000000),
      });
    } catch (err) {
      console.error(err);
      S.processing = false; editor.enabled = true; m.close();
      toast('Recording isn’t available in this browser.', { type: 'error' });
      return;
    }
    S.rec = rec;
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(res => { rec.onstop = res; });
    rec.start(400);

    const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    const loop = () => {
      if (S.cancelFlag || v.ended) return;
      draw();
      prog(v.currentTime);
      if (useRVFC) v.requestVideoFrameCallback(loop);
      else requestAnimationFrame(loop);
    };

    const seeked = new Promise(res => {
      if (v.currentTime === 0) res();
      else { v.addEventListener('seeked', res, { once: true }); v.currentTime = 0; }
    });
    await seeked;
    draw(); prog(0);
    try { await v.play(); } catch (_) {}
    loop();

    const onEnded = () => new Promise(res => { if (v.ended) res(); else v.addEventListener('ended', res, { once: true }); });
    await onEnded();
    await delay(350);
    if (!S.cancelFlag) prog(dur);
    try { rec.stop(); } catch (_) {}
    await stopped;
    m.close();

    S.processing = false; S.rec = null;
    editor.enabled = true;

    if (S.cancelFlag) {
      v.pause();
      sync();
      toast('Processing cancelled.');
      return;
    }
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) {
      sync();
      toast('Something went wrong while recording the video. Nothing was changed.', { type: 'error' });
      return;
    }
    if (S.resultUrl) URL.revokeObjectURL(S.resultUrl);
    S.resultUrl = URL.createObjectURL(blob);
    S.resultExt = mimeExt(mime);
    const base = (S.fileName.replace(/\.[^.]+$/, '') || 'video');
    const name = `${base}-clean.${S.resultExt}`;
    E.rvideo.src = S.resultUrl;
    E.download.href = S.resultUrl;
    E.download.download = name;
    E.open.href = S.resultUrl;
    E.rmeta.textContent = `${name} · ${fmtBytes(blob.size)} · ${fmtTime(dur)} · ${S.resultExt.toUpperCase()}`;
    show('result');
    v.pause();
    sync();
    toast('Video cleaned successfully — preview and download below.', { type: 'success' });
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
  $$('#vmModeSeg button').forEach(b => b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    $$('#vmModeSeg button').forEach(x => x.classList.toggle('on', x === b));
  }));
  E.undo.addEventListener('click', () => editor.undo());
  E.clear.addEventListener('click', () => editor.clear());
  E.run.addEventListener('click', run);
  E.back.addEventListener('click', () => {
    if (S.resultUrl) { URL.revokeObjectURL(S.resultUrl); S.resultUrl = null; }
    E.rvideo.removeAttribute('src'); E.rvideo.load();
    show('editor'); sync();
  });
  document.addEventListener('keydown', e => {
    if (Platform.route !== 'video-watermark' || Modal.current) return;
    const t = e.target;
    if (t.matches && t.matches('input,textarea,select')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && !E.editor.hidden) { e.preventDefault(); editor.undo(); }
  });
  window.addEventListener('beforeunload', e => {
    if (S.processing) { e.preventDefault(); e.returnValue = ''; }
  });

  sync();
})();
