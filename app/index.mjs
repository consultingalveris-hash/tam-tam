// tam-tam — serveur. Le code est rangé par sujet dans srv/ (noyau, comptes, appels, groupes, messages, google, traduction) ;
// ce fichier les charge dans l’ordre (l’ordre fixe celui des routes) puis démarre le serveur HTTP.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ALT_ORIGINS, BASE_URL, E, HttpError, PORT, PUB, currentUser, fail, readJson, routes, secure, send, serveFile } from './srv/core.mjs';
import './srv/comptes.mjs';
import './srv/appels.mjs';
import { LK_URL } from './srv/groupes.mjs';
import './srv/messages.mjs';
import './srv/google.mjs';
import './srv/traduction.mjs';

// Ordre des routes : celui des fichiers (rang), puis celui de déclaration dans chaque fichier (tri stable).
routes.sort((a, b) => a.rank - b.rank);

/* ---------- serveur ---------- */
const SEC = { ...(secure ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), 'Permissions-Policy': 'geolocation=(self), payment=()', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self' blob:${LK_URL && !LK_URL.includes(new URL(BASE_URL).host) ? ' ' + new URL(LK_URL).origin : ''}${[BASE_URL, ...ALT_ORIGINS].map(o => ' ' + o + (LK_URL ? ' ' + o.replace(/^https/, 'wss') : '')).join('')}; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` };
const server = http.createServer(async (req, res) => {
  let url, p;
  try { url = new URL(req.url, BASE_URL); p = url.pathname; } catch { return send(res, 400, 'Adresse invalide'); }
  try {
    if (p.startsWith('/api/')) {
      // Protection contre les requêtes venues d'autres sites.
      if (req.method !== 'GET') { const o = req.headers.origin; if (o && o !== BASE_URL && !ALT_ORIGINS.includes(o) && !(BASE_URL.startsWith('http://localhost') && o.startsWith('http://localhost'))) E(403, 'Origine refusée.'); }
      const rt = routes.find(r => r.method === req.method && r.re.test(p)); if (!rt) E(404, 'Adresse inconnue.');
      const me = currentUser(req); if (rt.auth && !me) E(401, 'Connectez-vous.');
      const body = req.method === 'POST' && !/^\/api\/media(\/up\/[A-Za-z0-9_-]+\/chunk)?$/.test(p) ? await readJson(req) : {};
      const out = await rt.fn({ req, res, url, body, me, m: p.match(rt.re) });
      if (out !== null && !res.headersSent) send(res, 200, out);
      return;
    }
    if (p === '/demo' ) { res.writeHead(301, { Location: '/demo/' }); return res.end(); }
    if (p === '/demo/') return serveFile(res, path.join(PUB, 'demo/index.html'), { 'X-Robots-Tag': 'noindex', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    if (p === '/conditions') return serveFile(res, path.join(PUB, 'conditions.html'), SEC);
    if (p === '/supprimer-compte') return serveFile(res, path.join(PUB, 'supprimer-compte.html'), SEC);
    if (p === '/telecharger') return serveFile(res, path.join(PUB, 'telecharger.html'), SEC);
    if (p === '/tam-tam.apk') return serveFile(res, path.join(PUB, 'tam-tam.apk'), { ...SEC, 'Content-Disposition': 'attachment; filename="tam-tam.apk"' });
    if (p === '/ambassadeurs') return serveFile(res, path.join(PUB, 'ambassadeurs.html'), SEC);
    if (p === '/' || /^\/(invite|reset|add)\/[A-Za-z0-9_-]+$/.test(p)) return serveFile(res, path.join(PUB, 'app.html'), SEC);
    const f = path.normalize(path.join(PUB, p)); if (!f.startsWith(PUB + path.sep) || f.includes(path.join(PUB, 'demo'))) return send(res, 404, 'Page introuvable');
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f, SEC);
    send(res, 404, 'Page introuvable');
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.code, e.message);
    console.error(e); if (!res.headersSent) fail(res, 500, 'Erreur du serveur. Réessayez.');
  }
});
// Filet de sécurité : une erreur imprévue est notée dans le journal au lieu d'arrêter Tam-Tam pour tout le monde.
process.on('unhandledRejection', e => console.error('erreur non gérée', e));
process.on('uncaughtException', e => console.error('erreur non gérée', e));
server.listen(PORT, () => console.log(`tam-tam en écoute sur ${PORT} — ${BASE_URL}`));
