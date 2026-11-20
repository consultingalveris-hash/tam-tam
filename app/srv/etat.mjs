// tam-tam — page « état du serveur » pour l'audit de sécurité quotidien (audit du 19/11/2026).
// Elle montre seulement un résumé : connexions refusées, erreurs, comptes administrateurs, nouveaux comptes,
// et ce que le serveur lui-même a noté (connexions à distance, clés d'accès, programmes lancés, mises à jour).
// Aucun message, aucune donnée privée des membres. Elle n'est lisible qu'avec la clé ETAT_SECRET
// (créée par l'installateur, envoyée une fois par e-mail au propriétaire) : sans elle, la page n'existe pas (404).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { BASE_URL, DAY, E, blockedNow, OWNER, Rfor, db, ipOf, now, q1, qa, run, sha, tooMany } from './core.mjs';
import { sendMail, mailHtml } from './messages.mjs';

const R = Rfor(8);
const KEY = Buffer.from(String(process.env.ETAT_SECRET || ''));
const HOTE = process.env.ETAT_HOTE || '/hote/etat.json';
const T0 = now();

db.exec(`CREATE TABLE IF NOT EXISTS etat_journal(at INTEGER NOT NULL, kind TEXT NOT NULL, path TEXT, ip TEXT);
CREATE INDEX IF NOT EXISTS etat_at ON etat_journal(at);`);

// Adresse raccourcie (dernier morceau masqué) : assez pour repérer une attaque, sans garder l'adresse exacte des membres.
const mask = ip => { const v = String(ip || '').replace(/^::ffff:/, ''); if (v.includes('.')) return v.split('.').slice(0, 3).join('.') + '.x'; if (v.includes(':')) return v.split(':').slice(0, 3).join(':') + ':…'; return v.slice(0, 40); };
let n = 0;
export function noter(kind, path, ip) {
  try {
    run(`INSERT INTO etat_journal(at,kind,path,ip) VALUES(?,?,?,?)`, now(), String(kind).slice(0, 20), path == null ? null : String(path).replace(/\/[A-Za-z0-9_-]{16,}/g, '/…').slice(0, 80), ip ? mask(ip) : null);
    if (++n % 200 === 0) run(`DELETE FROM etat_journal WHERE at<?`, now() - 8 * DAY);
  } catch { /* le journal ne doit jamais gêner Tam-Tam */ }
}
noter('demarrage', null, null);

const keyOk = v => { const b = Buffer.from(String(v || '')); return KEY.length >= 24 && b.length === KEY.length && crypto.timingSafeEqual(b, KEY); };
const groupe = (since, col, extra = '') => qa(`SELECT ${col} k, COUNT(*) n FROM etat_journal WHERE at>? ${extra} GROUP BY ${col} ORDER BY n DESC LIMIT 8`, since);

R('GET', /^\/api\/etat$/, ({ req, url, res }) => {
  // Sans la bonne clé : la page « n'existe pas », et les essais sont limités.
  // Audit du 20/11/2026 : seuls les essais avec une mauvaise clé sont comptés (les visites du propriétaire ne le bloquent plus).
  const k = 'etat:' + ipOf(req);
  if (blockedNow(k, 20, 60 * 60_000) || !keyOk(url.searchParams.get('cle'))) { tooMany(k, 20, 60 * 60_000); if (KEY.length) noter('etat-refus', '/api/etat', ipOf(req)); E(404, 'Adresse inconnue.'); }
  res.setHeader('X-Robots-Tag', 'noindex'); res.setHeader('Cache-Control', 'no-store');
  const t = now(), j1 = t - DAY, j7 = t - 7 * DAY;
  let hote = null; try { hote = JSON.parse(fs.readFileSync(HOTE, 'utf8')); } catch { /* pas de résumé du serveur */ }
  const mailMasque = e => String(e || '').replace(/^(.).*?(.)?@/, (m, a, b) => a + '…' + (b || '') + '@');
  return {
    adresse: BASE_URL, genere: new Date(t).toISOString(), enMarcheDepuis: new Date(T0).toISOString(),
    comptes: {
      total: q1(`SELECT COUNT(*) n FROM users`).n,
      crees24h: q1(`SELECT COUNT(*) n FROM users WHERE created_at>?`, j1).n,
      crees7j: q1(`SELECT COUNT(*) n FROM users WHERE created_at>?`, j7).n,
      administrateurs: qa(`SELECT id, handle, email, created_at FROM users WHERE admin=1 ORDER BY id`).map(u => ({ id: u.id, pseudo: u.handle, email: mailMasque(u.email), proprietaire: u.email === OWNER, cree: new Date(u.created_at).toISOString() })),
      sessionsOuvertes24h: q1(`SELECT COUNT(*) n FROM sessions WHERE created>?`, j1).n,
    },
    refus24h: { parType: groupe(j1, 'kind', `AND kind LIKE 'refus%'`), parAdresseDePage: groupe(j1, 'path', `AND kind LIKE 'refus%'`), parVisiteur: groupe(j1, 'ip', `AND kind LIKE 'refus%'`) },
    refus7j: groupe(j7, 'kind', `AND kind LIKE 'refus%'`),
    clesFaussesPourCettePage7j: q1(`SELECT COUNT(*) n FROM etat_journal WHERE at>? AND kind='etat-refus'`, j7).n,
    erreurs24h: q1(`SELECT COUNT(*) n FROM etat_journal WHERE at>? AND kind IN ('erreur','plantage')`, j1).n,
    dernieresErreurs: qa(`SELECT at, kind, path FROM etat_journal WHERE kind IN ('erreur','plantage') ORDER BY at DESC LIMIT 10`).map(r => ({ quand: new Date(r.at).toISOString(), type: r.kind, page: r.path })),
    redemarrages7j: qa(`SELECT at FROM etat_journal WHERE at>? AND kind='demarrage' ORDER BY at DESC LIMIT 20`, j7).map(r => new Date(r.at).toISOString()),
    serveur: hote || 'non disponible (le résumé du serveur LWS n’a pas encore été écrit)',
  };
}, false);

// Une seule fois par clé : le propriétaire reçoit par e-mail l'adresse de la page (pour l'audit quotidien).
setTimeout(async () => {
  if (KEY.length < 24 || !OWNER) return; const tag = sha(KEY.toString() + BASE_URL);
  if (q1(`SELECT v FROM settings WHERE k='etat_mail'`)?.v === tag) return;
  const lien = `${BASE_URL}/api/etat?cle=${encodeURIComponent(KEY.toString())}`;
  try {
    const ok = await sendMail(OWNER, 'Tam-Tam : adresse de la page « état du serveur » (pour l’audit de sécurité)', mailHtml('Page « état du serveur »',
      `<p>Voici l’adresse secrète de la page qui résume l’état du serveur (${BASE_URL.replace(/^https?:\/\//, '')}) : connexions refusées, erreurs, comptes administrateurs, accès au serveur.</p><p style="word-break:break-all;font-size:13px;background:#eef6f7;padding:10px;border-radius:8px">${lien}</p><p>L’audit de sécurité quotidien la lit chaque matin. Ne transférez pas ce message et ne publiez pas cette adresse.</p>`));
    if (ok) run(`INSERT OR REPLACE INTO settings(k,v) VALUES('etat_mail',?)`, tag);
  } catch { /* nouvel essai au prochain démarrage */ }
}, 20_000).unref();
