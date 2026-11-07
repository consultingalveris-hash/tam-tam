/* tam-tam — appareil photo et vidéo intégré (plein écran), puis retouche avant envoi :
   pivoter, rogner, filtres, légende, vue unique. Tout reste chiffré de bout en bout à l'envoi. */
const CI = {
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M9 13a3 3 0 0 1 5-2.2M15 13a3 3 0 0 1-5 2.2"/><path d="M14 9v2h-2M10 17v-2h2"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  flashOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  flashOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/><path d="m3 3 18 18"/></svg>',
  rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4v6h6"/><path d="M3.5 10A9 9 0 1 1 6 18.5"/></svg>',
  rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4v6h-6"/><path d="M20.5 10A9 9 0 1 0 18 18.5"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
  filt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
};
const FILTERS = [['Original', ''], ['Lumineux', 'brightness(1.15) contrast(1.05) saturate(1.1)'], ['Chaud', 'sepia(.25) saturate(1.35) hue-rotate(-8deg)'], ['Froid', 'saturate(1.1) hue-rotate(12deg) brightness(1.04)'],
  ['Noir et blanc', 'grayscale(1) contrast(1.15)'], ['Sépia', 'sepia(.85)'], ['Éclatant', 'contrast(1.3) saturate(1.45)'], ['Vintage', 'sepia(.4) contrast(.9) brightness(1.1) saturate(.75)'], ['Doux', 'brightness(1.08) contrast(.88) saturate(.9)']];
if (!E2E.vids) E2E.vids = new Map();
const VID_MAX_S = 60, VID_MAX_BYTES = 40_000_000;
const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ---------- appareil photo ---------- */
const Cam = {
  facing: 'environment', mode: 'photo', el: null, stream: null, torch: false,
  // opts.target : la photo ou la vidéo sert à autre chose qu'un message (un statut) ; opts.mode : 'photo' ou 'video'.
  async open(opts = {}) {
    this.opts = opts; if (opts.mode) this.mode = opts.mode;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return this.native();
    if (typeof Call !== 'undefined' && Call.c) return toast('Terminez l’appel avant de prendre une photo.');
    this.el = document.createElement('div'); this.el.className = 'cam'; this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', 'Appareil photo');
    document.body.appendChild(this.el); document.body.classList.add('in-cam'); this.render();
    await this.start();
  },
  render() {
    const rec = !!this.rec, ph = this.mode === 'photo';
    this.el.innerHTML = `<video class="cam-v${this.facing === 'user' ? ' mirror' : ''}" autoplay playsinline muted></video><div class="cam-flash" hidden></div>
      <div class="cam-top"><button class="cib" type="button" data-cam="close" aria-label="Fermer">${I.close}</button>
        ${rec ? `<span class="cam-rec"><i></i><b id="camT">0:00</b> / ${fmtT(VID_MAX_S)}</span>` : '<span></span>'}
        <span class="cam-tr"><button class="cib hd" type="button" data-cam="native" aria-label="Utiliser l’appareil photo du téléphone (qualité maximale, mode nuit)" title="Appareil du téléphone"${rec ? ' hidden' : ''}>HD</button>
        <button class="cib" type="button" data-cam="torch" aria-label="${this.torch ? 'Éteindre le flash' : 'Allumer le flash'}"${this.hasTorch ? '' : ' hidden'}>${this.torch ? CI.flashOn : CI.flashOff}</button></span></div>
      <div class="cam-bot">
        <div class="cam-row">
          <button class="cib" type="button" data-cam="gallery" aria-label="Choisir dans la galerie"${rec ? ' hidden' : ''}>${CI.gallery}</button>
          <button class="cam-shut${ph ? '' : ' vid'}${rec ? ' on' : ''}" type="button" data-cam="shoot" aria-label="${ph ? 'Prendre la photo' : rec ? 'Arrêter la vidéo' : 'Filmer'}"><span></span></button>
          <div class="cam-right"><button class="cib${ph ? '' : ' sel'}" type="button" data-cam="mode" aria-label="${ph ? 'Passer en mode vidéo' : 'Passer en mode photo'}"${rec ? ' hidden' : ''}>${ph ? CI.video : CI.photo}</button>
          <button class="cib" type="button" data-cam="flip" aria-label="Retourner la caméra"${rec ? ' hidden' : ''}>${CI.flip}</button></div>
        </div>
        <div class="cam-modes"${rec ? ' hidden' : ''}><button type="button" data-cam="setVideo" aria-pressed="${!ph}">Vidéo</button><button type="button" data-cam="setPhoto" aria-pressed="${ph}">Photo</button></div>
      </div>`;
    const v = this.el.querySelector('video'); if (this.stream) { v.srcObject = this.stream; v.play().catch(() => {}); }
  },
  async start() {
    this.stopStream();
    const base = this.mode === 'photo' ? {width: {ideal: 4096}, height: {ideal: 3072}} : {width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {ideal: 30}};
    let s = null;
    for (const v of [{...base, facingMode: {exact: this.facing}}, {...base, facingMode: this.facing}, true]) { try { s = await navigator.mediaDevices.getUserMedia({video: v}); break; } catch (e) { this.err = e; } }
    if (!this.el) { if (s) s.getTracks().forEach(t => t.stop()); return; }
    if (!s) { this.close(); toast(this.err && this.err.name === 'NotAllowedError' ? 'Autorisez la caméra pour Tam-Tam, puis réessayez.' : 'Caméra introuvable sur cet appareil.'); return; }
    this.stream = s; const tr = s.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {};
    this.hasTorch = !!caps.torch; this.torch = false;
    const adv = {}; for (const k of ['focusMode', 'exposureMode', 'whiteBalanceMode']) if ((caps[k] || []).includes('continuous')) adv[k] = 'continuous';
    if (Object.keys(adv).length) tr.applyConstraints({advanced: [adv]}).catch(() => {});
    this.render();
  },
  native() { const o = this.opts || {}; if (o.native) return o.native(); const i = $('#camIn'); if (i) i.click(); },
  stopStream() { if (this.stream) this.stream.getTracks().forEach(t => t.stop()); this.stream = null; },
  close() {
    if (this.rec) { try { this.rec.mr.onstop = null; this.rec.mr.stop(); } catch {} this.rec.extra.forEach(t => t.stop()); clearInterval(this.rec.tick); this.rec = null; }
    this.stopStream(); if (this.el) this.el.remove(); this.el = null; document.body.classList.remove('in-cam');
  },
  async flip() { if (this.rec || this.busy) return; this.busy = true; this.facing = this.facing === 'user' ? 'environment' : 'user'; await this.start(); this.busy = false; },
  async setTorch() { const tr = this.stream && this.stream.getVideoTracks()[0]; if (!tr) return; try { await tr.applyConstraints({advanced: [{torch: !this.torch}]}); this.torch = !this.torch; this.render(); } catch { toast('Flash indisponible sur cette caméra.'); } },
  // La photo garde exactement ce qui est affiché en plein écran.
  // Quand le téléphone le permet, on demande une vraie photo au capteur (pleine définition), sinon on prend l'image de l'aperçu.
  async snap() {
    const v = this.el && this.el.querySelector('video'); if (!v || !v.videoWidth || this.snapping) return; this.snapping = true;
    const fl = this.el.querySelector('.cam-flash'); if (fl) { fl.hidden = false; setTimeout(() => { fl.hidden = true; }, 160); }
    const W = v.clientWidth, H = v.clientHeight, user = this.facing === 'user';
    let src = v, sw0 = v.videoWidth, sh0 = v.videoHeight;
    const tr = this.stream && this.stream.getVideoTracks()[0];
    if (window.ImageCapture && tr) {
      try {
        const ic = new ImageCapture(tr), pc = await ic.getPhotoCapabilities().catch(() => null), opt = {};
        if (pc && pc.imageWidth && pc.imageWidth.max) opt.imageWidth = pc.imageWidth.max;
        if (pc && (pc.fillLightMode || []).length) opt.fillLightMode = this.torch && pc.fillLightMode.includes('flash') ? 'flash' : (pc.fillLightMode.includes('off') ? 'off' : undefined);
        if (!opt.fillLightMode) delete opt.fillLightMode;
        const blob = await Promise.race([ic.takePhoto(opt), new Promise((_, ko) => setTimeout(() => ko(new Error('lent')), 6000))]);
        const bmp = await createImageBitmap(blob);
        // même cadrage que l'aperçu : on tient compte du sens de la photo par rapport à l'aperçu
        if ((bmp.width > bmp.height) === (v.videoWidth > v.videoHeight)) { src = bmp; sw0 = bmp.width; sh0 = bmp.height; }
      } catch {}
    }
    const k = Math.max(W / sw0, H / sh0), sw = W / k, sh = H / k, sx = (sw0 - sw) / 2, sy = (sh0 - sh) / 2, out = Math.min(1, 3000 / Math.max(sw, sh));
    const cv = document.createElement('canvas'); cv.width = Math.round(sw * out); cv.height = Math.round(sh * out);
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; if (user) { g.translate(cv.width, 0); g.scale(-1, 1); }
    g.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    if (src.close) src.close();
    cv.toBlob(b => { this.snapping = false; if (!b) return toast('Photo impossible.'); const o = this.opts || {}; this.close(); Edit.photo(b, 'cam', o); }, 'image/jpeg', .95);
  },
  async recStart() {
    if (!window.MediaRecorder) return toast('Ce téléphone ne permet pas de filmer ici.');
    const vt = this.stream && this.stream.getVideoTracks()[0]; if (!vt) return;
    let extra = []; try { extra = (await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}})).getAudioTracks(); } catch { toast('Micro refusé : la vidéo sera sans le son.'); }
    const ms = new MediaStream([vt, ...extra]);
    const mime = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    let mr; try { mr = new MediaRecorder(ms, {...(mime ? {mimeType: mime} : {}), videoBitsPerSecond: 1_400_000, audioBitsPerSecond: 64_000}); } catch { extra.forEach(t => t.stop()); return toast('Enregistrement vidéo impossible sur ce téléphone.'); }
    const chunks = []; mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    this.rec = {mr, chunks, extra, t0: Date.now(), mime: (mr.mimeType || mime || 'video/webm').split(';')[0], mirror: this.facing === 'user'};
    mr.onstop = () => this.recDone();
    mr.start(1000); this.render();
    this.rec.tick = setInterval(() => { if (!this.rec) return; const s = Math.floor((Date.now() - this.rec.t0) / 1000), t = document.getElementById('camT'); if (t) t.textContent = fmtT(s); if (s >= VID_MAX_S) this.recStop(); }, 250);
  },
  recStop() { if (this.rec && this.rec.mr.state !== 'inactive') this.rec.mr.stop(); },
  recDone() {
    const r = this.rec; if (!r) return; this.rec = null; clearInterval(r.tick); r.extra.forEach(t => t.stop());
    const dur = Math.max(1, Math.round((Date.now() - r.t0) / 1000)), blob = new Blob(r.chunks, {type: r.mime});
    const o = this.opts || {}; this.close(); if (blob.size < 1000) return toast('Vidéo trop courte.');
    Edit.video(blob, r.mime, dur, r.mirror, 'cam', o);
  },
  act(a) {
    if (a === 'close') this.close();
    else if (a === 'flip') this.flip();
    else if (a === 'torch') this.setTorch();
    else if (a === 'gallery') { const o = this.opts || {}; this.close(); if (o.gallery) o.gallery(); else $('#fileIn').click(); }
    else if (a === 'mode' || a === 'setVideo' || a === 'setPhoto') { const m = a === 'mode' ? (this.mode === 'photo' ? 'video' : 'photo') : a === 'setVideo' ? 'video' : 'photo'; if (m !== this.mode) { this.mode = m; this.render(); this.start(); } }
    else if (a === 'native') { this.close(); this.native(); }
    else if (a === 'shoot') { if (this.mode === 'photo') this.snap(); else if (this.rec) this.recStop(); else this.recStart(); }
  },
};

/* ---------- vidéos longues ou lourdes : découpées en parties d'une minute (et allégées) ---------- */
const VID_MAX_TOTAL = 5 * 60;
const VCut = {
  // Propose de couper : une seule fenêtre au-dessus de tout (statut ou discussion).
  ask(file, dur, done) {
    const n = Math.max(1, Math.ceil(dur / VID_MAX_S)), el = document.createElement('div'); el.className = 'vprep';
    el.innerHTML = `<div class="vp-card" role="dialog" aria-modal="true" aria-label="Vidéo longue"><h2>${n > 1 ? 'Vidéo longue' : 'Vidéo lourde'}</h2>
      <p>${n > 1 ? `Cette vidéo dure <b>${fmtT(dur)}</b>. Une vidéo dure 1 minute au maximum : Tam-Tam peut la couper en <b>${n} parties</b> qui se suivront.` : 'Cette vidéo est trop lourde pour être envoyée telle quelle : Tam-Tam peut l’alléger.'}</p>
      <p class="hint">La préparation prend à peu près la durée de la vidéo (${fmtT(dur)}). Gardez l’écran allumé et Tam-Tam ouvert.</p>
      <div class="vp-act"><button class="btn ghost" type="button" data-vp="no">Annuler</button><button class="btn" type="button" data-vp="yes">${n > 1 ? `Couper en ${n} parties` : 'Alléger la vidéo'}</button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-vp]'); if (!b) return; if (b.dataset.vp === 'no') { el.remove(); return; } this.run(file, dur, el, done); });
  },
  async run(file, dur, el, done) {
    const card = el.querySelector('.vp-card');
    card.innerHTML = `<h2>Préparation de la vidéo…</h2><div class="vp-bar"><i style="width:0%"></i></div><p class="vp-t">0:00 / ${fmtT(dur)}</p><p class="hint">Gardez l’écran allumé.</p><div class="vp-act"><button class="btn ghost" type="button" data-vp2="stop">Annuler</button></div>`;
    const url = URL.createObjectURL(file), v = document.createElement('video'); v.src = url; v.playsInline = true; v.preload = 'auto';
    let stopped = false; card.querySelector('[data-vp2]').onclick = () => { stopped = true; v.pause(); };
    try {
      await new Promise((ok, ko) => { v.onloadedmetadata = ok; v.onerror = () => ko(new Error('Vidéo illisible sur ce téléphone.')); });
      const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight)), cv = document.createElement('canvas'); cv.width = Math.round(v.videoWidth * k / 2) * 2; cv.height = Math.round(v.videoHeight * k / 2) * 2;
      const g = cv.getContext('2d'), vs = cv.captureStream(30);
      let at = null; try { const ac = new (window.AudioContext || window.webkitAudioContext)(), src = ac.createMediaElementSource(v), dst = ac.createMediaStreamDestination(); src.connect(dst); at = dst.stream.getAudioTracks()[0]; this.ac = ac; } catch {}
      const ms = new MediaStream([...vs.getVideoTracks(), ...(at ? [at] : [])]);
      const mime = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      const parts = []; let rec = null, chunks = [], t0 = 0;
      const startRec = () => { chunks = []; t0 = v.currentTime; rec = new MediaRecorder(ms, {...(mime ? {mimeType: mime} : {}), videoBitsPerSecond: 1_400_000, audioBitsPerSecond: 64_000}); rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; rec.start(1000); };
      const stopRec = () => new Promise(ok => { const r = rec, c = chunks, d = Math.max(1, Math.round(v.currentTime - t0)); r.onstop = () => { parts.push({blob: new Blob(c, {type: (r.mimeType || mime || 'video/webm').split(';')[0]}), dur: d, mime: (r.mimeType || mime || 'video/webm').split(';')[0]}); ok(); }; r.stop(); });
      const draw = () => { if (!v.paused && !v.ended) g.drawImage(v, 0, 0, cv.width, cv.height); };
      let raf = 0; const loop = () => { draw(); raf = requestAnimationFrame(loop); };
      g.drawImage(v, 0, 0, cv.width, cv.height); startRec(); await v.play(); loop();
      await new Promise(ok => {
        const tick = setInterval(async () => {
          const bar = card.querySelector('.vp-bar i'), tt = card.querySelector('.vp-t'); if (bar) bar.style.width = Math.min(100, v.currentTime / dur * 100) + '%'; if (tt) tt.textContent = `${fmtT(Math.floor(v.currentTime))} / ${fmtT(dur)}${parts.length ? ` · partie ${parts.length + 1}` : ''}`;
          if (stopped || v.ended) { clearInterval(tick); ok(); return; }
          if (v.currentTime - t0 >= VID_MAX_S) { v.pause(); await stopRec(); startRec(); await v.play(); }
        }, 200);
      });
      cancelAnimationFrame(raf); if (rec && rec.state !== 'inactive') await stopRec();
      ms.getTracks().forEach(t => t.stop()); if (this.ac) this.ac.close().catch(() => {});
      URL.revokeObjectURL(url); el.remove();
      if (stopped) return toast('Préparation annulée.');
      const good = parts.filter(p => p.blob.size > 1000); if (!good.length) return toast('Cette vidéo n’a pas pu être préparée.');
      done(good);
    } catch (e) { URL.revokeObjectURL(url); el.remove(); toast(e.message || 'Cette vidéo n’a pas pu être préparée.'); }
  },
};

/* ---------- retouche avant envoi ---------- */
const Edit = {
  el: null, s: null,
  async photoFile(file, opts) {
    if (!file || !/^image\//.test(file.type)) return toast('Choisissez une photo.');
    this.photo(file, 'gal', opts);
  },
  async photo(blob, from, opts = {}) {
    const url = URL.createObjectURL(blob), img = new Image();
    try { await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; }); } catch { URL.revokeObjectURL(url); return toast('Cette photo n’a pas pu être lue.'); }
    this.s = {kind: 'photo', img, url, rot: 0, crop: null, f: 0, tool: null, hist: [], from, opts};
    this.mount(); this.draw();
  },
  video(blob, mime, dur, mirror, from, opts = {}, parts = null) {
    if (!parts && blob.size > VID_MAX_BYTES) return toast(`Vidéo trop lourde (${Math.round(blob.size / 1e6)} Mo). Limite : ${VID_MAX_BYTES / 1e6} Mo, soit environ une minute.`);
    this.s = {kind: 'video', blob, mime: (mime || blob.type || 'video/mp4').split(';')[0], dur: dur || 0, url: URL.createObjectURL(blob), mirror: !!mirror, from, opts, parts: parts && parts.length > 1 ? parts : null, pi: 0};
    this.mount();
  },
  videoFile(file, opts) {
    if (!file || !/^video\//.test(file.type)) return toast('Choisissez une vidéo.');
    const v = document.createElement('video'); v.preload = 'metadata'; const u = URL.createObjectURL(file);
    v.onloadedmetadata = () => { const d = Math.round(v.duration || 0); URL.revokeObjectURL(u);
      if (d > VID_MAX_TOTAL) return toast(`Vidéo trop longue (${fmtT(d)}). Maximum : ${fmtT(VID_MAX_TOTAL)}, coupée en parties d’une minute.`);
      if (d > VID_MAX_S + 2 || file.size > VID_MAX_BYTES) return VCut.ask(file, d, parts => this.video(parts[0].blob, parts[0].mime, parts[0].dur, false, 'gal', opts, parts));
      this.video(file, file.type, d, false, 'gal', opts); };
    v.onerror = () => { URL.revokeObjectURL(u); this.video(file, file.type, 0, false, 'gal', opts); };
    v.src = u;
  },
  mount() {
    const c = S.chats.get(S.chatId); if (!c && !(this.s.opts || {}).target) { this.close(); return toast('Ouvrez d’abord une discussion.'); }
    if (this.el) this.el.remove();
    this.el = document.createElement('div'); this.el.className = 'edit'; this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'true'); this.el.setAttribute('aria-label', 'Retoucher avant d’envoyer');
    document.body.appendChild(this.el); document.body.classList.add('in-cam'); this.render();
  },
  render() {
    const s = this.s, c = S.chats.get(S.chatId), ph = s.kind === 'photo', crop = s.tool === 'crop', tgt = !!(s.opts || {}).target;
    this.el.innerHTML = `<div class="ed-top">
        <button class="cib" type="button" data-ed="${crop ? 'cropCancel' : 'close'}" aria-label="${crop ? 'Annuler le rognage' : 'Annuler et revenir à la discussion'}">${I.close}</button>
        ${!crop && s.from ? `<button class="ed-retake" type="button" data-ed="retake">${CI.rotL}<span>${s.from === 'cam' ? (ph ? 'Reprendre' : 'Refilmer') : 'Choisir une autre'}</span></button>` : ''}
        <b class="ed-to">${crop ? 'Rogner' : tgt ? (s.opts.title || 'Pour mon statut') : 'À ' + esc(chatTitle(c))}</b>
        ${ph ? (crop ? `<button class="cib ok" type="button" data-ed="cropOk" aria-label="Valider le rognage">${CI.ok}</button>`
          : `<span class="ed-tools">${s.hist.length ? `<button class="cib" type="button" data-ed="undo" aria-label="Annuler la dernière retouche">${CI.undo}</button>` : ''}<button class="cib" type="button" data-ed="rotL" aria-label="Pivoter vers la gauche">${CI.rotL}</button><button class="cib" type="button" data-ed="rotR" aria-label="Pivoter vers la droite">${CI.rotR}</button><button class="cib" type="button" data-ed="crop" aria-label="Rogner">${CI.crop}</button><button class="cib${s.tool === 'filt' ? ' sel' : ''}" type="button" data-ed="filt" aria-label="Filtres">${CI.filt}</button></span>`) : '<span></span>'}
      </div>
      <div class="ed-stage">${ph ? '<canvas class="ed-cv"></canvas><div class="ed-crop" hidden><div class="ed-box"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div>'
        : `<video class="ed-vid${s.mirror ? ' mirror' : ''}" src="${s.url}" playsinline autoplay loop controls controlslist="nodownload"></video>${s.parts ? `<div class="ed-parts">${s.parts.map((p, i) => `<button type="button" data-ed="part" data-i="${i}" aria-pressed="${s.pi === i}">Partie ${i + 1}<small>${fmtT(p.dur)}</small></button>`).join('')}</div>` : ''}`}</div>
      ${crop ? `<div class="ed-ratios"><button type="button" data-ed="ratio" data-r="0" aria-pressed="${!s.ratio}">Libre</button><button type="button" data-ed="ratio" data-r="1" aria-pressed="${s.ratio === 1}">Carré</button><button type="button" data-ed="ratio" data-r="0.8" aria-pressed="${s.ratio === .8}">4:5</button><button type="button" data-ed="ratio" data-r="1.7778" aria-pressed="${s.ratio === 1.7778}">16:9</button><button type="button" data-ed="cropAll">Tout</button></div>` : ''}
      ${ph && s.tool === 'filt' ? `<div class="ed-filts" role="listbox" aria-label="Filtres">${FILTERS.map(([n], i) => `<button type="button" role="option" data-ed="setF" data-i="${i}" aria-selected="${s.f === i}"><img alt="" data-fth="${i}"><span>${n}</span></button>`).join('')}</div>` : ''}
      ${crop ? '' : `<form class="ed-send" data-edform="1">${tgt ? '' : `<button class="cib once-tog" type="button" data-ed="once" aria-pressed="${!!S.once}" aria-label="Vue unique" title="Vue unique"><span class="one" aria-hidden="true">1</span></button>`}
        ${Emoji.btn('#edCap', 'cib')}<input id="edCap" maxlength="1000" placeholder="Ajouter une légende…" autocomplete="off" value="${esc(s.cap || '')}"><button class="ed-go" type="submit" aria-label="${tgt ? 'Valider' : 'Envoyer'}">${tgt ? CI.ok : I.send}</button></form>`}`;
    if (ph) { this.draw(); if (s.tool === 'filt') this.thumbs(); if (crop) requestAnimationFrame(() => this.cropInit()); }
  },
  dims() { const {img, rot} = this.s, iw = img.naturalWidth, ih = img.naturalHeight; return rot % 180 ? [ih, iw] : [iw, ih]; },
  paint(cv, max, opts = {}) {
    const s = this.s, img = s.img, iw = img.naturalWidth, ih = img.naturalHeight, [rw, rh] = this.dims();
    const c = opts.full ? {x: 0, y: 0, w: 1, h: 1} : (s.crop || {x: 0, y: 0, w: 1, h: 1}), cw = rw * c.w, ch = rh * c.h;
    const k = Math.min(1, max / Math.max(cw, ch)); cv.width = Math.max(1, Math.round(cw * k)); cv.height = Math.max(1, Math.round(ch * k));
    const g = cv.getContext('2d'); g.filter = (opts.f != null ? FILTERS[opts.f][1] : FILTERS[s.f][1]) || 'none';
    g.save(); g.scale(k, k); g.translate(-rw * c.x, -rh * c.y); g.translate(rw / 2, rh / 2); g.rotate(s.rot * Math.PI / 180); g.drawImage(img, -iw / 2, -ih / 2); g.restore();
  },
  draw() { const cv = this.el && this.el.querySelector('.ed-cv'); if (cv) this.paint(cv, 1600, {full: this.s.tool === 'crop'}); },
  thumbs() {
    const t = document.createElement('canvas');
    this.el.querySelectorAll('img[data-fth]').forEach(im => { this.paint(t, 120, {f: +im.dataset.fth}); im.src = t.toDataURL('image/jpeg', .7); });
  },
  push() { const s = this.s; s.hist.push({rot: s.rot, crop: s.crop, f: s.f}); if (s.hist.length > 20) s.hist.shift(); },
  /* ---- rognage : un cadre à déplacer et à étirer par ses coins ---- */
  cropInit() {
    const s = this.s, cv = this.el.querySelector('.ed-cv'), wrap = this.el.querySelector('.ed-crop'), box = this.el.querySelector('.ed-box'); if (!cv || !wrap) return;
    const r = cv.getBoundingClientRect(), st = this.el.querySelector('.ed-stage').getBoundingClientRect();
    Object.assign(wrap.style, {left: (r.left - st.left) + 'px', top: (r.top - st.top) + 'px', width: r.width + 'px', height: r.height + 'px'}); wrap.hidden = false;
    const c = this.cr || s.crop || {x: 0, y: 0, w: 1, h: 1}; this.cr = {x: c.x, y: c.y, w: c.w, h: c.h, W: r.width, H: r.height};
    this.cropShow();
    let drag = null;
    box.onpointerdown = e => { e.preventDefault(); box.setPointerCapture(e.pointerId); drag = {h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, c: {...this.cr}}; };
    box.onpointermove = e => {
      if (!drag) return; const dx = (e.clientX - drag.x) / this.cr.W, dy = (e.clientY - drag.y) / this.cr.H, o = drag.c, min = .08; let {x, y, w, h} = o;
      if (drag.h === 'move') { x = Math.min(Math.max(0, o.x + dx), 1 - o.w); y = Math.min(Math.max(0, o.y + dy), 1 - o.h); }
      else {
        if (drag.h.includes('w')) { x = Math.min(Math.max(0, o.x + dx), o.x + o.w - min); w = o.x + o.w - x; } else w = Math.min(Math.max(min, o.w + dx), 1 - o.x);
        if (drag.h.includes('n')) { y = Math.min(Math.max(0, o.y + dy), o.y + o.h - min); h = o.y + o.h - y; } else h = Math.min(Math.max(min, o.h + dy), 1 - o.y);
        if (s.ratio) { const want = s.ratio * this.cr.H / this.cr.W; h = w / want; if (drag.h.includes('n')) y = o.y + o.h - h; if (y < 0 || y + h > 1) { h = drag.h.includes('n') ? o.y + o.h : 1 - y; y = Math.max(0, y); w = h * want; if (drag.h.includes('w')) x = o.x + o.w - w; } }
      }
      Object.assign(this.cr, {x, y, w, h}); this.cropShow();
    };
    box.onpointerup = box.onpointercancel = () => { drag = null; };
  },
  cropShow() { const b = this.el.querySelector('.ed-box'), c = this.cr; if (!b || !c) return; Object.assign(b.style, {left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%'}); },
  cropRatio(r) {
    const s = this.s; s.ratio = r || 0; const c = this.cr; if (!c) return this.render();
    if (r) { const want = r * c.H / c.W; let w = .9, h = w / want; if (h > .9) { h = .9; w = h * want; } Object.assign(c, {w, h, x: (1 - w) / 2, y: (1 - h) / 2}); }
    this.render();
  },
  async send() {
    const s = this.s, c = S.chats.get(S.chatId), btn = this.el.querySelector('.ed-go'), tgt = (s && s.opts || {}).target; if (!s || (!c && !tgt)) return;
    const cap = ($('#edCap') || {}).value?.trim() || '', once = !!S.once; btn.disabled = true; btn.classList.add('busy');
    try {
      let blob, payload;
      if (s.kind === 'photo') { const cv = document.createElement('canvas'); this.paint(cv, 2560); blob = await new Promise((ok, ko) => cv.toBlob(b => b ? ok(b) : ko(new Error('Photo illisible.')), 'image/jpeg', .9)); payload = {t: cap}; }
      else { blob = s.blob; payload = {t: cap, mime: s.mime, dur: s.dur}; }
      if (tgt) { const r = {kind: s.kind, blob, mime: s.kind === 'video' ? s.mime : 'image/jpeg', dur: s.dur || 0, cap, mirror: !!s.mirror, parts: s.parts}; this.close(); return tgt(r); }
      const list = s.parts || [{blob, mime: s.mime, dur: s.dur}];
      S.once = false;
      for (let i = 0; i < list.length; i++) {
        const p = list[i], b = s.kind === 'video' ? p.blob : blob, pl = s.kind === 'video' ? {t: list.length > 1 ? `${cap ? cap + ' ' : ''}(${i + 1}/${list.length})` : cap, mime: p.mime, dur: p.dur} : payload;
        btn.textContent = list.length > 1 ? `${i + 1}/${list.length}` : '';
        const sealed = await E2E.seal(pl, recipients(c), await b.arrayBuffer());
        const up = await api('/api/media', sealed.blob, {raw: true, type: 'application/octet-stream'});
        const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env, once, ...(s.kind === 'video' ? {kind: 'video'} : {})});
        if (!once) { const u = URL.createObjectURL(b); (s.kind === 'video' ? E2E.vids : E2E.imgs).set(r.msg.id, u); }
        onMsg(r.msg);
      }
      this.close(); renderComposer();
    } catch (e) { toast(e.message); btn.disabled = false; btn.classList.remove('busy'); }
  },
  close() { if (this.s && this.s.url) URL.revokeObjectURL(this.s.url); this.s = null; this.cr = null; if (this.el) this.el.remove(); this.el = null; document.body.classList.remove('in-cam'); },
  act(a, d) {
    const s = this.s; if (!s) return;
    const cap = $('#edCap'); if (cap) s.cap = cap.value;
    if (a === 'close') this.close();
    else if (a === 'retake') { const from = s.from, mode = s.kind === 'video' ? 'video' : 'photo', o = s.opts || {}; S.once = false; this.close(); if (from === 'cam') Cam.open({...o, mode}); else if (o.gallery) o.gallery(); else $('#fileIn').click(); }
    else if (a === 'rotL' || a === 'rotR') { this.push(); s.rot = (s.rot + (a === 'rotR' ? 90 : 270)) % 360; s.crop = null; this.render(); }
    else if (a === 'crop') { s.tool = 'crop'; s.ratio = 0; this.cr = null; this.render(); }
    else if (a === 'cropCancel') { s.tool = null; this.cr = null; this.render(); }
    else if (a === 'cropAll') { this.cr = {...this.cr, x: 0, y: 0, w: 1, h: 1}; s.ratio = 0; this.cropShow(); }
    else if (a === 'ratio') this.cropRatio(+d.r);
    else if (a === 'cropOk') { this.push(); const c = this.cr; s.crop = (c.w > .995 && c.h > .995) ? null : {x: c.x, y: c.y, w: c.w, h: c.h}; s.tool = null; this.cr = null; this.render(); }
    else if (a === 'filt') { s.tool = s.tool === 'filt' ? null : 'filt'; this.render(); }
    else if (a === 'setF') { if (s.f !== +d.i) { this.push(); s.f = +d.i; } this.render(); }
    else if (a === 'undo') { const h = s.hist.pop(); if (h) Object.assign(s, h); this.render(); }
    else if (a === 'part') { s.pi = +d.i; URL.revokeObjectURL(s.url); const p = s.parts[s.pi]; Object.assign(s, {blob: p.blob, mime: p.mime, dur: p.dur, url: URL.createObjectURL(p.blob)}); this.render(); }
    else if (a === 'once') { S.once = !S.once; this.el.querySelectorAll('.once-tog').forEach(b => b.setAttribute('aria-pressed', S.once)); toast(S.once ? 'Vue unique : ne pourra être ouvert qu’une seule fois' : 'Vue unique désactivée'); }
  },
};
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cam]'); if (c && Cam.el && Cam.el.contains(c)) { e.preventDefault(); return Cam.act(c.dataset.cam); }
  const b = e.target.closest('[data-ed]'); if (b && Edit.el && Edit.el.contains(b)) { e.preventDefault(); return Edit.act(b.dataset.ed, b.dataset); }
});
document.addEventListener('submit', e => { if (e.target.matches('[data-edform]')) { e.preventDefault(); Edit.send(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (Edit.el) Edit.close(); else if (Cam.el) Cam.close(); } });

/* lecture des vidéos reçues (déchiffrées sur l'appareil) */
async function hydrateVids(chatId) {
  const list = S.msgs.get(chatId) || [];
  for (const el of document.querySelectorAll('#msgs video[data-vid]:not([src])')) {
    const id = +el.dataset.vid; if (E2E.vids.has(id)) { el.src = E2E.vids.get(id); continue; }
    const m = list.find(x => x.id === id); if (!m || !m._key || !m.miv || el.dataset.busy) continue; el.dataset.busy = '1';
    try { const r = await fetch(m.media, {credentials: 'same-origin'}); if (!r.ok) throw 0; const url = URL.createObjectURL(new Blob([await E2E.decBytes(m._key, m.miv, await r.arrayBuffer())], {type: m.amime || 'video/mp4'})); E2E.vids.set(id, url); el.src = url; }
    catch { const w = el.closest('.vidb'); if (w) w.insertAdjacentHTML('beforeend', '<small class="hint">Vidéo illisible sur cet appareil</small>'); }
  }
}
