/* tam-tam — Messages sans internet (application Android, novembre 2026).
   Quand internet coupe, les téléphones proches qui ont Tam-Tam se trouvent tout seuls (Bluetooth, Wi-Fi direct, Wi-Fi Aware,
   par la technologie « Nearby Connections » de Google) et se passent les messages, de proche en proche dans une foule.
   - Chaque message reste chiffré de bout en bout (même enveloppe que sur le serveur) : un téléphone qui relaie ne peut pas le lire.
   - Le message part aussi par internet dès son retour (file d'envoi) ; le destinataire ne le voit qu'une fois (numéro « px » commun).
   - Seuls les contacts acceptés peuvent s'écrire ; un message dont l'expéditeur ne correspond pas à sa clé connue est ignoré.
   - Discrétion : aucun numéro de membre, aucune discussion ni clé ne circule en clair (étiquettes secrètes, voir plus bas).
   - Audit du 19/11/2026 : l'heure et la réponse citée sont scellées dans le message chiffré (un relais ne peut plus les changer),
     un message déjà reçu ne peut pas être rejoué, l'accusé de réception porte un secret que seul le vrai destinataire connaît
     (un téléphone proche ne peut plus faire croire qu'un message est arrivé), et un téléphone qui inonde est freiné.
   Le pont avec le téléphone : TamTamAndroid.pxStart / pxStop / pxSend (version 3 de l'application) ; les nouvelles
   arrivent par l'événement « tt-px » (detail.k : up, perm, radio, peer, gone, data, err). */
'use strict';
const Px = {
  HOPS: 8, LIFE: 48 * 3600e3, MAX: 400, SIZE: 30000, RATE: 120, PER: 60,
  on: false, want: false, state: '', peers: new Map(), near: new Map(), seen: new Map(), done: new Map(), rate: new Map(), box: null, msgs: null, radioAsked: 0,
  avail() { try { return !!(window.TamTamAndroid && window.TamTamAndroid.version && window.TamTamAndroid.version() >= 3); } catch { return false; } },
  pref() { try { return localStorage.getItem('tt:pxOff') !== '1'; } catch { return true; } },
  setPref(on) { try { if (on) localStorage.removeItem('tt:pxOff'); else localStorage.setItem('tt:pxOff', '1'); } catch {} this.tick(); },
  // « Sans internet » : le téléphone le dit, ou le serveur ne répond plus depuis 15 secondes.
  offline() { return !navigator.onLine || !!S.offline || (S.esDown > 0 && Date.now() - S.esDown > 15000); },
  hex(n) { return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join(''); },
  async sha(t) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))))].map(b => b.toString(16).padStart(2, '0')).join(''); },
  key: k => 'px' + k + ':' + (S.me ? S.me.id : 0),
  load(k, d) { try { return JSON.parse(localStorage.getItem(this.key(k)) || 'null') || d; } catch { return d; } },
  save(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch {} },
  init() {
    if (this.ready || !this.avail()) return; this.ready = true;
    this.box = this.load('box', []); this.seen = new Map(this.load('seen', [])); this.done = new Map(this.load('done', [])); this.clean();
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
    // Messages déjà remis : gardés 30 jours pour refuser une copie rejouée plus tard par un téléphone malveillant.
    for (const [id, at] of this.done) if (now - at > 30 * 864e5) this.done.delete(id);
    if (this.done.size > 5000) this.done = new Map([...this.done].slice(-4000));
    this.save('box', this.box); this.save('seen', [...this.seen]); this.save('done', [...this.done]);
  },
  // « v » (téléphone qui nous a passé le paquet) reste sur cet appareil : il ne sert qu'au partage équitable de la place.
  send(ep, p) { const s = JSON.stringify(p, (k, v) => k === 'v' ? undefined : v); if (s.length > this.SIZE) return; try { window.TamTamAndroid.pxSend(ep || '', btoa(unescape(encodeURIComponent(s)))); } catch {} },
  spread(p, except) { for (const ep of this.peers.keys()) if (ep !== except) this.send(ep, p); },
  keep(p) {
    if (this.box.some(x => x.id === p.id)) return;
    // Un même téléphone voisin ne peut pas occuper toute la place (sinon un téléphone malveillant chasserait les vrais messages).
    if (p.v && this.box.filter(x => x.v === p.v).length >= this.PER) return;
    this.box.push(p); this.clean();
  },
  // Frein : au-delà de 120 paquets par minute venant d'un même téléphone proche, le surplus est ignoré.
  flood(ep) {
    const now = Date.now(), r = this.rate.get(ep) || {t: now, n: 0}; if (now - r.t > 60e3) { r.t = now; r.n = 0; }
    r.n++; this.rate.set(ep, r); return r.n > this.RATE;
  },
  /* ---- Discrétion (audit du 19/11/2026) ----
     Rien de ce qui circule entre téléphones proches ne dit qui écrit à qui : ni numéro de membre, ni discussion, ni clé.
     Chaque paire de membres qui se connaissent partage une clé secrète (calculée par chacun à partir de sa clé privée et de
     la clé publique de l'autre). Un message porte, pour chaque destinataire, une petite étiquette faite avec cette clé :
     seul ce destinataire la reconnaît, et elle change à chaque message. Pour « à proximité », chaque téléphone répond à un
     défi tout neuf avec la même sorte d'étiquettes : impossible de se faire passer pour quelqu'un, ou de rejouer sa réponse. */
  te: new TextEncoder(), pk: new Map(),
  b64: u => btoa(String.fromCharCode(...new Uint8Array(u))),
  unb64: s => Uint8Array.from(atob(String(s || '')), c => c.charCodeAt(0)),
  // Les personnes avec qui on peut échanger : contacts et membres de nos groupes (dont on connaît la clé publique).
  known() {
    const m = new Map(), add = (id, pub) => { if (id && id !== S.me.id && pub && pub.x && pub.y) m.set(id, pub); };
    for (const u of (S.contacts && S.contacts.contacts) || []) add(u.id, u.pubkey);
    for (const c of S.chats.values()) for (const mm of c.members || []) add(mm.id, uOf(mm.id).pubkey);
    return m;
  },
  async pair(uid, pub) {
    const c = this.pk.get(uid); if (c && c.x === pub.x && c.y === pub.y) return c;
    const bits = await crypto.subtle.deriveBits({name: 'ECDH', public: await E2E.pubKey(pub)}, E2E.priv, 256);
    const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']), lo = Math.min(uid, S.me.id), hi = Math.max(uid, S.me.id);
    const opt = w => ({name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: this.te.encode(`tamtam-px-v1|${w}|${lo}|${hi}`)});
    const r = {x: pub.x, y: pub.y, uid,
      hk: await crypto.subtle.deriveKey(opt('tag'), base, {name: 'HMAC', hash: 'SHA-256', length: 256}, false, ['sign']),
      wk: await crypto.subtle.deriveKey(opt('wrap'), base, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt'])};
    this.pk.set(uid, r); return r;
  },
  async tag(pr, label) { return [...new Uint8Array(await crypto.subtle.sign('HMAC', pr.hk, this.te.encode(label))).slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join(''); },
  // Toutes les étiquettes possibles pour un libellé : étiquette → personne.
  async tags(label) { const out = new Map(); for (const [id, pub] of this.known()) { try { out.set(await this.tag(await this.pair(id, pub), label), id); } catch {} } return out; },
  mix(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  async ev(d) {
    if (d.k === 'up') { this.state = 'on'; this.paint(); }
    else if (d.k === 'perm') { this.state = d.ok ? 'on' : 'perm'; this.paint(); }
    else if (d.k === 'radio') { this.state = 'radio'; this.paint(); }
    else if (d.k === 'err') { if (this.state !== 'on') { this.state = 'err'; this.paint(); } }
    else if (d.k === 'peer') {
      // Un défi tout neuf (rien sur nous), puis tout ce qu'on transporte : nos messages et ceux qu'on relaie.
      const n = this.hex(16), old = this.peers.get(d.ep); this.peers.set(d.ep, {uid: 0, n, ans: old ? old.ans : 0}); this.state = 'on';
      this.send(d.ep, {k: 'ch', n}); for (const p of this.box) this.send(d.ep, p); this.paint();
    } else if (d.k === 'gone') { const pr = this.peers.get(d.ep); this.peers.delete(d.ep); if (pr && pr.uid) this.near.delete(pr.uid); this.paint(); }
    else if (d.k === 'data') { if (this.flood(d.ep)) return; let p; try { p = JSON.parse(decodeURIComponent(escape(atob(d.d)))); } catch { return; } await this.got(p, d.ep); }
  },
  async got(p, ep) {
    if (!p || typeof p !== 'object') return;
    let pr = this.peers.get(ep);
    // Le défi du voisin peut arriver juste avant l'annonce de la liaison : on note déjà ce voisin.
    if (p.k === 'ch' && !pr) { pr = {uid: 0, n: '', ans: 0}; this.peers.set(ep, pr); }
    if (p.k === 'ch') {
      // Réponse au défi : une étiquette par personne connue, liée au défi ; seuls nos vrais contacts la reconnaissent.
      if (!pr || pr.ans++ > 3 || typeof p.n !== 'string' || !/^[0-9a-f]{32}$/.test(p.n)) return;
      this.send(ep, {k: 'hi', t: this.mix([...(await this.tags('hi|' + p.n)).keys()]).slice(0, 400)}); return;
    }
    if (p.k === 'hi') {
      if (!pr || !pr.n || pr.uid || !Array.isArray(p.t) || p.t.length > 400) return; const got = new Set(p.t.map(String));
      for (const [t, id] of await this.tags('hi|' + pr.n)) if (got.has(t)) { pr.uid = id; this.near.set(id, Date.now()); break; }
      this.paint(); return;
    }
    if ((p.k !== 'm' && p.k !== 'a') || typeof p.id !== 'string' || !/^[0-9a-f]{16,40}$/.test(p.id)) return;
    if (p.k === 'm' && (!Array.isArray(p.w) || !p.w.length || p.w.length > 300 || typeof p.ct !== 'string' || typeof p.iv !== 'string')) return;
    if (p.k === 'a' && (typeof p.px !== 'string' || typeof p.ak !== 'string')) return;
    if (this.seen.has(p.id)) return; this.seen.set(p.id, Date.now());
    const age = Date.now() - (+p.at || 0); if (!(age < this.LIFE) || age < -6e5) return;
    let last = false;
    if (p.k === 'm') {
      const mine = await this.tags('m|' + p.id), w = p.w.find(x => Array.isArray(x) && mine.has(String(x[0])));
      if (w) { await this.deliver(p, mine.get(String(w[0])), w); last = p.w.length === 1; }
    } else last = await this.acked(p);
    // Relais de proche en proche, tant qu'il reste des sauts (sauf si le message n'était que pour nous).
    if (!last && (+p.h || 0) < this.HOPS) { const q = {...p, h: (+p.h || 0) + 1, v: ep}; this.keep(q); this.spread(q, ep); }
    else this.clean();
  },
  async deliver(p, from, w) {
    let inner; try {
      const pr = this.pk.get(from), raw = await crypto.subtle.decrypt({name: 'AES-GCM', iv: this.unb64(w[1])}, pr.wk, this.unb64(w[2]));
      const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
      inner = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: this.unb64(p.iv)}, k, this.unb64(p.ct))));
    } catch { return; }
    if (!inner || +inner.f !== from) return;
    const c = S.chats.get(+inner.c); if (!c || from === S.me.id || !c.members.some(m => m.id === from)) return;
    if (c.type === 'direct' && (c.blocked || !(S.contacts.contacts || []).some(u => u.id === from))) return;
    const env = inner.env, u = uOf(from); if (!u.pubkey || !env || !env.from || env.from.x !== u.pubkey.x || env.from.y !== u.pubkey.y) return;
    const o = await E2E.open(env, S.me.id); if (o.err || !o.payload || o.payload.px !== p.id) return;
    // L'heure doit être celle scellée par l'expéditeur (un relais ne peut ni la changer, ni rajeunir un vieux message).
    if (o.payload.at !== +p.at) return;
    const list = this.mine(); if (this.done.has(p.id) || list.some(m => m.px === p.id)) return;
    this.done.set(p.id, Date.now());
    const m = {id: -(9e14 + Math.floor(Math.random() * 9e13)), chatId: c.id, from, at: +o.payload.at, kind: 'text', text: String(o.payload.t || '').slice(0, 20000), px: p.id, viaPx: true, local: true, replyTo: +o.payload.rp || null};
    list.push(m); this.saveMine(list); this.clean();
    // Accusé de réception, qui revient de proche en proche, avec le secret lu dans le message chiffré (aucun nom dessus).
    if (typeof o.payload.ak === 'string' && /^[0-9a-f]{32}$/.test(o.payload.ak)) { const a = {k: 'a', id: this.hex(16), px: p.id, ak: o.payload.ak, at: Date.now(), h: 0}; this.seen.set(a.id, Date.now()); this.keep(a); this.spread(a); }
    const l = S.msgs.get(c.id); if (l && !l.some(x => x.px === p.id)) { l.push(m); l.sort((x, y) => (x.at || 0) - (y.at || 0)); }
    c.last = m; onMsgIn(m, true);
    const visible = S.chatId === c.id && !document.hidden; if (!visible) { c.unread = (c.unread || 0) + 1; notify(c, m); renderTabs(); if (S.tab === 'chats') renderBody(); }
  },
  // Un accusé n'est cru que s'il porte le secret scellé dans le message : seul le vrai destinataire a pu le lire.
  // Renvoie vrai quand l'accusé est arrivé chez l'expéditeur (inutile de le relayer plus loin).
  async acked(a) {
    if (!/^[0-9a-f]{32}$/.test(a.ak)) return false;
    const l = Outbox.list(); let hit = false, mineMsg = false; for (const it of l) if (it.px === a.px && it.pak === a.ak) { mineMsg = true; if (!it.pxOk) { it.pxOk = true; hit = true; } }
    if (hit) { Outbox.save(l); for (const ms of S.msgs.values()) for (const m of ms) if (m.px === a.px && m.pending) m.pxOk = true; if (S.chatId) renderMessages(true); }
    await this.drop(a); return mineMsg;
  },
  // Le message n'est retiré de ce qu'on transporte que si l'accusé est authentique (empreinte du secret).
  async drop(a) {
    const h = await this.sha(a.ak);
    this.box = this.box.filter(p => !(p.k === 'm' && p.id === a.px && Array.isArray(p.w) && p.w.length === 1 && p.ah === h)); this.clean();
  },
  // Un message écrit sans internet : il part aussi vers les téléphones proches (et attend internet dans la file d'envoi).
  async offer(it) {
    if (!this.avail() || !it.px) return;
    const c = S.chats.get(it.chatId); if (!c || (c.type === 'direct' && c.blocked)) return;
    // Secret d'accusé, propre à ce message et gardé dans la file d'envoi : seul le destinataire le lira (dans le message chiffré).
    if (!it.pak) { it.pak = this.hex(16); const l = Outbox.list(), x = l.find(y => y.tmp === it.tmp); if (x) { x.pak = it.pak; Outbox.save(l); } }
    try {
      const env = (await E2E.seal({t: it.t, px: it.px, at: it.at, rp: it.reply || null, ak: it.pak}, recipients(c))).env;
      // Enveloppe extérieure : discussion, expéditeur et clés ne sont lisibles que par les destinataires.
      const raw = crypto.getRandomValues(new Uint8Array(32)), k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']), iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, this.te.encode(JSON.stringify({c: c.id, f: S.me.id, env})));
      const w = [];
      for (const mm of c.members) {
        if (mm.id === S.me.id) continue; const pub = uOf(mm.id).pubkey; if (!pub) continue;
        const pr = await this.pair(mm.id, pub), iv2 = crypto.getRandomValues(new Uint8Array(12));
        w.push([await this.tag(pr, 'm|' + it.px), this.b64(iv2), this.b64(await crypto.subtle.encrypt({name: 'AES-GCM', iv: iv2}, pr.wk, raw))]);
      }
      if (!w.length) return;
      const p = {k: 'm', id: it.px, at: it.at, h: 0, iv: this.b64(iv), ct: this.b64(ct), w: this.mix(w), ah: await this.sha(it.pak)};
      this.seen.set(p.id, Date.now()); this.keep(p); this.spread(p);
    } catch { /* clé manquante : le message attendra internet */ }
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
