'use strict';
/* =====================================================================
   ANTROR — Video Editor (CapCut-style, local-only)
   REQUIRES: core.js (router/modal/toast), media-tools.js (pickVideoMime).
   Self-registers route 'video-editor'.
   ===================================================================== */
ROUTES['video-editor'] = {
  sub: 'Video Editor',
  title: 'ANTROR — Video Editor',
  desc: 'Free browser video editor: trim, split and arrange clips on a multi-track timeline, add text and music, adjust speed and color — then export locally.'
};

(function () {
  const E = {
    add: $('#btnVeAdd'), file: $('#veFile'), resSeg: $('#veResSeg'),
    clear: $('#btnVeClear'), exportBtn: $('#btnVeExport'),
    bin: $('#veBin'), binEmpty: $('#veBinEmpty'),
    canvas: $('#veCanvas'), play: $('#btnVePlay'), time: $('#veTime'), seek: $('#veSeek'),
    insp: $('#veInspector'),
    addText: $('#btnVeAddText'), split: $('#btnVeSplit'), del: $('#btnVeDelete'),
    zoomIn: $('#btnVeZoomIn'), zoomOut: $('#btnVeZoomOut'),
    tlScroll: $('#veTlScroll'), tlInner: $('#veTlInner'), ruler: $('#veRuler'),
    playhead: $('#vePlayhead'),
  };
  const lanes = {
    text: $('#veTlInner [data-lane="text"]'),
    video: $('#veTlInner [data-lane="video"]'),
    audio: $('#veTlInner [data-lane="audio"]'),
  };
  const IVP = {
    play: svg('<path d="M8 5.5v13l11-6.5z"/>'),
    pause: svg('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  };
  const FILTER_OK = typeof E.canvas.getContext('2d').filter === 'string';

  const S = {
    media: new Map(),   // id -> {id,name,kind,url,dur,w,h,thumb,img}
    clips: [],          // flat clip objects (see addClip*)
    sel: null, ph: 0, playing: false,
    pps: 60, res: [1280, 720],
    uid: 1, actx: null, exportDest: null,
    exporting: false, cancelExport: false, finishedExport: false,
  };
  const ctx = E.canvas.getContext('2d');
  let lastT = 0;

  /* ---------- helpers ---------- */
  const veFmt = t => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${d}`;
  };
  const projDur = () => S.clips.reduce((a, c) => Math.max(a, c.start + c.dur), 0);
  const getClip = id => S.clips.find(c => c.id === id) || null;
  const mediaOf = c => S.media.get(c.mediaId);
  const snap = t => Math.round(t * 10) / 10;
  function requestDraw() { requestAnimationFrame(() => { if (!S.playing) { syncMedia(); draw(); } }); }

  /* ---------- audio graph ---------- */
  function ensureAudio() {
    if (!S.actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      S.actx = new AC();
      S.exportDest = S.actx.createMediaStreamDestination();
    }
    if (S.actx.state === 'suspended') S.actx.resume().catch(() => {});
    return S.actx;
  }

  /* ---------- per-clip media elements ---------- */
  function clipEl(c) {
    if (c.el) return c.el;
    const m = mediaOf(c);
    const el = document.createElement(m.kind === 'video' ? 'video' : 'audio');
    el.src = m.url; el.preload = 'auto';
    c.el = el;
    if (S.actx) routeClip(c);
    el.addEventListener('seeked', () => { if (!S.playing) requestDraw(); });
    el.addEventListener('loadeddata', () => { if (!S.playing) requestDraw(); });
    return el;
  }
  function routeClip(c) {
    if (!S.actx || c.gain) return;
    const src = S.actx.createMediaElementSource(c.el);
    c.gain = S.actx.createGain();
    c.gain.gain.value = c.vol ?? 1;
    src.connect(c.gain);
    c.gain.connect(S.actx.destination);
    c.gain.connect(S.exportDest);
  }
  function disposeClipEl(c) {
    if (!c.el) return;
    try { c.el.pause(); c.el.removeAttribute('src'); c.el.load(); } catch (_) {}
    c.el = null; c.gain = null;
  }

  /* ---------- media import ---------- */
  const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

  async function addMedia(file) {
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null;
    if (!kind) { toast(`“${file.name}” isn’t a video, audio or image file.`, { type: 'error' }); return; }
    if (file.size > 300 * 1048576) { toast(`“${file.name}” is too large (over 300 MB).`, { type: 'error' }); return; }
    const url = URL.createObjectURL(file);
    const item = { id: 'm' + (S.uid++), name: file.name || kind, kind, url, dur: 0, w: 0, h: 0, thumb: null, img: null };
    try {
      if (kind === 'image') {
        const img = await loadImg(url);
        item.img = img; item.w = img.naturalWidth; item.h = img.naturalHeight; item.dur = 4;
      } else {
        const probe = document.createElement(kind === 'video' ? 'video' : 'audio');
        probe.preload = 'metadata'; probe.muted = true; probe.src = url;
        await new Promise((res, rej) => { probe.onloadedmetadata = res; probe.onerror = rej; setTimeout(rej, 15000); });
        item.dur = probe.duration;
        if (kind === 'video') {
          item.w = probe.videoWidth; item.h = probe.videoHeight;
          probe.currentTime = Math.min(0.5, (probe.duration || 1) / 2);
          await new Promise(res => { probe.onseeked = res; setTimeout(res, 2500); });
          const tc = document.createElement('canvas');
          tc.width = 160; tc.height = 90;
          const tctx = tc.getContext('2d');
          const vw = probe.videoWidth || 16, vh = probe.videoHeight || 9;
          const sc = Math.max(160 / vw, 90 / vh);
          tctx.drawImage(probe, (160 - vw * sc) / 2, (90 - vh * sc) / 2, vw * sc, vh * sc);
          item.thumb = tc.toDataURL('image/jpeg', 0.8);
        }
      }
      S.media.set(item.id, item);
      renderBin();
    } catch (_) {
      URL.revokeObjectURL(url);
      toast(`We couldn’t read “${file.name}”. Try an MP4 (H.264), MP3 or standard image.`, { type: 'error' });
    }
  }

  function renderBin() {
    E.bin.innerHTML = '';
    E.binEmpty.hidden = S.media.size > 0;
    for (const m of S.media.values()) {
      const d = el('div', 've-media');
      const icon = m.kind === 'audio' ? '♪' : m.kind === 'image' ? '🖼' : '▶';
      d.innerHTML = `
        <span class="ve-media-thumb" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}">${m.thumb ? '' : icon}</span>
        <span class="ve-media-info">
          <span class="ve-media-name" title="${esc(m.name)}">${esc(m.name)}</span>
          <span class="ve-media-meta mono">${m.kind}${m.kind !== 'image' ? ' · ' + fmtTime(m.dur) : ` · ${m.w}×${m.h}`}</span>
        </span>
        <span class="ve-media-actions"></span>`;
      const acts = $('.ve-media-actions', d);
      if (m.kind !== 'audio') {
        const bv = el('button', 'chip-btn', 'Video');
        bv.type = 'button'; bv.title = 'Add to video track';
        bv.addEventListener('click', () => addMediaClip(m, 'video'));
        acts.appendChild(bv);
      }
      if (m.kind !== 'image') {
        const ba = el('button', 'chip-btn', 'Audio');
        ba.type = 'button'; ba.title = 'Add to audio track';
        ba.addEventListener('click', () => addMediaClip(m, 'audio'));
        acts.appendChild(ba);
      }
      const bx = el('button', 'icon-btn'); bx.type = 'button'; bx.innerHTML = I.x;
      bx.setAttribute('aria-label', `Remove ${m.name}`);
      bx.addEventListener('click', () => removeMedia(m.id));
      acts.appendChild(bx);
      E.bin.appendChild(d);
    }
  }

  function removeMedia(id) {
    const m = S.media.get(id); if (!m) return;
    S.clips.filter(c => c.mediaId === id).forEach(c => { disposeClipEl(c); if (S.sel === c.id) S.sel = null; });
    S.clips = S.clips.filter(c => c.mediaId !== id);
    URL.revokeObjectURL(m.url);
    S.media.delete(id);
    renderBin(); renderTimeline(); renderInspector(); requestDraw();
  }

  /* ---------- clips ---------- */
  const trackEnd = track => S.clips.filter(c => c.track === track).reduce((a, c) => Math.max(a, c.start + c.dur), 0);

  function addMediaClip(m, track) {
    const c = track === 'video'
      ? { id: S.uid++, track: 'video', mediaId: m.id, start: trackEnd('video'), dur: m.kind === 'image' ? 4 : m.dur, in: 0, speed: 1, vol: 1, f: { b: 100, c: 100, s: 100 }, fi: 0, fo: 0 }
      : { id: S.uid++, track: 'audio', mediaId: m.id, start: trackEnd('audio'), dur: m.dur, in: 0, speed: 1, vol: 1, fi: 0, fo: 0 };
    S.clips.push(c);
    renderTimeline(); select(c.id);
    toast(`Added to the ${track} track.`, { type: 'success' });
  }
  function addTextClip() {
    const c = { id: S.uid++, track: 'text', mediaId: null, start: snap(S.ph), dur: 3, text: 'Your text', size: 48, color: '#FFFFFF', x: 50, y: 80, fi: 0, fo: 0 };
    S.clips.push(c);
    renderTimeline(); select(c.id);
  }

  function clampPlace(c, start, dur) {
    start = Math.max(0, start);
    if (c.track !== 'video') return start;
    for (const o of S.clips) {
      if (o.track !== 'video' || o.id === c.id) continue;
      const oe = o.start + o.dur;
      if (o.start < start + dur - 1e-4 && oe > start + 1e-4) {
        // overlap — snap to the nearer side
        start = (start + dur / 2 < o.start + o.dur / 2) ? oe - dur < 0 ? oe : Math.max(0, oe) : Math.max(0, o.start - dur);
      }
    }
    return Math.max(0, start);
  }

  function select(id) {
    S.sel = id;
    $$('#veTlInner .ve-clip').forEach(n => n.classList.toggle('sel', +n.dataset.id === id));
    renderInspector();
  }

  function deleteSelected() {
    const c = getClip(S.sel); if (!c) { toast('Select a clip on the timeline first.'); return; }
    disposeClipEl(c);
    S.clips = S.clips.filter(x => x.id !== c.id);
    S.sel = null;
    renderTimeline(); renderInspector(); requestDraw(); updateTransport();
  }
  function duplicateSelected() {
    const c = getClip(S.sel); if (!c) return;
    const copy = { ...c, id: S.uid++, start: c.start + c.dur, el: undefined, gain: undefined, f: c.f ? { ...c.f } : undefined };
    copy.start = clampPlace(copy, copy.start, copy.dur);
    S.clips.push(copy);
    renderTimeline(); select(copy.id);
  }
  function splitAtPlayhead() {
    let c = getClip(S.sel);
    if (!(c && S.ph > c.start && S.ph < c.start + c.dur)) {
      c = S.clips.find(x => S.ph > x.start + 0.05 && S.ph < x.start + x.dur - 0.05);
    }
    if (!c) { toast('Move the playhead over a clip to split it.'); return; }
    const off = snap(S.ph - c.start);
    if (off < 0.1 || c.dur - off < 0.1) { toast('Playhead is too close to the clip edge to split.'); return; }
    const right = { ...c, id: S.uid++, start: c.start + off, dur: c.dur - off, in: c.in + off * (c.speed || 1), el: undefined, gain: undefined, f: c.f ? { ...c.f } : undefined };
    c.dur = off;
    S.clips.push(right);
    renderTimeline(); select(right.id); updateTransport();
  }

  /* ---------- timeline rendering ---------- */
  function renderTimeline() {
    const dur = Math.max(projDur(), 10);
    const width = Math.max(dur * S.pps + 500, E.tlScroll.clientWidth - 64);
    E.tlInner.style.width = width + 'px';
    // ruler
    E.ruler.innerHTML = '';
    const step = S.pps >= 50 ? 1 : S.pps >= 12 ? 5 : 30;
    for (let t = 0; t * S.pps <= width; t += step) {
      const tick = el('div', 've-tick', t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t}s`);
      tick.style.left = t * S.pps + 'px';
      E.ruler.appendChild(tick);
    }
    // lanes
    for (const track of ['text', 'video', 'audio']) {
      lanes[track].innerHTML = '';
      for (const c of S.clips.filter(x => x.track === track)) lanes[track].appendChild(buildClipEl(c));
    }
    renderPlayhead();
    updateTransport();
  }
  function buildClipEl(c) {
    const m = c.mediaId ? mediaOf(c) : null;
    const d = el('div', `ve-clip kind-${c.track}` + (S.sel === c.id ? ' sel' : ''));
    d.dataset.id = c.id;
    d.style.left = c.start * S.pps + 'px';
    d.style.width = Math.max(10, c.dur * S.pps) + 'px';
    if (m && m.thumb && c.track === 'video') d.style.backgroundImage = `url(${m.thumb})`;
    const label = c.track === 'text' ? `T · ${c.text}` : m ? m.name : '';
    d.innerHTML = `<span class="ve-h l" data-edge="l"></span><span class="ve-clip-label">${esc(label)}</span><span class="ve-h r" data-edge="r"></span>`;
    d.title = `${label} · ${veFmt(c.dur)}`;
    return d;
  }
  function renderPlayhead() { E.playhead.style.left = S.ph * S.pps + 'px'; }

  /* ---------- timeline interactions ---------- */
  let drag = null;
  E.tlInner.addEventListener('pointerdown', e => {
    if (S.exporting) return;
    const clipNode = e.target.closest('.ve-clip');
    if (!clipNode) {
      if (e.target.closest('.ve-track-label')) return;
      select(null);
      scrub(e);
      document.addEventListener('pointermove', scrubMove);
      document.addEventListener('pointerup', scrubEnd);
      return;
    }
    const c = getClip(+clipNode.dataset.id); if (!c) return;
    select(c.id);
    e.preventDefault();
    const edge = e.target.dataset.edge;
    drag = { c, node: clipNode, edge: edge || null, x0: e.clientX, start0: c.start, dur0: c.dur, in0: c.in };
    document.addEventListener('pointermove', dragMove);
    document.addEventListener('pointerup', dragEnd);
  });
  function px2s(dx) { return dx / S.pps; }
  function dragMove(e) {
    if (!drag) return;
    const c = drag.c, dx = px2s(e.clientX - drag.x0);
    if (!drag.edge) { // move
      let ns = clampPlace(c, drag.start0 + dx, c.dur);
      c.start = Math.round(ns * 100) / 100;
      drag.node.style.left = c.start * S.pps + 'px';
    } else if (drag.edge === 'l') { // trim left
      const m = mediaOf(c);
      let ns = Math.max(0, drag.start0 + dx);
      let delta = ns - drag.start0;
      let ndur = drag.dur0 - delta;
      if (m && m.kind !== 'image') {
        delta = Math.max(delta, -drag.in0 / (c.speed || 1));           // don't go before source start
        const maxDelta = drag.dur0 - 0.1;
        delta = Math.min(delta, maxDelta);
        if (c.in + delta * (c.speed || 1) + ndur * (c.speed || 1) > m.dur) {
          delta = (m.dur - drag.in0) / (c.speed || 1) - drag.dur0;
        }
      }
      if (ndur <= 0.1) return;
      c.start = Math.round((drag.start0 + delta) * 100) / 100;
      c.dur = Math.round((drag.dur0 - delta) * 100) / 100;
      if (m && m.kind !== 'image') c.in = Math.max(0, drag.in0 + delta * (c.speed || 1));
      drag.node.style.left = c.start * S.pps + 'px';
      drag.node.style.width = Math.max(10, c.dur * S.pps) + 'px';
    } else { // trim right
      const m = mediaOf(c);
      let ndur = drag.dur0 + dx;
      const min = 0.1;
      if (m && m.kind !== 'image') ndur = Math.min(ndur, (m.dur - c.in) / (c.speed || 1));
      // overlap clamp on video track
      if (c.track === 'video') {
        for (const o of S.clips) {
          if (o.track !== 'video' || o.id === c.id) continue;
          if (o.start >= c.start + drag.dur0 - 1e-4) ndur = Math.min(ndur, o.start - c.start);
        }
      }
      if (ndur < min) return;
      c.dur = Math.round(ndur * 100) / 100;
      drag.node.style.width = Math.max(10, c.dur * S.pps) + 'px';
    }
  }
  function dragEnd() {
    document.removeEventListener('pointermove', dragMove);
    document.removeEventListener('pointerup', dragEnd);
    if (!drag) return;
    drag = null;
    renderTimeline(); renderInspector(); requestDraw(); 
  }
  function scrub(e) {
    const r = E.tlInner.getBoundingClientRect();
    seek((e.clientX - r.left) / S.pps);
  }
  function scrubMove(e) { scrub(e); }
  function scrubEnd() {
    document.removeEventListener('pointermove', scrubMove);
    document.removeEventListener('pointerup', scrubEnd);
  }

  /* ---------- playback engine ---------- */
  const videoClipAt = t => S.clips.find(c => c.track === 'video' && t >= c.start && t < c.start + c.dur) || null;
  const activeAt = (c, t) => t >= c.start && t < c.start + c.dur;
  function fadeEnv(c, t) {
    const lt = t - c.start, rt = c.start + c.dur - t;
    let e = 1;
    if (c.fi > 0 && lt < c.fi) e *= lt / c.fi;
    if (c.fo > 0 && rt < c.fo) e *= rt / c.fo;
    return clamp(e, 0, 1);
  }

  function syncMedia() {
    const vc = videoClipAt(S.ph);
    for (const c of S.clips) {
      if (c.track === 'text') continue;
      const active = c === vc || (c.track === 'audio' && activeAt(c, S.ph));
      if (!active) { if (c.el && !c.el.paused) c.el.pause(); continue; }
      const el = clipEl(c);
      const want = c.in + (S.ph - c.start) * (c.speed || 1);
      el.playbackRate = clamp(c.speed || 1, 0.25, 4);
      if (Math.abs(el.currentTime - want) > (S.playing ? 0.25 : 0.06)) {
        try { el.currentTime = want; } catch (_) {}
      }
      if (S.playing && el.paused) el.play().catch(() => {});
      if (!S.playing && !el.paused) el.pause();
      if (c.gain) c.gain.gain.value = (c.vol ?? 1) * fadeEnv(c, S.ph);
      else if (c.el) c.el.volume = clamp((c.vol ?? 1) * fadeEnv(c, S.ph), 0, 1);
    }
  }

  function draw() {
    const [W, H] = S.res;
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const c = videoClipAt(S.ph);
    if (c) {
      const m = mediaOf(c);
      const src = m.kind === 'image' ? m.img : clipEl(c);
      const sw = m.kind === 'image' ? m.w : (src.videoWidth || m.w);
      const sh = m.kind === 'image' ? m.h : (src.videoHeight || m.h);
      if (sw && sh) {
        ctx.save();
        if (FILTER_OK && c.f) ctx.filter = `brightness(${c.f.b}%) contrast(${c.f.c}%) saturate(${c.f.s}%)`;
        ctx.globalAlpha = fadeEnv(c, S.ph);
        const sc = Math.max(W / sw, H / sh);
        ctx.drawImage(src, (W - sw * sc) / 2, (H - sh * sc) / 2, sw * sc, sh * sc);
        ctx.restore();
      }
    }
    for (const t of S.clips) {
      if (t.track !== 'text' || !activeAt(t, S.ph)) continue;
      ctx.save();
      ctx.globalAlpha = fadeEnv(t, S.ph);
      ctx.font = `600 ${Math.round(t.size * (S.res[1] / 720))}px 'Space Grotesk', sans-serif`;
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 8;
      ctx.fillText(t.text, S.res[0] * t.x / 100, S.res[1] * t.y / 100);
      ctx.restore();
    }
  }

  function tick(now) {
    if (!S.playing) return;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    S.ph += dt;
    const dur = projDur();
    if (S.ph >= dur) {
      S.ph = dur;
      syncMedia(); draw(); updateTransport(); renderPlayhead();
      S.playing = false; setPlayIcon();
      if (S.exporting && !S.finishedExport) finishExport();
      return;
    }
    syncMedia(); draw(); updateTransport(); renderPlayhead();
    if (S.exporting) exportProgress();
    requestAnimationFrame(tick);
  }

  function setPlayIcon() { E.play.innerHTML = S.playing ? IVP.pause : IVP.play; }
  function updateTransport() {
    const dur = projDur();
    E.time.textContent = `${veFmt(S.ph)} / ${veFmt(dur)}`;
    if (document.activeElement !== E.seek) E.seek.value = dur ? Math.round(S.ph / dur * 1000) : 0;
  }
  function play() {
    if (S.exporting || !S.clips.length) return;
    ensureAudio();
    if (S.ph >= projDur() - 0.01) S.ph = 0;
    S.playing = true; setPlayIcon();
    lastT = performance.now();
    requestAnimationFrame(tick);
  }
  function pause() {
    S.playing = false; setPlayIcon();
    S.clips.forEach(c => { if (c.el && !c.el.paused) c.el.pause(); });
    syncMedia(); draw();
  }
  function seek(t) {
    S.ph = clamp(t, 0, projDur());
    syncMedia(); draw(); updateTransport(); renderPlayhead();
  }

  /* ---------- inspector ---------- */
  function fRange(label, min, max, step, val, fmt, oninput) {
    const w = el('div', 've-field');
    w.innerHTML = `<span class="label">${label}<b class="mono"></b></span>`;
    const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val;
    const b = $('b', w); b.textContent = fmt(val);
    r.addEventListener('input', () => { const v = +r.value; b.textContent = fmt(v); oninput(v); });
    w.appendChild(r);
    return w;
  }
  function renderInspector() {
    const c = getClip(S.sel);
    E.insp.hidden = !c;
    if (!c) return;
    E.insp.innerHTML = '';
    const head = el('span', 'label');
    head.style.gridColumn = '1/-1';
    const m = c.mediaId ? mediaOf(c) : null;
    head.textContent = c.track === 'text' ? 'Text clip' : `${m ? m.name : 'Clip'} — ${c.track} track`;
    E.insp.appendChild(head);

    if (c.track === 'text') {
      const tw = el('div', 've-field');
      tw.innerHTML = '<span class="label">Text</span>';
      const ta = el('textarea', 'input'); ta.rows = 2; ta.value = c.text;
      ta.addEventListener('input', () => { c.text = ta.value; requestDraw(); renderTimeline(); });
      tw.appendChild(ta); E.insp.appendChild(tw);
      E.insp.appendChild(fRange('Size', 16, 160, 1, c.size, v => v + 'px', v => { c.size = v; requestDraw(); }));
      const cw = el('div', 've-field');
      cw.innerHTML = '<span class="label">Color</span>';
      const ci = el('input'); ci.type = 'color'; ci.value = c.color;
      ci.addEventListener('input', () => { c.color = ci.value; requestDraw(); });
      cw.appendChild(ci); E.insp.appendChild(cw);
      E.insp.appendChild(fRange('X position', 0, 100, 1, c.x, v => v + '%', v => { c.x = v; requestDraw(); }));
      E.insp.appendChild(fRange('Y position', 0, 100, 1, c.y, v => v + '%', v => { c.y = v; requestDraw(); }));
      E.insp.appendChild(fRange('Fade in', 0, 3, 0.1, c.fi, v => v + 's', v => c.fi = v));
      E.insp.appendChild(fRange('Fade out', 0, 3, 0.1, c.fo, v => v + 's', v => c.fo = v));
      const dw = el('div', 've-field');
      dw.innerHTML = '<span class="label">Duration (s)</span>';
      const dn = el('input', 'input'); dn.type = 'number'; dn.min = 0.1; dn.step = 0.1; dn.value = c.dur;
      dn.addEventListener('change', () => {
        let nd = clamp(+dn.value || c.dur, 0.1, 600);
        if (c.track === 'video') { /* keep overlap rules */ }
        c.dur = nd; renderTimeline(); updateTransport();
      });
      dw.appendChild(dn); E.insp.appendChild(dw);
      return;
    }
    if (c.track === 'video' && m.kind !== 'image') {
      E.insp.appendChild(fRange('Volume', 0, 1.5, 0.05, c.vol, v => Math.round(v * 100) + '%', v => { c.vol = v; if (c.gain) c.gain.gain.value = v * fadeEnv(c, S.ph); }));
      E.insp.appendChild(fRange('Speed', 0.25, 4, 0.05, c.speed, v => v + '×', v => {
        const span = c.dur * c.speed;
        c.speed = v;
        c.dur = clampPlace(c, c.start, span / v) === c.start ? span / v : c.dur;
        renderTimeline(); updateTransport();
      }));
    }
    if (m.kind !== 'audio') {
      E.insp.appendChild(fRange('Brightness', 50, 150, 1, c.f.b, v => v + '%', v => { c.f.b = v; requestDraw(); }));
      E.insp.appendChild(fRange('Contrast', 50, 150, 1, c.f.c, v => v + '%', v => { c.f.c = v; requestDraw(); }));
      E.insp.appendChild(fRange('Saturation', 0, 200, 1, c.f.s, v => v + '%', v => { c.f.s = v; requestDraw(); }));
    }
    E.insp.appendChild(fRange('Fade in', 0, 3, 0.1, c.fi, v => v + 's', v => c.fi = v));
    E.insp.appendChild(fRange('Fade out', 0, 3, 0.1, c.fo, v => v + 's', v => c.fo = v));
    if (m.kind === 'image' && c.track === 'video') {
      const dw = el('div', 've-field');
      dw.innerHTML = '<span class="label">Duration (s)</span>';
      const dn = el('input', 'input'); dn.type = 'number'; dn.min = 0.1; dn.step = 0.1; dn.value = c.dur;
      dn.addEventListener('change', () => { c.dur = clamp(+dn.value || c.dur, 0.1, 600); renderTimeline(); updateTransport(); });
      dw.appendChild(dn); E.insp.appendChild(dw);
    }
    if (FILTER_OK === false && m.kind !== 'audio') {
      const note = el('span', 'label');
      note.style.gridColumn = '1/-1';
      note.textContent = 'Note: this browser doesn’t support canvas color filters — adjustments apply after browsers add support.';
      E.insp.appendChild(note);
    }
  }

  /* ---------- export ---------- */
  let rec = null, chunks = [], exportModal = null, exportFill = null, exportPct = null;
  function startExport() {
    const dur = projDur();
    if (dur < 0.2) { toast('Timeline is empty — add clips first.'); return; }
    ensureAudio();
    const mime = pickVideoMime();
    if (!mime) { toast('This browser can’t record video locally. Try Chrome, Edge or Firefox.', { type: 'error' }); return; }
    S.exporting = true; S.cancelExport = false; S.finishedExport = false;
    pause(); seek(0);

    const stream = E.canvas.captureStream(30);
    S.exportDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    chunks = [];
    try {
      rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: clamp(S.res[0] * S.res[1] * 7, 3000000, 16000000),
      });
    } catch (err) {
      console.error(err);
      S.exporting = false;
      toast('Recording isn’t available in this browser.', { type: 'error' });
      return;
    }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(500);

    const body = el('div');
    body.innerHTML = `
      <ul class="m-stages">
        <li class="active"><span class="m-dot">${I.check}</span><span>Rendering &amp; recording in real time</span><span class="m-meta mono" id="veStageMeta"></span></li>
      </ul>
      <div class="m-bar"><div class="m-fill" id="veFill"></div></div>
      <div class="m-runfoot"><span class="m-pct mono" id="vePct">0%</span><button type="button" class="btn ghost sm" id="veExCancel">Cancel</button></div>`;
    exportModal = Modal.open({ title: 'Exporting video', body, width: 440, dismissable: false });
    exportFill = $('#veFill', body); exportPct = $('#vePct', body);
    $('#veExCancel', body).addEventListener('click', () => { S.cancelExport = true; exportModal.close(); cancelExport(); });
    play();
  }
  function exportProgress() {
    const dur = projDur();
    const p = clamp(S.ph / dur, 0, 1);
    if (exportFill) exportFill.style.width = (p * 100).toFixed(1) + '%';
    if (exportPct) exportPct.textContent = Math.round(p * 100) + '%';
    const meta = $('#veStageMeta');
    if (meta) meta.textContent = `${veFmt(S.ph)} / ${veFmt(dur)}`;
  }
  function finishExport() {
    S.finishedExport = true;
    pause();
    const meta = $('#veStageMeta'); if (meta) meta.textContent = 'Finalizing…';
    setTimeout(() => {
      try { rec.stop(); } catch (_) {}
      rec.addEventListener('stop', () => {
        S.exporting = false;
        if (exportModal) { exportModal.close(); exportModal = null; }
        const mime = rec.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type: mime });
        chunks = [];
        if (!blob.size) { toast('Something went wrong while recording. Nothing was changed.', { type: 'error' }); return; }
        const url = URL.createObjectURL(blob);
        const ext = mimeExt(mime);
        const name = `antror-edit.${ext}`;
        const body = el('div');
        body.innerHTML = `
          <div class="m-done" style="display:block">
            <h3 class="m-title">Video exported</h3>
            <p class="m-stats mono">${veFmt(projDur())} · ${fmtBytes(blob.size)} · ${ext.toUpperCase()}</p>
            <div class="stage" style="margin:12px 0"><div class="stage-fit"><video src="${url}" controls playsinline style="max-width:100%;max-height:40vh"></video></div></div>
            <div class="m-donefoot">
              <a class="btn primary" href="${url}" download="${name}">${I.download}<span>Download video</span></a>
              <a class="btn ghost" href="${url}" target="_blank" rel="noopener">Open in new tab</a>
            </div>
          </div>`;
        Modal.open({ title: 'Your video is ready', body, width: 520 });
        toast('Export complete — preview and download above.', { type: 'success' });
      }, { once: true });
    }, 350);
  }
  function cancelExport() {
    S.cancelExport = true; S.finishedExport = true;
    pause();
    try { rec.stop(); } catch (_) {}
    chunks = [];
    S.exporting = false;
    toast('Export cancelled.');
  }

  /* ---------- wiring ---------- */
  E.add.addEventListener('click', () => E.file.click());
  E.file.addEventListener('change', e => { [...e.target.files].forEach(addMedia); e.target.value = ''; });
  E.play.addEventListener('click', () => S.playing ? pause() : play());
  E.seek.addEventListener('input', () => { const d = projDur(); if (d) seek(E.seek.value / 1000 * d); });
  E.addText.addEventListener('click', addTextClip);
  E.split.addEventListener('click', splitAtPlayhead);
  E.del.addEventListener('click', deleteSelected);
  E.zoomIn.addEventListener('click', () => { S.pps = clamp(S.pps * 1.3, 12, 240); renderTimeline(); });
  E.zoomOut.addEventListener('click', () => { S.pps = clamp(S.pps / 1.3, 12, 240); renderTimeline(); });
  $$('#veResSeg button').forEach(b => b.addEventListener('click', () => {
    $$('#veResSeg button').forEach(x => x.classList.toggle('on', x === b));
    const [w, h] = b.dataset.res.split('x').map(Number);
    S.res = [w, h]; E.canvas.width = w; E.canvas.height = h;
    requestDraw();
  }));
  E.exportBtn.addEventListener('click', () => {
    if (S.exporting) return;
    const dur = projDur();
    if (dur < 0.2) { toast('Timeline is empty — add clips first.'); return; }
    let m;
    m = Modal.open({
      title: 'Export video?', width: 440, confirmOnEnter: true,
      body: `<p class="modal-text">Rendering runs <b>in real time</b> — this ${veFmt(dur)} project takes about <b>${veFmt(dur)}</b> to export at <b>${S.res[0]}×${S.res[1]}</b>. Everything is processed on your device. You can cancel anytime.</p>`,
      footer: [
        btn('Cancel', { onClick: () => m.close() }),
        btn('Start export', { kind: 'primary', onClick: () => { m.close(); startExport(); } }),
      ],
    });
  });
  E.clear.addEventListener('click', () => {
    if (!S.clips.length && !S.media.size) return;
    let m;
    m = Modal.open({
      title: 'Clear project?', width: 410, confirmOnEnter: true,
      body: '<p class="modal-text">All media and timeline clips will be removed.</p>',
      footer: [
        btn('Cancel', { onClick: () => m.close() }),
        btn('Clear', { kind: 'danger', onClick: () => {
          pause();
          S.clips.forEach(disposeClipEl);
          S.media.forEach(mm => URL.revokeObjectURL(mm.url));
          S.media.clear(); S.clips = []; S.sel = null; S.ph = 0;
          renderBin(); renderTimeline(); renderInspector(); requestDraw();
          m.close(); toast('Project cleared.');
        } }),
      ],
    });
  });

  document.addEventListener('keydown', e => {
    if (Platform.route !== 'video-editor' || Modal.current) return;
    const t = e.target;
    if ((t.matches && t.matches('input,textarea,select')) || t.isContentEditable) return;
    if (e.key === ' ') { e.preventDefault(); S.playing ? pause() : play(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key.toLowerCase() === 's') { e.preventDefault(); splitAtPlayhead(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(S.ph - (e.shiftKey ? 1 : 0.1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(S.ph + (e.shiftKey ? 1 : 0.1)); }
  });

  window.addEventListener('beforeunload', e => {
    if (S.clips.length || S.exporting) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- boot ---------- */
  setPlayIcon();
  renderTimeline();
  draw();
})();
