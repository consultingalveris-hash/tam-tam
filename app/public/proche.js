/* tam-tam — Messages sans internet (application Android, novembre 2026).
   Quand internet coupe, les téléphones proches qui ont Tam-Tam se trouvent tout seuls (Bluetooth, Wi-Fi direct, Wi-Fi Aware,
   par la technologie « Nearby Connections » de Google) et se passent les messages, de proche en proche dans une foule.
   - Chaque message reste chiffré de bout en bout (même enveloppe que sur le serveur) : un téléphone qui relaie ne peut pas le lire.
   - Le message part aussi par internet dès son retour (file d'envoi) ; le destinataire ne le voit qu'une fois (numéro « px » commun).
   - Seuls les contacts acceptés peuvent s'écrire ; un message dont l'expéditeur ne correspond pas à sa clé connue est ignoré.
   Le pont avec le téléphone : TamTamAndroid.pxStart / pxStop / pxSend (version 3 de l'application) ; les nouvelles
   arrivent par l'événement « tt-px » (detail.k : up, perm, radio, peer, gone, data, err). */
'use strict';
const Px = {
  HOPS: 8, LIFE: 48 * 3600e3, MAX: 400, SIZE: 30000,
  on: false, want: false, state: '', peers: new Map(), near: new Map(), seen: new Map(), box: null, msgs: null, radioAsked: 0,
  avail() { try { return !!(window.TamTamAndroid && window.TamTamAndroid.version && window.TamTamAndroid.version() >= 3); } catch { return false; } },
  pref() { try { return localStorage.getItem('tt:pxOff') !== '1'; } catch { return true; } },
  setPref(on) { try { if (on) localStorage.removeItem('tt:pxOff'); else localStorage.setItem('tt:pxOff', '1'); } catch {} this.tick(); },
  // « Sans internet » : le téléphone le dit, ou le serveur ne répond plus depuis 15 secondes.
  offline() { return !navigator.onLine || !!S.offline || (S.esDown > 0 && Date.now() - S.esDown > 15000); },
  hex(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join(''); },
  key: k => 'px' + k + ':' + (S.me ? S.me.id : 0),
  load(k, d) { try { return JSON.parse(localStorage.getItem(this.key(k)) || 'null') || d; } catch { return d; } },
  save(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch {} },
  init() {
    if (this.ready || !this.avail()) return; this.ready = true;
    this.box = this.load('box', []); this.seen = new Map(this.load('seen', [])); this.clean();
    window.addEventListener('tt-px', e => this.ev(e.detail || {}).catch(() => {}));
    window.addEventListener('online', () => this.tick()); window.addEventListener('offline', () => this.tick());
    // Une seule fois, au premier lancement de la version qui sait le faire : l'autorisation « Appareils à proximité »,
    // demandée quand tout va bien, pour ne plus rien avoir à demander le jour d'une coupure.
    try { if (!localStorage.getItem('tt:pxAsked') && this.pref()) { localStorage.setItem('tt:pxAsked', '1'); window.TamTamAndroid.pxPrepare(); } } catch {}
    setInterval(() => this.tick(), 5000); this.tick();
  },
  tick() {
    if (!this.avail() || !S.me || !E2E.ready()) return;
    const need = this.pref() && this.offline();
    if (need && !this.on) {
      this.on = true; this.state = 'start'; this.since = Date.now(); this.radioAsked = 0;
      try { window.TamTamAndroid.pxStart(); } catch { this.on = false; }
      for (const it of Outbox.list()) this.offer(it);
      this.paint();
    } else if (!need && this.on) { this.on = false; this.state = ''; this.peers.clear(); this.near.clear(); try { window.TamTamAndroid.pxStop(); } catch {} this.paint(); }
    if (this.on) this.radios();
  },
  // Android interdit aux applications d'allumer seules le Bluetooth ou le Wi-Fi (fin 2026). Tam-Tam utilise ce qui est allumé ;
  // si les deux sont éteints, ou si personne n'est trouvé au bout de 45 s avec le Bluetooth éteint, Android propose
  // en un seul appui de l'allumer (une fois par coupure).
  radios() {
    if (this.radioAsked || this.peers.size) return; let r; try { r = JSON.parse(window.TamTamAndroid.pxRadios()); } catch { return; }
    if (r.bt) return;
    if (!r.wifi || Date.now() - (this.since || 0) > 45000) { this.radioAsked = Date.now(); try { window.TamTamAndroid.pxAskBt(); } catch {} }
  },
  clean() {
    const now = Date.now(); this.box = this.box.filter(p => now - p.at < this.LIFE).slice(-this.MAX);
    for (const [id, at] of this.seen) if (now - at > this.LIFE) this.seen.delete(id);
    if (this.seen.size > 3000) this.seen = new Map([...this.seen].slice(-2000));
    this.save('box', this.box); this.save('seen', [...this.seen]);
  },
  send(ep, p) { const s = JSON.stringify(p); if (s.length > this.SIZE) return; try { window.TamTamAndroid.pxSend(ep || '', btoa(unescape(encodeURIComponent(s)))); } catch {} },
  spread(p, except) { for (const ep of this.peers.keys()) if (ep !== except) this.send(ep, p); },
  keep(p) { if (this.box.some(x => x.id === p.id)) return; this.box.push(p); this.clean(); },
  async ev(d) {
    if (d.k === 'up') { this.state = 'on'; this.paint(); }
    else if (d.k === 'perm') { this.state = d.ok ? 'on' : 'perm'; this.paint(); }
    else if (d.k === 'radio') { this.state = 'radio'; this.paint(); }
    else if (d.k === 'err') { if (this.state !== 'on') { this.state = 'err'; this.paint(); } }
    else if (d.k === 'peer') {
      this.peers.set(d.ep, {uid: 0}); this.state = 'on';
      // Présentation (numéro de membre seulement), puis tout ce qu'on transporte : ses messages et ceux qu'on relaie.
      this.send(d.ep, {k: 'hi', u: S.me.id}); for (const p of this.box) this.send(d.ep, p); this.paint();
    } else if (d.k === 'gone') { const pr = this.peers.get(d.ep); this.peers.delete(d.ep); if (pr && pr.uid) this.near.delete(pr.uid); this.paint(); }
    else if (d.k === 'data') { let p; try { p = JSON.parse(decodeURIComponent(escape(atob(d.d)))); } catch { return; } await this.got(p, d.ep); }
  },
  async got(p, ep) {
    if (!p || typeof p !== 'object') return;
    if (p.k === 'hi') { const u = +p.u; if (!u) return; const pr = this.peers.get(ep); if (pr) pr.uid = u; this.near.set(u, Date.now()); this.paint(); return; }
    if ((p.k !== 'm' && p.k !== 'a') || typeof p.id !== 'string' || !/^[0-9a-f]{16,40}$/.test(p.id) || !Array.isArray(p.to)) return;
    if (this.seen.has(p.id)) return; this.seen.set(p.id, Date.now());
    const age = Date.now() - (+p.at || 0); if (!(age < this.LIFE) || age < -6e5) return;
    const forMe = p.to.map(Number).includes(S.me.id);
    if (forMe && p.k === 'm') await this.deliver(p);
    if (forMe && p.k === 'a') this.acked(p);
    // Relais de proche en proche : pour les autres destinataires, tant qu'il reste des sauts.
    if ((+p.h || 0) < this.HOPS && p.to.some(u => +u !== S.me.id)) { const q = {...p, h: (+p.h || 0) + 1}; this.keep(q); this.spread(q, ep); }
    else this.clean();
  },
  async deliver(p) {
    const c = S.chats.get(+p.c), from = +p.f; if (!c || !from || from === S.me.id || !c.members.some(m => m.id === from)) return;
    if (c.type === 'direct' && (c.blocked || !(S.contacts.contacts || []).some(u => u.id === from))) return;
    const u = uOf(from); if (!u.pubkey || !p.env || !p.env.from || p.env.from.x !== u.pubkey.x || p.env.from.y !== u.pubkey.y) return;
    const o = await E2E.open(p.env, S.me.id); if (o.err || !o.payload || o.payload.px !== p.id) return;
    const list = this.mine(); if (list.some(m => m.px === p.id)) return;
    const m = {id: -(9e14 + Math.floor(Math.random() * 9e13)), chatId: c.id, from, at: +p.at, kind: 'text', text: String(o.payload.t || '').slice(0, 20000), px: p.id, viaPx: true, local: true, replyTo: +p.rp || null};
    list.push(m); this.saveMine(list);
    // Accusé de réception, qui revient de proche en proche jusqu'à l'expéditeur.
    const a = {k: 'a', id: this.hex(16), px: p.id, f: S.me.id, to: [from], at: Date.now(), h: 0}; this.seen.set(a.id, Date.now()); this.keep(a); this.spread(a);
    const l = S.msgs.get(c.id); if (l && !l.some(x => x.px === p.id)) { l.push(m); l.sort((x, y) => (x.at || 0) - (y.at || 0)); }
    c.last = m; onMsgIn(m, true);
    const visible = S.chatId === c.id && !document.hidden; if (!visible) { c.unread = (c.unread || 0) + 1; notify(c, m); renderTabs(); if (S.tab === 'chats') renderBody(); }
  },
  acked(a) {
    const l = Outbox.list(); let hit = false; for (const it of l) if (it.px === a.px && !it.pxOk) { it.pxOk = true; hit = true; }
    if (hit) { Outbox.save(l); for (const ms of S.msgs.values()) for (const m of ms) if (m.px === a.px && m.pending) m.pxOk = true; if (S.chatId) renderMessages(true); }
    this.box = this.box.filter(p => !(p.k === 'm' && p.id === a.px && p.to.length === 1)); this.clean();
  },
  // Un message écrit sans internet : il part aussi vers les téléphones proches (et attend internet dans la file d'envoi).
  async offer(it) {
    if (!this.avail() || !it.px) return;
    const c = S.chats.get(it.chatId); if (!c || (c.type === 'direct' && c.blocked)) return;
    let env; try { env = (await E2E.seal({t: it.t, px: it.px}, recipients(c))).env; } catch { return; }
    const p = {k: 'm', id: it.px, c: c.id, f: S.me.id, to: c.members.map(m => m.id).filter(x => x !== S.me.id), at: it.at, h: 0, env, rp: it.reply || null};
    this.seen.set(p.id, Date.now()); this.keep(p); this.spread(p);
  },
  // Messages reçus sans internet, gardés (chiffrés) sur l'appareil jusqu'à l'arrivée de la copie passée par le serveur.
  mine() { return this.msgs || (this.msgs = this.load('in', [])); },
  saveMine(l) { this.msgs = l.filter(m => Date.now() - m.at < 30 * 864e5).slice(-500); this.save('in', this.msgs); },
  restore(chatId) {
    const list = S.msgs.get(chatId); if (!list) return; let ch = false;
    const keep = this.mine().filter(m => { if (m.chatId !== chatId) return true; if (list.some(x => x.pxid === m.px)) { ch = true; return false; } if (!list.some(x => x.px === m.px)) { list.push({...m}); ch = true; } return true; });
    if (ch) { this.saveMine(keep); list.sort((x, y) => (x.at || 0) - (y.at || 0)); }
  },
  // La copie arrivée par internet remplace celle reçue sans internet.
  settle(m) {
    if (!m || !m.pxid) return; const l = S.msgs.get(m.chatId);
    if (l) { const i = l.findIndex(x => x.px === m.pxid && x.local); if (i >= 0) l.splice(i, 1); }
    const all = this.mine(); if (all.some(x => x.px === m.pxid)) this.saveMine(all.filter(x => x.px !== m.pxid));
  },
  isNear(uid) { const t = this.near.get(uid); return !!(this.on && t); },
  banner() {
    if (!this.avail() || !this.on || !S.me) return '';
    const n = new Set([...this.peers.values()].map(p => p.uid).filter(Boolean)).size || this.peers.size;
    const t = this.state === 'perm' ? 'Autorisez « Appareils à proximité » pour écrire sans internet.' : this.state === 'radio' ? 'Allumez le Wi-Fi ou le Bluetooth pour écrire sans internet.' : this.state === 'err' ? 'Recherche des téléphones proches impossible pour le moment.'
      : n ? `${n} téléphone${n > 1 ? 's' : ''} avec Tam-Tam à proximité : vos messages passent sans internet.` : 'Pas d’internet : Tam-Tam cherche les téléphones proches pour faire passer vos messages.';
    const btn = this.state === 'perm' || this.state === 'radio' || this.state === 'err' ? '<button class="btn sm" type="button" data-act="pxRetry">Réessayer</button>' : '';
    return `<div class="inst px-ban"><span class="bk-ic">${PX_IC}</span><div><b>Sans internet</b><span>${t}</span></div>${btn}</div>`;
  },
  paint() { if (!S.me) return; if (S.tab === 'chats' && typeof renderBody === 'function') renderBody(); if (S.chatId) { renderChatHead(); const b = $('#pxBar'); if (b) b.innerHTML = this.banner(); } },
};
const PX_IC = '<svg class="px-ic" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 7l10 10-5 5V2l5 5L7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
Object.assign(ACT, { pxTog() { Px.setPref(!Px.pref()); toast(Px.pref() ? 'Messages sans internet activés sur ce téléphone' : 'Messages sans internet désactivés'); }, pxRetry() { Px.state = 'start'; Px.radioAsked = 0; Px.since = Date.now(); try { window.TamTamAndroid.pxStart(); } catch {} Px.paint(); } });
