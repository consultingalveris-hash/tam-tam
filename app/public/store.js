/* tam-tam — Données gardées sur l'appareil (chiffrées), stockage, préchargement, file d'envoi hors ligne, mesures de vitesse.
   Extrait de app.js (nov. 2026) : fichier chargé après app.js, partage ses variables globales (S, api, toast…). */
'use strict';
/* ---------- données gardées sur l'appareil, chiffrées avec une clé qui ne quitte jamais l'appareil ---------- */
const Local = {
  db: null, k: null, t: new Map(),
  name: () => 'tt-local-' + (S.me ? S.me.id : 0),
  open() { if (this.db) return this.db; this.db = new Promise((ok, ko) => { if (!window.indexedDB) return ko(); const r = indexedDB.open(this.name(), 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }).catch(() => null); return this.db; },
  async tx(mode, fn) { const db = await this.open(); if (!db) return null; return new Promise(ok => { let q; try { const t = db.transaction('kv', mode); q = fn(t.objectStore('kv')); t.oncomplete = () => ok(q && q.result); t.onerror = t.onabort = () => ok(null); } catch { ok(null); } }); },
  async key() { if (this.k) return this.k; let k = await this.tx('readonly', st => st.get('__k')); if (!k) { k = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']); await this.tx('readwrite', st => st.put(k, '__k')); } return (this.k = k); },
  async put(name, v) { const txt = typeof v === 'string' ? v : JSON.stringify(v); try { const k = await this.key(), iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, new TextEncoder().encode(txt)); await this.tx('readwrite', st => st.put({iv, ct, at: Date.now()}, name)); } catch {} },
  async get(name) { try { const r = await this.tx('readonly', st => st.get(name)); if (!r || !r.ct) return null; const k = await this.key(); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: r.iv}, k, r.ct))); } catch { return null; } },
  async del(name) { await this.tx('readwrite', st => st.delete(name)); },
  async keys() { return (await this.tx('readonly', st => st.getAllKeys())) || []; },
  async meta(name) { const r = await this.tx('readonly', st => st.get(name)); return r && r.ct ? {n: r.ct.byteLength, at: r.at} : null; },
  // Les 150 derniers messages de chaque discussion ouverte (encore chiffrés de bout en bout, comme le serveur les envoie).
  saveChat(id) { clearTimeout(this.t.get(id)); this.t.set(id, setTimeout(() => { const l = (S.msgs.get(id) || []).filter(x => x.id > 0 && x._raw).slice(-150).map(x => x._raw); if (l.length) this.put('m:' + id, l); }, 1500)); },
  wipe() { this.k = null; const n = this.name(); this.db = null; return new Promise(ok => { try { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => ok(); } catch { ok(); } }); },
};
/* ---------- écran « Gérer le stockage » ---------- */
const Stock = {
  map: null,
  async load() { if (!this.map) this.map = (await Local.get('medmap')) || {}; return this.map; },
  note(m) { if (!m || !m.media || !/^\/api\/media\//.test(m.media)) return; this.load().then(mp => { if (mp[m.media] === m.chatId) return; mp[m.media] = m.chatId; clearTimeout(this.t); this.t = setTimeout(() => Local.put('medmap', mp), 2000); }); },
  async scan() {
    const mp = await this.load(), per = new Map(), big = []; let total = 0, n = 0;
    try { const c = await caches.open('tt-media'); for (const rq of await c.keys()) { const p = new URL(rq.url).pathname, r = await c.match(rq); const sz = +(r && r.headers.get('Content-Length')) || (r ? (await r.clone().blob()).size : 0); total += sz; n++; const cid = mp[p] || 0; per.set(cid, (per.get(cid) || 0) + sz); big.push({p, sz, cid}); } } catch {}
    for (const k of await Local.keys()) { if (!/^m:\d+$/.test(k)) continue; const cid = +k.slice(2), mt = await Local.meta(k); if (mt) { per.set(cid, (per.get(cid) || 0) + mt.n); total += mt.n; } }
    let est = null; try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch {}
    return {total, n, per: [...per.entries()].sort((a, b) => b[1] - a[1]), big: big.sort((a, b) => b.sz - a.sz).slice(0, 8), est};
  },
  fmt: b => b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} Ko` : `${(b / 1e6).toLocaleString('fr-FR', {maximumFractionDigits: 1})} Mo`,
  async sheet() {
    if (!$('#stoBody')) sheet(`${head('Gérer le stockage')}<div class="sheet-body" id="stoBody"><p class="hint">Calcul de la place utilisée…</p></div>`, 'Gérer le stockage');
    const r = await this.scan(), box = $('#stoBody'); if (!box) return;
    const name = cid => { const c = cid && S.chats.get(cid); return c ? esc(chatTitle(c)) : 'Autres (statuts, souvenirs, profils)'; };
    box.innerHTML = `<p class="sto-tot"><b>${this.fmt(r.total)}</b> gardés sur cet appareil, dont ${r.n} photo${r.n > 1 ? 's' : ''} ou vidéo${r.n > 1 ? 's' : ''}.</p>
      <p class="hint">Vider ne supprime rien de vos discussions : les fichiers se téléchargent à nouveau quand vous les ouvrez.</p>
      <span class="lbl">Par discussion</span><div class="sto-list">${r.per.length ? r.per.map(([cid, sz]) => `<div class="sto-row"><span>${name(cid)}</span><b>${this.fmt(sz)}</b><button class="btn sm ghost" type="button" data-act="stoClear" data-c="${cid}">Vider</button></div>`).join('') : '<p class="hint" style="padding:8px 12px">Rien n’est encore gardé sur cet appareil.</p>'}</div>
      ${r.big.length ? `<span class="lbl">Les plus gros fichiers</span><div class="sto-list">${r.big.map(x => `<div class="sto-row"><span>${name(x.cid)}</span><b>${this.fmt(x.sz)}</b><button class="btn sm ghost" type="button" data-act="stoDrop" data-p="${esc(x.p)}">Retirer</button></div>`).join('')}</div>` : ''}
      ${r.total ? '<div class="actions"><button class="btn danger" type="button" data-act="stoAll">Tout vider sur cet appareil</button></div>' : ''}`;
  },
  async clearChat(cid) {
    const mp = await this.load(), c = await caches.open('tt-media').catch(() => null);
    if (c) for (const rq of await c.keys()) { const p = new URL(rq.url).pathname; if ((+mp[p] || 0) === +cid) { await c.delete(rq); delete mp[p]; } }
    if (+cid) await Local.del('m:' + cid); await Local.put('medmap', mp);
  },
  async drop(p) { try { const c = await caches.open('tt-media'); await c.delete(p); } catch {} },
  async all() { try { await caches.delete('tt-media'); } catch {} for (const k of await Local.keys()) if (/^m:\d+$/.test(k)) await Local.del(k); this.map = {}; await Local.put('medmap', {}); },
  async wipe() { try { await caches.delete('tt-media'); } catch {} try { indexedDB.deleteDatabase('tt-vs'); } catch {} try { localStorage.removeItem('tt-outbox:' + (S.me ? S.me.id : 0)); } catch {} await Local.wipe(); },
};
/* ---------- préchargement : la dernière photo ou vidéo reçue est déjà là quand on ouvre la discussion ---------- */
const Prefetch = {
  weak() { const c = navigator.connection || {}; return dataSaver() || !!c.saveData || /(^|-)2g$/.test(c.effectiveType || '') || !!(navigator.deviceMemory && navigator.deviceMemory < 2); },
  run() {
    if (this.weak()) return;
    const go = async () => { const list = [...S.chats.values()].filter(c => c.unread && c.last && c.last.media && /^\/api\/media\//.test(c.last.media)).slice(0, 6);
      for (const c of list) { if (this.weak()) break; try { await fetch(c.last.media, {credentials: 'same-origin'}); Stock.note({media: c.last.media, chatId: c.id}); } catch {} } };
    (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => { go(); });
  },
};
/* ---------- lecture des vidéos pendant le téléchargement ---------- */
const VStream = {
  ok: m => !!(m && m.miv && m.miv[0] === 'c' && m._key && navigator.serviceWorker && navigator.serviceWorker.controller),
  reg(id, url, key, iv, mime) { return new Promise((ok, ko) => { const ch = new MessageChannel(), t = setTimeout(() => ko(new Error('lent')), 2500); ch.port1.onmessage = () => { clearTimeout(t); ok(); }; navigator.serviceWorker.controller.postMessage({vs: id, url, key, iv, mime, keep: !Prefetch.weak()}, [ch.port2]); }); },
};
/* ---------- file d'envoi : rien ne se perd sans réseau ---------- */
const Outbox = {
  key: () => 'tt-outbox:' + (S.me ? S.me.id : 0),
  list() { try { return JSON.parse(localStorage.getItem(this.key()) || '[]'); } catch { return []; } },
  save(l) { try { localStorage.setItem(this.key(), JSON.stringify(l)); } catch {} },
  add(chatId, t, reply) { const it = {tmp: -(Date.now() * 100 + Math.floor(Math.random() * 100)), chatId, t, reply: reply || null, at: Date.now()}; this.save(this.list().concat(it)); this.show(it); return it; },
  show(it) { const list = S.msgs.get(it.chatId); if (!list || list.some(x => x.id === it.tmp)) return; list.push({id: it.tmp, chatId: it.chatId, from: S.me.id, at: it.at, kind: 'text', text: it.t, pending: true, replyTo: it.reply}); if (S.chatId === it.chatId) renderMessages(true); },
  restore(chatId) { for (const it of this.list()) if (!chatId || it.chatId === chatId) this.show(it); },
  busy: false, t: 0,
  net: e => !navigator.onLine || /connexion|réseau|trop de temps/i.test((e && e.message) || '') || (e && e.status >= 500),
  async flush() {
    if (this.busy || !S.me) return; this.busy = true;
    try {
      for (const it of this.list()) {
        const c = S.chats.get(it.chatId); if (!c) { this.drop(it.tmp); continue; }
        try { const m = await sendCore(c, it.t, it.reply, false, it.tmp); this.drop(it.tmp); onMsg(m); }
        catch (e) { if (this.net(e)) break; this.drop(it.tmp); toast(e.message); const i = $('#msgIn'); if (i && !i.value && S.chatId === it.chatId) { i.value = it.t; syncSend(); } }
      }
    } finally { this.busy = false; }
    clearTimeout(this.t); if (this.list().length) this.t = setTimeout(() => this.flush(), 8000);
  },
  drop(tmp) { this.save(this.list().filter(x => x.tmp !== tmp)); for (const l of S.msgs.values()) { const i = l.findIndex(x => x.id === tmp); if (i >= 0) l.splice(i, 1); } if (S.chatId) renderMessages(true); },
};
window.addEventListener('online', () => { if (S.offline) { S.offline = false; Promise.all([loadChats(), loadContacts(), loadStatuses()]).then(() => { renderAll(); if (S.chatId) loadMessages(S.chatId); }).catch(() => {}); } Outbox.flush(); });
/* ---------- vitesse mesurée chez les utilisateurs (des durées seulement, rien d'autre) ---------- */
const APP_V = '2.00';
const Perf = {
  q: [],
  add(k, ms) { if (!(ms >= 0) || ms > 120000) return; this.q.push([k, Math.round(ms)]); if (this.q.length >= 40) this.flush(); },
  flush() {
    if (!this.q.length || !S.me) return; const body = JSON.stringify({v: APP_V, items: this.q.splice(0, 60)});
    try { if (navigator.sendBeacon && navigator.sendBeacon('/api/perf', new Blob([body], {type: 'application/json'}))) return; } catch {}
    fetch('/api/perf', {method: 'POST', headers: {'Content-Type': 'application/json'}, body, credentials: 'same-origin', keepalive: true}).catch(() => {});
  },
};
setInterval(() => Perf.flush(), 60000);
document.addEventListener('visibilitychange', () => { if (document.hidden) Perf.flush(); });
function autoGrow(t) { const desk = matchMedia('(min-width:821px)').matches, h0 = desk ? 42 : 46; t.style.height = h0 + 'px'; t.style.height = Math.min(desk ? 130 : Math.round(innerHeight * 0.32), Math.max(h0, t.scrollHeight)) + 'px'; }
function renderReplyBar() {
  const c = S.chats.get(S.chatId), el = $('#replyBar'); if (!el || !c) return;
  if (S.editId) { el.innerHTML = `<div class="replybar editbar"><span class="quote"><b>✎ Modification du message</b><span>Vous avez 2 minutes après l’envoi pour le modifier.</span></span><button class="ib" type="button" data-act="editCancel" aria-label="Annuler la modification">${I.close}</button></div>`; return; }
  el.innerHTML = S.replyTo ? `<div class="replybar">${quoteHtml(c, S.replyTo)}<button class="ib" type="button" data-act="replyCancel" aria-label="Annuler la réponse">${I.close}</button></div>` : '';
}

