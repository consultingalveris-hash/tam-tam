/* tam-tam — Son des messages (petit « tam-tam » joué par le navigateur).
   Extrait de app.js (nov. 2026) : fichier chargé après app.js, partage ses variables globales (S, api, toast…). */
'use strict';
/* ---------- son des messages : un petit « tam-tam » joué par le navigateur, sans fichier ---------- */
const Sound = {
  ctx: null, last: 0,
  on() { try { return localStorage.getItem('tt:sound') !== 'off'; } catch { return true; } },
  set(v) { try { localStorage.setItem('tt:sound', v ? 'on' : 'off'); } catch {} },
  unlock() { try { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch {} },
  drum(t, f0, f1, dur, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .05);
    // la frappe de la main sur la peau
    const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * .03, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const hp = c.createBiquadFilter(), ng = c.createGain(); hp.type = 'bandpass'; hp.frequency.value = f0 * 6; ng.gain.value = vol * .35;
    n.buffer = b; n.connect(hp).connect(ng).connect(c.destination); n.start(t);
  },
  notif() { if (!this.on() || Date.now() - this.last < 1500) return; this.last = Date.now(); if (typeof Tones !== 'undefined') Tones.play(Tones.get('notif'), {short: true}); },
  msg(force) {
    if (!force && (!this.on() || Date.now() - this.last < 1500)) return; this.last = Date.now();
    this.unlock(); const c = this.ctx; if (!c) return; const t = c.currentTime + .02;
    if (typeof Tones !== 'undefined') Tones.play(Tones.get('msg'), {short: true}); else { this.drum(t, 190, 95, .32, .55); this.drum(t + .16, 330, 170, .16, .35); this.drum(t + .30, 200, 100, .36, .5); }
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate([60, 60, 60]); } catch {}
  },
};
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => Sound.unlock(), {passive: true}));
function toast(t) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }

