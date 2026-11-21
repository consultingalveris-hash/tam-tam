// tam-tam — capacité et fluidité (demande du 21/11/2026 : être prévenu À L'AVANCE qu'il faut plus de serveurs ou de relais).
// Chaque minute : personnes connectées, appels en cours, messages, temps de réponse du serveur, retard du programme,
// mémoire, charge des processeurs et débit du serveur (relevé par etat-hote). Chaque jour : le pic de la journée.
// Les appareils envoient en fin d'appel un résumé de la qualité (sans aucun contenu) : passé ou non par le relais,
// temps d'aller-retour, pertes, images par seconde. Tout cela apparaît dans la page « état du serveur » (bloc capacite),
// et le propriétaire reçoit un e-mail dès que le niveau passe à orange (prévoir) ou rouge (agir maintenant).
import fs from 'node:fs';
import os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { BASE_URL, DAY, OWNER, Rfor, db, now, q1, qa, run, streams, tooMany } from './core.mjs';
import { gcalls } from './groupes.mjs';
import { sendMail, mailHtml } from './messages.mjs';

const R = Rfor(8);
const HOTE = process.env.ETAT_HOTE || '/hote/etat.json';
// Capacité du palier en cours (plan de croissance) : personnes connectées en même temps, et débit du serveur.
export const CAP = { personnes: +process.env.CAPACITE_PERSONNES || 1000, debitMbps: +process.env.CAPACITE_DEBIT_MBPS || 250 };

db.exec(`CREATE TABLE IF NOT EXISTS cap_min(at INTEGER PRIMARY KEY, j TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cap_jour(jour TEXT PRIMARY KEY, j TEXT NOT NULL);`);

const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
let reqs = []; // temps de réponse de l'API (ms) sur la minute en cours
export function mesurer(ms) { if (reqs.length < 20000) reqs.push(ms); }
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const jourDe = t => new Date(t).toISOString().slice(0, 10);
const hote = () => { try { return JSON.parse(fs.readFileSync(HOTE, 'utf8')); } catch { return null; } };

function releve() {
  const t = now(), h = hote(), r = reqs; reqs = [];
  let sse = 0; for (const s of streams.values()) sse += s.size;
  let gpart = 0; for (const g of gcalls.values()) gpart += g.parts.size;
  const appels = q1(`SELECT COUNT(*) n FROM calls WHERE kind='direct' AND status='answered' AND ended IS NULL AND started>?`, t - 4 * 3600_000).n;
  const net = h && h.reseau && Date.parse(h.reseau.mesure || 0) > t - 15 * 60_000 ? h.reseau : null;
  const m = {
    personnes: streams.size, connexions: sse, appels, appelsGroupe: gpart,
    messagesMin: q1(`SELECT COUNT(*) n FROM messages WHERE created_at>?`, t - 60_000).n,
    reqMin: r.length, repMoyMs: r.length ? Math.round(r.reduce((s, x) => s + x, 0) / r.length) : 0, rep95Ms: Math.round(pct(r, 0.95)),
    retardMs: Math.round(lag.percentile(99) / 1e6), memProgMo: Math.round(process.memoryUsage().rss / 1048576),
    chargeCpu: Math.round(os.loadavg()[0] / Math.max(1, os.cpus().length) * 100) / 100,
    memServeur: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    debitMbps: net ? Math.round(Math.max(net.mbpsEntrant || 0, net.mbpsSortant || 0) * 10) / 10 : null,
  };
  lag.reset();
  run(`INSERT OR REPLACE INTO cap_min(at,j) VALUES(?,?)`, t, JSON.stringify(m));
  run(`DELETE FROM cap_min WHERE at<?`, t - 2 * DAY);
  // pic du jour
  const jr = jourDe(t), old = q1(`SELECT j FROM cap_jour WHERE jour=?`, jr), d = old ? JSON.parse(old.j) : {};
  const up = (k, v, w) => { if (v != null && (d[k] == null || v > d[k])) { d[k] = v; if (w) d[w] = new Date(t).toISOString().slice(11, 16); } };
  up('personnesMax', m.personnes, 'heurePic'); up('appelsMax', m.appels); up('appelsGroupeMax', m.appelsGroupe); up('messagesMinMax', m.messagesMin);
  up('rep95MaxMs', m.rep95Ms); up('retardMaxMs', m.retardMs); up('chargeCpuMax', m.chargeCpu); up('memServeurMax', m.memServeur); up('debitMaxMbps', m.debitMbps);
  run(`INSERT OR REPLACE INTO cap_jour(jour,j) VALUES(?,?)`, jr, JSON.stringify(d));
  run(`DELETE FROM cap_jour WHERE jour<?`, jourDe(t - 60 * DAY));
  alerter(statut());
}
setInterval(() => { try { releve(); } catch (e) { console.error('capacite', e); } }, +process.env.CAPACITE_INTERVALLE_MS || 60_000).unref();

// Qualité des appels, envoyée par l'appareil en fin d'appel (aucun contenu, aucun numéro).
R('POST', /^\/api\/call\/qualite$/, async ({ me, body }) => {
  if (tooMany('cq:' + me.id, 30, 60 * 60_000)) return { ok: true };
  const n = (v, max) => { const x = +v; return Number.isFinite(x) && x >= 0 ? Math.min(x, max) : null; };
  const q = { dur: n(body.dur, 6 * 3600), rtt: n(body.rtt, 10_000), perte: n(body.perte, 1), relais: !!body.relais, ips: n(body.ips, 60), video: !!body.video, groupe: !!body.groupe };
  if (!q.dur || q.dur < 5) return { ok: true }; // appels de moins de 5 s : pas significatifs
  const mauvais = (q.perte != null && q.perte > 0.05) || (q.rtt != null && q.rtt > 400) || (q.video && q.ips != null && q.ips < 12);
  const jr = jourDe(now()), old = q1(`SELECT j FROM cap_jour WHERE jour=?`, jr), d = old ? JSON.parse(old.j) : {};
  const a = d.appelsQualite || { total: 0, relais: 0, mauvais: 0, rttSomme: 0, rttN: 0, perteSomme: 0, perteN: 0, minutes: 0, minutesRelais: 0 };
  a.total++; if (q.relais) { a.relais++; a.minutesRelais += q.dur / 60; } if (mauvais) a.mauvais++; a.minutes += q.dur / 60;
  if (q.rtt != null) { a.rttSomme += q.rtt; a.rttN++; } if (q.perte != null) { a.perteSomme += q.perte; a.perteN++; }
  d.appelsQualite = a; run(`INSERT OR REPLACE INTO cap_jour(jour,j) VALUES(?,?)`, jr, JSON.stringify(d));
  return { ok: true };
});

// Niveau : vert (tout va bien), orange (prévoir le palier suivant), rouge (agir maintenant). Chaque raison est écrite simplement.
export function statut() {
  const t = now(), mins = qa(`SELECT j FROM cap_min WHERE at>? ORDER BY at`, t - 15 * 60_000).map(r => JSON.parse(r.j));
  const jours = qa(`SELECT jour, j FROM cap_jour ORDER BY jour DESC LIMIT 30`).map(r => ({ jour: r.jour, ...JSON.parse(r.j) }));
  const last = mins.at(-1) || {}, max = k => Math.max(0, ...mins.map(m => m[k] || 0));
  const o = [], rge = [];
  const pic = Math.max(max('personnes'), (jours[0] || {}).personnesMax || 0), part = pic / CAP.personnes;
  if (part >= 0.9) rge.push(`${pic} personnes connectées en même temps, soit ${Math.round(part * 100)} % de la capacité du serveur (${CAP.personnes})`);
  else if (part >= 0.7) o.push(`${pic} personnes connectées en même temps, soit ${Math.round(part * 100)} % de la capacité du serveur (${CAP.personnes})`);
  const rep = max('rep95Ms'); if (rep > 1500) rge.push(`le serveur met jusqu'à ${(rep / 1000).toFixed(1)} s à répondre`); else if (rep > 500) o.push(`le serveur met jusqu'à ${(rep / 1000).toFixed(1)} s à répondre`);
  const ret = max('retardMs'); if (ret > 300) rge.push(`le programme prend du retard (${ret} ms)`); else if (ret > 100) o.push(`le programme commence à prendre du retard (${ret} ms)`);
  const cpu = max('chargeCpu'); if (cpu > 0.9) rge.push(`processeurs occupés à ${Math.round(cpu * 100)} %`); else if (cpu > 0.7) o.push(`processeurs occupés à ${Math.round(cpu * 100)} %`);
  const mem = max('memServeur'); if (mem > 90) rge.push(`mémoire du serveur utilisée à ${mem} %`); else if (mem > 80) o.push(`mémoire du serveur utilisée à ${mem} %`);
  const deb = max('debitMbps'), pd = deb / CAP.debitMbps; if (pd > 0.85) rge.push(`débit à ${Math.round(pd * 100)} % (${deb} Mbit/s sur ${CAP.debitMbps})`); else if (pd > 0.6) o.push(`débit à ${Math.round(pd * 100)} % (${deb} Mbit/s sur ${CAP.debitMbps}) : les appels relayés pèsent`);
  const h = hote(); const disque = h && parseInt(h.disqueUtilise, 10); if (disque > 90) rge.push(`disque plein à ${disque} %`); else if (disque > 80) o.push(`disque plein à ${disque} %`);
  const aq = (jours[0] || {}).appelsQualite; if (aq && aq.total >= 10) { const pm = aq.mauvais / aq.total; if (pm > 0.25) rge.push(`${Math.round(pm * 100)} % des appels d'aujourd'hui ont été de mauvaise qualité`); else if (pm > 0.1) o.push(`${Math.round(pm * 100)} % des appels d'aujourd'hui ont été de mauvaise qualité`); }
  // Tendance : au rythme des 7 derniers jours, dans combien de jours atteint-on 90 % de la capacité ?
  let dans = null; const p7 = jours.slice(0, 8).map(j => j.personnesMax || 0);
  if (p7.length >= 4 && p7[0] > 0) { const ancien = p7.at(-1) || 1, g = Math.pow(Math.max(p7[0], 1) / Math.max(ancien, 1), 1 / (p7.length - 1)); if (g > 1.001) { dans = Math.ceil(Math.log(0.9 * CAP.personnes / p7[0]) / Math.log(g)); if (dans < 0) dans = 0; if (dans <= 30 && !rge.length) o.push(`au rythme actuel, 90 % de la capacité seront atteints dans environ ${dans} jours`); } }
  const niveau = rge.length ? 'rouge' : o.length ? 'orange' : 'vert';
  return { niveau, raisons: rge.length ? rge.concat(o) : o, maintenant: last, capacite: CAP, joursAvantLimite: dans, paliers: 'voir le document « Tam-Tam : plan de croissance et coûts »',
    jours: jours.slice(0, 14).map(j => ({ jour: j.jour, personnesMax: j.personnesMax || 0, heurePic: j.heurePic || null, appelsMax: j.appelsMax || 0, appelsGroupeMax: j.appelsGroupeMax || 0, messagesMinMax: j.messagesMinMax || 0, rep95MaxMs: j.rep95MaxMs || 0, retardMaxMs: j.retardMaxMs || 0, chargeCpuMax: j.chargeCpuMax || 0, memServeurMax: j.memServeurMax || 0, debitMaxMbps: j.debitMaxMbps ?? null,
      appels: j.appelsQualite ? { total: j.appelsQualite.total, parLeRelais: j.appelsQualite.relais, mauvaiseQualite: j.appelsQualite.mauvais, minutes: Math.round(j.appelsQualite.minutes), minutesRelais: Math.round(j.appelsQualite.minutesRelais), allerRetourMoyMs: j.appelsQualite.rttN ? Math.round(j.appelsQualite.rttSomme / j.appelsQualite.rttN) : null, pertesMoy: j.appelsQualite.perteN ? Math.round(j.appelsQualite.perteSomme / j.appelsQualite.perteN * 1000) / 10 + ' %' : null } : null })) };
}

// E-mail au propriétaire : orange au plus une fois par jour, rouge au plus une fois toutes les 6 heures.
let suite = 0;
function alerter(s) {
  if (!OWNER || s.niveau === 'vert') { suite = 0; return; }
  if (++suite < 3) return; // 3 minutes de suite : pas d'alerte pour un pic passager
  const k = 'cap_alerte_' + s.niveau, prev = +(q1(`SELECT v FROM settings WHERE k=?`, k)?.v || 0);
  if (now() - prev < (s.niveau === 'rouge' ? 6 : 24) * 3600_000) return;
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, k, String(now()));
  const titre = s.niveau === 'rouge' ? 'Tam-Tam – capacité : à traiter maintenant' : 'Tam-Tam – capacité : prévoir la montée en puissance';
  const conseil = s.niveau === 'rouge'
    ? 'Le serveur arrive à sa limite : il faut passer au palier suivant dès maintenant (serveur plus puissant, relais d’appels séparé), sinon les membres vont subir des lenteurs et des coupures.'
    : 'Le serveur tient encore, mais la limite approche : c’est le moment de préparer le palier suivant (et son financement) pour ne pas être pris de court.';
  sendMail(OWNER, titre, mailHtml(titre, `<p>${conseil}</p><ul>${s.raisons.map(r => `<li>${r}</li>`).join('')}</ul><p>Le détail des paliers et de leur coût est dans le document « Tam-Tam : plan de croissance et coûts ». Serveur : ${BASE_URL.replace(/^https?:\/\//, '')}.</p>`)).catch(() => {});
}
