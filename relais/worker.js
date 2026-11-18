// Relais Tam-Tam pour Cloudflare Workers : un second chemin vers le même serveur.
// Il ne voit que des données chiffrées (les messages restent chiffrés de bout en bout) et ne garde rien.
const ORIGINE = 'https://secours.tam-tam.africa';
export default {
  async fetch(req, env) {
    const u = new URL(req.url), dest = new URL(u.pathname + u.search, ORIGINE);
    const h = new Headers(req.headers);
    h.set('x-tt-origin', u.host);
    h.set('x-tt-client', req.headers.get('cf-connecting-ip') || '');
    // Mot de passe partagé avec le serveur (variable RELAY_SECRET du Worker) : sans lui, le serveur ne croit pas l'adresse transmise.
    h.delete('x-tt-relay'); if (env && env.RELAY_SECRET) h.set('x-tt-relay', env.RELAY_SECRET);
    return fetch(new Request(dest, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' }));
  },
};
