/* tam-tam — travailleur de fond : notifications et ouverture hors connexion. */
const CACHE = 'tamtam-v99';
const SHELL = ['/', '/style.css', '/kit.js', '/secure.js', '/app.js', '/call.js', '/gcall.js', '/device.js', '/tabs.js', '/emoji.js', '/camera.js', '/memories.js', '/sounds.js', '/secours.js', '/icon.svg', '/logo-tamtam.svg', '/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const MEDIA = 'tt-media';
/* Lecture d'une vidéo pendant son téléchargement : la page confie ici la clé du message (elle ne sort jamais de l'appareil),
   le travailleur va chercher les seuls morceaux demandés par le lecteur et les déchiffre au vol. */
const vsDb = () => new Promise((ok, ko) => { const r = indexedDB.open('tt-vs', 1); r.onupgradeneeded = () => r.result.createObjectStore('vs'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const vsTx = async (mode, fn) => { const db = await vsDb(); return new Promise(ok => { const t = db.transaction('vs', mode), q = fn(t.objectStore('vs')); t.oncomplete = () => ok(q && q.result); t.onerror = t.onabort = () => ok(null); }); };
const VS = new Map();
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.vs) { d.at = Date.now(); VS.set(d.vs, d); e.waitUntil(vsTx('readwrite', st => st.put(d, d.vs)).then(() => e.ports[0] && e.ports[0].postMessage('ok'))); }
  if (d.mediaClear) e.waitUntil(caches.delete(MEDIA).then(() => vsTx('readwrite', st => st.clear())).then(() => e.ports[0] && e.ports[0].postMessage('ok')));
});
const ivAt = (base, i) => { const v = new Uint8Array(base); const dv = new DataView(v.buffer); dv.setUint32(8, dv.getUint32(8) ^ i); return v; };
async function vstream(req, id, ev) {
  // Lecture par le lecteur vidéo seulement : jamais une page ouverte à cette adresse (un piège envoyé par lien).
  if (req.mode === 'navigate' || req.destination === 'document' || req.destination === 'iframe') return new Response('', {status: 404});
  const v = VS.get(id) || await vsTx('readonly', st => st.get(id)); if (!v) return new Response('', {status: 404});
  VS.set(id, v);
  // Déjà gardée sur l'appareil : lue sans réseau. Sinon, elle se garde en arrière-plan pendant qu'on la regarde.
  if (!v.buf) { const hit = await (await caches.open(MEDIA)).match(v.url); if (hit) { v.buf = new Uint8Array(await hit.arrayBuffer()); v.enc = v.buf.length; } else if (v.keep && !v.filling) { v.filling = true; ev.waitUntil(fetch(v.url, {credentials: 'same-origin'}).then(async r => { if (r.status === 200 && !/no-store/.test(r.headers.get('Cache-Control') || '')) await (await caches.open(MEDIA)).put(v.url, r); }).catch(() => {})); } }
  const m = /^c(\d+):(.+)$/.exec(v.iv); const CK = +m[1], E = CK + 16, base = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (!v.total && v.buf) v.total = v.enc - 16 * Math.ceil(v.enc / E);
  if (!v.total) {
    const h = await fetch(v.url, {headers: {Range: 'bytes=0-0'}, credentials: 'same-origin'}); const cr = h.headers.get('Content-Range');
    v.enc = cr ? +cr.split('/')[1] : +(h.headers.get('Content-Length') || 0); v.total = v.enc - 16 * Math.ceil(v.enc / E);
  }
  const rg = /bytes=(\d+)-(\d*)/.exec(req.headers.get('Range') || ''); const a = rg ? +rg[1] : 0; let b = rg && rg[2] ? +rg[2] : v.total - 1;
  if (a >= v.total) return new Response('', {status: 416, headers: {'Content-Range': `bytes */${v.total}`}});
  b = Math.min(b, v.total - 1, rg ? a + CK * 8 - 1 : Infinity);
  const i0 = Math.floor(a / CK), i1 = Math.floor(b / CK);
  const from = i0 * E, to = Math.min(v.enc - 1, (i1 + 1) * E - 1);
  const buf = v.buf ? v.buf.subarray(from, to + 1) : new Uint8Array(await (await fetch(v.url, {headers: {Range: `bytes=${from}-${to}`}, credentials: 'same-origin'})).arrayBuffer()), out = new Uint8Array((i1 - i0 + 1) * CK); let len = 0;
  for (let i = i0; i <= i1; i++) { const off = (i - i0) * E; const p = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: ivAt(base, i)}, v.key, buf.subarray(off, off + E))); out.set(p, len); len += p.length; }
  const s0 = a - i0 * CK, body = out.slice(s0, s0 + (b - a + 1));
  return new Response(body, {status: rg ? 206 : 200, headers: {'Content-Type': /^(video|audio)\/[\w.+-]{1,40}$/.test(v.mime || '') ? v.mime : 'video/mp4', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", ...(rg ? {'Content-Range': `bytes ${a}-${a + body.length - 1}/${v.total}`} : {}), 'Content-Length': String(body.length), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'}});
}
// Photos et vidéos chiffrées : gardées sur l'appareil après le premier chargement (elles restent illisibles sans la clé).
async function mediaFirst(req) {
  const c = await caches.open(MEDIA), hit = await c.match(req.url); if (hit) return hit;
  const r = await fetch(req); const cc = r.headers.get('Cache-Control') || '';
  if (r.status === 200 && !/no-store/.test(cc) && +(r.headers.get('Content-Length') || 0) < 45_000_000) c.put(req.url, r.clone()).catch(() => {});
  return r;
}
// Toujours la version en ligne d'abord ; la copie ne sert que sans connexion. Les autres données (/api) ne sont jamais gardées.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'GET' && u.origin === location.origin && u.pathname.startsWith('/vs/')) return e.respondWith(vstream(e.request, u.pathname.slice(4), e).catch(() => new Response('', {status: 502})));
  if (e.request.method === 'GET' && u.origin === location.origin && /^\/api\/media\/[A-Za-z0-9_-]{10,40}$/.test(u.pathname) && !e.request.headers.get('Range')) return e.respondWith(mediaFirst(e.request).catch(() => fetch(e.request)));
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/demo')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && SHELL.includes(u.pathname)) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(u.pathname, cp)); } return r; })
    .catch(() => caches.match(e.request.mode === 'navigate' ? '/' : u.pathname).then(r => r || new Response('Pas de connexion', { status: 503 }))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'tam-tam', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    // pastille sur l'icône de l'écran d'accueil (nombre de messages non lus)
    if (typeof d.badge === 'number' && self.navigator.setAppBadge) { try { d.badge ? await self.navigator.setAppBadge(d.badge) : await self.navigator.clearAppBadge(); } catch {} }
    if (d.close) { const ns = await self.registration.getNotifications({ tag: d.tag }); ns.forEach(n => n.close()); return; }
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // tam-tam est ouvert et visible : l'application sonne elle-même
    if (list.some(c => c.visibilityState === 'visible') && !/^test/.test(d.tag || '')) return;
    return self.registration.showNotification(d.title || 'tam-tam', { body: d.body || '', icon: '/icon-192.png', badge: '/badge-96.png', tag: d.tag || 'tamtam', renotify: true,
      requireInteraction: !!d.ring, vibrate: d.ring ? [700, 400, 700, 400, 700, 400, 700] : [120, 80, 120],
      actions: d.ring ? [{ action: 'answer', title: 'Répondre' }] : [], data: { url: d.url || '/' } });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => new URL(x.url).origin === location.origin);
    if (c) { c.postMessage({ open: url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
