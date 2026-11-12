/* tam-tam — Vidéos du profil, flammes, profil privé chiffré de bout en bout.
   Extrait de app.js (nov. 2026) : fichier chargé après app.js, partage ses variables globales (S, api, toast…). */
'use strict';
/* ---------- vidéos du profil et flammes 🔥 sur les photos et vidéos ---------- */
const Prof = {
  fl: new Map(), urls: new Map(),
  mid: u => { const m = /\/api\/media\/([A-Za-z0-9_-]+)/.exec(u || ''); return m ? m[1] : null; },
  ids(u, set) { return set === 'pub' ? (u.pics || []).map(x => this.mid(x)) : (u.privIds || []); },
  vids(u, set) { return (set === 'pub' ? u.vids : u.privVids) || [null, null, null]; },
  vidTile(v, i) { if (v && v.id && !this.reg.has(v.id)) this.reg.set(v.id, v); return `<button class="ph3-img ph3-vid" type="button" data-act="vidView" data-vid="${esc(v.id)}" aria-label="Regarder la vidéo ${i + 1}"><video data-pvid="${esc(v.id)}" muted playsinline preload="metadata"></video><span class="ph3-play" aria-hidden="true">▶</span></button>`; },
  reg: new Map(), // id de la vidéo -> {url chiffrée + clé} ou adresse déjà déchiffrée
  remember(list) { (list || []).forEach(v => { if (v && v.id) this.reg.set(v.id, v); }); },
  async src(id) {
    if (this.urls.has(id)) return this.urls.get(id);
    const v = this.reg.get(id); if (!v) return null; if (v.blob) return v.blob;
    const p = (async () => { const u = await PP.decPic(v); if (!u) this.urls.delete(id); return u; })(); this.urls.set(id, p); return p;
  },
  async hydrate() { for (const el of document.querySelectorAll('video[data-pvid]:not([data-ok])')) { el.dataset.ok = '1'; const u = await this.src(el.dataset.pvid).catch(() => null); if (u) el.src = u + '#t=0.1'; } },
  bar(uid, id) {
    if (!id) return ''; const it = (this.fl.get(uid) || {})[id] || {n: 0, mine: false};
    if (uid === S.me.id) return `<div class="pf-bar" data-pf="${esc(id)}">${it.n ? `<span>🔥 ${it.n}</span><button class="pf-who" type="button" data-act="pfWho" data-m="${esc(id)}">Voir qui</button>` : '<small class="hint">Pas encore de flamme</small>'}</div>`;
    return `<div class="pf-bar" data-pf="${esc(id)}"><button class="pf-btn" type="button" data-act="pfFlame" data-u="${uid}" data-m="${esc(id)}" aria-pressed="${it.mine}" aria-label="${it.mine ? 'Retirer ma flamme' : 'Envoyer une flamme'}"><span class="fl" aria-hidden="true">🔥</span>${it.n || ''}</button></div>`;
  },
  async loadFor(uid) { try { this.fl.set(uid, (await api(`/api/users/${uid}/flames`)).items || {}); } catch {} },
  async load(rerender) { await this.loadFor(S.me.id); if (rerender) { if (S.modal === 'me') renderModal(); else if (S.tab === 'chats' && S.filt === 'me') renderBody(); } },
};
new MutationObserver(() => { if (document.querySelector('video[data-pvid]:not([data-ok])')) Prof.hydrate(); }).observe(document.documentElement, {childList: true, subtree: true});
/* ---------- profil privé chiffré de bout en bout ----------
   Téléphone, adresse, famille, photos privées : chiffrés sur l'appareil pour les seules personnes autorisées.
   Le serveur ne garde qu'une enveloppe illisible et une empreinte du numéro (pour le répertoire). */
const PP = {
  data: null, tel: '', urls: [null, null, null], vurls: [null, null, null],
  async open(env) { if (!env || !E2E.ready()) return null; const r = await E2E.open(env, S.me.id); return r.err ? null : r.payload; },
  aud() {
    const me = S.me, cs = (S.contacts.contacts || []).filter(u => u.pubkey && !u.blocked && !u.limMine);
    const list = me.privTo === 'me' ? [] : me.privTo === 'grp' ? cs.filter(u => (me.close || []).includes(u.id)) : cs;
    return [[me.id, E2E.pubJwk], ...list.map(u => [u.id, u.pubkey])];
  },
  telAud() { return [[S.me.id, E2E.pubJwk], ...(S.contacts.contacts || []).filter(u => u.pubkey && u.telMine).map(u => [u.id, u.pubkey])]; },
  attach(me) { me.priv = Object.assign({}, this.data.f, {tel: this.tel}); me.privPics = this.urls.slice(); me.privIds = this.data.pics.map(p => p && p.id); me.privVids = this.vlist(this.data.vids, this.vurls); Prof.remember(me.privVids); Prof.remember(me.vids); },
  vlist(vids, urls) { return (vids || [null, null, null]).map((v, i) => v && urls[i] ? {id: v.id, blob: urls[i]} : null); },
  async init() {
    if (!E2E.ready() || !S.me) return;
    const me = S.me;
    if (me.privEnv) { const p = await this.open(me.privEnv); this.data = p ? {f: p.f || {}, pics: p.pics || [null, null, null], vids: p.vids || [null, null, null]} : {f: {}, pics: [null, null, null], vids: [null, null, null]}; }
    if (me.telEnv) { const t = await this.open(me.telEnv); this.tel = (t && t.tel) || ''; }
    if (!me.privEnv || me.legacyPriv) await this.migrate();
    this.data.vids = this.data.vids || [null, null, null];
    this.urls = await this.picUrls(this.data.pics); this.vurls = await this.picUrls(this.data.vids); this.attach(S.me);
    await this.check();
  },
  // Ancien profil privé en clair : on le chiffre une fois, puis le serveur l'efface.
  async migrate() {
    const me = S.me, old = me.priv || {}, f = {};
    for (const k of ['annee', 'mail', 'adresse', 'travail', 'famille']) if (old[k]) f[k] = old[k];
    this.tel = this.tel || old.tel || '';
    const pics = [null, null, null];
    for (let i = 0; i < 3; i++) { const u = (me.privPics || [])[i]; if (!u) continue; try { const r = await fetch(u, {credentials: 'same-origin'}); if (r.ok) pics[i] = await this.encPic(await r.arrayBuffer()); } catch {} }
    this.data = {f, pics, vids: [null, null, null]}; await this.save();
  },
  async encPic(bytes) {
    const raw = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12)), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, bytes);
    const up = await upMedia(new Blob([ct], {type: 'application/octet-stream'}));
    return {id: up.id, k: Tr.b64(raw), iv: Tr.b64(iv)};
  },
  async encVid(bytes, type) { return Object.assign(await this.encPic(bytes), {t: /^video\//.test(type || '') ? type : 'video/mp4'}); },
  async decPic(p) {
    if (!p) return null; const r = await fetch('/api/media/' + p.id, {credentials: 'same-origin'}); if (!r.ok) return null;
    const key = await crypto.subtle.importKey('raw', Tr.unb64(p.k), 'AES-GCM', false, ['decrypt']);
    return URL.createObjectURL(new Blob([await crypto.subtle.decrypt({name: 'AES-GCM', iv: Tr.unb64(p.iv)}, key, await r.arrayBuffer())], {type: p.t || 'image/jpeg'}));
  },
  picUrls(pics) { return Promise.all((pics || [null, null, null]).map(p => this.decPic(p).catch(() => null))); },
  async save() {
    if (!this.data || !E2E.ready()) return;
    const vids = this.data.vids || [null, null, null], privEnv = (await E2E.seal({f: this.data.f, pics: this.data.pics, vids}, this.aud())).env;
    const telEnv = this.tel ? (await E2E.seal({tel: this.tel}, this.telAud())).env : null;
    const d = String(this.tel || '').replace(/\D/g, ''), telHash = d.length >= 6 ? await Book.hash(d.slice(-9)) : null;
    const r = await api('/api/me/privenv', {privEnv, telEnv, telHash, mediaIds: this.data.pics.concat(vids).filter(Boolean).map(p => p.id)});
    S.me = r.me; this.attach(S.me); keepUsers([S.me]);
  },
  // Quand les personnes autorisées changent (nouveau contact, groupe privé, numéro partagé…), on rechiffre pour elles.
  async check() {
    if (!this.data || !S.me.privEnv) return;
    const ids = a => a.map(x => String(x[0])).sort().join(','), keys = e => e ? Object.keys(e.keys || {}).sort().join(',') : '';
    if (ids(this.aud()) !== keys(S.me.privEnv) || (this.tel ? ids(this.telAud()) : '') !== keys(S.me.telEnv)) await this.save().catch(() => {});
  },
  setField(k, v) {
    if (!this.data) return; if (k === 'tel') this.tel = v; else this.data.f[k] = v; S.me.priv = Object.assign(S.me.priv || {}, {[k]: v});
    clearTimeout(this.t); this.t = setTimeout(() => this.save().catch(e => toast(e.message)), 900);
  },
  async setPic(i, bytes) { this.data.pics[i] = bytes ? await this.encPic(bytes) : null; this.urls = await this.picUrls(this.data.pics); await this.save(); },
  async setVid(i, bytes, type) { this.data.vids = this.data.vids || [null, null, null]; this.data.vids[i] = bytes ? await this.encVid(bytes, type) : null; this.vurls = await this.picUrls(this.data.vids); await this.save(); },
  // Profil d'un contact : on ouvre ses enveloppes avec notre propre clé.
  async reveal(u) {
    if (!u) return u;
    if (u.privEnv) { const p = await this.open(u.privEnv); if (p) { u.priv = Object.assign({}, p.f || {}); u.privPics = await this.picUrls(p.pics); u.privIds = (p.pics || []).map(x => x && x.id); u.privVids = this.vlist(p.vids, await this.picUrls(p.vids)); } else { u.priv = null; u.privPics = null; } }
    if (u.telEnv) { const t = await this.open(u.telEnv); if (t && t.tel) { u.priv = u.priv || {}; u.priv.tel = t.tel; } }
    return u;
  },
};

