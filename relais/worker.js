// Relais Tam-Tam pour Cloudflare Workers : un second chemin vers le même serveur.
// Il ne voit que des données chiffrées (les messages restent chiffrés de bout en bout) et ne garde rien.
const ORIGINE = 'https://secours.tam-tam.africa';
export default {
  async fetch(req) {
    const u = new URL(req.url), dest = new URL(u.pathname + u.search, ORIGINE);
    const h = new Headers(req.headers);
    h.set('x-tt-origin', u.host);
    h.set('x-tt-client', req.headers.get('cf-connecting-ip') || '');
    return fetch(new Request(dest, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' }));
  },
};
