/* tam-tam — filtres vidéo pendant les appels (peau douce, éclat, chaleureux…).
   L'image de la caméra est retouchée par la carte graphique du téléphone (WebGL) : lissage de la peau qui garde
   les contours nets (yeux, bouche), lumière, contraste et couleurs. C'est cette image retouchée qui est envoyée
   et montrée dans la petite image de soi. Rien ne quitte le téléphone : le traitement se fait sur place.
   Sans WebGL, un traitement plus simple (filtres du navigateur) prend le relais. */
'use strict';
const Beauty = {
  // [clé, nom, réglages, aperçu de la pastille]
  FX: [
    ['off', 'Aucun', null, 'none'],
    ['doux', 'Peau douce', {soft: 0.75, bri: 1.05, con: 0.98, sat: 1.05, warm: 0.3}, 'brightness(1.06) saturate(1.05)'],
    ['eclat', 'Éclat', {soft: 0.4, bri: 1.1, con: 1.04, sat: 1.2}, 'brightness(1.12) saturate(1.2)'],
    ['chaud', 'Chaleureux', {soft: 0.35, bri: 1.05, sat: 1.15, warm: 1}, 'sepia(0.25) saturate(1.25)'],
    ['frais', 'Frais', {soft: 0.25, bri: 1.04, con: 1.06, sat: 1.1, warm: -0.8}, 'hue-rotate(-10deg) saturate(1.1)'],
    ['retro', 'Rétro', {soft: 0.2, bri: 1.05, con: 0.95, sep: 0.6}, 'sepia(0.6)'],
    ['nb', 'Noir et blanc', {con: 1.1, gray: 1}, 'grayscale(1)'],
  ],
  raw: new WeakMap(), // image retouchée -> image brute de la caméra
  get ok() { try { return !!HTMLCanvasElement.prototype.captureStream; } catch { return false; } },
  get mode() { try { return localStorage.getItem('tt-fx') || 'off'; } catch { return 'off'; } },
  set mode(v) { try { localStorage.setItem('tt-fx', v); } catch {} },
  fx() { return this.FX.find(f => f[0] === this.mode) || this.FX[0]; },
  rawOf(t) { return (t && this.raw.get(t)) || t; },
  box() { let b = document.getElementById('fxSrc'); if (!b) { b = document.createElement('div'); b.id = 'fxSrc'; b.setAttribute('aria-hidden', 'true'); b.style.cssText = 'position:fixed;left:-20px;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none'; document.body.appendChild(b); } return b; },

  FS: `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;uniform float soft,bri,con,sat,warm,sep,gray;
const vec3 L=vec3(.299,.587,.114);
void main(){vec3 c=texture2D(t,v).rgb;
if(soft>0.){vec3 s=c;float w=1.;
for(int i=0;i<8;i++){float a=float(i)*.7854;vec2 o=vec2(cos(a),sin(a))*px*2.5;vec3 q=texture2D(t,v+o).rgb;float k=exp(-dot(q-c,q-c)*45.);s+=q*k;w+=k;}
for(int i=0;i<8;i++){float a=float(i)*.7854+.3927;vec2 o=vec2(cos(a),sin(a))*px*5.;vec3 q=texture2D(t,v+o).rgb;float k=exp(-dot(q-c,q-c)*45.)*.6;s+=q*k;w+=k;}
c=mix(c,s/w,soft);}
c=(c-.5)*con+.5;c*=bri;float l=dot(c,L);c=mix(vec3(l),c,sat);c+=vec3(.05,.015,-.04)*warm;
vec3 p=vec3(dot(c,vec3(.393,.769,.189)),dot(c,vec3(.349,.686,.168)),dot(c,vec3(.272,.534,.131)));c=mix(c,p,sep);
c=mix(c,vec3(dot(c,L)),gray);gl_FragColor=vec4(clamp(c,0.,1.),1.);}`,
  gl(cv) {
    let g; try { g = cv.getContext('webgl', {premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false}); } catch {} if (!g) return null;
    const sh = (type, src) => { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(s)); return s; };
    try {
      const pr = g.createProgram();
      g.attachShader(pr, sh(g.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));
      g.attachShader(pr, sh(g.FRAGMENT_SHADER, this.FS)); g.linkProgram(pr); if (!g.getProgramParameter(pr, g.LINK_STATUS)) return null;
      g.useProgram(pr);
      const b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
      const loc = g.getAttribLocation(pr, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
      const tx = g.createTexture(); g.bindTexture(g.TEXTURE_2D, tx);
      [[g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]].forEach(([k, val]) => g.texParameteri(g.TEXTURE_2D, k, val));
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
      const u = {}; ['px', 'soft', 'bri', 'con', 'sat', 'warm', 'sep', 'gray'].forEach(n => { u[n] = g.getUniformLocation(pr, n); });
      return {g, u};
    } catch { return null; }
  },
  // Une image brute → une image retouchée (si un filtre est choisi).
  track(raw) {
    if (!raw || raw.kind !== 'video' || this.mode === 'off' || !this.ok) return raw;
    const vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.autoplay = true; vid.srcObject = new MediaStream([raw]);
    this.box().appendChild(vid); vid.play().catch(() => {}); // dans la page (invisible) : sinon certains téléphones figent l'image
    const st = raw.getSettings ? raw.getSettings() : {}, cv = document.createElement('canvas');
    cv.width = st.width || 640; cv.height = st.height || 480;
    const W = this.gl(cv), ctx = W ? null : cv.getContext('2d');
    const out = cv.captureStream(30).getVideoTracks()[0];
    const draw = () => {
      if (vid.readyState < 2 || !vid.videoWidth) return;
      const w = Math.min(vid.videoWidth, 1280), h = Math.round(vid.videoHeight * w / vid.videoWidth);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const [, , f, css] = this.fx(), p = f || {};
      if (W) {
        const {g, u} = W; g.viewport(0, 0, w, h);
        try { g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, vid); } catch { return; }
        g.uniform2f(u.px, 1 / w, 1 / h); g.uniform1f(u.soft, p.soft || 0); g.uniform1f(u.bri, p.bri || 1); g.uniform1f(u.con, p.con || 1); g.uniform1f(u.sat, p.sat == null ? 1 : p.sat);
        g.uniform1f(u.warm, p.warm || 0); g.uniform1f(u.sep, p.sep || 0); g.uniform1f(u.gray, p.gray || 0);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      } else { ctx.filter = css; ctx.drawImage(vid, 0, 0, w, h); ctx.filter = 'none'; }
    };
    const iv = setInterval(draw, 33); // minuterie régulière (30 images par seconde), plus fiable que d'attendre chaque image de la vidéo
    out._end = () => { clearInterval(iv); vid.srcObject = null; vid.remove(); };
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
    document.querySelectorAll('video').forEach(v => { if (v.srcObject === c.local) { v.srcObject = null; v.srcObject = c.local; v.play().catch(() => {}); } });
    k.render();
  },
};
// Bandeau des filtres, en bas de l'écran d'appel. Chaque pastille montre le même portrait avec l'effet du filtre
// (portraits illustrés créés avec ChatGPT, rangés côte à côte dans fx-portraits.jpg).
function fxPick(pre) {
  const m = Beauty.mode;
  return `<div class="fx-pick" role="radiogroup" aria-label="Filtres vidéo">${Beauty.FX.map(([k, l], n) => `<button type="button" role="radio" aria-checked="${m === k}" data-act="${pre}FxSet" data-k="${k}" aria-label="${l}" title="${l}"><i style="background-position:${(n * 100 / 6).toFixed(3)}% 0" aria-hidden="true"></i></button>`).join('')}</div>`;
}
