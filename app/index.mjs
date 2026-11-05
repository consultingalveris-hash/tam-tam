// tam-tam — version 1 (serveur)
// Comptes sur invitation, demandes d'ami, discussions en temps réel (SSE), photos, statuts 24 h, blocage, signalement.
// Aucune dépendance : Node 22 (node:sqlite intégré).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import nodemailer from 'nodemailer';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'var');
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const OWNER = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
const PUB = path.join(ROOT, 'public');
const MEDIA = path.join(DATA_DIR, 'media');
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'tamtam.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE, avatar TEXT, photo TEXT, pub TEXT NOT NULL DEFAULT '{}', priv TEXT NOT NULL DEFAULT '{}',
  priv_to TEXT NOT NULL DEFAULT 'contacts', admin INTEGER NOT NULL DEFAULT 0, invited_by INTEGER, cgu_at INTEGER NOT NULL,
  last_seen INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites(code TEXT PRIMARY KEY, by_user INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uses INTEGER NOT NULL DEFAULT 0, max_uses INTEGER NOT NULL DEFAULT 20, expires INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contacts(a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL, requester INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(a,b));
CREATE TABLE IF NOT EXISTS blocks(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY(user_id,blocked));
CREATE TABLE IF NOT EXISTS close_group(owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, member INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(owner,member));
CREATE TABLE IF NOT EXISTS chats(id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT, direct_key TEXT UNIQUE, created_by INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS members(chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read INTEGER NOT NULL DEFAULT 0, admin INTEGER NOT NULL DEFAULT 0, joined_at INTEGER NOT NULL, PRIMARY KEY(chat_id,user_id));
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE, sender INTEGER,
  kind TEXT NOT NULL, text TEXT, media TEXT, reply_to INTEGER, deleted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS msg_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, mime TEXT NOT NULL, size INTEGER NOT NULL,
  scope TEXT, ref INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS statuses(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  text TEXT, bg INTEGER, media TEXT, aud TEXT NOT NULL, created_at INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS status_views(status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE, viewer INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL, PRIMARY KEY(status_id,viewer));
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY, by_user INTEGER, target_user INTEGER, chat_id INTEGER, reason TEXT NOT NULL, note TEXT,
  created_at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
`);
for (const sql of [`ALTER TABLE users ADD COLUMN pubkey TEXT`, `ALTER TABLE users ADD COLUMN keybackup TEXT`, `ALTER TABLE messages ADD COLUMN e2e INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE media ADD COLUMN enc INTEGER NOT NULL DEFAULT 0`]) { try { db.exec(sql); } catch {} }
db.exec(`CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS codes(email TEXT PRIMARY KEY, code TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL);`);
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const qa = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const now = () => Date.now();
const DAY = 864e5;

/* ---------- outils ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rnd = (n = 24) => crypto.randomBytes(n).toString('base64url');
function hashPass(p) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(p, salt, 64); return salt.toString('hex') + ':' + h.toString('hex'); }
function checkPass(p, stored) {
  const [s, h] = String(stored).split(':'); if (!s || !h) return false;
  const c = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex'));
}
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);
const pair = (x, y) => x < y ? [x, y] : [y, x];
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const AV_D = /^[fm][1-6]$/, AV_C = ['turq', 'bleu', 'violet', 'rouge', 'orange', 'vert', 'rose', 'brun', 'noir'];
const AV_ST = ['court', 'afro', 'tresses', 'foulard', 'locks', 'chignon', 'carre', 'chauve'], AV_SH = ['#14b8c9', '#1d4e89', '#2f9e66', '#f2b705', '#e2531f', '#c8102e', '#7b2cbf', '#db2777', '#475569'];
function avatarJson(a) {
  if (a && a.v === 2) { if (!AV_ST.includes(a.st) || !/^[a-f]$/.test(a.sk) || !AV_SH.includes(a.sh)) return null; return JSON.stringify({ v: 2, st: a.st, sk: a.sk, sh: a.sh, f: !!a.f, b: !!a.b, g: !!a.g, e: !!a.e }); }
  if (a && AV_D.test(a.d) && AV_C.includes(a.c)) return JSON.stringify({ d: a.d, c: a.c });
  return null;
}
const PUB_K = ['bio', 'metier', 'ville', 'langues', 'interets', 'bd', 'bm'];
const PRIV_K = ['tel', 'annee', 'mail', 'adresse', 'travail', 'famille'];
function slugHandle(name) {
  const base = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20) || 'membre';
  let h = base, i = 1; while (q1(`SELECT 1 FROM users WHERE handle=?`, h)) h = `${base}${++i}`; return h;
}

/* ---------- relations ---------- */
const blockedEither = (x, y) => !!q1(`SELECT 1 FROM blocks WHERE (user_id=? AND blocked=?) OR (user_id=? AND blocked=?)`, x, y, y, x);
const iBlocked = (x, y) => !!q1(`SELECT 1 FROM blocks WHERE user_id=? AND blocked=?`, x, y);
function relation(me, other) {
  if (me === other) return 'me';
  const [a, b] = pair(me, other), r = q1(`SELECT * FROM contacts WHERE a=? AND b=?`, a, b);
  if (!r) return 'none';
  if (r.status === 'accepted') return 'contact';
  return r.requester === me ? 'sent' : 'received';
}
const contactIds = me => qa(`SELECT CASE WHEN a=? THEN b ELSE a END AS id FROM contacts WHERE (a=? OR b=?) AND status='accepted'`, me, me, me).map(r => r.id);
const isMember = (chatId, uid) => !!q1(`SELECT 1 FROM members WHERE chat_id=? AND user_id=?`, chatId, uid);
const memberIds = chatId => qa(`SELECT user_id FROM members WHERE chat_id=?`, chatId).map(r => r.user_id);

/* ---------- temps réel (Server-Sent Events) ---------- */
const streams = new Map(); // userId -> Set(res)
const online = uid => (streams.get(uid)?.size || 0) > 0;
function push(uid, ev) {
  const s = streams.get(uid); if (!s) return;
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of s) { try { res.write(data); } catch {} }
}
const pushMany = (ids, ev) => ids.forEach(id => push(id, ev));
function presence(uid) { const ids = contactIds(uid); pushMany(ids, { t: 'presence', id: uid, online: online(uid), lastSeen: q1(`SELECT last_seen FROM users WHERE id=?`, uid)?.last_seen || null }); }
setInterval(() => { for (const s of streams.values()) for (const res of s) { try { res.write(': ping\n\n'); } catch {} } }, 25_000);

/* ---------- formats de sortie ---------- */
const mediaUrl = id => id ? `/api/media/${id}` : null;
function userCard(u, me) {
  if (!u) return null;
  const pub = J(u.pub, {}), rel = me ? relation(me, u.id) : 'none';
  const card = { id: u.id, name: u.name, handle: u.handle, avatar: J(u.avatar, null), photo: mediaUrl(u.photo), rel, online: rel === 'contact' || rel === 'me' ? online(u.id) : undefined,
    lastSeen: rel === 'contact' ? u.last_seen : undefined, pub: {}, mutual: 0, pubkey: u.pubkey ? J(u.pubkey, null) : null };
  for (const k of PUB_K) if (pub[k] != null && pub[k] !== '') card.pub[k] = pub[k];
  if (me && me !== u.id) {
    const mine = new Set(contactIds(me)); card.mutual = contactIds(u.id).filter(x => mine.has(x)).length;
    card.blocked = iBlocked(me, u.id);
    if (canSeePriv(u, me)) card.priv = J(u.priv, {});
  }
  return card;
}
function canSeePriv(u, me) {
  if (u.id === me) return true;
  if (u.priv_to === 'me') return false;
  if (relation(me, u.id) !== 'contact' || blockedEither(me, u.id)) return false;
  if (u.priv_to === 'grp') return !!q1(`SELECT 1 FROM close_group WHERE owner=? AND member=?`, u.id, me);
  return true;
}
const getUser = id => q1(`SELECT * FROM users WHERE id=?`, id);
function msgOut(m) {
  if (!m) return null;
  return { id: m.id, chatId: m.chat_id, from: m.sender, kind: m.kind, text: m.deleted || m.e2e ? '' : m.text, enc: m.e2e && !m.deleted ? J(m.text, null) : null,
    media: m.deleted ? null : mediaUrl(m.media), replyTo: m.reply_to, deleted: !!m.deleted, at: m.created_at };
}
function chatOut(c, me) {
  const mem = qa(`SELECT m.user_id, m.last_read, m.admin FROM members m WHERE m.chat_id=?`, c.id);
  const mine = mem.find(x => x.user_id === me);
  const last = q1(`SELECT * FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT 1`, c.id);
  const unread = q1(`SELECT COUNT(*) n FROM messages WHERE chat_id=? AND id>? AND (sender IS NULL OR sender<>?)`, c.id, mine ? mine.last_read : 0, me).n;
  const others = mem.filter(x => x.user_id !== me);
  const out = { id: c.id, type: c.type, name: c.name, createdAt: c.created_at, unread, last: msgOut(last),
    members: mem.map(x => ({ id: x.user_id, lastRead: x.last_read, admin: !!x.admin })),
    users: Object.fromEntries(mem.map(x => [x.user_id, userCard(getUser(x.user_id), me)])) };
  if (c.type === 'direct') { const o = others[0] && getUser(others[0].user_id); out.peer = o ? o.id : null; out.blocked = o ? blockedEither(me, o.id) : false; }
  return out;
}
function statusVisible(s, viewer) {
  if (s.user_id === viewer) return true;
  if (s.expires < now() || blockedEither(s.user_id, viewer)) return false;
  if (relation(viewer, s.user_id) !== 'contact') return false;
  if (s.aud === 'private') return !!q1(`SELECT 1 FROM close_group WHERE owner=? AND member=?`, s.user_id, viewer);
  return true;
}

/* ---------- entretien et sauvegardes ---------- */
function sweep() {
  run(`DELETE FROM sessions WHERE expires<?`, now()); run(`DELETE FROM resets WHERE expires<?`, now());
  for (const s of qa(`SELECT id, media FROM statuses WHERE expires<?`, now())) { if (s.media) dropMedia(s.media); run(`DELETE FROM statuses WHERE id=?`, s.id); }
  for (const m of qa(`SELECT id FROM media WHERE scope IS NULL AND created_at<?`, now() - DAY)) dropMedia(m.id);
}
function dropMedia(id) { try { fs.rmSync(path.join(MEDIA, id)); } catch {} run(`DELETE FROM media WHERE id=?`, id); }
setInterval(sweep, 10 * 60_000); sweep();
function backup() {
  const day = new Date().toISOString().slice(0, 10), f = path.join(DATA_DIR, 'backups', `tamtam-${day}.db`);
  if (!fs.existsSync(f)) { try { db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); } catch (e) { console.error('sauvegarde', e.message); } }
  for (const x of fs.readdirSync(path.join(DATA_DIR, 'backups')).sort().slice(0, -14)) fs.rmSync(path.join(DATA_DIR, 'backups', x));
}
backup(); setInterval(backup, 3600_000);

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
const fail = (res, code, msg) => send(res, code, { error: msg });
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const E = (code, msg) => { throw new HttpError(code, msg); };
function serveFile(res, file, extra = {}) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Page introuvable');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extra }); res.end(buf);
  });
}
async function readBody(req, max) {
  let size = 0; const chunks = [];
  for await (const ch of req) { size += ch.length; if (size > max) E(413, 'Fichier trop lourd'); chunks.push(ch); }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  if (!/application\/json/.test(req.headers['content-type'] || '')) E(415, 'Format attendu : JSON');
  try { return JSON.parse((await readBody(req, 200_000)).toString('utf8') || '{}'); } catch (e) { if (e instanceof HttpError) throw e; E(400, 'Requête illisible'); }
}
function cookies(req) { const o = {}; for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } return o; }
const secure = BASE_URL.startsWith('https');
function setSession(res, userId) {
  const tok = rnd(32); run(`INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)`, sha(tok), userId, now() + 365 * DAY);
  res.setHeader('Set-Cookie', `tt_s=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${secure ? '; Secure' : ''}`);
}
function currentUser(req) {
  const tok = cookies(req).tt_s; if (!tok) return null;
  return q1(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?`, sha(tok), now()) || null;
}
const attempts = new Map();
function tooMany(key, max = 10, win = 15 * 60_000) {
  const t = now(), a = (attempts.get(key) || []).filter(x => t - x < win); a.push(t); attempts.set(key, a); return a.length > max;
}
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function meOut(u) {
  return { ...userCard(u, u.id), email: u.email, priv: J(u.priv, {}), privTo: u.priv_to, admin: !!u.admin,
    close: qa(`SELECT member FROM close_group WHERE owner=?`, u.id).map(r => r.member),
    blocked: qa(`SELECT blocked FROM blocks WHERE user_id=?`, u.id).map(r => userCard(getUser(r.blocked), u.id)).filter(Boolean),
    cguAt: u.cgu_at, createdAt: u.created_at };
}
function inviteValid(code) { const i = code && q1(`SELECT * FROM invites WHERE code=?`, code); return i && i.expires > now() && i.uses < i.max_uses ? i : null; }

/* ---------- routes ---------- */
const routes = [];
const R = (method, re, fn, auth = true) => routes.push({ method, re, fn, auth });

R('GET', /^\/api\/meta$/, async ({ req, url }) => {
  const code = url.searchParams.get('invite'), inv = inviteValid(code);
  const n = q1(`SELECT COUNT(*) n FROM users`).n;
  return { mail: !!getTransport(), ownerSetup: n === 0, ownerEmail: n === 0 && OWNER ? OWNER.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
    invite: inv ? { by: getUser(inv.by_user)?.name || '' } : null };
}, false);

R('POST', /^\/api\/register$/, async ({ req, res, body }) => {
  if (tooMany('reg:' + ipOf(req), 8, 60 * 60_000)) E(429, 'Trop de tentatives. Réessayez plus tard.');
  const email = clean(body.email, 120).toLowerCase(), name = clean(body.name, 40), pass = String(body.pass || '');
  if (!name) E(400, 'Indiquez votre nom.');
  if (!isEmail(email)) E(400, 'Adresse e-mail invalide.');
  if (pass.length < 8) E(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  if (!body.cgu) E(400, 'Acceptez les Conditions générales pour créer votre compte.');
  if (!body.age) E(400, 'tam-tam est réservé aux personnes de 16 ans et plus.');
  const first = q1(`SELECT COUNT(*) n FROM users`).n === 0;
  let inv = null;
  if (first) { if (OWNER && email !== OWNER) E(403, 'Le premier compte est réservé au propriétaire de tam-tam.'); }
  else { inv = inviteValid(clean(body.invite, 60)); if (!inv) E(403, 'Il faut un lien d’invitation valide pour s’inscrire.'); }
  if (q1(`SELECT 1 FROM users WHERE email=?`, email)) E(409, 'Un compte existe déjà avec cette adresse. Connectez-vous.');
  const av = avatarJson(body.avatar) || JSON.stringify({ v: 2, st: 'court', sk: 'c', sh: '#14b8c9' });
  const id = run(`INSERT INTO users(email,pass,name,handle,avatar,admin,invited_by,cgu_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
    email, hashPass(pass), name, slugHandle(name), av, first ? 1 : 0, inv ? inv.by_user : null, now(), now()).lastInsertRowid;
  if (inv) {
    run(`UPDATE invites SET uses=uses+1 WHERE code=?`, inv.code);
    // La personne qui invite et l'invité deviennent contacts directement : l'invitation vaut acceptation.
    const [a, b] = pair(Number(id), inv.by_user); run(`INSERT OR IGNORE INTO contacts(a,b,status,requester,created_at) VALUES(?,?,'accepted',?,?)`, a, b, inv.by_user, now());
    push(inv.by_user, { t: 'contacts' });
  }
  setSession(res, Number(id));
  return { me: meOut(getUser(Number(id))) };
}, false);

R('POST', /^\/api\/login$/, async ({ req, res, body }) => {
  const email = clean(body.email, 120).toLowerCase();
  if (tooMany('login:' + ipOf(req)) || tooMany('login:' + email)) E(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
  const u = q1(`SELECT * FROM users WHERE email=?`, email);
  if (!u || !checkPass(body.pass, u.pass)) E(401, 'E-mail ou mot de passe incorrect.');
  setSession(res, u.id); return { me: meOut(u) };
}, false);

R('POST', /^\/api\/logout$/, async ({ req, res }) => {
  const tok = cookies(req).tt_s; if (tok) run(`DELETE FROM sessions WHERE token=?`, sha(tok));
  res.setHeader('Set-Cookie', 'tt_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return { ok: true };
}, false);

R('POST', /^\/api\/reset$/, async ({ req, res, body }) => {
  if (tooMany('reset:' + ipOf(req))) E(429, 'Trop de tentatives.');
  const r = q1(`SELECT * FROM resets WHERE token=? AND expires>?`, sha(String(body.token || '')), now());
  if (!r) E(400, 'Ce lien n’est plus valable. Demandez-en un nouveau.');
  if (String(body.pass || '').length < 8) E(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(body.pass), r.user_id); run(`DELETE FROM resets WHERE user_id=?`, r.user_id);
  run(`DELETE FROM sessions WHERE user_id=?`, r.user_id); setSession(res, r.user_id); return { me: meOut(getUser(r.user_id)) };
}, false);

R('GET', /^\/api\/me$/, async ({ me }) => ({ me: meOut(me) }));
R('POST', /^\/api\/me$/, async ({ me, body }) => {
  if (body.name != null) { const n = clean(body.name, 40); if (!n) E(400, 'Indiquez votre nom.'); run(`UPDATE users SET name=? WHERE id=?`, n, me.id); }
  if (body.handle != null) {
    const h = clean(body.handle, 24).toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9][a-z0-9._]{2,23}$/.test(h)) E(400, 'Le pseudo doit faire 3 à 24 caractères : lettres, chiffres, point ou tiret bas.');
    if (q1(`SELECT 1 FROM users WHERE handle=? AND id<>?`, h, me.id)) E(409, 'Ce pseudo est déjà pris.');
    run(`UPDATE users SET handle=? WHERE id=?`, h, me.id);
  }
  if (body.avatar) { const aj = avatarJson(body.avatar); if (!aj) E(400, 'Avatar inconnu.'); run(`UPDATE users SET avatar=? WHERE id=?`, aj, me.id); }
  if (body.photo === null) { if (me.photo) dropMedia(me.photo); run(`UPDATE users SET photo=NULL WHERE id=?`, me.id); }
  else if (body.photo) {
    const m = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.photo), me.id); if (!m) E(400, 'Photo introuvable.');
    if (me.photo) dropMedia(me.photo); run(`UPDATE media SET scope='avatar', ref=? WHERE id=?`, me.id, m.id); run(`UPDATE users SET photo=? WHERE id=?`, m.id, me.id);
  }
  if (body.pub) { const p = J(me.pub, {}); for (const k of PUB_K) if (k in body.pub) p[k] = clean(body.pub[k], k === 'bio' ? 200 : 80); run(`UPDATE users SET pub=? WHERE id=?`, JSON.stringify(p), me.id); }
  if (body.priv) { const p = J(me.priv, {}); for (const k of PRIV_K) if (k in body.priv) p[k] = clean(body.priv[k], 120); run(`UPDATE users SET priv=? WHERE id=?`, JSON.stringify(p), me.id); }
  if (body.privTo) { if (!['me', 'contacts', 'grp'].includes(body.privTo)) E(400, 'Choix inconnu.'); run(`UPDATE users SET priv_to=? WHERE id=?`, body.privTo, me.id); }
  if (Array.isArray(body.close)) {
    const ok = new Set(contactIds(me.id)); run(`DELETE FROM close_group WHERE owner=?`, me.id);
    for (const x of body.close.map(Number).filter(x => ok.has(x)).slice(0, 500)) run(`INSERT OR IGNORE INTO close_group(owner,member) VALUES(?,?)`, me.id, x);
  }
  return { me: meOut(getUser(me.id)) };
});
R('POST', /^\/api\/me\/password$/, async ({ me, body }) => {
  if (!checkPass(body.old, me.pass)) E(400, 'Le mot de passe actuel est incorrect.');
  if (String(body.pass || '').length < 8) E(400, 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(body.pass), me.id); return { ok: true };
});
R('POST', /^\/api\/me\/delete$/, async ({ me, body, res }) => {
  if (!checkPass(body.pass, me.pass)) E(400, 'Mot de passe incorrect.');
  for (const m of qa(`SELECT id FROM media WHERE owner=?`, me.id)) dropMedia(m.id);
  run(`UPDATE messages SET sender=NULL, text=NULL, media=NULL, deleted=1 WHERE sender=?`, me.id);
  run(`DELETE FROM users WHERE id=?`, me.id);
  run(`DELETE FROM chats WHERE type='direct' AND id NOT IN (SELECT chat_id FROM members GROUP BY chat_id HAVING COUNT(*)>=2)`);
  res.setHeader('Set-Cookie', 'tt_s=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); return { ok: true };
});

/* invitations */
R('POST', /^\/api\/invites$/, async ({ me }) => {
  if (q1(`SELECT COUNT(*) n FROM invites WHERE by_user=? AND created_at>?`, me.id, now() - DAY).n >= 20) E(429, 'Vous avez créé beaucoup d’invitations aujourd’hui. Réessayez demain.');
  const code = rnd(9); run(`INSERT INTO invites(code,by_user,expires,created_at) VALUES(?,?,?,?)`, code, me.id, now() + 14 * DAY, now());
  return { code, url: `${BASE_URL}/invite/${code}`, expires: now() + 14 * DAY };
});

/* personnes et contacts */
R('GET', /^\/api\/users\/search$/, async ({ me, url }) => {
  const q = clean(url.searchParams.get('q'), 60).toLowerCase().replace(/^@/, ''); if (q.length < 2) return { users: [] };
  const rows = qa(`SELECT * FROM users WHERE id<>? AND (handle LIKE ? OR email=? OR lower(name) LIKE ?) LIMIT 30`, me.id, q + '%', q, '%' + q + '%');
  return { users: rows.filter(u => !blockedEither(me.id, u.id)).slice(0, 20).map(u => userCard(u, me.id)) };
});
R('GET', /^\/api\/users\/(\d+)$/, async ({ me, m }) => {
  const u = getUser(+m[1]); if (!u || (blockedEither(me.id, u.id) && !iBlocked(me.id, u.id))) E(404, 'Personne introuvable.');
  return { user: userCard(u, me.id) };
});
R('GET', /^\/api\/contacts$/, async ({ me }) => {
  const rows = qa(`SELECT * FROM contacts WHERE a=? OR b=?`, me.id, me.id), out = { contacts: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const other = r.a === me.id ? r.b : r.a, u = getUser(other); if (!u) continue; const c = userCard(u, me.id);
    if (r.status === 'accepted') out.contacts.push(c); else if (r.requester === me.id) out.outgoing.push(c); else if (!iBlocked(me.id, other)) out.incoming.push(c);
  }
  out.contacts.sort((x, y) => x.name.localeCompare(y.name, 'fr'));
  // Suggestions : contacts de mes contacts.
  const mine = new Set(out.contacts.map(c => c.id).concat(rows.map(r => r.a === me.id ? r.b : r.a))), seen = new Set(), sug = [];
  for (const c of out.contacts) for (const id of contactIds(c.id)) if (id !== me.id && !mine.has(id) && !seen.has(id) && !blockedEither(me.id, id)) { seen.add(id); sug.push(userCard(getUser(id), me.id)); }
  out.suggestions = sug.sort((a, b) => b.mutual - a.mutual).slice(0, 12);
  return out;
});
R('POST', /^\/api\/contacts\/(request|accept|decline|remove)$/, async ({ me, m, body }) => {
  const id = +body.id, u = getUser(id); if (!u || id === me.id) E(404, 'Personne introuvable.');
  const [a, b] = pair(me.id, id), r = q1(`SELECT * FROM contacts WHERE a=? AND b=?`, a, b);
  if (m[1] === 'request') {
    if (blockedEither(me.id, id)) E(403, 'Impossible d’ajouter cette personne.');
    if (tooMany('req:' + me.id, 40, 60 * 60_000)) E(429, 'Trop de demandes envoyées. Réessayez plus tard.');
    if (!r) run(`INSERT INTO contacts(a,b,status,requester,created_at) VALUES(?,?,'pending',?,?)`, a, b, me.id, now());
    else if (r.status === 'pending' && r.requester !== me.id) run(`UPDATE contacts SET status='accepted' WHERE a=? AND b=?`, a, b);
  } else if (m[1] === 'accept') {
    if (!r || r.status !== 'pending' || r.requester === me.id) E(400, 'Aucune demande à accepter.');
    run(`UPDATE contacts SET status='accepted' WHERE a=? AND b=?`, a, b);
  } else run(`DELETE FROM contacts WHERE a=? AND b=?`, a, b);
  push(id, { t: 'contacts' }); push(me.id, { t: 'contacts' });
  return { user: userCard(u, me.id) };
});
R('POST', /^\/api\/block$/, async ({ me, body }) => {
  const id = +body.id; if (!getUser(id) || id === me.id) E(404, 'Personne introuvable.');
  if (body.on) { run(`INSERT OR IGNORE INTO blocks(user_id,blocked,created_at) VALUES(?,?,?)`, me.id, id, now()); const [a, b] = pair(me.id, id); run(`DELETE FROM contacts WHERE a=? AND b=? AND status='pending'`, a, b); }
  else run(`DELETE FROM blocks WHERE user_id=? AND blocked=?`, me.id, id);
  push(id, { t: 'contacts' }); push(me.id, { t: 'contacts' });
  return { me: meOut(getUser(me.id)) };
});
R('POST', /^\/api\/report$/, async ({ me, body }) => {
  const reason = clean(body.reason, 80); if (!reason) E(400, 'Choisissez un motif.');
  if (tooMany('rep:' + me.id, 20, DAY)) E(429, 'Trop de signalements aujourd’hui.');
  run(`INSERT INTO reports(by_user,target_user,chat_id,reason,note,created_at) VALUES(?,?,?,?,?,?)`, me.id, body.userId ? +body.userId : null, body.chatId ? +body.chatId : null, reason, clean(body.note, 4000), now());
  for (const a of qa(`SELECT id FROM users WHERE admin=1`)) push(a.id, { t: 'report' });
  return { ok: true };
});

/* discussions */
R('GET', /^\/api\/chats$/, async ({ me }) => {
  const rows = qa(`SELECT c.* FROM chats c JOIN members m ON m.chat_id=c.id WHERE m.user_id=?`, me.id);
  return { chats: rows.map(c => chatOut(c, me.id)).sort((a, b) => (b.last?.at || b.createdAt) - (a.last?.at || a.createdAt)) };
});
R('POST', /^\/api\/chats\/direct$/, async ({ me, body }) => {
  const id = +body.userId; if (relation(me.id, id) !== 'contact') E(403, 'Vous devez d’abord être en contact avec cette personne.');
  const key = pair(me.id, id).join('-'); let c = q1(`SELECT * FROM chats WHERE direct_key=?`, key);
  if (!c) {
    const cid = run(`INSERT INTO chats(type,direct_key,created_by,created_at) VALUES('direct',?,?,?)`, key, me.id, now()).lastInsertRowid;
    for (const u of [me.id, id]) run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, cid, u, now());
    c = q1(`SELECT * FROM chats WHERE id=?`, cid);
  }
  return { chat: chatOut(c, me.id) };
});
R('POST', /^\/api\/chats\/group$/, async ({ me, body }) => {
  const name = clean(body.name, 50); if (!name) E(400, 'Donnez un nom au groupe.');
  const ok = new Set(contactIds(me.id)), ids = [...new Set((body.members || []).map(Number))].filter(x => ok.has(x)).slice(0, 100);
  if (!ids.length) E(400, 'Choisissez au moins un contact.');
  const cid = Number(run(`INSERT INTO chats(type,name,created_by,created_at) VALUES('group',?,?,?)`, name, me.id, now()).lastInsertRowid);
  run(`INSERT INTO members(chat_id,user_id,admin,joined_at) VALUES(?,?,1,?)`, cid, me.id, now());
  for (const u of ids) run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, cid, u, now());
  sysMsg(cid, `${me.name} a créé le groupe « ${name} »`);
  pushMany(ids, { t: 'chats' });
  return { chat: chatOut(q1(`SELECT * FROM chats WHERE id=?`, cid), me.id) };
});
function sysMsg(cid, text) {
  const id = run(`INSERT INTO messages(chat_id,sender,kind,text,created_at) VALUES(?,NULL,'sys',?,?)`, cid, text, now()).lastInsertRowid;
  pushMany(memberIds(cid), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, id)) });
}
function chatFor(me, id) { const c = q1(`SELECT * FROM chats WHERE id=?`, id); if (!c || !isMember(id, me.id)) E(404, 'Discussion introuvable.'); return c; }
R('POST', /^\/api\/chats\/(\d+)\/members$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Seuls les groupes acceptent de nouveaux membres.');
  const ok = new Set(contactIds(me.id)), ids = (body.add || []).map(Number).filter(x => ok.has(x) && !isMember(c.id, x));
  for (const u of ids) { run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, c.id, u, now()); sysMsg(c.id, `${me.name} a ajouté ${getUser(u).name}`); }
  pushMany(memberIds(c.id), { t: 'chats' });
  return { chat: chatOut(c, me.id) };
});
R('POST', /^\/api\/chats\/(\d+)\/leave$/, async ({ me, m }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Impossible de quitter une discussion à deux.');
  run(`DELETE FROM members WHERE chat_id=? AND user_id=?`, c.id, me.id); sysMsg(c.id, `${me.name} a quitté le groupe`);
  if (!q1(`SELECT 1 FROM members WHERE chat_id=?`, c.id)) run(`DELETE FROM chats WHERE id=?`, c.id);
  return { ok: true };
});
R('GET', /^\/api\/chats\/(\d+)\/messages$/, async ({ me, m, url }) => {
  const c = chatFor(me, +m[1]), before = +url.searchParams.get('before') || 9e15;
  const rows = qa(`SELECT * FROM messages WHERE chat_id=? AND id<? ORDER BY id DESC LIMIT 60`, c.id, before).reverse();
  return { messages: rows.map(msgOut), more: rows.length === 60 };
});
R('POST', /^\/api\/chats\/(\d+)\/messages$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]);
  if (tooMany('msg:' + me.id, 40, 10_000)) E(429, 'Vous envoyez trop vite. Patientez un instant.');
  if (c.type === 'direct') {
    const o = memberIds(c.id).find(x => x !== me.id);
    if (!o || blockedEither(me.id, o)) E(403, 'Vous ne pouvez plus écrire à cette personne.');
    if (relation(me.id, o) !== 'contact') E(403, 'Vous n’êtes plus en contact avec cette personne.');
  }
  let text = clean(body.text, 4000), media = null, e2e = 0;
  if (body.enc) {
    // Message chiffré de bout en bout : le serveur ne garde qu'une enveloppe illisible.
    const env = body.enc; if (typeof env !== 'object' || typeof env.ct !== 'string' || typeof env.iv !== 'string' || typeof env.keys !== 'object') E(400, 'Message chiffré invalide.');
    text = JSON.stringify({ v: 1, iv: env.iv, ct: env.ct, keys: env.keys, from: env.from }); if (text.length > 60000) E(413, 'Message trop long.'); e2e = 1;
  }
  if (body.media) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.'); media = md.id; }
  if (!text && !media) E(400, 'Message vide.');
  const reply = body.replyTo && q1(`SELECT id FROM messages WHERE id=? AND chat_id=?`, +body.replyTo, c.id) ? +body.replyTo : null;
  const id = Number(run(`INSERT INTO messages(chat_id,sender,kind,text,media,reply_to,e2e,created_at) VALUES(?,?,?,?,?,?,?,?)`, c.id, me.id, media ? 'image' : 'text', text || null, media, reply, e2e, now()).lastInsertRowid);
  if (media) run(`UPDATE media SET scope='chat', ref=? WHERE id=?`, c.id, media);
  run(`UPDATE members SET last_read=? WHERE chat_id=? AND user_id=?`, id, c.id, me.id);
  const msg = msgOut(q1(`SELECT * FROM messages WHERE id=?`, id));
  pushMany(memberIds(c.id), { t: 'msg', msg });
  return { msg };
});
R('POST', /^\/api\/chats\/(\d+)\/read$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]), up = Math.max(0, +body.upTo || 0);
  const mx = q1(`SELECT MAX(id) x FROM messages WHERE chat_id=?`, c.id).x || 0, v = Math.min(up, mx);
  run(`UPDATE members SET last_read=MAX(last_read,?) WHERE chat_id=? AND user_id=?`, v, c.id, me.id);
  pushMany(memberIds(c.id), { t: 'read', chatId: c.id, user: me.id, upTo: v });
  return { ok: true };
});
R('POST', /^\/api\/chats\/(\d+)\/typing$/, async ({ me, m }) => {
  const c = chatFor(me, +m[1]); pushMany(memberIds(c.id).filter(x => x !== me.id), { t: 'typing', chatId: c.id, user: me.id }); return { ok: true };
});
R('POST', /^\/api\/messages\/(\d+)\/delete$/, async ({ me, m }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg || msg.sender !== me.id) E(404, 'Message introuvable.');
  if (msg.media) dropMedia(msg.media);
  run(`UPDATE messages SET deleted=1, text=NULL, media=NULL WHERE id=?`, msg.id);
  pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true });
  return { ok: true };
});

/* photos */
R('POST', /^\/api\/media$/, async ({ me, req }) => {
  const ct = String(req.headers['content-type'] || ''), enc = ct === 'application/octet-stream';
  if (!enc && !/^image\/(jpeg|png|webp)$/.test(ct)) E(415, 'Seules les photos (JPEG, PNG, WebP) sont acceptées.');
  if (tooMany('up:' + me.id, 60, 10 * 60_000)) E(429, 'Trop de photos envoyées. Patientez un peu.');
  const buf = await readBody(req, 6_000_000); if (buf.length < 100) E(400, 'Fichier vide.');
  const sig = buf.subarray(0, 12).toString('hex');
  if (!enc && !(sig.startsWith('ffd8ff') || sig.startsWith('89504e47') || (sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP'))) E(415, 'Ce fichier n’est pas une photo valide.');
  const id = rnd(18); fs.writeFileSync(path.join(MEDIA, id), buf);
  run(`INSERT INTO media(id,owner,mime,size,enc,created_at) VALUES(?,?,?,?,?,?)`, id, me.id, ct, buf.length, enc ? 1 : 0, now());
  return { id, url: mediaUrl(id) };
});
R('GET', /^\/api\/media\/([A-Za-z0-9_-]{10,40})$/, async ({ me, m, res }) => {
  const md = q1(`SELECT * FROM media WHERE id=?`, m[1]); if (!md) E(404, 'Introuvable');
  let ok = md.owner === me.id;
  if (!ok && md.scope === 'avatar') ok = true;
  if (!ok && md.scope === 'chat') ok = isMember(md.ref, me.id);
  if (!ok && md.scope === 'status') { const s = q1(`SELECT * FROM statuses WHERE id=?`, md.ref); ok = !!s && statusVisible(s, me.id); }
  if (!ok) E(404, 'Introuvable');
  res.writeHead(200, { 'Content-Type': md.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(path.join(MEDIA, md.id)).on('error', () => res.end()).pipe(res);
  return null;
});

/* statuts */
R('GET', /^\/api\/statuses$/, async ({ me }) => {
  const ids = [me.id, ...contactIds(me.id)];
  const rows = qa(`SELECT * FROM statuses WHERE user_id IN (${ids.map(() => '?').join(',')}) AND expires>? ORDER BY created_at`, ...ids, now()).filter(s => statusVisible(s, me.id));
  const by = new Map();
  for (const s of rows) {
    if (!by.has(s.user_id)) by.set(s.user_id, { user: userCard(getUser(s.user_id), me.id), items: [] });
    const seen = !!q1(`SELECT 1 FROM status_views WHERE status_id=? AND viewer=?`, s.id, me.id);
    const it = { id: s.id, kind: s.kind, text: s.text, bg: s.bg, media: mediaUrl(s.media), aud: s.aud, at: s.created_at, expires: s.expires, seen };
    if (s.user_id === me.id) it.views = qa(`SELECT v.viewer, v.at FROM status_views v WHERE v.status_id=? ORDER BY v.at DESC`, s.id).map(v => ({ user: userCard(getUser(v.viewer), me.id), at: v.at })).filter(v => v.user);
    by.get(s.user_id).items.push(it);
  }
  const mine = by.get(me.id) || { user: userCard(me, me.id), items: [] }; by.delete(me.id);
  const others = [...by.values()].map(g => ({ ...g, allSeen: g.items.every(i => i.seen), last: g.items[g.items.length - 1].at }))
    .sort((a, b) => (a.allSeen - b.allSeen) || (b.last - a.last));
  return { mine, others };
});
R('POST', /^\/api\/statuses$/, async ({ me, body }) => {
  if (tooMany('st:' + me.id, 30, DAY)) E(429, 'Trop de statuts aujourd’hui.');
  const aud = body.aud === 'private' ? 'private' : 'public', text = clean(body.text, 700); let media = null;
  if (body.media) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.'); media = md.id; }
  if (!media && !text) E(400, 'Écrivez un texte ou ajoutez une photo.');
  const bg = Math.max(0, Math.min(359, +body.bg || 170));
  const id = Number(run(`INSERT INTO statuses(user_id,kind,text,bg,media,aud,created_at,expires) VALUES(?,?,?,?,?,?,?,?)`, me.id, media ? 'image' : 'text', text || null, bg, media, aud, now(), now() + DAY).lastInsertRowid);
  if (media) run(`UPDATE media SET scope='status', ref=? WHERE id=?`, id, media);
  pushMany(contactIds(me.id), { t: 'statuses' });
  return { id };
});
R('POST', /^\/api\/statuses\/(\d+)\/view$/, async ({ me, m }) => {
  const s = q1(`SELECT * FROM statuses WHERE id=?`, +m[1]); if (!s || !statusVisible(s, me.id)) E(404, 'Statut introuvable.');
  if (s.user_id !== me.id) { run(`INSERT OR IGNORE INTO status_views(status_id,viewer,at) VALUES(?,?,?)`, s.id, me.id, now()); push(s.user_id, { t: 'statuses' }); }
  return { ok: true };
});
R('POST', /^\/api\/statuses\/(\d+)\/delete$/, async ({ me, m }) => {
  const s = q1(`SELECT * FROM statuses WHERE id=? AND user_id=?`, +m[1], me.id); if (!s) E(404, 'Statut introuvable.');
  if (s.media) dropMedia(s.media); run(`DELETE FROM statuses WHERE id=?`, s.id); pushMany(contactIds(me.id), { t: 'statuses' }); return { ok: true };
});

/* clés de chiffrement de bout en bout : le serveur garde la clé publique et une sauvegarde chiffrée par le code du membre */
R('POST', /^\/api\/keys$/, async ({ me, body }) => {
  const pk = body.pubkey; if (!pk || pk.kty !== 'EC' || pk.crv !== 'P-256' || typeof pk.x !== 'string' || typeof pk.y !== 'string' || pk.d) E(400, 'Clé invalide.');
  const b = body.backup; if (!b || typeof b.ct !== 'string' || typeof b.iv !== 'string' || typeof b.salt !== 'string' || !(+b.iter >= 100000)) E(400, 'Sauvegarde invalide.');
  if (JSON.stringify(b).length > 8000) E(413, 'Sauvegarde trop grande.');
  const old = me.pubkey;
  run(`UPDATE users SET pubkey=?, keybackup=? WHERE id=?`, JSON.stringify({ kty: 'EC', crv: 'P-256', x: pk.x, y: pk.y }), JSON.stringify({ ct: b.ct, iv: b.iv, salt: b.salt, iter: +b.iter }), me.id);
  if (old && J(old, {}).x !== pk.x) for (const c of qa(`SELECT chat_id FROM members WHERE user_id=?`, me.id)) sysMsg(c.chat_id, `Le code de sécurité de ${me.name} a changé (nouvel appareil ou nouvelle clé).`);
  pushMany(contactIds(me.id), { t: 'contacts' });
  return { ok: true };
});
R('GET', /^\/api\/keys\/backup$/, async ({ me }) => ({ backup: me.keybackup ? J(me.keybackup, null) : null, pubkey: me.pubkey ? J(me.pubkey, null) : null }));

/* mot de passe oublié : code à 6 chiffres envoyé par e-mail */
function mailSettings() { const r = q1(`SELECT v FROM settings WHERE k='mail'`); return r ? J(r.v, null) : null; }
let transport = null, transportKey = '';
function getTransport() {
  const m = mailSettings(); if (!m || !m.host || !m.user || !m.pass || !m.from) return null;
  const key = JSON.stringify(m);
  if (key !== transportKey) { transport = nodemailer.createTransport({ host: m.host, port: +m.port || 465, secure: (+m.port || 465) === 465, auth: { user: m.user, pass: m.pass } }); transportKey = key; }
  return { t: transport, from: m.from };
}
const mailHtml = (title, inner) => `<div style="font-family:Arial,Helvetica,sans-serif;background:#eef6f7;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;padding:26px;color:#0f2430;font-size:15px;line-height:1.5"><div style="font-weight:800;font-size:20px;color:#0b7a89;margin-bottom:14px">tam-tam</div><h1 style="font-size:19px;margin:0 0 10px">${title}</h1>${inner}<p style="color:#5d7380;font-size:12px;margin-top:26px">Message envoyé automatiquement par tam-tam. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre compte reste protégé.</p></div></div>`;
async function sendMail(to, subject, html) { const tr = getTransport(); if (!tr) return false; await tr.t.sendMail({ from: tr.from, to, subject, html }); return true; }
R('POST', /^\/api\/forgot$/, async ({ req, body }) => {
  const email = clean(body.email, 120).toLowerCase(); if (!isEmail(email)) E(400, 'Adresse e-mail invalide.');
  if (tooMany('forgot:' + ipOf(req), 6, 60 * 60_000) || tooMany('forgot:' + email, 3, 60 * 60_000)) E(429, 'Trop de demandes. Réessayez dans une heure.');
  if (!getTransport()) E(503, 'L’envoi d’e-mails n’est pas encore réglé. Demandez un lien au responsable de tam-tam.');
  const u = q1(`SELECT id,name FROM users WHERE email=?`, email);
  if (u) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    run(`INSERT OR REPLACE INTO codes(email,code,tries,expires) VALUES(?,?,0,?)`, email, sha(code), now() + 15 * 60_000);
    try { await sendMail(email, `Votre code tam-tam : ${code}`, mailHtml('Réinitialiser votre mot de passe', `<p>Bonjour ${String(u.name).replace(/[<>&]/g, '')},</p><p>Voici votre code pour choisir un nouveau mot de passe :</p><p style="font-size:30px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p><p>Il est valable 15 minutes.</p>`)); }
    catch (e) { console.error('envoi e-mail', e.message); E(502, 'L’e-mail n’a pas pu partir. Réessayez dans quelques minutes.'); }
  }
  return { ok: true }; // même réponse que le compte existe ou non
}, false);
R('POST', /^\/api\/forgot\/verify$/, async ({ req, res, body }) => {
  const email = clean(body.email, 120).toLowerCase(), r = q1(`SELECT * FROM codes WHERE email=?`, email);
  if (tooMany('fv:' + ipOf(req), 15, 60 * 60_000)) E(429, 'Trop de tentatives.');
  if (!r || r.expires < now()) E(400, 'Ce code a expiré. Demandez-en un nouveau.');
  if (r.tries >= 5) { run(`DELETE FROM codes WHERE email=?`, email); E(400, 'Trop d’essais. Demandez un nouveau code.'); }
  if (sha(String(body.code || '').trim()) !== r.code) { run(`UPDATE codes SET tries=tries+1 WHERE email=?`, email); E(400, 'Code incorrect.'); }
  if (String(body.pass || '').length < 8) E(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  const u = q1(`SELECT * FROM users WHERE email=?`, email); if (!u) E(400, 'Code incorrect.');
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(body.pass), u.id); run(`DELETE FROM codes WHERE email=?`, email); run(`DELETE FROM sessions WHERE user_id=?`, u.id);
  setSession(res, u.id); return { me: meOut(getUser(u.id)) };
}, false);

/* administration (propriétaire) */
function adminOnly(me) { if (!me.admin) E(403, 'Réservé au propriétaire.'); }
R('GET', /^\/api\/admin$/, async ({ me }) => {
  adminOnly(me);
  return { users: qa(`SELECT id,name,handle,email,created_at,last_seen FROM users ORDER BY created_at DESC LIMIT 500`).map(u => ({ ...u, online: online(u.id) })),
    reports: qa(`SELECT * FROM reports WHERE done=0 ORDER BY created_at DESC LIMIT 200`).map(r => ({ ...r, by: getUser(r.by_user)?.name || '—', target: r.target_user ? getUser(r.target_user)?.name || '—' : null, chat: r.chat_id ? q1(`SELECT name,type FROM chats WHERE id=?`, r.chat_id) : null })),
    counts: { users: q1(`SELECT COUNT(*) n FROM users`).n, messages: q1(`SELECT COUNT(*) n FROM messages`).n, chats: q1(`SELECT COUNT(*) n FROM chats`).n } };
});
R('POST', /^\/api\/admin\/reset$/, async ({ me, body }) => {
  adminOnly(me); const u = getUser(+body.userId); if (!u) E(404, 'Compte introuvable.');
  const tok = rnd(24); run(`INSERT INTO resets(token,user_id,expires) VALUES(?,?,?)`, sha(tok), u.id, now() + 2 * DAY);
  return { url: `${BASE_URL}/reset/${tok}` };
});
R('GET', /^\/api\/admin\/mail$/, async ({ me }) => { adminOnly(me); const m = mailSettings() || {}; return { host: m.host || '', port: m.port || 465, user: m.user || '', from: m.from || '', hasPass: !!m.pass }; });
R('POST', /^\/api\/admin\/mail$/, async ({ me, body }) => {
  adminOnly(me); const old = mailSettings() || {};
  const m = { host: clean(body.host, 120), port: +body.port || 465, user: clean(body.user, 120), pass: body.pass ? String(body.pass).slice(0, 200) : old.pass, from: clean(body.from, 160) };
  if (!m.host || !m.user || !m.pass || !m.from) E(400, 'Remplissez le serveur, l’identifiant, le mot de passe et l’expéditeur.');
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES('mail',?)`, JSON.stringify(m)); transportKey = '';
  if (body.test) { try { await sendMail(me.email, 'Test d’envoi tam-tam', mailHtml('L’envoi d’e-mails fonctionne', '<p>Les codes « mot de passe oublié » partiront depuis cette adresse.</p>')); } catch (e) { E(502, 'Réglage enregistré, mais le test a échoué : ' + String(e.message || e).slice(0, 160)); } }
  return { ok: true };
});
R('POST', /^\/api\/admin\/report-done$/, async ({ me, body }) => { adminOnly(me); run(`UPDATE reports SET done=1 WHERE id=?`, +body.id); return { ok: true }; });

/* flux temps réel */
R('GET', /^\/api\/stream$/, async ({ me, req, res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ t: 'hello' })}\n\n`);
  if (!streams.has(me.id)) streams.set(me.id, new Set());
  const set = streams.get(me.id), first = set.size === 0; set.add(res);
  if (first) presence(me.id);
  req.on('close', () => {
    set.delete(res);
    if (!set.size) { streams.delete(me.id); run(`UPDATE users SET last_seen=? WHERE id=?`, now(), me.id); presence(me.id); }
  });
  return null;
});

/* ---------- serveur ---------- */
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL), p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      // Protection contre les requêtes venues d'autres sites.
      if (req.method !== 'GET') { const o = req.headers.origin; if (o && o !== BASE_URL && !(BASE_URL.startsWith('http://localhost') && o.startsWith('http://localhost'))) E(403, 'Origine refusée.'); }
      const rt = routes.find(r => r.method === req.method && r.re.test(p)); if (!rt) E(404, 'Adresse inconnue.');
      const me = currentUser(req); if (rt.auth && !me) E(401, 'Connectez-vous.');
      const body = req.method === 'POST' && !/^\/api\/media$/.test(p) ? await readJson(req) : {};
      const out = await rt.fn({ req, res, url, body, me, m: p.match(rt.re) });
      if (out !== null && !res.headersSent) send(res, 200, out);
      return;
    }
    if (p === '/demo' ) { res.writeHead(301, { Location: '/demo/' }); return res.end(); }
    if (p === '/demo/') return serveFile(res, path.join(PUB, 'demo/index.html'), { 'X-Robots-Tag': 'noindex' });
    if (p === '/conditions') return serveFile(res, path.join(PUB, 'conditions.html'), SEC);
    if (p === '/' || /^\/(invite|reset)\/[A-Za-z0-9_-]+$/.test(p)) return serveFile(res, path.join(PUB, 'app.html'), SEC);
    const f = path.normalize(path.join(PUB, p)); if (!f.startsWith(PUB + path.sep) || f.includes(path.join(PUB, 'demo'))) return send(res, 404, 'Page introuvable');
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f, SEC);
    send(res, 404, 'Page introuvable');
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.code, e.message);
    console.error(e); if (!res.headersSent) fail(res, 500, 'Erreur du serveur. Réessayez.');
  }
});
server.listen(PORT, () => console.log(`tam-tam en écoute sur ${PORT} — ${BASE_URL}`));
