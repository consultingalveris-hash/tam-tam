/* tam-tam — travailleur de fond : notifications et ouverture hors connexion. */
const CACHE = 'tamtam-v75';
const SHELL = ['/', '/style.css', '/kit.js', '/secure.js', '/app.js', '/call.js', '/gcall.js', '/device.js', '/tabs.js', '/emoji.js', '/camera.js', '/memories.js', '/sounds.js', '/icon.svg', '/logo-tamtam.svg', '/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Toujours la version en ligne d'abord ; la copie ne sert que sans connexion. Les données (/api) ne sont jamais gardées.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
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
