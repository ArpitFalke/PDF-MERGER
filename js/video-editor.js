'use strict';
/* =====================================================================
   ANTROR — Video Editor v2 (overlays, transitions, filters, beats,
   snapping, ripple delete, auto-sequence, aspect ratios)
   REQUIRES: core.js, media-tools.js (pickVideoMime, mimeExt).
   ===================================================================== */
ROUTES['video-editor'] = {
  sub: 'Video Editor',
  title: 'ANTROR — Video Editor',
  desc: 'Free browser video editor: multi-track timeline with overlays, transitions, filters and beat snapping. Trim, split, add text and music — export locally.'
};

(function () {
  const E = {
    add: $('#btnVeAdd'), file: $('#veFile'),
    layoutSeg: $('#veLayoutSeg'), qualitySeg: $('#veQualitySeg'),
    clear: $('#btnVeClear'), exportBtn: $('#btnVeExport'), seq: $('#btnVeSeq'),
    bin: $('#veBin'), binEmpty: $('#veBinEmpty'),
    canvas: $('#veCanvas'), play: $('#btnVePlay'), time: $('#veTime'), seek: $('#veSeek'),
    insp: $('#veInspector'),
    addText: $('#btnVeAddText'), split: $('#btnVeSplit'), del: $('#btnVeDelete'),
    rippleBtn: $('#btnVeRipple'),
    zoomIn: $('#btnVeZoomIn'), zoomOut: $('#btnVeZoomOut'),
    tlScroll: $('#veTlScroll'), tlInner: $('#veTlInner'), ruler: $('#veRuler'),
    playhead: $('#vePlayhead'),
  };
  const lanes = {
    text: $('#veTlInner [data-lane="text"]'),
    overlay: $('#veTlInner [data-lane="overlay"]'),
    video: $('#veTlInner [data-lane="video"]'),
    audio: $('#veTlInner [data-lane="audio"]'),
  };
  const IVP = {
    play: svg('<path d="M8 5.5v13l11-6.5z"/>'),
    pause: svg('<path d="M8.5 5.5v13M15.5 5.5v13"/>'),
  };
  const FILTER_OK = typeof E.canvas.getContext('2d').filter === 'string';
  const PRESETS = {
    none: '', mono: 'grayscale(1)', sepia: 'sepia(.8)',
    cool: 'hue-rotate(15deg) saturate(1.15)',
    warm: 'hue-rotate(-12deg) saturate(1.1) brightness(1.03)',
    vivid: 'saturate(1.5) contrast(1.08)',
  };
  const S = {
    media: new Map(), clips: [], sel: null, ph: 0, playing: false,
    pps: 60, layout: '16:9', quality: 720, ripple: false,
    uid: 1, actx: null, exportDest: null,
    exporting: false, finishedExport: false,
  };
  const ctx = E.canvas.getContext('2d');
  let lastT = 0;

  /* ---------- basics ---------- */
  const veFmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t % 1) * 10); return `${m}:${String(s).padStart(2, '0')}.${d}`; };
  const projDur = () => S.clips.reduce((a, c) => Math.max(a, c.start + c.dur), 0);
  const getClip = id => S.clips.find(c => c.id === id) || null;
  const mediaOf = c => c.mediaId ? S.media.get(c.mediaId) : null;
  function setRes() {
    const q = S.quality;
    if (S.layout === '9:16') S.res = [q, Math.round(q * 16 / 9)];
    else if (S.layout === '1:1') S.res = [q, q];
    else S.res = [Math.round(q * 16 / 9), q];
    E.canvas.width = S.res[0]; E.canvas.height = S.res[1];
    if (!S.playing) { syncMedia(); draw(); }
  }
  function requestDraw() { requestAnimationFrame(() => { if (!S.playing) { syncMedia(); draw(); } }); }

  /* ---------- audio ---------- */
  function ensureAudio() {
    if (!S.actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      S.actx = new AC();
      S.exportDest = S.actx.createMediaStreamDestination();
    }
    if (S.actx.state === 'suspended') S.actx.resume().catch(() => {});
    return S.actx;
  }
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
    if (!S.actx || c.gain || !c.el) return;
    const src = S.actx.createMediaElementSource(c.el);
    c.gain = S.actx.createGain();
    src.connect(c.gain);
    c.gain.connect(S.actx.destination);
    c.gain.connect(S.exportDest);
  }
  function disposeClipEl(c) {
    if (!c.el) return;
    try { c.el.pause(); c.el.removeAttribute('src'); c.el.load(); } catch (_) {}
    c.el = null; c.gain = null;
  }

  /* ---------- import ---------- */
  const loadImg = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

  async function addMedia(file) {
    const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : null;
    if (!kind) { toast(`“${file.name}” isn’t a video, audio or image file.`, { type: 'error' }); return; }
    if (file.size > 300 * 1048576) { toast(`“${file.name}” is too large (over 300 MB).`, { type: 'error' }); return; }
    const url = URL.createObjectURL(file);
    const item = { id: 'm' + (S.uid++), name: file.name || kind, kind, url, dur: 0, w: 0, h: 0, thumb: null, img: null, beats: null };
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
    E.seq.disabled = S.media.size === 0;
    for (const m of S.media.values()) {
      const d = el('div', 've-media');
      const icon = m.kind === 'audio' ? '♪' : m.kind === 'image' ? '▭' : '▶';
      d.innerHTML = `
        <span class="ve-media-thumb" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}">${m.thumb ? '' : icon}</span>
        <span class="ve-media-info">
          <span class="ve-media-name" title="${esc(m.name)}">${esc(m.name)}</span>
          <span class="ve-media-meta mono">${m.kind}${m.kind !== 'image' ? ' · ' + fmtTime(m.dur) : ` · ${m.w}×${m.h}`}${m.beats ? ' · ' + m.beats.length + ' beats' : ''}</span>
        </span>
        <span class="ve-media-actions"></span>`;
      const acts = $('.ve-media-actions', d);
      if (m.kind !== 'audio') {
        const bv = el('button', 'chip-btn', 'Clip');
        bv.type = 'button'; bv.title = 'Add to video track';
        bv.addEventListener('click', () => addMediaClip(m, 'video'));
        acts.appendChild(bv);
        const bo = el('button', 'chip-btn', 'Overlay');
        bo.type = 'button'; bo.title = 'Add as overlay (picture-in-picture)';
        bo.addEventListener('click', () => addMediaClip(m, 'overlay'));
        acts.appendChild(bo);
      }
      if (m.kind !== 'image') {
        const ba = el('button', 'chip-btn', 'Audio');
        ba.type = 'button'; ba.title = 'Add to audio track';
        ba.addEventListener('click', () => addMediaClip(m, 'audio'));
        acts.appendChild(ba);
        if (m.kind === 'audio') {
          const bb = el('button', 'chip-btn', 'Beats');
          bb.type = 'button'; bb.title = 'Detect beats for snapping';
          bb.addEventListener('click', () => detectBeats(m));
          acts.appendChild(bb);
        }
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

  /* ---------- beats (simple onset detector) ---------- */
  async function detectBeats(m) {
    toast('Detecting beats…');
    try {
      const ab = await (await fetch(m.url)).arrayBuffer();
      const actx = ensureAudio();
      const audio = await actx.decodeAudioData(ab);
      const ch = audio.getChannelData(0);
      const win = Math.floor(audio.sampleRate * 0.02);
      const n = Math.floor(ch.length / win);
      const energies = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let e = 0;
        for (let j = 0; j < win; j++) { const v = ch[i * win + j]; e += v * v; }
        energies[i] = e;
      }
      const secPer = win / audio.sampleRate;
      const minGap = Math.max(1, Math.round(0.22 / secPer));
      const beats = [];
      let last = -1e9;
      for (let i = 8; i < n; i++) {
        let avg = 0, cnt = 0;
        for (let j = Math.max(0, i - 50); j < i; j++) { avg += energies[j]; cnt++; }
        avg /= Math.max(1, cnt);
        if (energies[i] > avg * 1.5 && energies[i] > 1e-7 && i - last >= minGap) {
          beats.push(i * secPer); last = i;
        }
      }
      m.beats = beats;
      renderBin(); renderTimeline();
      toast(beats.length ? `${beats.length} beats detected — clips will snap to them.` : 'No clear beats found in this audio.', { type: beats.length ? 'success' : 'info' });
    } catch (_) {
      toast('Beat detection failed for this file.', { type: 'error' });
    }
  }

  /* ---------- clips ---------- */
  const trackEnd = track => S.clips.filter(c => c.track === track).reduce((a, c) => Math.max(a, c.start + c.dur), 0);
  function overlaps(track, id, start, dur) {
    for (const o of S.clips) {
      if (o.track !== track || o.id === id) continue;
      if (o.start < start + dur - 1e-4 && o.start + o.dur > start + 1e-4) return o;
    }
    return null;
  }
  function clampPlace(c, start, dur) {
    start = Math.max(0, start);
    if (c.track === 'text' || c.track === 'audio') return start;
    let guard = 0;
    while (overlaps(c.track, c.id, start, dur) && guard++ < 12) {
      const o = overlaps(c.track, c.id, start, dur);
      start = (start + dur / 2 < o.start + o.dur / 2) ? Math.max(0, o.start + o.dur) : Math.max(0, o.start - dur);
    }
    return start;
  }

  function addMediaClip(m, track) {
    const base = { id: S.uid++, track, mediaId: m.id, start: trackEnd(track), dur: m.kind === 'image' ? 4 : m.dur, in: 0, speed: 1, vol: 1, fi: 0, fo: 0 };
    let c;
    if (track === 'overlay') c = { ...base, f: { b: 100, c: 100, s: 100 }, preset: 'none', flipH: false, flipV: false, x: 50, y: 50, scale: 0.35, trans: 'none', transDur: 0.5 };
    else if (track === 'video') c = { ...base, f: { b: 100, c: 100, s: 100 }, preset: 'none', flipH: false, flipV: false, trans: 'none', transDur: 0.5 };
    else c = base;
    S.clips.push(c);
    renderTimeline(); select(c.id);
  }
  function addOverlayFromSelected() {
    const c = getClip(S.sel);
    if (!c || c.track !== 'video') { toast('Select a video clip first, then duplicate it as an overlay.'); return; }
    const copy = { ...c, id: S.uid++, track: 'overlay', start: c.start, x: 50, y: 50, scale: 0.35, el: undefined, gain: undefined, f: { ...c.f } };
    S.clips.push(copy);
    renderTimeline(); select(copy.id);
    toast('Added as overlay — adjust size & position in the inspector.', { type: 'success' });
  }
  function addTextClip() {
    const c = { id: S.uid++, track: 'text', mediaId: null, start: snapTime(S.ph), dur: 3, text: 'Your text', size: 48, color: '#FFFFFF', x: 50, y: 80, bg: false, fi: 0, fo: 0 };
    S.clips.push(c);
    renderTimeline(); select(c.id);
  }

  /* ---------- snapping ---------- */
  function snapTime(t) { return Math.round(t * 10) / 10; }
  function snapTargets(excludeId) {
    const t = [0, S.ph];
    for (const c of S.clips) { if (c.id === excludeId) continue; t.push(c.start, c.start + c.dur); }
    for (const c of S.clips) {
      if (c.track !== 'audio') continue;
      const m = mediaOf(c);
      if (!m || !m.beats) continue;
      for (const b of m.beats) {
        if (b < c.in - 1e-6 || b > c.in + c.dur * (c.speed || 1) + 1e-6) continue;
        t.push(c.start + (b - c.in) / (c.speed || 1));
      }
    }
    return t;
  }
  function applySnap(v, dur, excludeId) {
    const th = Math.max(0.08, 9 / S.pps);
    let best = null, bd = th;
    for (const t of snapTargets(excludeId)) {
      const d1 = Math.abs(v - t);
      if (d1 < bd) { bd = d1; best = t; }
      if (dur > 0) {
        const d2 = Math.abs(v + dur - t);
        if (d2 < bd) { bd = d2; best = t - dur; }
      }
    }
    return best == null ? v : Math.max(0, best);
  }

  /* ---------- selection / edit ops ---------- */
  function select(id) {
    S.sel = id;
    $$('#veTlInner .ve-clip').forEach(n => n.classList.toggle('sel', +n.dataset.id === id));
    renderInspector();
  }
  function deleteSelected() {
    const c = getClip(S.sel);
    if (!c) { toast('Select a clip on the timeline first.'); return; }
    disposeClipEl(c);
    S.clips = S.clips.filter(x => x.id !== c.id);
    if (S.ripple && (c.track === 'video' || c.track === 'overlay')) {
      S.clips.filter(x => x.track === c.track && x.start >= c.start).forEach(x => { x.start = Math.max(0, x.start - c.dur); });
    }
    S.sel = null;
    renderTimeline(); renderInspector(); requestDraw(); updateTransport();
  }
  function splitAtPlayhead() {
    let c = getClip(S.sel);
    if (!(c && S.ph > c.start && S.ph < c.start + c.dur)) {
      c = S.clips.find(x => S.ph > x.start + 0.05 && S.ph < x.start + x.dur - 0.05);
    }
    if (!c) { toast('Move the playhead over a clip to split it.'); return; }
    const off = snapTime(S.ph - c.start);
    if (off < 0.1 || c.dur - off < 0.1) { toast('Playhead is too close to the clip edge to split.'); return; }
    const right = { ...c, id: S.uid++, start: c.start + off, dur: c.dur - off, in: c.in + off * (c.speed || 1), el: undefined, gain: undefined, f: c.f ? { ...c.f } : undefined };
    if (right.track === 'video' || right.track === 'overlay') right.trans = 'none'; // transition lives on the left half
    c.dur = off;
    S.clips.push(right);
    renderTimeline(); select(right.id); updateTransport();
  }
  function autoSequence() {
    const items = [...S.media.values()].filter(m => m.kind === 'video' || m.kind === 'image');
    if (!items.length) { toast('No videos or images in the media bin.'); return; }
    let t = 0;
    for (const m of items) {
      const c = {
        id: S.uid++, track: 'video', mediaId: m.id, start: t, dur: m.kind === 'image' ? 4 : m.dur, in: 0, speed: 1, vol: 1,
        f: { b: 100, c: 100, s: 100 }, preset: 'none', flipH: false, flipV: false, trans: 'cross', transDur: 0.5, fi: 0, fo: 0,
      };
      S.clips.push(c);
      t += c.dur;
    }
    renderTimeline(); updateTransport(); requestDraw();
    toast(`${items.length} clips sequenced with crossfades — adjust in the inspector.`, { type: 'success' });
  }

  /* ---------- timeline rendering ---------- */
  function renderTimeline() {
    const dur = Math.max(projDur(), 10);
    const width = Math.max(dur * S.pps + 500, E.tlScroll.clientWidth - 64);
    E.tlInner.style.width = width + 'px';
    E.ruler.innerHTML = '';
    const step = S.pps >= 50 ? 1 : S.pps >= 12 ? 5 : 30;
    for (let t = 0; t * S.pps <= width; t += step) {
      const tick = el('div', 've-tick', t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t}s`);
      tick.style.left = t * S.pps + 'px';
      E.ruler.appendChild(tick);
    }
    // beat markers on the ruler
    for (const c of S.clips) {
      if (c.track !== 'audio') continue;
      const m = mediaOf(c);
      if (!m || !m.beats) continue;
      for (const b of m.beats) {
        if (b < c.in - 1e-6 || b > c.in + c.dur * (c.speed || 1) + 1e-6) continue;
        const pos = c.start + (b - c.in) / (c.speed || 1);
        const d = el('span', 've-beat');
        d.style.left = pos * S.pps + 'px';
        E.ruler.appendChild(d);
      }
    }
    for (const track of ['text', 'overlay', 'video', 'audio']) {
      lanes[track].innerHTML = '';
      for (const c of S.clips.filter(x => x.track === track)) lanes[track].appendChild(buildClipEl(c));
    }
    renderPlayhead();
    updateTransport();
  }
  function buildClipEl(c) {
    const m = mediaOf(c);
    const d = el('div', `ve-clip kind-${c.track}` + (S.sel === c.id ? ' sel' : ''));
    d.dataset.id = c.id;
    d.style.left = c.start * S.pps + 'px';
    d.style.width = Math.max(10, c.dur * S.pps) + 'px';
    if (m && m.thumb && (c.track === 'video' || c.track === 'overlay')) d.style.backgroundImage = `url(${m.thumb})`;
    const label = c.track === 'text' ? `T · ${c.text}` : m ? m.name : '';
    const badge = c.track === 'video' && c.trans !== 'none' ? ' ⟿' : c.track === 'overlay' ? ' ⧉' : '';
    d.innerHTML = `<span class="ve-h l" data-edge="l"></span><span class="ve-clip-label">${esc(label)}${badge}</span><span class="ve-h r" data-edge="r"></span>`;
    d.title = `${label} · ${veFmt(c.dur)}${c.track === 'video' && c.trans !== 'none' ? ' · ' + c.trans + ' in' : ''}`;
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
  function dragMove(e) {
    if (!drag) return;
    const c = drag.c, dx = (e.clientX - drag.x0) / S.pps;
    const m = mediaOf(c);
    if (!drag.edge) { // move
      let ns = clampPlace(c, drag.start0 + dx, c.dur);
      ns = applySnap(ns, c.dur, c.id);
      if (!overlaps(c.track, c.id, ns, c.dur)) c.start = Math.round(ns * 100) / 100;
      drag.node.style.left = c.start * S.pps + 'px';
    } else if (drag.edge === 'l') { // trim left
      let ns = drag.start0 + dx;
      if (m && m.kind !== 'image') ns = Math.max(ns, drag.start0 - drag.in0 / (c.speed || 1));
      ns = clamp(ns, 0, drag.start0 + drag.dur0 - 0.1);
      const snapped = applySnap(ns, 0, c.id);
      if (snapped < drag.start0 + drag.dur0 - 0.1) ns = snapped;
      if (c.track === 'video' || c.track === 'overlay') {
        for (const o of S.clips) {
          if (o.track !== c.track || o.id === c.id) continue;
          if (o.start + o.dur > ns + 1e-4 && o.start < ns) ns = o.start + o.dur;
        }
      }
      const delta = ns - drag.start0;
      if (drag.dur0 - delta < 0.1) return;
      c.start = Math.round(ns * 100) / 100;
      c.dur = Math.round((drag.dur0 - delta) * 100) / 100;
      if (m && m.kind !== 'image') c.in = Math.max(0, drag.in0 + delta * (c.speed || 1));
      drag.node.style.left = c.start * S.pps + 'px';
      drag.node.style.width = Math.max(10, c.dur * S.pps) + 'px';
    } else { // trim right
      let ndur = drag.dur0 + dx;
      if (m && m.kind !== 'image') ndur = Math.min(ndur, (m.dur - c.in) / (c.speed || 1));
      if (c.track === 'video' || c.track === 'overlay') {
        for (const o of S.clips) {
          if (o.track !== c.track || o.id === c.id) continue;
          if (o.start >= c.start + drag.dur0 - 1e-4) ndur = Math.min(ndur, o.start - c.start);
        }
      }
      if (ndur < 0.1) return;
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

  /* ---------- playback ---------- */
  const videoClipAt = t => S.clips.find(c => c.track === 'video' && t >= c.start && t < c.start + c.dur) || null;
  const activeAt = (c, t) => t >= c.start && t < c.start + c.dur;
  function prevMain(c) {
    let best = null;
    for (const o of S.clips) {
      if (o.track !== 'video' || o.id === c.id || o.start >= c.start) continue;
      if (Math.abs((o.start + o.dur) - c.start) > 0.06) continue;
      if (!best || o.start > best.start) best = o;
    }
    return best;
  }
  function transZone(main, prev) {
    if (!prev || main.trans === 'none') return 0;
    return Math.max(0, Math.min(main.transDur || 0.5, main.dur * 0.5, prev.dur * 0.5));
  }
  function fadeEnv(c, t) {
    const lt = t - c.start, rt = c.start + c.dur - t;
    let e = 1;
    if (c.fi > 0 && lt < c.fi) e *= lt / c.fi;
    if (c.fo > 0 && rt < c.fo) e *= rt / c.fo;
    return clamp(e, 0, 1);
  }

  function syncMedia() {
    const vc = videoClipAt(S.ph);
    const prev = vc ? prevMain(vc) : null;
    const zone = vc ? transZone(vc, prev) : 0;
    const inTrans = vc && prev && vc.trans === 'cross' && S.ph < vc.start + zone && S.ph >= vc.start;
    const p = inTrans ? (S.ph - vc.start) / zone : 0;

    for (const c of S.clips) {
      if (c.track === 'text') continue;
      const isMain = c === vc;
      const isPrevInTrans = inTrans && c === prev;
      const active = isMain || isPrevInTrans || (c.track === 'audio' && activeAt(c, S.ph)) || (c.track === 'overlay' && activeAt(c, S.ph));
      if (!active) { if (c.el && !c.el.paused) c.el.pause(); continue; }
      const el = clipEl(c);
      let want;
      if (isPrevInTrans) want = c.in + (S.ph - c.start) * (c.speed || 1); // continues past its out point
      else want = c.in + (S.ph - c.start) * (c.speed || 1);
      const m = mediaOf(c);
      if (m && m.kind !== 'image' && want > m.dur - 0.05) want = Math.max(0, m.dur - 0.05);
      el.playbackRate = clamp(c.speed || 1, 0.25, 4);
      if (Math.abs(el.currentTime - want) > (S.playing ? 0.25 : 0.06)) {
        try { el.currentTime = want; } catch (_) {}
      }
      if (S.playing && el.paused) el.play().catch(() => {});
      if (!S.playing && !el.paused) el.pause();
      let env = fadeEnv(c, S.ph);
      if (isPrevInTrans) env = 1 - p;                    // audio crossfades down
      else if (inTrans && isMain) env = Math.max(env, p); // audio crossfades up
      const vol = clamp((c.vol ?? 1) * env, 0, 1.5);
      if (c.gain) c.gain.gain.value = vol;
      else if (c.el) c.el.volume = clamp(vol, 0, 1);
    }
  }

  function filterStr(c) {
    if (!FILTER_OK) return 'none';
    let s = PRESETS[c.preset || 'none'] || '';
    if (c.f) s += (s ? ' ' : '') + `brightness(${c.f.b}%) contrast(${c.f.c}%) saturate(${c.f.s}%)`;
    return s || 'none';
  }
  function drawVisual(c, t, alpha) {
    const m = mediaOf(c);
    if (!m) return;
    const src = m.kind === 'image' ? m.img : c.el;
    const sw = m.kind === 'image' ? m.w : (src && (src.videoWidth || m.w));
    const sh = m.kind === 'image' ? m.h : (src && (src.videoHeight || m.h));
    if (!src || !sw || !sh) return;
    const [W, H] = S.res;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.filter = filterStr(c);
    if (c.track === 'overlay') {
      let bw = W * (c.scale ?? 0.35), bh = bw * sh / sw;
      if (bh > H * (c.scale ?? 0.35)) { bh = H * (c.scale ?? 0.35); bw = bh * sw / sh; }
      ctx.translate(W * (c.x ?? 50) / 100, H * (c.y ?? 50) / 100);
      ctx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
      ctx.drawImage(src, -bw / 2, -bh / 2, bw, bh);
    } else {
      const sc = Math.max(W / sw, H / sh);
      const dw = sw * sc, dh = sh * sc;
      ctx.translate(W / 2, H / 2);
      ctx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
      ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
  }
  function draw() {
    const [W, H] = S.res;
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const c = videoClipAt(S.ph);
    if (c) {
      const prev = prevMain(c);
      const zone = transZone(c, prev);
      const inTrans = prev && S.ph < c.start + zone;
      const p = zone ? clamp((S.ph - c.start) / zone, 0, 1) : 1;
      if (inTrans && c.trans === 'cross') {
        drawVisual(prev, S.ph, 1);
        drawVisual(c, S.ph, p);
      } else if (inTrans && c.trans === 'fade') {
        drawVisual(c, S.ph, p); // dip up from black
      } else {
        drawVisual(c, S.ph, fadeEnv(c, S.ph));
      }
    }
    for (const o of S.clips) {
      if (o.track !== 'overlay' || !activeAt(o, S.ph)) continue;
      drawVisual(o, S.ph, fadeEnv(o, S.ph));
    }
    for (const t of S.clips) {
      if (t.track !== 'text' || !activeAt(t, S.ph)) continue;
      ctx.save();
      ctx.globalAlpha = fadeEnv(t, S.ph);
      ctx.font = `600 ${Math.round(t.size * (S.res[1] / 720))}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = S.res[0] * t.x / 100, ty = S.res[1] * t.y / 100;
      if (t.bg) {
        const w = ctx.measureText(t.text).width + 28, h = t.size * (S.res[1] / 720) + 18;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(tx - w / 2, ty - h / 2, w, h, 10); ctx.fill(); }
        else ctx.fillRect(tx - w / 2, ty - h / 2, w, h);
      }
      ctx.fillStyle = t.color;
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 8;
      ctx.fillText(t.text, tx, ty);
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
    if (!S.clips.length) return;
    if (S.playing) return;
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
  function fSelect(label, options, val, onchange) {
    const w = el('div', 've-field');
    w.innerHTML = `<span class="label">${label}</span>`;
    const s = el('select', 'input');
    for (const [v, txt] of options) { const o = el('option'); o.value = v; o.textContent = txt; if (v === val) o.selected = true; s.appendChild(o); }
    s.addEventListener('change', () => onchange(s.value));
    w.appendChild(s);
    return w;
  }
  function renderInspector() {
    const c = getClip(S.sel);
    E.insp.hidden = !c;
    if (!c) return;
    E.insp.innerHTML = '';
    const m = c.mediaId ? mediaOf(c) : null;
    const head = el('span', 'label');
    head.style.gridColumn = '1/-1';
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
      const bw = el('div', 've-field');
      bw.innerHTML = '<span class="label">Background pill</span>';
      const bb = el('button', 'chip-btn' + (c.bg ? ' accent' : ''), c.bg ? 'On' : 'Off');
      bb.type = 'button';
      bb.addEventListener('click', () => { c.bg = !c.bg; bb.textContent = c.bg ? 'On' : 'Off'; bb.classList.toggle('accent', c.bg); requestDraw(); });
      bw.appendChild(bb); E.insp.appendChild(bw);
      E.insp.appendChild(fRange('X position', 0, 100, 1, c.x, v => v + '%', v => { c.x = v; requestDraw(); }));
      E.insp.appendChild(fRange('Y position', 0, 100, 1, c.y, v => v + '%', v => { c.y = v; requestDraw(); }));
      E.insp.appendChild(fRange('Fade in', 0, 3, 0.1, c.fi, v => v + 's', v => c.fi = v));
      E.insp.appendChild(fRange('Fade out', 0, 3, 0.1, c.fo, v => v + 's', v => c.fo = v));
      E.insp.appendChild(fRange('Duration', 0.3, 30, 0.1, c.dur, v => veFmt(v), v => { c.dur = v; renderTimeline(); updateTransport(); }));
      return;
    }

    if (c.track === 'video' || c.track === 'overlay') {
      if (c.track === 'video') {
        E.insp.appendChild(fSelect('Transition in', [['none', 'None'], ['cross', 'Crossfade'], ['fade', 'Dip to black']], c.trans, v => { c.trans = v; renderTimeline(); }));
        E.insp.appendChild(fRange('Transition length', 0.2, 2, 0.1, c.transDur, v => v + 's', v => c.transDur = v));
      }
      if (c.track === 'overlay') {
        E.insp.appendChild(fRange('Scale', 0.1, 1, 0.01, c.scale, v => Math.round(v * 100) + '%', v => { c.scale = v; requestDraw(); }));
        E.insp.appendChild(fRange('X position', 0, 100, 1, c.x, v => v + '%', v => { c.x = v; requestDraw(); }));
        E.insp.appendChild(fRange('Y position', 0, 100, 1, c.y, v => v + '%', v => { c.y = v; requestDraw(); }));
      }
      E.insp.appendChild(fSelect('Filter', Object.keys(PRESETS).map(k => [k, k === 'none' ? 'None' : k[0].toUpperCase() + k.slice(1)]), c.preset || 'none', v => { c.preset = v; requestDraw(); }));
      if (m && m.kind !== 'image') E.insp.appendChild(fRange('Speed', 0.25, 4, 0.05, c.speed, v => v + '×', v => {
        const span = c.dur * (c.speed || 1);
        c.speed = v;
        let nd = span / v;
        if (m.kind !== 'image' && c.in + nd * v > m.dur) nd = (m.dur - c.in) / v;
        if (c.track === 'video' || c.track === 'overlay') {
          for (const o of S.clips) { if (o.track === c.track && o.id !== c.id && o.start >= c.start + c.dur - 1e-4) nd = Math.min(nd, o.start - c.start); }
        }
        c.dur = Math.max(0.1, nd);
        renderTimeline(); updateTransport();
      }));
      const fl = el('div', 've-field');
      fl.innerHTML = '<span class="label">Flip</span>';
      const fh = el('button', 'chip-btn' + (c.flipH ? ' accent' : ''), 'Horizontal');
      const fv = el('button', 'chip-btn' + (c.flipV ? ' accent' : ''), 'Vertical');
      fh.type = fv.type = 'button';
      fh.addEventListener('click', () => { c.flipH = !c.flipH; fh.classList.toggle('accent', c.flipH); requestDraw(); });
      fv.addEventListener('click', () => { c.flipV = !c.flipV; fv.classList.toggle('accent', c.flipV); requestDraw(); });
      fl.appendChild(fh); fl.appendChild(fv);
      E.insp.appendChild(fl);
    }
    if (m && m.kind !== 'image') {
      E.insp.appendChild(fRange('Volume', 0, 1.5, 0.05, c.vol, v => Math.round(v * 100) + '%', v => { c.vol = v; }));
    }
    if (c.track !== 'audio') {
      E.insp.appendChild(fRange('Brightness', 50, 150, 1, c.f.b, v => v + '%', v => { c.f.b = v; requestDraw(); }));
      E.insp.appendChild(fRange('Contrast', 50, 150, 1, c.f.c, v => v + '%', v => { c.f.c = v; requestDraw(); }));
      E.insp.appendChild(fRange('Saturation', 0, 200, 1, c.f.s, v => v + '%', v => { c.f.s = v; requestDraw(); }));
    }
    E.insp.appendChild(fRange('Fade in', 0, 3, 0.1, c.fi, v => v + 's', v => c.fi = v));
    E.insp.appendChild(fRange('Fade out', 0, 3, 0.1, c.fo, v => v + 's', v => c.fo = v));
    if (m && m.kind === 'image') {
      E.insp.appendChild(fRange('Duration', 0.3, 30, 0.1, c.dur, v => veFmt(v), v => { c.dur = v; renderTimeline(); updateTransport(); }));
    }
    if (c.track === 'audio' && m) {
      const bw = el('div', 've-field');
      bw.innerHTML = '<span class="label">Beats</span>';
      const bb = el('button', 'chip-btn', m.beats ? `Re-detect (${m.beats.length})` : 'Detect beats');
      bb.type = 'button';
      bb.addEventListener('click', () => detectBeats(m));
      bw.appendChild(bb); E.insp.appendChild(bw);
    }
    if (!FILTER_OK && c.track !== 'audio') {
      const note = el('span', 'label');
      note.style.gridColumn = '1/-1';
      note.textContent = 'Note: this browser doesn’t support canvas color filters — filters & color apply once your browser adds support.';
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
    S.exporting = true; S.finishedExport = false;
    pause(); seek(0);
    const stream = E.canvas.captureStream(30);
    S.exportDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    chunks = [];
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: clamp(S.res[0] * S.res[1] * 7, 3000000, 16000000) });
    } catch (err) {
      console.error(err); S.exporting = false;
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
    $('#veExCancel', body).addEventListener('click', () => { exportModal.close(); cancelExport(); });
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
            <p class="m-stats mono">${veFmt(projDur())} · ${fmtBytes(blob.size)} · ${ext.toUpperCase()} · ${S.res[0]}×${S.res[1]}</p>
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
    S.finishedExport = true;
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
  E.seq.addEventListener('click', autoSequence);
  E.rippleBtn.addEventListener('click', () => {
    S.ripple = !S.ripple;
    E.rippleBtn.textContent = 'Ripple: ' + (S.ripple ? 'on' : 'off');
    E.rippleBtn.classList.toggle('accent', S.ripple);
  });
  E.zoomIn.addEventListener('click', () => { S.pps = clamp(S.pps * 1.3, 12, 240); renderTimeline(); });
  E.zoomOut.addEventListener('click', () => { S.pps = clamp(S.pps / 1.3, 12, 240); renderTimeline(); });
  $$('#veLayoutSeg button').forEach(b => b.addEventListener('click', () => {
    $$('#veLayoutSeg button').forEach(x => x.classList.toggle('on', x === b));
    S.layout = b.dataset.layout; setRes();
  }));
  $$('#veQualitySeg button').forEach(b => b.addEventListener('click', () => {
    $$('#veQualitySeg button').forEach(x => x.classList.toggle('on', x === b));
    S.quality = +b.dataset.q; setRes();
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

  // window-level import while the editor is open
  let dropDepth = 0;
  window.addEventListener('dragenter', e => {
    if (![...(e.dataTransfer?.types || [])].includes('Files') || Platform.route !== 'video-editor') return;
    e.preventDefault(); dropDepth++;
  });
  window.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  window.addEventListener('dragleave', e => { if (--dropDepth <= 0) dropDepth = 0; });
  window.addEventListener('drop', e => {
    if (Platform.route !== 'video-editor' || ![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault(); dropDepth = 0;
    [...e.dataTransfer.files].forEach(addMedia);
  });

  document.addEventListener('keydown', e => {
    if (Platform.route !== 'video-editor' || Modal.current) return;
    const t = e.target;
    if ((t.matches && t.matches('input,textarea,select')) || t.isContentEditable) return;
    if (e.key === ' ') { e.preventDefault(); S.playing ? pause() : play(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key.toLowerCase() === 's') { e.preventDefault(); splitAtPlayhead(); }
    else if (e.key.toLowerCase() === 'd') { e.preventDefault(); addOverlayFromSelected(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(S.ph - (e.shiftKey ? 1 : 0.1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(S.ph + (e.shiftKey ? 1 : 0.1)); }
  });

  window.addEventListener('beforeunload', e => {
    if (S.clips.length || S.exporting) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- boot ---------- */
  setPlayIcon();
  setRes();
  renderTimeline();
  E.seq.disabled = true;
})();
