/* tam-tam — filtres vidéo pendant les appels (peau douce, éclat, chaleureux…).
   L'image de la caméra passe par un canevas qui applique le filtre ; c'est cette image filtrée qui est envoyée
   (et montrée dans la petite image de soi). Rien ne quitte le téléphone : le traitement se fait sur place. */
'use strict';
const Beauty = {
  FX: [
    ['off', 'Aucun', 'none', 0],
    ['doux', 'Peau douce', 'brightness(1.06) saturate(1.05) contrast(0.97)', 0.45],
    ['eclat', 'Éclat', 'brightness(1.12) saturate(1.2) contrast(1.02)', 0.25],
    ['chaud', 'Chaleureux', 'sepia(0.22) saturate(1.25) brightness(1.06)', 0.2],
    ['frais', 'Frais', 'hue-rotate(-8deg) saturate(1.12) brightness(1.05) contrast(1.05)', 0.1],
    ['retro', 'Rétro', 'sepia(0.55) contrast(0.95) brightness(1.05)', 0.15],
    ['nb', 'Noir et blanc', 'grayscale(1) contrast(1.1)', 0],
  ],
  raw: new WeakMap(), // image filtrée -> image brute de la caméra
  get ok() { try { return 'filter' in CanvasRenderingContext2D.prototype && !!HTMLCanvasElement.prototype.captureStream; } catch { return false; } },
  get mode() { try { return localStorage.getItem('tt-fx') || 'off'; } catch { return 'off'; } },
  set mode(v) { try { localStorage.setItem('tt-fx', v); } catch {} },
  fx() { return this.FX.find(f => f[0] === this.mode) || this.FX[0]; },
  rawOf(t) { return (t && this.raw.get(t)) || t; },
  // Une image brute → une image filtrée (si un filtre est choisi et que le navigateur sait le faire).
  track(raw) {
    if (!raw || raw.kind !== 'video' || this.mode === 'off' || !this.ok) return raw;
    const vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.srcObject = new MediaStream([raw]); vid.play().catch(() => {});
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), st = raw.getSettings ? raw.getSettings() : {};
    cv.width = st.width || 640; cv.height = st.height || 480;
    const out = cv.captureStream(Math.min(st.frameRate || 24, 30)).getVideoTracks()[0];
    let on = true;
    const draw = () => {
      if (!on) return;
      if (vid.readyState >= 2 && vid.videoWidth) {
        if (cv.width !== vid.videoWidth || cv.height !== vid.videoHeight) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; }
        const [, , base, soft] = this.fx();
        ctx.globalAlpha = 1; ctx.filter = base; ctx.drawImage(vid, 0, 0, cv.width, cv.height);
        if (soft) { ctx.globalAlpha = soft; ctx.filter = `blur(${Math.max(2, Math.round(cv.width / 180))}px) brightness(1.04)`; ctx.drawImage(vid, 0, 0, cv.width, cv.height); }
        ctx.globalAlpha = 1; ctx.filter = 'none';
      }
      if (vid.requestVideoFrameCallback) vid.requestVideoFrameCallback(draw); else setTimeout(draw, 40);
    };
    draw();
    out._end = () => { on = false; vid.srcObject = null; };
    const stop = out.stop.bind(out); out.stop = () => { out._end(); stop(); raw.stop(); };
    this.raw.set(out, raw);
    return out;
  },
  stream(s) { const v = s && s.getVideoTracks()[0]; if (!v) return s; const f = this.track(v); if (f !== v) { s.removeTrack(v); s.addTrack(f); } return s; },
  // Changer de filtre pendant l'appel. Entre deux filtres, rien à remplacer ; entre « Aucun » et un filtre, on échange l'image envoyée.
  async apply(k) {
    const c = k.c, cur = c && c.local && c.local.getVideoTracks()[0]; if (!cur) return;
    const wrapped = this.raw.has(cur), raw = this.rawOf(cur);
    let next = cur;
    if (this.mode === 'off' && wrapped) next = raw; else if (this.mode !== 'off' && !wrapped) next = this.track(raw);
    if (next === cur) return k.render();
    next.enabled = cur.enabled;
    c.local.removeTrack(cur); c.local.addTrack(next);
    const swap = pc => { const s = pc && pc.getSenders().find(x => x.track === cur); if (s) s.replaceTrack(next).catch(() => {}); };
    if (c.pc) swap(c.pc);
    if (c.peers) c.peers.forEach(p => swap(p.pc));
    if (c.room) c.room.localParticipant.trackPublications.forEach(pub => { if (pub.kind === 'video' && pub.track && pub.track.replaceTrack) pub.track.replaceTrack(next).catch(() => {}); });
    if (wrapped) cur._end();
    k.render();
  },
};
// Bandeau des filtres, en bas de l'écran d'appel.
function fxPick(pre) {
  const m = Beauty.mode;
  return `<div class="fx-pick" role="radiogroup" aria-label="Filtres vidéo">${Beauty.FX.map(([k, l, base]) => `<button type="button" role="radio" aria-checked="${m === k}" data-act="${pre}FxSet" data-k="${k}"><i style="filter:${base}" aria-hidden="true"></i><span>${l}</span></button>`).join('')}</div>`;
}
