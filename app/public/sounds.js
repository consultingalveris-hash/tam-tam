/* tam-tam — sonneries africaines, créées par l'application elle-même (aucun fichier à télécharger, aucun droit d'auteur),
   plus « Ma musique » : un morceau du téléphone, coupé à la partie choisie. Réglage propre à chaque appareil. */
'use strict';
const Tones = {
  // [identifiant, nom, description]
  list: [
    ['tamtam', 'Tam-tam', 'le rythme de Tam-Tam'],
    ['djembe', 'Djembé', 'basse, ton et claque'],
    ['tama', 'Tambour parlant', 'le tama qui chante'],
    ['balafon', 'Balafon', 'mélodie sur lames de bois'],
    ['kora', 'Kora', 'cordes pincées'],
    ['sanza', 'Sanza', 'piano à pouces'],
    ['shekere', 'Shékéré', 'la calebasse perlée'],
    ['grillons', 'Grillons', 'le soir au village'],
    ['foret', 'Nuit dans la forêt', 'grillons, vent et hibou'],
    ['custom', 'Ma musique', 'un morceau de votre téléphone'],
  ],
  def: {call: 'tamtam', msg: 'tamtam', notif: 'balafon'},
  get(k) { try { return localStorage.getItem('tt:tone:' + k) || this.def[k]; } catch { return this.def[k]; } },
  set(k, id) { try { localStorage.setItem('tt:tone:' + k, id); } catch {} },
  name(id) { const t = this.list.find(x => x[0] === id); return t ? (id === 'custom' && this.meta() ? this.meta().name : t[1]) : 'Tam-tam'; },
  meta() { try { return JSON.parse(localStorage.getItem('tt:tone:custom-meta') || 'null'); } catch { return null; } },

  /* ---------- petits instruments ---------- */
  noise(c, d) { const b = c.createBuffer(1, Math.max(1, c.sampleRate * d), c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; return b; },
  env(c, g, t, a, v, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); },
  sine(c, out, t, f, v, d, type = 'sine', f2) { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d * .8); this.env(c, g, t, .005, v, d); o.connect(g).connect(out); o.start(t); o.stop(t + d + .05); },
  hit(c, out, t, f, v, d, q = 1) { const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise(c, d); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; this.env(c, g, t, .002, v, d); n.connect(bp).connect(g).connect(out); n.start(t); },
  drum(c, out, t, f0, f1, d, v) { this.sine(c, out, t, f0, v, d, 'sine', f1); this.hit(c, out, t, f0 * 6, v * .3, .03); },
  bar(c, out, t, f, v) { this.sine(c, out, t, f, v, .55); this.sine(c, out, t, f * 3.93, v * .25, .12); this.hit(c, out, t, 2500, v * .15, .02, 2); },   // lame de balafon
  tine(c, out, t, f, v) { this.sine(c, out, t, f, v, 1.3); this.sine(c, out, t, f * 5.4, v * .12, .25); this.hit(c, out, t, 3200, v * .06, .05, 6); }, // lame de sanza
  pluck(c, out, t, f, v) {   // corde pincée (méthode Karplus-Strong)
    const sr = c.sampleRate, n = Math.round(sr / f), len = Math.round(sr * 1.6), b = c.createBuffer(1, len, sr), x = b.getChannelData(0);
    for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
    for (let i = n; i < len; i++) x[i] = .4985 * (x[i - n] + x[i - n + 1]);
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = v; s.connect(g).connect(out); s.start(t);
  },
  chirp(c, out, t, f, v, n = 3) { for (let k = 0; k < n; k++) { const o = c.createOscillator(), am = c.createOscillator(), ag = c.createGain(), g = c.createGain(); o.frequency.value = f; am.frequency.value = 38; ag.gain.value = .5; g.gain.value = 0; am.connect(ag).connect(g.gain); const t0 = t + k * .19; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + .02); g.gain.linearRampToValueAtTime(0, t0 + .12); o.connect(g).connect(out); o.start(t0); am.start(t0); o.stop(t0 + .14); am.stop(t0 + .14); } },

  /* ---------- les sonneries ---------- (chacune renvoie sa durée ; « court » = version message) */
  P: {
    tamtam(T, c, o, t, short) { const D = (dt, a, b, d, v) => T.drum(c, o, t + dt, a, b, d, v);
      D(0, 190, 95, .32, .55); D(.16, 330, 170, .16, .35); D(.30, 200, 100, .36, .5); if (short) return .7;
      D(.62, 150, 75, .42, .7); D(.86, 150, 78, .3, .55); D(1.06, 330, 175, .16, .45); D(1.3, 240, 120, .12, .35); D(1.4, 250, 125, .12, .38); D(1.5, 260, 130, .12, .42); D(1.62, 160, 80, .5, .75); return 2.2; },
    djembe(T, c, o, t, short) { const bass = dt => T.drum(c, o, t + dt, 85, 60, .4, .8), tone = dt => T.drum(c, o, t + dt, 210, 190, .18, .45), slap = dt => T.hit(c, o, t + dt, 1700, .7, .09, 1.2);
      bass(0); tone(.18); slap(.3); tone(.45); if (short) return .7; bass(.6); slap(.78); slap(.9); tone(1.05); bass(1.2); slap(1.4); slap(1.5); slap(1.6); return 2.1; },
    tama(T, c, o, t, short) { const s = (dt, a, b, d, v) => T.sine(c, o, t + dt, a, v, d, 'sine', b);
      s(0, 120, 190, .28, .7); s(.3, 190, 130, .3, .6); if (short) return .7; s(.7, 110, 210, .3, .7); s(1.05, 210, 120, .4, .6); s(1.5, 150, 150, .15, .5); s(1.68, 150, 220, .35, .6); return 2.2; },
    balafon(T, c, o, t, short) { const N = [523.3, 587.3, 659.3, 784, 880, 1046.5], seq = short ? [[0, 2], [.13, 4], [.26, 5]] : [[0, 2], [.14, 4], [.28, 5], [.42, 4], [.56, 2], [.7, 3], [.84, 1], [1.12, 0], [1.26, 2], [1.4, 4], [1.68, 3], [1.82, 2]];
      for (const [dt, k] of seq) T.bar(c, o, t + dt, N[k], .45); return short ? .8 : 2.4; },
    kora(T, c, o, t, short) { const N = [196, 246.9, 293.7, 392, 493.9, 587.3], seq = short ? [[0, 0], [.12, 2], [.24, 4]] : [[0, 0], [.15, 2], [.3, 4], [.45, 5], [.6, 3], [.75, 4], [.9, 2], [1.2, 1], [1.35, 3], [1.5, 5], [1.65, 4], [1.95, 0]];
      for (const [dt, k] of seq) T.pluck(c, o, t + dt, N[k], .55); return short ? 1 : 2.6; },
    sanza(T, c, o, t, short) { const N = [440, 523.3, 587.3, 659.3, 784], seq = short ? [[0, 4], [.18, 2], [.36, 3]] : [[0, 4], [.2, 2], [.4, 3], [.6, 1], [.8, 2], [1, 0], [1.4, 4], [1.6, 3], [1.8, 1], [2, 2]];
      for (const [dt, k] of seq) T.tine(c, o, t + dt, N[k], .35); return short ? 1.2 : 2.8; },
    shekere(T, c, o, t, short) { const h = (dt, v) => T.hit(c, o, t + dt, 7000, v, .07, .7), lo = dt => T.drum(c, o, t + dt, 110, 80, .3, .5);
      lo(0); h(.12, .5); h(.24, .7); h(.36, .5); if (short) return .6; lo(.5); h(.62, .5); h(.74, .7); h(.86, .5); h(.98, .7); lo(1.1); h(1.22, .5); h(1.34, .7); h(1.46, .9); return 1.9; },
    grillons(T, c, o, t, short) { T.chirp(c, o, t, 4400, .18, 3); if (short) return .7; T.chirp(c, o, t + .9, 4600, .15, 3); T.chirp(c, o, t + 1.6, 4300, .18, 4); return 2.6; },
    foret(T, c, o, t, short) {
      const n = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), d = short ? 1.4 : 3.2; n.buffer = T.noise(c, d); lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(.12, t + d * .4); g.gain.linearRampToValueAtTime(0.0001, t + d); n.connect(lp).connect(g).connect(o); n.start(t);
      T.chirp(c, o, t + .1, 4800, .1, 3); const hoo = dt => { const os = c.createOscillator(), gg = c.createGain(); os.frequency.setValueAtTime(390, t + dt); os.frequency.linearRampToValueAtTime(350, t + dt + .45); gg.gain.setValueAtTime(0.0001, t + dt); gg.gain.linearRampToValueAtTime(.35, t + dt + .12); gg.gain.linearRampToValueAtTime(0.0001, t + dt + .5); os.connect(gg).connect(o); os.start(t + dt); os.stop(t + dt + .55); };
      hoo(.5); if (short) return d; hoo(1.2); T.chirp(c, o, t + 1.9, 4500, .1, 4); hoo(2.4); return d; },
  },

  /* ---------- lecture ---------- */
  buf: null,
  async customBuf() {
    if (this.buf) return this.buf; const m = this.meta(); if (!m) return null;
    const blob = await Store.get('tone:custom'); if (!blob) return null; Sound.unlock();
    this.buf = await Sound.ctx.decodeAudioData(await blob.arrayBuffer()); return this.buf;
  },
  // Joue une sonnerie ; loop = en boucle (appel entrant). Renvoie de quoi l'arrêter.
  play(id, {short = false, loop = false} = {}) {
    Sound.unlock(); const c = Sound.ctx; if (!c) return {stop() {}};
    const out = c.createGain(); out.gain.value = .9; out.connect(c.destination);
    let stopped = false, timer = null, src = null;
    const once = async () => {
      if (stopped) return;
      if (id === 'custom') {
        const b = await this.customBuf().catch(() => null), m = this.meta();
        if (!b || !m) { this.P.tamtam(this, c, out, c.currentTime + .02, short); timer = loop && setTimeout(once, 2800); return; }
        const len = Math.max(.3, Math.min((short ? 4 : 30), m.end - m.start)); src = c.createBufferSource(); src.buffer = b; src.connect(out); src.start(c.currentTime + .02, m.start, len);
        if (loop) timer = setTimeout(once, len * 1000 + 600); return;
      }
      const f = this.P[id] || this.P.tamtam, d = f(this, c, out, c.currentTime + .02, short);
      if (loop) timer = setTimeout(once, d * 1000 + 700);
    };
    once();
    return {stop() { stopped = true; clearTimeout(timer); try { src && src.stop(); } catch {} try { out.gain.setTargetAtTime(0, c.currentTime, .05); setTimeout(() => out.disconnect(), 400); } catch {} }};
  },
  preview: null,
  test(id, k) { if (this.preview) this.preview.stop(); this.preview = this.play(id, {short: k !== 'call'}); },

  /* ---------- réglages ---------- */
  kinds: [['call', 'Appels'], ['msg', 'Messages'], ['notif', 'Notifications']],
  settingsHtml() {
    return `<div class="set-block"><h2>🥁 Sonneries</h2><p class="hint">Des sons d’Afrique pour vos appels, vos messages et vos notifications, ou un morceau de votre téléphone.</p>
      <div class="tone-rows">${this.kinds.map(([k, l]) => `<button class="tone-row" type="button" data-act="toneOpen" data-k="${k}"><span>${l}</span><b>${esc(this.name(this.get(k)))}</b>${I.chev || '›'}</button>`).join('')}</div>
      <div><button class="btn sm ghost" type="button" data-act="toneImport">🎵 ${this.meta() ? 'Changer ma musique' : 'Importer ma musique'}</button></div></div>`;
  },
  open(k) {
    const cur = this.get(k), lab = this.kinds.find(x => x[0] === k)[1];
    sheet(`${head('Sonnerie · ' + lab)}<div class="sheet-body"><p class="hint">Touchez un son pour l’écouter et le choisir.</p></div><div class="menu tone-list">${this.list.map(([id, n, d]) => id === 'custom' && !this.meta() ? '' : `<button type="button" data-act="toneSet" data-k="${k}" data-id="${id}" aria-pressed="${id === cur}"><span class="tl-ic" aria-hidden="true">${id === cur ? '●' : '○'}</span><span><b>${esc(id === 'custom' ? this.meta().name : n)}</b><small>${esc(d)}</small></span></button>`).join('')}</div>
      <div class="sheet-body"><div class="actions"><button class="btn sm ghost" type="button" data-act="toneImport">🎵 Importer ma musique</button><button class="btn" type="button" data-act="toneDone">Terminé</button></div></div>`, 'Sonnerie');
  },
  pick() { const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*'; i.onchange = () => { const f = i.files[0]; if (f) this.trimSheet(f); }; i.click(); },
  async trimSheet(file) {
    if (file.size > 25e6) return toast('Morceau trop lourd (25 Mo au maximum).');
    Sound.unlock(); let b; try { b = await Sound.ctx.decodeAudioData(await file.arrayBuffer()); } catch { return toast('Ce fichier audio n’a pas pu être lu.'); }
    this.tr = {file, b, start: 0, end: Math.min(b.duration, 20)};
    sheet(`${head('Ma musique')}<div class="sheet-body"><p class="hint">Choisissez la partie à garder (30 secondes au maximum), puis « Enregistrer ».</p>
      <canvas id="trWave" width="640" height="90" class="tr-wave"></canvas>
      <div class="field"><label for="trS">Début : <b id="trSv"></b></label><input id="trS" type="range" min="0" max="${b.duration.toFixed(1)}" step="0.1" value="0"></div>
      <div class="field"><label for="trE">Fin : <b id="trEv"></b></label><input id="trE" type="range" min="0" max="${b.duration.toFixed(1)}" step="0.1" value="${this.tr.end.toFixed(1)}"></div>
      <div class="actions"><button class="btn ghost" type="button" data-act="trPlay">▶ Écouter</button><button class="btn" type="button" data-act="trSave">Enregistrer</button></div></div>`, 'Ma musique');
    const draw = () => { const cv = $('#trWave'); if (!cv) return; const g = cv.getContext('2d'), d = b.getChannelData(0), W = cv.width, H = cv.height, step = Math.ceil(d.length / W);
      g.clearRect(0, 0, W, H); const s = this.tr.start / b.duration * W, e = this.tr.end / b.duration * W; g.fillStyle = 'rgba(20,184,201,.18)'; g.fillRect(s, 0, e - s, H);
      for (let x = 0; x < W; x++) { let m = 0; for (let i = 0; i < step; i += 16) m = Math.max(m, Math.abs(d[x * step + i] || 0)); g.fillStyle = x >= s && x <= e ? '#14b8c9' : '#8a9aa3'; g.fillRect(x, H / 2 - m * H / 2, 1, Math.max(1, m * H)); }
      $('#trSv').textContent = fmtT(Math.floor(this.tr.start)); $('#trEv').textContent = `${fmtT(Math.floor(this.tr.end))} (${Math.round(this.tr.end - this.tr.start)} s)`; };
    const sync = which => { let s = +$('#trS').value, e = +$('#trE').value; if (which === 's' && e - s > 30) e = s + 30; if (which === 'e' && e - s > 30) s = e - 30; if (e <= s + .5) { if (which === 's') e = Math.min(b.duration, s + .5); else s = Math.max(0, e - .5); } $('#trS').value = s; $('#trE').value = e; Object.assign(this.tr, {start: s, end: e}); draw(); };
    $('#trS').oninput = () => sync('s'); $('#trE').oninput = () => sync('e'); draw();
  },
  trPlay() { const t = this.tr; if (!t) return; if (this.preview) this.preview.stop(); const c = Sound.ctx, s = c.createBufferSource(); s.buffer = t.b; s.connect(c.destination); s.start(c.currentTime + .02, t.start, t.end - t.start); this.preview = {stop() { try { s.stop(); } catch {} }}; },
  async trSave() {
    const t = this.tr; if (!t) return; if (this.preview) this.preview.stop();
    await Store.set('tone:custom', t.file); try { localStorage.setItem('tt:tone:custom-meta', JSON.stringify({name: (t.file.name || 'Ma musique').replace(/\.[a-z0-9]+$/i, '').slice(0, 40), start: t.start, end: t.end})); } catch {}
    this.buf = t.b; this.tr = null; toast('Votre musique est enregistrée : choisissez-la pour les appels, les messages ou les notifications.'); closeLayer(); if (S.tab === 'settings' || document.querySelector('.tone-rows')) renderBody();
  },
};
Object.assign(ACT, {
  toneOpen(d) { Tones.open(d.k); },
  toneSet(d) { Tones.set(d.k, d.id); Tones.test(d.id, d.k); document.querySelectorAll('.tone-list button').forEach(b => { const on = b.dataset.id === d.id; b.setAttribute('aria-pressed', on); b.querySelector('.tl-ic').textContent = on ? '●' : '○'; }); },
  toneDone() { if (Tones.preview) Tones.preview.stop(); closeLayer(); renderBody(); if (typeof pmRefresh === 'function') try { pmRefresh(); } catch {} },
  toneImport() { Tones.pick(); },
  trPlay() { Tones.trPlay(); },
  trSave() { Tones.trSave(); },
});
