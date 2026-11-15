// Visiteurs de la vitrine (tam-tam.africa) : bulle de discussion et formulaire « Nous écrire ».
// Un visiteur reçoit un petit compte « invité » (sans mot de passe ni e-mail réel) relié au compte du porteur (OWNER) :
// ses messages arrivent dans le Tam-Tam du porteur comme une discussion normale, et la réponse revient en direct dans la bulle.
// Comme partout dans Tam-Tam, les messages sont chiffrés de bout en bout : la clé du visiteur reste dans son navigateur.
// Seul le formulaire « Nous écrire » passe aussi en clair par le serveur, le temps d'envoyer la copie par e-mail (rien n'est gardé).
import { BASE_URL, DAY, E, OWNER, Rfor, clean, cookies, db, ipOf, isEmail, memberIds, msgOut, now, pair, portraitFor, presence, pushMany, q1, qa, rnd, run, secure, sha, shownOnline, streams, tooMany } from './core.mjs';
import { webPush } from './appels.mjs';
import { envPick } from './comptes.mjs';
import { getTransport, mailHtml, sendMail } from './messages.mjs';
import { translateText, trConf, trKey, trLangs } from './traduction.mjs';

const R = Rfor(8);
for (const sql of [`ALTER TABLE users ADD COLUMN guest TEXT`, `CREATE TABLE IF NOT EXISTS visit_sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL)`]) { try { db.exec(sql); } catch {} }

// Adresse de la vitrine : web.tam-tam.africa → tam-tam.africa (sur le site d'essai, c'est la même adresse).
export const VITRINE_ORIGIN = (() => { try { const u = new URL(BASE_URL); return u.protocol + '//' + u.host.replace(/^web\./, ''); } catch { return ''; } })();
const CONTACT_MAIL = (process.env.CONTACT_MAIL || 'consultingalveris@gmail.com').trim();
const KEEP = 60 * DAY; // un visiteur silencieux depuis 60 jours est effacé
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

const owner = () => OWNER ? q1(`SELECT * FROM users WHERE email=?`, OWNER) : null;
function guestOf(req) {
  const tok = cookies(req).tt_v; if (!tok) return null;
  return q1(`SELECT u.* FROM visit_sessions v JOIN users u ON u.id=v.user_id WHERE v.token=? AND v.expires>? AND u.guest IS NOT NULL`, sha(tok), now()) || null;
}
const needGuest = req => guestOf(req) || E(401, 'Session de discussion expirée. Rechargez la page.');
const chatOf = (g, o) => q1(`SELECT * FROM chats WHERE direct_key=?`, pair(g.id, o.id).join('-'));
const pubOk = p => p && typeof p.x === 'string' && typeof p.y === 'string' && p.x.length < 100 && p.y.length < 100 && /^[A-Za-z0-9_-]+$/.test(p.x + p.y);
const ownerCard = o => ({ id: o.id, name: 'Équipe Tam-Tam', pubkey: o.pubkey ? JSON.parse(o.pubkey) : null, online: shownOnline(o.id) });

// État de la bulle : le porteur (sa clé publique, en ligne ou non) et, si le visiteur a déjà écrit, sa discussion.
R('GET', /^\/api\/visite\/etat$/, async ({ req }) => {
  const o = owner(); if (!o || !o.pubkey) return { off: true };
  const g = guestOf(req), out = { owner: ownerCard(o) };
  if (g) {
    const c = chatOf(g, o);
    out.guest = { id: g.id, name: g.name.replace(/ · visiteur du site$/, '') };
    if (c) { out.chatId = c.id; out.msgs = qa(`SELECT * FROM (SELECT * FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 80) ORDER BY id`, c.id).map(msgOut); }
    run(`UPDATE users SET last_seen=? WHERE id=?`, now(), g.id);
  }
  return out;
}, false);

// Premier message : création du compte invité, du lien avec le porteur et de la discussion.
R('POST', /^\/api\/visite\/debut$/, async ({ req, res, body }) => {
  const o = owner(); if (!o || !o.pubkey) E(503, 'La discussion n’est pas disponible pour le moment.');
  const old = guestOf(req); if (old) return { guest: { id: old.id }, chatId: chatOf(old, o)?.id };
  if (tooMany('visite:' + ipOf(req), 6, 60 * 60_000)) E(429, 'Trop de nouvelles discussions depuis cette connexion. Réessayez plus tard.');
  const name = clean(body.name, 40).replace(/[<>]/g, ''); if (name.length < 2) E(400, 'Indiquez votre prénom.');
  const contact = clean(body.contact, 120); if (!pubOk(body.pubkey)) E(400, 'Clé de chiffrement invalide. Rechargez la page.');
  const t = now(), handle = 'visiteur.' + rnd(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  const gid = Number(run(`INSERT INTO users(email,pass,name,handle,avatar,cgu_at,created_at,listed,last_seen,pubkey,guest) VALUES(?,?,?,?,?,?,?,0,?,?,?)`,
    `${handle}@visiteur.invalid`, '!', name + ' · visiteur du site', handle, null, t, t, t, JSON.stringify({ kty: 'EC', crv: 'P-256', x: body.pubkey.x, y: body.pubkey.y }), JSON.stringify({ contact, ip: sha(ipOf(req)).slice(0, 16) })).lastInsertRowid);
  run(`UPDATE users SET avatar=? WHERE id=?`, portraitFor(gid), gid);
  const [a, b] = pair(gid, o.id);
  run(`INSERT OR IGNORE INTO contacts(a,b,status,requester,created_at) VALUES(?,?,'accepted',?,?)`, a, b, gid, t);
  const cid = Number(run(`INSERT INTO chats(type,direct_key,created_by,created_at) VALUES('direct',?,?,?)`, `${a}-${b}`, gid, t).lastInsertRowid);
  for (const u of [gid, o.id]) run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, cid, u, t);
  const tok = rnd(32); run(`INSERT INTO visit_sessions(token,user_id,expires) VALUES(?,?,?)`, sha(tok), gid, t + KEEP);
  res.setHeader('Set-Cookie', `tt_v=${tok}; Path=/api/visite; HttpOnly; SameSite=Lax; Max-Age=${KEEP / 1000}${secure ? '; Secure' : ''}`);
  pushMany([o.id], { t: 'chats' }); pushMany([o.id], { t: 'contacts' });
  return { guest: { id: gid }, chatId: cid };
}, false);

function store(g, o, body, label) {
  const c = chatOf(g, o); if (!c) E(404, 'Discussion introuvable.');
  const env = body.enc; if (!env || typeof env !== 'object' || typeof env.ct !== 'string' || typeof env.iv !== 'string' || typeof env.keys !== 'object') E(400, 'Message chiffré invalide.');
  const text = JSON.stringify(envPick(env)); if (text.length > 30000) E(413, 'Message trop long.');
  const id = Number(run(`INSERT INTO messages(chat_id,sender,kind,text,e2e,created_at) VALUES(?,?,'text',?,1,?)`, c.id, g.id, text, now()).lastInsertRowid);
  run(`UPDATE members SET last_read=? WHERE chat_id=? AND user_id=?`, id, c.id, g.id);
  run(`UPDATE users SET last_seen=? WHERE id=?`, now(), g.id);
  run(`UPDATE visit_sessions SET expires=? WHERE user_id=?`, now() + KEEP, g.id);
  const msg = msgOut(q1(`SELECT * FROM messages WHERE id=?`, id));
  pushMany(memberIds(c.id), { t: 'msg', msg });
  webPush(o.id, { title: g.name, body: label, tag: 'chat-' + c.id, url: '/?chat=' + c.id });
  return msg;
}

R('POST', /^\/api\/visite\/message$/, async ({ req, body }) => {
  const g = needGuest(req), o = owner(); if (!o) E(503, 'Indisponible.');
  if (tooMany('vmsg:' + g.id, 20, 60_000)) E(429, 'Vous écrivez trop vite. Patientez un instant.');
  return { msg: store(g, o, body, '💬 Nouveau message depuis le site') };
}, false);

// Formulaire « Nous écrire » : le message chiffré arrive dans Tam-Tam, et une copie part par e-mail (si l'envoi d'e-mails est réglé).
// Traduction pour le visiteur : il lit les réponses de l'équipe dans sa langue (le texte ne fait que passer, rien n'est gardé).
R('POST', /^\/api\/visite\/traduire$/, async ({ req, body }) => {
  const g = needGuest(req); if (!trKey()) return { text: '' };
  const text = String(body.text || '').slice(0, 2000).trim(), to = String(body.to || '');
  if (!text || !trLangs(trConf()).includes(to)) return { text: '' };
  if (tooMany('vtr:' + g.id, 80, 60 * 60_000)) return { text: '' };
  try { const t = await translateText(text, to); return { text: t.text || '', from: t.from || null }; } catch { return { text: '' }; }
}, false);
R('POST', /^\/api\/visite\/formulaire$/, async ({ req, body }) => {
  const g = needGuest(req), o = owner(); if (!o) E(503, 'Indisponible.');
  if (tooMany('vform:' + ipOf(req), 5, 60 * 60_000)) E(429, 'Trop de messages envoyés. Réessayez plus tard.');
  const f = { nom: clean(body.nom, 80), email: clean(body.email, 120), tel: clean(body.tel, 40), objet: clean(body.objet, 120), message: clean(body.message, 4000) };
  if (f.nom.length < 2 || !isEmail(f.email) || f.message.length < 10) E(400, 'Merci de remplir le nom, l’e-mail et le message (10 caractères au moins).');
  if (!f.objet) f.objet = 'Sans objet';
  const msg = store(g, o, body, '📩 Nouveau message du formulaire : ' + f.objet.slice(0, 60));
  run(`UPDATE users SET guest=? WHERE id=?`, JSON.stringify({ contact: f.email + (f.tel ? ' · ' + f.tel : '') }), g.id);
  let mailed = false;
  if (getTransport()) {
    try {
      mailed = await sendMail(CONTACT_MAIL, `Tam-Tam · Nous écrire : ${f.objet}`, mailHtml('Nouveau message depuis tam-tam.africa',
        `<p><b>Nom :</b> ${esc(f.nom)}<br><b>E-mail :</b> ${esc(f.email)}<br><b>Téléphone :</b> ${esc(f.tel || '—')}<br><b>Objet :</b> ${esc(f.objet)}</p><p style="white-space:pre-wrap;background:#f4fbfc;border-radius:10px;padding:12px">${esc(f.message)}</p><p>Vous pouvez aussi lui répondre directement dans Tam-Tam (discussion « ${esc(f.nom)} · visiteur du site »).</p>`));
    } catch (e) { console.error('formulaire : e-mail non envoyé', e.message); }
  }
  return { msg, mailed };
}, false);

R('POST', /^\/api\/visite\/lu$/, async ({ req, body }) => {
  const g = needGuest(req), o = owner(); const c = o && chatOf(g, o); if (!c) return { ok: true };
  const mx = q1(`SELECT MAX(id) x FROM messages WHERE chat_id=?`, c.id).x || 0, v = Math.min(Math.max(0, +body.upTo || 0), mx);
  run(`UPDATE members SET last_read=MAX(last_read,?) WHERE chat_id=? AND user_id=?`, v, c.id, g.id);
  pushMany(memberIds(c.id), { t: 'read', chatId: c.id, user: g.id, upTo: v });
  return { ok: true };
}, false);

// Flux en direct pour la bulle : réponses du porteur, « en train d'écrire », présence.
R('GET', /^\/api\/visite\/flux$/, async ({ req, res }) => {
  const g = guestOf(req); if (!g) E(401, 'Pas de discussion.');
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 4000\ndata: {"t":"hello"}\n\n`);
  if (!streams.has(g.id)) streams.set(g.id, new Set());
  const set = streams.get(g.id), first = set.size === 0;
  if (set.size >= 4) { const old = set.values().next().value; set.delete(old); try { old.end(); } catch {} }
  set.add(res); if (first) presence(g.id);
  req.on('close', () => { set.delete(res); if (!set.size) { streams.delete(g.id); run(`UPDATE users SET last_seen=? WHERE id=?`, now(), g.id); presence(g.id); } });
  return null;
}, false);

// Ménage : les visiteurs silencieux depuis 60 jours sont effacés (leur discussion disparaît aussi chez le porteur).
function sweep() {
  const old = qa(`SELECT id FROM users WHERE guest IS NOT NULL AND COALESCE(last_seen, created_at) < ?`, now() - KEEP);
  for (const u of old) {
    for (const c of qa(`SELECT chat_id FROM members WHERE user_id=?`, u.id)) { const mem = memberIds(c.chat_id); run(`DELETE FROM chats WHERE id=?`, c.chat_id); pushMany(mem, { t: 'chats' }); }
    run(`DELETE FROM users WHERE id=?`, u.id);
  }
  run(`DELETE FROM visit_sessions WHERE expires<?`, now());
}
setTimeout(sweep, 60_000); setInterval(sweep, 6 * 3600_000);
