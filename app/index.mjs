// tam-tam — version 1 (serveur)
// Comptes sur invitation, demandes d'ami, discussions en temps réel (SSE), photos, statuts 24 h, blocage, signalement.
// Node 22 (node:sqlite intégré) ; nodemailer pour les e-mails, web-push pour les notifications.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import QRCode from 'qrcode';

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
for (const sql of [`ALTER TABLE users ADD COLUMN pubkey TEXT`, `ALTER TABLE users ADD COLUMN keybackup TEXT`, `ALTER TABLE messages ADD COLUMN e2e INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE media ADD COLUMN enc INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN google_sub TEXT`, `ALTER TABLE members ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN hide_code TEXT`, `ALTER TABLE users ADD COLUMN qr_token TEXT`, `ALTER TABLE contacts ADD COLUMN lim INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE members ADD COLUMN fav INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN pics TEXT NOT NULL DEFAULT '{}'`, `ALTER TABLE messages ADD COLUMN once INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE sessions ADD COLUMN created INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE sessions ADD COLUMN seen INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE sessions ADD COLUMN ua TEXT`, `ALTER TABLE users ADD COLUMN listed INTEGER NOT NULL DEFAULT 1`, `ALTER TABLE users ADD COLUMN avail TEXT NOT NULL DEFAULT 'on'`, `ALTER TABLE users ADD COLUMN tr_consent INTEGER`, `ALTER TABLE users ADD COLUMN priv_env TEXT`, `ALTER TABLE users ADD COLUMN tel_env TEXT`, `ALTER TABLE users ADD COLUMN tel_hash TEXT`, `ALTER TABLE statuses ADD COLUMN e2e INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE chats ADD COLUMN expires INTEGER`, `ALTER TABLE statuses ADD COLUMN music TEXT`, `ALTER TABLE users ADD COLUMN handle_set INTEGER NOT NULL DEFAULT 0`, `CREATE TABLE IF NOT EXISTS msg_hidden(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, msg_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, PRIMARY KEY(user_id, msg_id))`, `ALTER TABLE users ADD COLUMN handle_at INTEGER`, `CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, media TEXT NOT NULL, thumb TEXT, env TEXT NOT NULL, aud TEXT NOT NULL, taken_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`, `CREATE INDEX IF NOT EXISTS mem_user ON memories(user_id, taken_at)`, `CREATE TABLE IF NOT EXISTS mem_access(mem_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(mem_id, user_id))`, `CREATE TABLE IF NOT EXISTS corpus(id INTEGER PRIMARY KEY, src TEXT NOT NULL, sl TEXT, tgt TEXT NOT NULL, tl TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)`, `CREATE UNIQUE INDEX IF NOT EXISTS corpus_u ON corpus(src, tl, tgt, kind)`, `CREATE TABLE IF NOT EXISTS tr_mine(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(user_id, id))`, `CREATE TABLE IF NOT EXISTS tr_votes(id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(id, user_id))`, `CREATE TABLE IF NOT EXISTS tr_cache(id TEXT PRIMARY KEY, iv TEXT NOT NULL, ct TEXT NOT NULL, at INTEGER NOT NULL)`, `ALTER TABLE tr_cache ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0`, `CREATE TABLE IF NOT EXISTS once_views(msg_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(msg_id, user_id))`, `CREATE TABLE IF NOT EXISTS tel_share(owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, viewer INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(owner, viewer))`]) { try { db.exec(sql); } catch {} }
db.exec(`CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS codes(email TEXT PRIMARY KEY, code TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS calls(id INTEGER PRIMARY KEY, call_id TEXT NOT NULL, kind TEXT NOT NULL, chat_id INTEGER NOT NULL, caller INTEGER NOT NULL, callee INTEGER, video INTEGER NOT NULL, status TEXT NOT NULL, joined TEXT NOT NULL DEFAULT '[]', started INTEGER NOT NULL, answered INTEGER, ended INTEGER);
CREATE INDEX IF NOT EXISTS calls_cid ON calls(call_id);
CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, keys TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS gpending(token TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, sub TEXT NOT NULL, invite TEXT, expires INTEGER NOT NULL);`);
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const qa = (sql, ...a) => db.prepare(sql).all(...a);
const run = (sql, ...a) => db.prepare(sql).run(...a);
const now = () => Date.now();
const DAY = 864e5;

/* ---------- outils ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rnd = (n = 24) => crypto.randomBytes(n).toString('base64url');
// Mots de passe trop faciles à deviner : refusés à la création et au changement.
const WEAK = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'password', 'password1', 'motdepasse', 'motdepasse1', 'azertyui', 'azertyuiop', 'qwertyui', 'qwertyuiop', 'iloveyou', 'senegal1', 'senegal221', 'dakar221', 'bonjour1', 'soleil123', 'jetaime1', 'abcd1234', 'abc12345', 'azerty123', 'qwerty123', 'tamtam123', 'tam-tam1', 'admin123', 'welcome1', '12341234', '123123123', 'aaaaaaaa', 'football', 'princesse']);
function passOk(p, email) {
  p = String(p || ''); if (p.length < 8) E(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  const l = p.toLowerCase(), local = String(email || '').split('@')[0].toLowerCase();
  if (WEAK.has(l) || /^(.)\1+$/.test(p) || '0123456789012345678901234567890'.includes(p) || '9876543210987654321'.includes(p) || (local.length >= 4 && l.includes(local)))
    E(400, 'Ce mot de passe est trop facile à deviner. Mélangez des lettres, des chiffres et un signe, par exemple « Baobab-2026! ».');
}
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
// Disponibilité choisie par le membre : en ligne (réel), occupé, ou hors ligne (masque sa présence).
const availOf = uid => q1(`SELECT avail FROM users WHERE id=?`, uid)?.avail || 'on';
const shownOnline = uid => { const a = availOf(uid); return a !== 'off' && online(uid); };
function push(uid, ev) {
  const s = streams.get(uid); if (!s) return;
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of s) { try { res.write(data); } catch {} }
}
const pushMany = (ids, ev) => ids.forEach(id => push(id, ev));
// Le vrai nom (facultatif) n'est montré qu'à soi-même et à ses contacts acceptés ; les autres ne voient que le pseudo.
const nameFor = (u, viewer) => { if (!u) return ''; const r = viewer == null ? 'none' : relation(viewer, u.id); return (r === 'me' || r === 'contact') && u.name ? u.name : '@' + u.handle; };
const firstFor = (u, viewer) => { const n = nameFor(u, viewer); return n.startsWith('@') ? n : n.split(' ')[0]; };
// Dans un groupe, les membres ne se connaissent pas tous : le message système montre le pseudo.
const nameInChat = (u, c) => c.type === 'direct' && !c.expires && u.name ? u.name : '@' + u.handle;
function normHandle(v) {
  const h = String(v || '').trim().replace(/^@/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!/^[a-z0-9][a-z0-9._]{2,19}$/.test(h)) E(400, 'Pseudo : 3 à 20 caractères, lettres, chiffres, point ou tiret bas (sans espace).');
  return h;
}
function handleIdeas(u, seed) {
  const b = String(seed || u?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const f = b[0] || 'membre', l = b[1] || '', y = String(new Date().getFullYear()).slice(2);
  const raw = [u && u.handle, l ? `${f}.${l}` : `${f}.tt`, l ? `${f[0]}${l}` : `${f}${y}`, `${f}_${Math.floor(10 + Math.random() * 89)}`, `${f}${l}${Math.floor(1 + Math.random() * 98)}`];
  const out = [];
  for (let h of raw) { if (!h) continue; h = h.replace(/[^a-z0-9._]/g, '').slice(0, 20); if (h.length < 3) h = (h + 'tam').slice(0, 20);
    const own = u && h === u.handle; if (!out.includes(h) && (own || !q1(`SELECT 1 FROM users WHERE handle=?`, h))) out.push(h); if (out.length >= 3) break; }
  return out;
}
function presence(uid) { const ids = contactIds(uid), a = availOf(uid); pushMany(ids, { t: 'presence', id: uid, online: shownOnline(uid), busy: a === 'busy', lastSeen: a === 'off' ? null : q1(`SELECT last_seen FROM users WHERE id=?`, uid)?.last_seen || null }); }
setInterval(() => { for (const s of streams.values()) for (const res of s) { try { res.write(': ping\n\n'); } catch {} } }, 25_000);

/* ---------- formats de sortie ---------- */
const mediaUrl = id => id ? `/api/media/${id}` : null;
function userCard(u, me) {
  if (!u) return null;
  const pub = J(u.pub, {}), rel = me ? relation(me, u.id) : 'none';
  const card = { id: u.id, name: (rel === 'me' || rel === 'contact') && u.name ? u.name : '@' + u.handle, handle: u.handle, avatar: J(u.avatar, null), photo: mediaUrl(u.photo), rel, online: rel === 'me' ? online(u.id) : rel === 'contact' ? (u.avail !== 'off' && online(u.id)) : undefined,
    busy: rel === 'contact' && u.avail === 'busy' ? true : undefined,
    lastSeen: rel === 'contact' && u.avail !== 'off' ? u.last_seen : undefined, pub: {}, mutual: 0, pubkey: u.pubkey ? J(u.pubkey, null) : null };
  for (const k of PUB_K) if (pub[k] != null && pub[k] !== '') card.pub[k] = pub[k];
  card.pics = picsOf(u, 'pub'); card.trc = !!u.tr_consent;
  if (me && me !== u.id) {
    const mine = new Set(contactIds(me)); card.mutual = contactIds(u.id).filter(x => mine.has(x)).length;
    card.blocked = iBlocked(me, u.id);
    if (canSeePriv(u, me)) {
      // Profil privé chiffré de bout en bout : le serveur ne transmet qu'une enveloppe illisible pour lui.
      if (u.priv_env) card.privEnv = J(u.priv_env, null);
      else { const pv = J(u.priv, {}); if (!telShared(u.id, me)) delete pv.tel; card.priv = pv; card.privPics = picsOf(u, 'priv'); } // ancien format, le temps de la migration
    }
    // Le numéro de téléphone n'est jamais montré sans l'accord explicite de son propriétaire.
    if (u.tel_env && telShared(u.id, me) && relation(me, u.id) === 'contact') card.telEnv = J(u.tel_env, null);
    card.telMine = telShared(me, u.id);
    if (card.rel === 'contact') { const l = limOf(me, u.id); if (l === me) card.limMine = true; else if (l === u.id) card.limTheirs = true; }
  }
  return card;
}
const telShared = (owner, viewer) => !!q1(`SELECT 1 FROM tel_share WHERE owner=? AND viewer=?`, owner, viewer);
const picsOf = (u, set) => (J(u.pics, {})[set] || [null, null, null]).map(mediaUrl);
function canSeePriv(u, me) {
  if (u.id === me) return true;
  if (u.priv_to === 'me') return false;
  if (relation(me, u.id) !== 'contact' || blockedEither(me, u.id)) return false;
  if (limOf(me, u.id) === u.id) return false;
  if (u.priv_to === 'grp') return !!q1(`SELECT 1 FROM close_group WHERE owner=? AND member=?`, u.id, me);
  return true;
}
const getUser = id => q1(`SELECT * FROM users WHERE id=?`, id);
function msgOut(m) {
  if (!m) return null;
  return { id: m.id, chatId: m.chat_id, from: m.sender, kind: m.kind, text: m.deleted || m.e2e ? '' : m.text, enc: m.e2e && !m.deleted ? J(m.text, null) : null,
    media: m.deleted ? null : mediaUrl(m.media), replyTo: m.reply_to, deleted: !!m.deleted, at: m.created_at,
    ...(m.once ? { once: true, opened: qa(`SELECT user_id FROM once_views WHERE msg_id=?`, m.id).map(r => r.user_id) } : {}) };
}
// Un message à vue unique déjà ouvert ne renvoie plus son contenu à celui qui l'a ouvert (ni à l'expéditeur).
function msgFor(m, uid) {
  const o = msgOut(m); if (!o || !o.once) return o;
  if (m.sender === uid || o.opened.includes(uid)) { o.enc = null; o.text = ''; o.media = o.media ? 'x' : null; }
  return o;
}
function chatOut(c, me) {
  const mem = qa(`SELECT m.user_id, m.last_read, m.admin, m.hidden, m.fav FROM members m WHERE m.chat_id=?`, c.id);
  const mine = mem.find(x => x.user_id === me);
  const last = q1(`SELECT * FROM messages WHERE chat_id=? AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?) ORDER BY id DESC LIMIT 1`, c.id, me);
  const unread = q1(`SELECT COUNT(*) n FROM messages WHERE chat_id=? AND id>? AND (sender IS NULL OR sender<>?) AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?)`, c.id, mine ? mine.last_read : 0, me, me).n;
  const others = mem.filter(x => x.user_id !== me);
  const out = { id: c.id, type: c.type, name: c.name, createdAt: c.created_at, unread, last: msgOut(last), hidden: !!(mine && mine.hidden), fav: !!(mine && mine.fav),
    // Un membre « hors ligne » ne révèle pas qu'il a lu : ses coches restent grises chez les autres.
    members: mem.map(x => ({ id: x.user_id, lastRead: x.user_id !== me && availOf(x.user_id) === 'off' ? 0 : x.last_read, admin: !!x.admin })),
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
  for (const c of qa(`SELECT id FROM chats WHERE expires IS NOT NULL AND expires<?`, now())) { run(`DELETE FROM calls WHERE chat_id=?`, c.id); run(`DELETE FROM chats WHERE id=?`, c.id); }
  run(`DELETE FROM sessions WHERE expires<?`, now()); run(`DELETE FROM tr_cache WHERE at<?`, now() - 180 * DAY); run(`DELETE FROM resets WHERE expires<?`, now());
  for (const s of qa(`SELECT id, media, music FROM statuses WHERE expires<?`, now())) { if (s.media) dropMedia(s.media); if (s.music) dropMedia(s.music); run(`DELETE FROM statuses WHERE id=?`, s.id); }
  for (const m of qa(`SELECT id FROM media WHERE scope IS NULL AND created_at<?`, now() - DAY)) dropMedia(m.id);
}
function dropMedia(id) { try { fs.rmSync(path.join(MEDIA, id)); } catch {} run(`DELETE FROM media WHERE id=?`, id); }
setInterval(sweep, 5 * 60_000); sweep();
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
// Une connexion reste valable 90 jours après la dernière utilisation (au lieu d'un an fixe).
const SESSION_DAYS = 90;
function setSession(res, userId) {
  const tok = rnd(32), ua = String(res.req?.headers['user-agent'] || '').slice(0, 300);
  run(`INSERT INTO sessions(token,user_id,expires,created,seen,ua) VALUES(?,?,?,?,?,?)`, sha(tok), userId, now() + SESSION_DAYS * DAY, now(), now(), ua);
  res.setHeader('Set-Cookie', `tt_s=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${secure ? '; Secure' : ''}`);
}
function currentUser(req) {
  const tok = cookies(req).tt_s; if (!tok) return null;
  const h = sha(tok), u = q1(`SELECT u.*, s.created AS s_created, s.seen AS s_seen, s.rowid AS s_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?`, h, now());
  if (!u) return null;
  if (now() - u.s_seen > 3600_000) run(`UPDATE sessions SET seen=?, expires=? WHERE token=?`, now(), now() + SESSION_DAYS * DAY, h);
  return u;
}
const attempts = new Map();
function blockedNow(key, max = 10, win = 15 * 60_000) { const t = now(); return (attempts.get(key) || []).filter(x => t - x < win).length >= max; }
function tooMany(key, max = 10, win = 15 * 60_000) {
  const t = now(), a = (attempts.get(key) || []).filter(x => t - x < win); a.push(t); attempts.set(key, a); return a.length > max;
}
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function meOut(u) {
  return { ...userCard(u, u.id), rawName: u.name || '', handleSet: !!u.handle_set, handleAt: u.handle_at || null, email: u.email, priv: u.priv_env ? {} : J(u.priv, {}), privPics: u.priv_env ? [null, null, null] : picsOf(u, 'priv'), privEnv: u.priv_env ? J(u.priv_env, null) : null, telEnv: u.tel_env ? J(u.tel_env, null) : null, legacyPriv: !u.priv_env, listed: !!u.listed, avail: u.avail || 'on', trConsent: u.tr_consent == null ? null : !!u.tr_consent, privTo: u.priv_to, admin: !!u.admin, hasHideCode: !!u.hide_code,
    close: qa(`SELECT member FROM close_group WHERE owner=?`, u.id).map(r => r.member),
    blocked: qa(`SELECT blocked FROM blocks WHERE user_id=?`, u.id).map(r => userCard(getUser(r.blocked), u.id)).filter(Boolean),
    cguAt: u.cgu_at, createdAt: u.created_at };
}
function inviteValid(code) {
  if (!code) return null;
  const i = q1(`SELECT * FROM invites WHERE code=?`, code); if (i) return i.expires > now() && i.uses < i.max_uses ? i : null;
  // le code QR personnel d'un membre vaut aussi invitation
  const o = q1(`SELECT id FROM users WHERE qr_token=?`, code); return o ? { code, by_user: o.id, qr: true } : null;
}
const limOf = (x, y) => { const [a, b] = pair(x, y); return q1(`SELECT lim FROM contacts WHERE a=? AND b=?`, a, b)?.lim || 0; };

/* ---------- routes ---------- */
const routes = [];
const R = (method, re, fn, auth = true) => routes.push({ method, re, fn, auth });

R('GET', /^\/api\/meta$/, async ({ req, url }) => {
  const code = url.searchParams.get('invite'), inv = inviteValid(code);
  const n = q1(`SELECT COUNT(*) n FROM users`).n;
  return { mail: !!getTransport(), google: !!googleSettings(), ownerSetup: n === 0, ownerEmail: n === 0 && OWNER ? OWNER.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
    invite: inv ? { by: (u => u ? (inv.qr || !u.name ? '@' + u.handle : u.name) : '')(getUser(inv.by_user)) } : null };
}, false);

R('POST', /^\/api\/register$/, async ({ req, res, body }) => {
  if (tooMany('reg:' + ipOf(req), 8, 60 * 60_000)) E(429, 'Trop de tentatives. Réessayez plus tard.');
  const gp = body.gtok ? q1(`SELECT * FROM gpending WHERE token=? AND expires>?`, sha(String(body.gtok)), now()) : null;
  if (body.gtok && !gp) E(400, 'La connexion Google a expiré. Recommencez avec « Continuer avec Google ».');
  const email = gp ? gp.email : clean(body.email, 120).toLowerCase(), fname = clean(body.first, 30), lname = clean(body.last, 30), name = (lname ? `${fname} ${lname}` : fname).slice(0, 40), pass = gp ? rnd(24) : String(body.pass || '');
  if (gp && !body.invite && gp.invite) body.invite = gp.invite;
  if (!isEmail(email)) E(400, 'Adresse e-mail invalide.');
  if (!gp) passOk(pass, email);
  if (!body.cgu) E(400, 'Acceptez les Conditions générales pour créer votre compte.');
  if (!body.age) E(400, 'tam-tam est réservé aux personnes de 16 ans et plus.');
  const first = q1(`SELECT COUNT(*) n FROM users`).n === 0;
  let inv = null;
  if (first) { if (OWNER && email !== OWNER) E(403, 'Le premier compte est réservé au propriétaire de tam-tam.'); }
  else { inv = inviteValid(clean(body.invite, 60)); if (!inv) E(403, 'Il faut un lien d’invitation valide pour s’inscrire.');
    if (inv.qr && q1(`SELECT COUNT(*) n FROM users WHERE invited_by=? AND created_at>?`, inv.by_user, now() - DAY).n >= 5) E(429, 'Ce code QR a déjà servi à beaucoup d’inscriptions aujourd’hui. Demandez plutôt un lien d’invitation.'); }
  if (q1(`SELECT 1 FROM users WHERE email=?`, email)) E(409, 'Un compte existe déjà avec cette adresse. Connectez-vous.');
  if (!body.handle) E(400, 'Choisissez un pseudo : c’est lui que voient les membres.');
  const handle = normHandle(body.handle);
  if (q1(`SELECT 1 FROM users WHERE handle=?`, handle)) E(409, 'Ce pseudo est déjà pris. Choisissez-en un autre.');
  const av = avatarJson(body.avatar) || JSON.stringify({ v: 2, st: 'court', sk: 'c', sh: '#14b8c9' });
  const id = run(`INSERT INTO users(email,pass,name,handle,avatar,admin,invited_by,cgu_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
    email, hashPass(pass), name, handle, av, first ? 1 : 0, inv ? inv.by_user : null, now(), now()).lastInsertRowid;
  run(`UPDATE users SET tr_consent=?, handle_set=1 WHERE id=?`, body.trc ? 1 : 0, Number(id));
  if (gp) { run(`UPDATE users SET google_sub=? WHERE id=?`, gp.sub, Number(id)); run(`DELETE FROM gpending WHERE token=?`, gp.token); }
  if (inv) {
    if (!inv.qr) run(`UPDATE invites SET uses=uses+1 WHERE code=?`, inv.code);
    // La personne qui invite et l'invité deviennent contacts directement : l'invitation vaut acceptation.
    // Par code QR, celui qui partage son code ne montre que son profil public.
    const [a, b] = pair(Number(id), inv.by_user); run(`INSERT OR IGNORE INTO contacts(a,b,status,requester,created_at,lim) VALUES(?,?,'accepted',?,?,?)`, a, b, inv.by_user, now(), inv.qr ? inv.by_user : 0);
    push(inv.by_user, { t: 'contacts' });
  }
  setSession(res, Number(id));
  return { me: meOut(getUser(Number(id))) };
}, false);

R('POST', /^\/api\/login$/, async ({ req, res, body }) => {
  const email = clean(body.email, 120).toLowerCase();
  // seuls les essais ratés comptent : se connecter et se déconnecter plusieurs fois reste possible
  if (blockedNow('login:' + ipOf(req), 20) || blockedNow('login:' + email)) E(429, 'Trop d’essais ratés. Réessayez dans 15 minutes.');
  const u = q1(`SELECT * FROM users WHERE email=?`, email);
  if (!u || !checkPass(body.pass, u.pass)) { tooMany('login:' + ipOf(req), 20); tooMany('login:' + email); E(401, 'E-mail ou mot de passe incorrect. En cas d’oubli, utilisez « Mot de passe oublié ? ».'); }
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
R('GET', /^\/api\/handle\/ideas$/, async ({ me, url }) => ({ ideas: handleIdeas(me, url.searchParams.get('from')) }));
R('GET', /^\/api\/handle\/free$/, async ({ me, url }) => { let h; try { h = normHandle(url.searchParams.get('h')); } catch (e) { return { ok: false, why: e.message }; } const t = q1(`SELECT id FROM users WHERE handle=?`, h); return { ok: !t || t.id === me.id, why: t && t.id !== me.id ? 'Déjà pris.' : '' }; });
R('POST', /^\/api\/me$/, async ({ me, body }) => {
  if (body.name != null) run(`UPDATE users SET name=? WHERE id=?`, clean(body.name, 40), me.id);
  if (body.handle != null) {
    const h = normHandle(body.handle);
    if (h !== me.handle || !me.handle_set) {
      // Changer de pseudo reste libre, mais une fois par mois au plus, pour éviter les usurpations. Le tout premier choix ne compte pas.
      const next = (me.handle_at || 0) + 30 * DAY;
      if (me.handle_set && h !== me.handle && me.handle_at && next > now()) E(429, `Vous avez déjà changé de pseudo ce mois-ci. Prochain changement possible le ${new Date(next).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}.`);
      if (q1(`SELECT 1 FROM users WHERE handle=? AND id<>?`, h, me.id)) E(409, 'Ce pseudo est déjà pris. Choisissez-en un autre.');
      run(`UPDATE users SET handle=?, handle_at=?, handle_set=1 WHERE id=?`, h, me.handle_set && h !== me.handle ? now() : me.handle_at, me.id);
    }
  }
  if (body.avatar) { const aj = avatarJson(body.avatar); if (!aj) E(400, 'Avatar inconnu.'); run(`UPDATE users SET avatar=? WHERE id=?`, aj, me.id); }
  if (body.photo === null) { if (me.photo) dropMedia(me.photo); run(`UPDATE users SET photo=NULL WHERE id=?`, me.id); }
  else if (body.photo) {
    const m = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.photo), me.id); if (!m) E(400, 'Photo introuvable.');
    if (me.photo) dropMedia(me.photo); run(`UPDATE media SET scope='avatar', ref=? WHERE id=?`, me.id, m.id); run(`UPDATE users SET photo=? WHERE id=?`, m.id, me.id);
  }
  if (body.pub) { const p = J(me.pub, {}); for (const k of PUB_K) if (k in body.pub) p[k] = clean(body.pub[k], k === 'bio' ? 200 : 80); run(`UPDATE users SET pub=? WHERE id=?`, JSON.stringify(p), me.id); }
  if (body.priv && !me.priv_env) { const p = J(me.priv, {}); for (const k of PRIV_K) if (k in body.priv) p[k] = clean(body.priv[k], 120); run(`UPDATE users SET priv=? WHERE id=?`, JSON.stringify(p), me.id); }
  if (body.avail && ['on', 'busy', 'off'].includes(body.avail)) { run(`UPDATE users SET avail=? WHERE id=?`, body.avail, me.id); setTimeout(() => { presence(me.id); pushMany(contactIds(me.id), { t: 'chats' }); }, 0); }
  if (body.trConsent != null) run(`UPDATE users SET tr_consent=? WHERE id=?`, body.trConsent ? 1 : 0, me.id);
  if (body.listed != null) run(`UPDATE users SET listed=? WHERE id=?`, body.listed ? 1 : 0, me.id);
  if (body.privTo) { if (!['me', 'contacts', 'grp'].includes(body.privTo)) E(400, 'Choix inconnu.'); run(`UPDATE users SET priv_to=? WHERE id=?`, body.privTo, me.id); }
  if (Array.isArray(body.close)) {
    const ok = new Set(contactIds(me.id)); run(`DELETE FROM close_group WHERE owner=?`, me.id);
    for (const x of body.close.map(Number).filter(x => ok.has(x)).slice(0, 500)) run(`INSERT OR IGNORE INTO close_group(owner,member) VALUES(?,?)`, me.id, x);
  }
  return { me: meOut(getUser(me.id)) };
});
// Profil privé chiffré : enveloppe pour les personnes autorisées, numéro dans une enveloppe à part, empreinte du numéro pour le répertoire.
const envOk = e => e && typeof e === 'object' && typeof e.ct === 'string' && typeof e.iv === 'string' && e.keys && typeof e.keys === 'object' && JSON.stringify(e).length < 200_000;
R('POST', /^\/api\/me\/privenv$/, async ({ me, body }) => {
  if (!envOk(body.privEnv) || (body.telEnv && !envOk(body.telEnv))) E(400, 'Profil chiffré invalide.');
  const keep = new Set((Array.isArray(body.mediaIds) ? body.mediaIds : []).map(String).slice(0, 6));
  for (const id of keep) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=?`, id, me.id); if (md && md.enc && (md.scope == null || md.scope === 'ppriv')) run(`UPDATE media SET scope='ppriv', ref=? WHERE id=?`, me.id, id); else keep.delete(id); }
  for (const r of qa(`SELECT id FROM media WHERE owner=? AND scope='ppriv'`, me.id)) if (!keep.has(r.id)) dropMedia(r.id);
  const pics = J(me.pics, {}); pics.priv = [null, null, null];
  const th = /^[0-9a-f]{64}$/.test(String(body.telHash || '')) ? String(body.telHash) : null;
  run(`UPDATE users SET priv_env=?, tel_env=?, tel_hash=?, priv='{}', pics=? WHERE id=?`, JSON.stringify(body.privEnv), body.telEnv ? JSON.stringify(body.telEnv) : null, th, JSON.stringify(pics), me.id);
  pushMany(contactIds(me.id), { t: 'contacts' }); return { me: meOut(getUser(me.id)) };
});
// Trois photos publiques et trois photos privées sur le profil.
R('POST', /^\/api\/me\/pics$/, async ({ me, body }) => {
  const set = body.set === 'priv' ? 'priv' : 'pub', slot = +body.slot; if (![0, 1, 2].includes(slot)) E(400, 'Emplacement inconnu.');
  if (set === 'priv' && me.priv_env) E(400, 'Les photos privées sont chiffrées : mettez à jour l’application.');
  const all = J(me.pics, {}), list = (all[set] || [null, null, null]).slice(0, 3);
  if (body.media) {
    const m = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL AND enc=0`, String(body.media), me.id); if (!m) E(400, 'Photo introuvable.');
    run(`UPDATE media SET scope=?, ref=? WHERE id=?`, set === 'pub' ? 'ppub' : 'ppriv', me.id, m.id);
  }
  if (list[slot]) dropMedia(list[slot]);
  list[slot] = body.media ? String(body.media) : null; all[set] = list;
  run(`UPDATE users SET pics=? WHERE id=?`, JSON.stringify(all), me.id);
  return { me: meOut(getUser(me.id)) };
});
R('POST', /^\/api\/contacts\/share-tel$/, async ({ me, body }) => {
  const id = +body.id; if (relation(me.id, id) !== 'contact') E(400, 'Cette personne doit d’abord être votre contact.');
  if (body.on) run(`INSERT OR IGNORE INTO tel_share(owner,viewer) VALUES(?,?)`, me.id, id); else run(`DELETE FROM tel_share WHERE owner=? AND viewer=?`, me.id, id);
  push(id, { t: 'contacts' }); return { ok: true };
});
// Tous les membres de Tam-Tam (profil public seulement), pour les découvrir et leur demander d'être amis.
R('GET', /^\/api\/people$/, async ({ me, url }) => {
  const off = Math.max(0, +url.searchParams.get('off') || 0);
  if (tooMany('people:' + me.id, 40, 60 * 60_000)) E(429, 'Vous avez parcouru beaucoup de profils. Faites une pause et réessayez plus tard.');
  const rows = qa(`SELECT * FROM users WHERE id<>? AND listed=1 AND id NOT IN (SELECT CASE WHEN a=? THEN b ELSE a END FROM contacts WHERE (a=? OR b=?)) ORDER BY id DESC LIMIT 31 OFFSET ?`, me.id, me.id, me.id, me.id, off);
  return { users: rows.slice(0, 30).filter(u => !blockedEither(me.id, u.id)).map(u => userCard(u, me.id)), more: rows.length > 30 };
});
// Message à vue unique : ouvert une fois, puis effacé du serveur quand tous les destinataires l'ont vu.
R('POST', /^\/api\/messages\/(\d+)\/opened$/, async ({ me, m }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=? AND once=1`, +m[1]); if (!msg || !isMember(msg.chat_id, me.id)) E(404, 'Message introuvable.');
  if (msg.sender === me.id) return { ok: true };
  run(`INSERT OR IGNORE INTO once_views(msg_id,user_id,at) VALUES(?,?,?)`, msg.id, me.id, now());
  const others = memberIds(msg.chat_id).filter(x => x !== msg.sender), seen = new Set(qa(`SELECT user_id FROM once_views WHERE msg_id=?`, msg.id).map(r => r.user_id));
  if (others.every(x => seen.has(x))) { if (msg.media) dropMedia(msg.media); run(`UPDATE messages SET text=NULL WHERE id=?`, msg.id); }
  pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true });
  return { ok: true };
});
// Capture d'écran repérée sur l'appareil : on prévient tout le monde dans la discussion.
R('POST', /^\/api\/chats\/(\d+)\/shot$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]); if (tooMany('shot:' + me.id, 10, 60_000)) return { ok: true };
  sysMsg(c.id, `📸 ${nameInChat(me, c)} a fait une capture d’écran${body.once ? ' d’un message à vue unique' : ''}`); return { ok: true };
});
// Déverrouillage de secours : le mot de passe Tam-Tam, vérifié sans déconnecter.
R('POST', /^\/api\/me\/unlock$/, async ({ me, body }) => {
  if (blockedNow('unlock:' + me.id, 8)) E(429, 'Trop d’essais. Réessayez dans 15 minutes.');
  if (!checkPass(String(body.pass || ''), me.pass)) { tooMany('unlock:' + me.id, 8); E(400, 'Mot de passe incorrect.'); }
  return { ok: true };
});
R('POST', /^\/api\/me\/password$/, async ({ me, body }) => {
  if (!checkPass(body.old, me.pass)) E(400, 'Le mot de passe actuel est incorrect.');
  passOk(body.pass, me.email);
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(body.pass), me.id);
  run(`DELETE FROM sessions WHERE user_id=? AND rowid<>?`, me.id, me.s_id); return { ok: true };
});
// Appareils connectés : les voir et les déconnecter.
R('GET', /^\/api\/sessions$/, async ({ me }) => ({ sessions: qa(`SELECT rowid AS id, created, seen, ua FROM sessions WHERE user_id=? AND expires>? ORDER BY seen DESC`, me.id, now()).map(x => ({ ...x, current: x.id === me.s_id })) }));
R('POST', /^\/api\/sessions\/revoke$/, async ({ me, body }) => {
  if (body.others) run(`DELETE FROM sessions WHERE user_id=? AND rowid<>?`, me.id, me.s_id);
  else run(`DELETE FROM sessions WHERE user_id=? AND rowid=? AND rowid<>?`, me.id, +body.id, me.s_id);
  return { ok: true };
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
  const rows = qa(`SELECT * FROM users WHERE id<>? AND (handle LIKE ? OR lower(name) LIKE ?) LIMIT 60`, me.id, q + '%', '%' + q + '%');
  return { users: rows.filter(u => !blockedEither(me.id, u.id) && (u.handle.startsWith(q) || relation(me.id, u.id) === 'contact')).slice(0, 20).map(u => userCard(u, me.id)) };
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
  } else { run(`DELETE FROM contacts WHERE a=? AND b=?`, a, b); run(`DELETE FROM tel_share WHERE (owner=? AND viewer=?) OR (owner=? AND viewer=?)`, me.id, id, id, me.id); }
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
  const rows = qa(`SELECT c.* FROM chats c JOIN members m ON m.chat_id=c.id WHERE m.user_id=? AND c.expires IS NULL`, me.id);
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
  sysMsg(cid, `@${me.handle} a créé le groupe « ${name} »`);
  pushMany(ids, { t: 'chats' });
  return { chat: chatOut(q1(`SELECT * FROM chats WHERE id=?`, cid), me.id) };
});
function sysMsg(cid, text) {
  const id = run(`INSERT INTO messages(chat_id,sender,kind,text,created_at) VALUES(?,NULL,'sys',?,?)`, cid, text, now()).lastInsertRowid;
  pushMany(memberIds(cid), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, id)) });
}
/* ---------- appels audio et vidéo (signalisation seulement : le son et l'image passent d'un appareil à l'autre) ---------- */
const TURN_SECRET = process.env.TURN_SECRET || '', TURN_HOST = process.env.TURN_HOST || '';
R('GET', /^\/api\/call\/ice$/, async ({ me }) => {
  const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (TURN_SECRET && TURN_HOST) {
    const username = `${Math.floor(now() / 1000) + 12 * 3600}:${me.id}`;
    ice.push({ urls: [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`], username, credential: crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64') });
  }
  return { ice };
});
const pendingRings = new Map(); // personne appelée -> sonnerie en attente (45 s)
const CALL_T = ['ring', 'accept', 'decline', 'busy', 'end', 'offer', 'answer', 'ice', 'media'];
R('POST', /^\/api\/call\/signal$/, async ({ me, body }) => {
  const type = String(body.type || ''), callId = clean(body.callId, 40), to = +body.to, cid = +body.chatId;
  if (!CALL_T.includes(type) || !/^[A-Za-z0-9_-]{8,40}$/.test(callId)) E(400, 'Signal d’appel invalide.');
  const c = chatFor(me, cid); if (c.type !== 'direct' || !isMember(cid, to) || to === me.id) E(400, 'Les appels se font en discussion à deux.');
  if (blockedEither(me.id, to)) E(403, 'Appel impossible avec cette personne.');
  if (type === 'ring' && tooMany('call:' + me.id, 20, 10 * 60_000)) E(429, 'Trop d’appels. Patientez quelques minutes.');
  const data = body.data == null ? null : JSON.parse(JSON.stringify(body.data).slice(0, 60_000));
  const ev = { t: 'call', type, callId, chatId: cid, from: me.id, video: !!body.video, data };
  if (type === 'ring') { ev.fromUser = userCard(me, to); if (c.expires) run(`UPDATE chats SET expires=? WHERE id=?`, now() + NUM_TTL, c.id); }
  const wasOffline = type === 'ring' && !online(to);
  // journal des appels (onglet « Appels »)
  if (type === 'ring' && !q1(`SELECT 1 FROM calls WHERE call_id=?`, callId)) run(`INSERT INTO calls(call_id,kind,chat_id,caller,callee,video,status,started) VALUES(?,?,?,?,?,?,?,?)`, callId, 'direct', cid, me.id, to, body.video ? 1 : 0, 'ringing', now());
  else if (type === 'accept') run(`UPDATE calls SET status='answered', answered=? WHERE call_id=? AND answered IS NULL`, now(), callId);
  else if (type === 'decline' || type === 'busy') run(`UPDATE calls SET status=?, ended=? WHERE call_id=? AND status='ringing'`, type === 'busy' ? 'busy' : 'declined', now(), callId);
  else if (type === 'end') run(`UPDATE calls SET ended=COALESCE(ended,?), status=CASE WHEN status='ringing' THEN 'missed' ELSE status END WHERE call_id=?`, now(), callId);
  if (type === 'ring') {
    // Le téléphone de la personne appelée sonne même si tam-tam est fermé : notification « touchez pour répondre ».
    pendingRings.set(to, { ev, at: now() });
    webPush(to, { title: nameFor(me, to), body: `📞 ${body.video ? 'Appel vidéo' : 'Appel vocal'} entrant · touchez pour répondre`, tag: 'ring-' + callId, url: '/?call=' + callId, ring: true }, true);
  }
  if (['accept', 'decline', 'busy', 'end'].includes(type)) { const who = type === 'end' ? to : me.id, pr = pendingRings.get(who); if (pr && pr.ev.callId === callId) pendingRings.delete(who); }
  if (type === 'end') webPush(to, { title: nameFor(me, to), body: 'Appel terminé', tag: 'ring-' + callId, url: '/?chat=' + cid, close: true }, true);
  push(to, ev);
  if (type === 'accept' || type === 'decline') push(me.id, { ...ev, elsewhere: true }); // arrête la sonnerie sur mes autres appareils
  if (type === 'end' && body.log) {
    const d = Math.max(0, Math.round(+body.log.dur || 0)), v = body.video ? 'Appel vidéo' : 'Appel vocal';
    sysMsg(cid, d > 0 ? `${v} · ${d >= 60 ? Math.floor(d / 60) + ' min ' + String(d % 60).padStart(2, '0') + ' s' : d + ' s'}` : `${v} manqué de ${firstFor(me, to)}`);
  }
  return { ok: true, pushed: wasOffline };
});
R('GET', /^\/api\/call\/pending$/, async ({ me }) => {
  const pr = pendingRings.get(me.id); if (!pr || now() - pr.at > 45_000) { pendingRings.delete(me.id); return { ev: null }; }
  return { ev: pr.ev };
});

/* ---------- notifications sur le téléphone, même quand tam-tam est fermé ---------- */
function vapid() {
  let r = q1(`SELECT v FROM settings WHERE k='vapid'`), v = r ? J(r.v, null) : null;
  if (!v) { v = webpush.generateVAPIDKeys(); run(`INSERT OR REPLACE INTO settings(k,v) VALUES('vapid',?)`, JSON.stringify(v)); }
  return v;
}
const VAPID = vapid();
webpush.setVapidDetails('mailto:' + (OWNER || 'contact@alveris-consulting.com'), VAPID.publicKey, VAPID.privateKey);
// Le contenu des messages reste chiffré : la notification dit seulement qui écrit.
function unreadCount(uid) {
  return q1(`SELECT COUNT(*) n FROM messages m JOIN members mb ON mb.chat_id=m.chat_id AND mb.user_id=? WHERE m.id>mb.last_read AND m.deleted=0 AND (m.sender IS NULL OR m.sender<>?)`, uid, uid).n;
}
function webPush(uid, payload, always = false) {
  if (!always && online(uid)) return;
  if (payload.badge === undefined) payload.badge = unreadCount(uid);
  for (const sub of qa(`SELECT * FROM push_subs WHERE user_id=?`, uid)) {
    webpush.sendNotification({ endpoint: sub.endpoint, keys: J(sub.keys, {}) }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' })
      .catch(e => { if (e && (e.statusCode === 404 || e.statusCode === 410)) run(`DELETE FROM push_subs WHERE endpoint=?`, sub.endpoint); });
  }
}
R('GET', /^\/api\/push\/key$/, async () => ({ key: VAPID.publicKey }));
R('POST', /^\/api\/push\/sub$/, async ({ me, body }) => {
  const s = body.sub || {}, ep = String(s.endpoint || '');
  if (!/^https:\/\/[^\s]{10,800}$/.test(ep) || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') E(400, 'Abonnement invalide.');
  run(`INSERT OR REPLACE INTO push_subs(endpoint,user_id,keys,created_at) VALUES(?,?,?,?)`, ep, me.id, JSON.stringify({ p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) }), now());
  return { ok: true };
});
R('POST', /^\/api\/push\/unsub$/, async ({ me, body }) => { run(`DELETE FROM push_subs WHERE endpoint=? AND user_id=?`, String(body.endpoint || ''), me.id); return { ok: true }; });
R('POST', /^\/api\/push\/test$/, async ({ me }) => { webPush(me.id, { title: 'tam-tam', body: 'Les notifications fonctionnent sur cet appareil 🥁', tag: 'test', url: '/' }, true); return { ok: true }; });

/* ---------- appels de groupe (jusqu'à 8) : le serveur tient la liste des participants ---------- */
const GMAX = 8, gcalls = new Map(); // callId -> {chatId, video, parts:Set, started}
const gcallOf = chatId => [...gcalls.entries()].find(([, g]) => g.chatId === chatId);
function gstate(g, id) { pushMany(memberIds(g.chatId), { t: 'gcall', type: 'state', callId: id, chatId: g.chatId, video: g.video, parts: [...g.parts] }); }
function gleave(uid, id) {
  const g = gcalls.get(id); if (!g || !g.parts.has(uid)) return;
  g.parts.delete(uid);
  for (const p of g.parts) push(p, { t: 'gcall', type: 'left', callId: id, user: uid });
  if (!g.parts.size) {
    gcalls.delete(id); const d = Math.round((now() - g.started) / 1000); run(`UPDATE calls SET ended=? WHERE call_id=?`, now(), id);
    sysMsg(g.chatId, `Appel de groupe terminé · ${d >= 60 ? Math.floor(d / 60) + ' min' : d + ' s'}`);
  }
  gstate(g, id);
}
R('POST', /^\/api\/gcall\/start$/, async ({ me, body }) => {
  const c = chatFor(me, +body.chatId); if (c.type !== 'group') E(400, 'Les appels de groupe se font dans un groupe.');
  const ex = gcallOf(c.id); if (ex) return { callId: ex[0], existing: true };
  if (tooMany('gcall:' + me.id, 10, 10 * 60_000)) E(429, 'Trop d’appels. Patientez quelques minutes.');
  const id = crypto.randomBytes(9).toString('base64url'), video = !!body.video;
  gcalls.set(id, { chatId: c.id, video, parts: new Set(), started: now() });
  run(`INSERT INTO calls(call_id,kind,chat_id,caller,callee,video,status,started) VALUES(?,?,?,?,NULL,?,?,?)`, id, 'group', c.id, me.id, video ? 1 : 0, 'answered', now());
  const fn = '@' + me.handle;
  sysMsg(c.id, `${fn} a lancé un appel ${video ? 'vidéo' : 'vocal'} de groupe`);
  for (const uid of memberIds(c.id)) if (uid !== me.id) {
    push(uid, { t: 'gcall', type: 'ring', callId: id, chatId: c.id, from: me.id, video });
    webPush(uid, { title: c.name || 'Groupe', body: `${fn} lance un appel ${video ? 'vidéo' : 'vocal'} de groupe`, tag: 'gcall-' + c.id, url: '/?chat=' + c.id });
  }
  return { callId: id };
});
R('POST', /^\/api\/gcall\/join$/, async ({ me, body }) => {
  const id = String(body.callId || ''), g = gcalls.get(id); if (!g) E(404, 'Cet appel est terminé.');
  chatFor(me, g.chatId);
  if (!g.parts.has(me.id) && g.parts.size >= GMAX) E(409, `L’appel est complet (${GMAX} personnes au maximum).`);
  const others = [...g.parts].filter(x => x !== me.id);
  g.parts.add(me.id);
  const row = q1(`SELECT joined FROM calls WHERE call_id=?`, id); if (row) { const j = new Set(J(row.joined, [])); j.add(me.id); run(`UPDATE calls SET joined=? WHERE call_id=?`, JSON.stringify([...j]), id); }
  for (const p of others) push(p, { t: 'gcall', type: 'joined', callId: id, user: me.id });
  gstate(g, id);
  return { parts: others, video: g.video, chatId: g.chatId };
});
R('POST', /^\/api\/gcall\/signal$/, async ({ me, body }) => {
  const id = String(body.callId || ''), g = gcalls.get(id), to = +body.to, type = String(body.type || '');
  if (!g || !g.parts.has(me.id) || !g.parts.has(to) || !['offer', 'answer', 'ice', 'media'].includes(type)) E(400, 'Signal d’appel invalide.');
  const data = body.data == null ? null : JSON.parse(JSON.stringify(body.data).slice(0, 60_000));
  push(to, { t: 'gcall', type, callId: id, from: me.id, data });
  return { ok: true };
});
R('POST', /^\/api\/gcall\/leave$/, async ({ me, body }) => { gleave(me.id, String(body.callId || '')); return { ok: true }; });
R('GET', /^\/api\/gcall\/active$/, async ({ me }) => {
  const mine = new Set(qa(`SELECT chat_id FROM members WHERE user_id=?`, me.id).map(r => r.chat_id));
  return { calls: [...gcalls.entries()].filter(([, g]) => mine.has(g.chatId)).map(([id, g]) => ({ callId: id, chatId: g.chatId, video: g.video, parts: [...g.parts] })) };
});

/* ---------- onglet « Appels » : historique et numéros ---------- */
R('GET', /^\/api\/calls$/, async ({ me }) => {
  const mine = qa(`SELECT chat_id FROM members WHERE user_id=?`, me.id).map(r => r.chat_id);
  const rows = qa(`SELECT * FROM calls WHERE caller=? OR callee=? OR (kind='group' AND chat_id IN (${mine.map(() => '?').join(',') || 'NULL'})) ORDER BY started DESC LIMIT 150`, me.id, me.id, ...mine);
  const users = {}, numIds = new Set(qa(`SELECT id FROM chats WHERE expires IS NOT NULL`).map(x => x.id));
  const list = rows.map(r => {
    const out = r.caller === me.id, peer = r.kind === 'direct' ? (out ? r.callee : r.caller) : null;
    if (peer && !users[peer]) { const u = getUser(peer); if (u) users[peer] = userCard(u, me.id); }
    const joined = J(r.joined, []), mineJoined = r.kind === 'group' && (out || joined.includes(me.id));
    let status = r.status;
    if (r.kind === 'group') status = mineJoined ? 'answered' : 'missed';
    else if (!out && status !== 'answered') status = 'missed';
    else if (out && status === 'ringing') status = r.ended ? 'missed' : 'ringing';
    const from = r.answered || (r.kind === 'group' ? r.started : null), dur = from && r.ended ? Math.round((r.ended - from) / 1000) : 0;
    return { id: r.id, kind: r.kind, chatId: r.chat_id, num: !!numIds.has(r.chat_id), peer, dir: out ? 'out' : 'in', video: !!r.video, status, at: r.started, dur };
  });
  return { calls: list, users };
});
const digits = s => String(s || '').replace(/\D/g, '');
R('GET', /^\/api\/calls\/lookup$/, async ({ me, url }) => {
  const n = digits(url.searchParams.get('num')); if (n.length < 6) E(400, 'Numéro trop court.');
  const key = n.slice(-9);
  for (const id of contactIds(me.id)) {
    const u = getUser(id); if (!u || !canSeePriv(u, me.id)) continue;
    if (u.tel_hash ? u.tel_hash === sha(key) : digits(J(u.priv, {}).tel).slice(-9) === key) return { user: userCard(u, me.id) };
  }
  return { user: null };
});

// Appel par numéro (chauffeur, livreur…) : on peut appeler un membre de Tam-Tam sans être amis.
// Seuls les appels sont possibles (pas de messages), et la ligne disparaît 2 h après le dernier appel.
const NUM_TTL = 2 * 3600_000;
function numLine(me, other) {
  const [a, b] = pair(me, other), key = `n:${a}-${b}`; let c = q1(`SELECT * FROM chats WHERE direct_key=?`, key);
  if (c && c.expires && c.expires < now()) { run(`DELETE FROM calls WHERE chat_id=?`, c.id); run(`DELETE FROM chats WHERE id=?`, c.id); c = null; }
  if (!c) {
    const cid = run(`INSERT INTO chats(type,direct_key,created_by,created_at,expires) VALUES('direct',?,?,?,?)`, key, me, now(), now() + NUM_TTL).lastInsertRowid;
    for (const u of [me, other]) run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, cid, u, now());
    c = q1(`SELECT * FROM chats WHERE id=?`, cid);
  } else run(`UPDATE chats SET expires=? WHERE id=?`, now() + NUM_TTL, c.id);
  return q1(`SELECT * FROM chats WHERE id=?`, c.id);
}
R('POST', /^\/api\/calls\/bynum$/, async ({ me, body }) => {
  const n = digits(body.num); if (n.length < 8) E(400, 'Tapez le numéro complet.');
  if (tooMany('bynum:' + me.id, 15, 60 * 60_000)) E(429, 'Vous avez composé beaucoup de numéros. Réessayez dans une heure.');
  let u = q1(`SELECT * FROM users WHERE tel_hash=? AND id<>?`, sha(n.slice(-9)), me.id);
  // Anciens profils dont le numéro n'a pas encore d'empreinte : seulement parmi mes amis qui me le montrent.
  if (!u) for (const id of contactIds(me.id)) { const c = getUser(id); if (c && !c.tel_hash && canSeePriv(c, me.id) && digits(J(c.priv, {}).tel).slice(-9) === n.slice(-9)) { u = c; break; } }
  if (!u || blockedEither(me.id, u.id)) return { user: null };
  if (relation(me.id, u.id) === 'contact') return { user: userCard(u, me.id), contact: true };
  return { user: userCard(u, me.id), chat: chatOut(numLine(me.id, u.id), me.id) };
});
// Rappeler depuis l'historique une personne jointe par numéro (dans les 2 h).
R('POST', /^\/api\/calls\/again$/, async ({ me, body }) => {
  const c = q1(`SELECT * FROM chats WHERE id=? AND expires IS NOT NULL AND expires>?`, +body.chatId, now());
  if (!c || !isMember(c.id, me.id)) E(404, 'Ce numéro n’est plus dans votre historique (effacé au bout de 2 h).');
  const o = memberIds(c.id).find(x => x !== me.id); if (!o || blockedEither(me.id, o)) E(403, 'Appel impossible avec cette personne.');
  run(`UPDATE chats SET expires=? WHERE id=?`, now() + NUM_TTL, c.id);
  return { chat: chatOut(q1(`SELECT * FROM chats WHERE id=?`, c.id), me.id) };
});

/* ---------- discussions privées : cachées du fil, révélées par un code tapé dans la recherche ---------- */
R('POST', /^\/api\/chats\/(\d+)\/hide$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]);
  if (body.on) {
    if (!me.hide_code) { const code = String(body.code || ''); if (!/^\d{4,8}$/.test(code)) E(400, 'Choisissez un code de 4 à 8 chiffres.'); run(`UPDATE users SET hide_code=? WHERE id=?`, hashPass(code), me.id); }
  }
  run(`UPDATE members SET hidden=? WHERE chat_id=? AND user_id=?`, body.on ? 1 : 0, c.id, me.id);
  return { ok: true, chat: chatOut(c, me.id) };
});
R('POST', /^\/api\/private\/unlock$/, async ({ me, body }) => {
  if (!me.hide_code) return { ok: false };
  if (blockedNow('priv:' + me.id, 10)) return { ok: false, wait: true };
  const ok = checkPass(String(body.code || ''), me.hide_code); if (!ok) tooMany('priv:' + me.id, 10);
  return { ok };
});
R('POST', /^\/api\/private\/code$/, async ({ me, body }) => {
  const code = String(body.code || ''); if (!/^\d{4,8}$/.test(code)) E(400, 'Choisissez un code de 4 à 8 chiffres.');
  if (me.hide_code && !checkPass(String(body.old || ''), me.hide_code)) E(403, 'L’ancien code n’est pas le bon.');
  run(`UPDATE users SET hide_code=? WHERE id=?`, hashPass(code), me.id); return { ok: true };
});

/* ---------- code QR personnel : se connecter en scannant ---------- */
function qrUrl(me) {
  let t = getUser(me.id).qr_token; if (!t) { t = rnd(12); run(`UPDATE users SET qr_token=? WHERE id=?`, t, me.id); }
  return `${BASE_URL}/add/${t}`;
}
R('GET', /^\/api\/qr$/, async ({ me }) => { const url = qrUrl(me); return { url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f2430', light: '#ffffff' } }) }; });
R('POST', /^\/api\/qr\/reset$/, async ({ me }) => { run(`UPDATE users SET qr_token=? WHERE id=?`, rnd(12), me.id); const url = qrUrl(me); return { url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0f2430', light: '#ffffff' } }) }; });
R('POST', /^\/api\/qr\/connect$/, async ({ me, body }) => {
  const o = q1(`SELECT * FROM users WHERE qr_token=?`, clean(body.token, 40)); if (!o) E(404, 'Ce code QR n’est plus valable. Demandez-en un nouveau.');
  if (o.id === me.id) E(400, 'C’est votre propre code QR.');
  if (blockedEither(me.id, o.id)) E(403, 'Connexion impossible avec cette personne.');
  if (tooMany('qr:' + me.id, 30, 60 * 60_000)) E(429, 'Trop d’essais. Réessayez plus tard.');
  const [a, b] = pair(me.id, o.id), ex = q1(`SELECT * FROM contacts WHERE a=? AND b=?`, a, b);
  if (!ex) run(`INSERT INTO contacts(a,b,status,requester,created_at,lim) VALUES(?,?,'accepted',?,?,?)`, a, b, me.id, now(), o.id);
  else if (ex.status !== 'accepted') run(`UPDATE contacts SET status='accepted', lim=? WHERE a=? AND b=?`, o.id, a, b);
  push(o.id, { t: 'contacts' }); push(me.id, { t: 'contacts' });
  return { user: userCard(o, me.id), already: !!(ex && ex.status === 'accepted') };
});
R('POST', /^\/api\/contacts\/share-priv$/, async ({ me, body }) => {
  const id = +body.id, [a, b] = pair(me.id, id);
  run(`UPDATE contacts SET lim=0 WHERE a=? AND b=? AND lim=?`, a, b, me.id); push(id, { t: 'contacts' }); return { ok: true };
});

/* ---------- favoris et répertoire du téléphone ---------- */
R('POST', /^\/api\/chats\/(\d+)\/fav$/, async ({ me, m, body }) => { const c = chatFor(me, +m[1]); run(`UPDATE members SET fav=? WHERE chat_id=? AND user_id=?`, body.fav ? 1 : 0, c.id, me.id); return { ok: true }; });
// Le téléphone envoie des empreintes des numéros (pas les numéros eux-mêmes) ; on répond lesquels ont Tam-Tam.
const matchQuota = new Map();
R('POST', /^\/api\/contacts\/match$/, async ({ me, body }) => {
  if (tooMany('match:' + me.id, 20, 60 * 60_000)) E(429, 'Trop de demandes. Réessayez plus tard.');
  const want = new Set((Array.isArray(body.hashes) ? body.hashes : []).slice(0, 3000).map(String));
  // Au plus 3 000 numéros vérifiés par jour et par compte : empêche de deviner les numéros en masse.
  const day = new Date().toISOString().slice(0, 10), q = matchQuota.get(me.id); const used = q && q.day === day ? q.n : 0;
  if (used + want.size > 3000) E(429, 'Vous avez déjà vérifié beaucoup de numéros aujourd’hui. Réessayez demain.');
  matchQuota.set(me.id, { day, n: used + want.size });
  const out = {};
  for (const u of qa(`SELECT * FROM users WHERE id<>? AND (tel_hash IS NOT NULL OR priv LIKE '%"tel"%')`, me.id)) {
    let h = u.tel_hash; if (!h) { const t = String(J(u.priv, {}).tel || '').replace(/\D/g, ''); if (t.length < 6) continue; h = sha(t.slice(-9)); }
    if (!want.has(h) || blockedEither(me.id, u.id)) continue;
    const c = userCard(u, me.id); out[h] = { id: c.id, name: c.name, handle: c.handle, avatar: c.avatar, photo: c.photo, rel: c.rel };
  }
  return { matches: out };
});

function chatFor(me, id) { const c = q1(`SELECT * FROM chats WHERE id=?`, id); if (!c || !isMember(id, me.id)) E(404, 'Discussion introuvable.'); return c; }
R('POST', /^\/api\/chats\/(\d+)\/members$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Seuls les groupes acceptent de nouveaux membres.');
  const ok = new Set(contactIds(me.id)), ids = (body.add || []).map(Number).filter(x => ok.has(x) && !isMember(c.id, x));
  for (const u of ids) { run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, c.id, u, now()); sysMsg(c.id, `@${me.handle} a ajouté @${getUser(u).handle}`); }
  pushMany(memberIds(c.id), { t: 'chats' });
  return { chat: chatOut(c, me.id) };
});
R('POST', /^\/api\/chats\/(\d+)\/leave$/, async ({ me, m }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Impossible de quitter une discussion à deux.');
  run(`DELETE FROM members WHERE chat_id=? AND user_id=?`, c.id, me.id); sysMsg(c.id, `@${me.handle} a quitté le groupe`);
  if (!q1(`SELECT 1 FROM members WHERE chat_id=?`, c.id)) run(`DELETE FROM chats WHERE id=?`, c.id);
  return { ok: true };
});
R('GET', /^\/api\/chats\/(\d+)\/messages$/, async ({ me, m, url }) => {
  const c = chatFor(me, +m[1]), before = +url.searchParams.get('before') || 9e15;
  const rows = qa(`SELECT * FROM messages WHERE chat_id=? AND id<? AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?) ORDER BY id DESC LIMIT 60`, c.id, before, me.id).reverse();
  return { messages: rows.map(r => msgFor(r, me.id)), more: rows.length === 60 };
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
  const id = Number(run(`INSERT INTO messages(chat_id,sender,kind,text,media,reply_to,e2e,once,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, c.id, me.id, media ? (e2e && ['audio', 'video'].includes(body.kind) ? body.kind : 'image') : 'text', text || null, media, body.once ? null : reply, e2e, body.once ? 1 : 0, now()).lastInsertRowid);
  if (media) run(`UPDATE media SET scope='chat', ref=? WHERE id=?`, c.id, media);
  run(`UPDATE members SET last_read=? WHERE chat_id=? AND user_id=?`, id, c.id, me.id);
  const msg = msgOut(q1(`SELECT * FROM messages WHERE id=?`, id));
  pushMany(memberIds(c.id), { t: 'msg', msg });
  const hiddenFor = new Set(qa(`SELECT user_id FROM members WHERE chat_id=? AND hidden=1`, c.id).map(r => r.user_id));
  for (const uid of memberIds(c.id)) if (uid !== me.id) webPush(uid, hiddenFor.has(uid) ? { title: 'tam-tam', body: 'Nouveau message', tag: 'chat-p', url: '/' } : c.type === 'group'
    ? { title: c.name || 'Groupe', body: `${firstFor(me, uid)} : ${media ? (body.kind === 'video' ? '🎥 Vidéo' : body.kind === 'audio' ? '🎤 Vocal' : '📷 Photo') : 'nouveau message'}`, tag: 'chat-' + c.id, url: '/?chat=' + c.id }
    : { title: nameFor(me, uid), body: media ? (body.kind === 'video' ? '🎥 Vidéo' : body.kind === 'audio' ? '🎤 Vocal' : '📷 Photo') : 'Nouveau message', tag: 'chat-' + c.id, url: '/?chat=' + c.id });
  return { msg };
});
R('POST', /^\/api\/chats\/(\d+)\/read$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]), up = Math.max(0, +body.upTo || 0);
  const mx = q1(`SELECT MAX(id) x FROM messages WHERE chat_id=?`, c.id).x || 0, v = Math.min(up, mx);
  run(`UPDATE members SET last_read=MAX(last_read,?) WHERE chat_id=? AND user_id=?`, v, c.id, me.id);
  pushMany(me.avail === 'off' ? [me.id] : memberIds(c.id), { t: 'read', chatId: c.id, user: me.id, upTo: v });
  return { ok: true };
});
R('POST', /^\/api\/chats\/(\d+)\/typing$/, async ({ me, m }) => {
  const c = chatFor(me, +m[1]); pushMany(memberIds(c.id).filter(x => x !== me.id), { t: 'typing', chatId: c.id, user: me.id }); return { ok: true };
});
// Supprimer pour moi : le message disparaît seulement de mon côté, à tout moment.
R('POST', /^\/api\/messages\/(\d+)\/hide$/, async ({ me, m }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg) E(404, 'Message introuvable.'); chatFor(me, msg.chat_id);
  run(`INSERT OR IGNORE INTO msg_hidden(user_id,msg_id) VALUES(?,?)`, me.id, msg.id);
  push(me.id, { t: 'hide', chatId: msg.chat_id, id: msg.id }); return { ok: true };
});
// Supprimer pour tout le monde : seulement ses propres messages, et dans l'heure qui suit l'envoi.
const DEL_ALL_MAX = 3600_000;
R('POST', /^\/api\/messages\/(\d+)\/delete$/, async ({ me, m }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg || msg.sender !== me.id) E(404, 'Message introuvable.');
  if (now() - msg.created_at > DEL_ALL_MAX) E(403, 'Ce message a plus d’une heure : il ne peut plus être supprimé pour tout le monde. Vous pouvez le supprimer pour vous seul.');
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
  const buf = await readBody(req, enc ? 42_000_000 : 6_000_000); if (buf.length < 100) E(400, 'Fichier vide.');
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
  if (!ok && md.scope === 'ppub') ok = !blockedEither(md.owner, me.id);
  if (!ok && md.scope === 'ppriv') { const o = getUser(md.owner); ok = !!o && canSeePriv(o, me.id); }
  if (!ok && md.scope === 'chat') {
    ok = isMember(md.ref, me.id);
    const om = ok && q1(`SELECT id FROM messages WHERE media=? AND once=1`, md.id); if (om && q1(`SELECT 1 FROM once_views WHERE msg_id=? AND user_id=?`, om.id, me.id)) ok = false;
  }
  if (!ok && md.scope === 'mem') { const mm = q1(`SELECT * FROM memories WHERE id=?`, md.ref); ok = !!mm && memVisible(mm, me.id); }
  if (!ok && md.scope === 'status') { const s = q1(`SELECT * FROM statuses WHERE id=?`, md.ref); ok = !!s && statusVisible(s, me.id); }
  if (!ok) E(404, 'Introuvable');
  res.writeHead(200, { 'Content-Type': md.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(path.join(MEDIA, md.id)).on('error', () => res.end()).pipe(res);
  return null;
});

/* souvenirs : photos et vidéos gardées dans le temps (publiques, privées ou restreintes) */
function memVisible(m, viewer) {
  if (m.user_id === viewer) return true;
  if (blockedEither(m.user_id, viewer)) return false;
  if (m.aud === 'public') return true;
  if (m.aud === 'restricted') return !!q1(`SELECT 1 FROM mem_access WHERE mem_id=? AND user_id=?`, m.id, viewer);
  return false;
}
const memOut = m => ({ id: m.id, kind: m.kind, media: mediaUrl(m.media), thumb: mediaUrl(m.thumb), env: J(m.env, null), aud: m.aud, takenAt: m.taken_at, at: m.created_at });
R('GET', /^\/api\/memories$/, async ({ me, url }) => {
  const uid = +url.searchParams.get('user') || me.id, u = getUser(uid); if (!u) E(404, 'Personne introuvable.');
  const rows = qa(`SELECT * FROM memories WHERE user_id=? ORDER BY taken_at DESC LIMIT 600`, uid).filter(m => memVisible(m, me.id));
  return { items: rows.map(m => uid === me.id ? { ...memOut(m), to: m.aud === 'restricted' ? qa(`SELECT user_id FROM mem_access WHERE mem_id=?`, m.id).map(r => r.user_id) : undefined } : memOut(m)) };
});
R('POST', /^\/api\/memories$/, async ({ me, body }) => {
  if (tooMany('mem:' + me.id, 120, DAY)) E(429, 'Beaucoup de souvenirs ajoutés aujourd’hui. Réessayez demain.');
  if (q1(`SELECT COUNT(*) n FROM memories WHERE user_id=?`, me.id).n >= 2000) E(400, 'Vous avez atteint 2 000 souvenirs. Supprimez-en quelques-uns.');
  const aud = ['public', 'private', 'restricted'].includes(body.aud) ? body.aud : 'private', kind = body.kind === 'video' ? 'video' : 'image';
  const env = body.env; if (!env || typeof env !== 'object' || typeof env.ct !== 'string' || typeof env.iv !== 'string' || JSON.stringify(env).length > 200_000) E(400, 'Souvenir invalide.');
  if (aud === 'public' ? typeof env.k !== 'string' : (!env.keys || env.k)) E(400, 'Souvenir invalide.');
  const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.');
  const th = body.thumb ? q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.thumb), me.id) : null;
  const taken = Math.min(now() + DAY, Math.max(0, +body.taken || now()));
  const id = Number(run(`INSERT INTO memories(user_id,kind,media,thumb,env,aud,taken_at,created_at) VALUES(?,?,?,?,?,?,?,?)`, me.id, kind, md.id, th ? th.id : null, JSON.stringify(env), aud, taken, now()).lastInsertRowid);
  for (const x of [md, th]) if (x) run(`UPDATE media SET scope='mem', ref=? WHERE id=?`, id, x.id);
  if (aud === 'restricted') { const ok = new Set(contactIds(me.id)); for (const uid of (Array.isArray(body.to) ? body.to : []).map(Number)) if (ok.has(uid)) run(`INSERT OR IGNORE INTO mem_access(mem_id,user_id) VALUES(?,?)`, id, uid); }
  return { item: memOut(q1(`SELECT * FROM memories WHERE id=?`, id)) };
});
R('POST', /^\/api\/memories\/(\d+)\/delete$/, async ({ me, m }) => {
  const mm = q1(`SELECT * FROM memories WHERE id=? AND user_id=?`, +m[1], me.id); if (!mm) E(404, 'Souvenir introuvable.');
  dropMedia(mm.media); if (mm.thumb) dropMedia(mm.thumb); run(`DELETE FROM memories WHERE id=?`, mm.id); return { ok: true };
});

/* statuts */
R('GET', /^\/api\/statuses$/, async ({ me }) => {
  const ids = [me.id, ...contactIds(me.id)];
  const rows = qa(`SELECT * FROM statuses WHERE user_id IN (${ids.map(() => '?').join(',')}) AND expires>? ORDER BY created_at`, ...ids, now()).filter(s => statusVisible(s, me.id));
  const by = new Map();
  for (const s of rows) {
    if (!by.has(s.user_id)) by.set(s.user_id, { user: userCard(getUser(s.user_id), me.id), items: [] });
    const seen = !!q1(`SELECT 1 FROM status_views WHERE status_id=? AND viewer=?`, s.id, me.id);
    const it = { id: s.id, kind: s.kind, text: s.e2e ? '' : s.text, enc: s.e2e ? J(s.text, null) : null, bg: s.bg, media: mediaUrl(s.media), music: mediaUrl(s.music), aud: s.aud, at: s.created_at, expires: s.expires, seen };
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
  const aud = body.aud === 'private' ? 'private' : 'public'; let text = clean(body.text, 700), media = null, e2e = 0;
  if (body.enc) { if (!envOk(body.enc) || JSON.stringify(body.enc).length > 60000) E(400, 'Statut chiffré invalide.'); text = JSON.stringify({ iv: body.enc.iv, ct: body.enc.ct, keys: body.enc.keys, from: body.enc.from }); e2e = 1; }
  if (body.media) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.'); media = md.id; }
  let music = null; if (body.music && e2e) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.music), me.id); if (!md) E(400, 'Musique introuvable.'); music = md.id; }
  if (!media && !text) E(400, 'Écrivez un texte ou ajoutez une photo.');
  const bg = Math.max(0, Math.min(361, +body.bg || 170)), kind = media ? (body.kind === 'video' && e2e ? 'video' : 'image') : 'text';
  const id = Number(run(`INSERT INTO statuses(user_id,kind,text,bg,media,aud,created_at,expires,e2e,music) VALUES(?,?,?,?,?,?,?,?,?,?)`, me.id, kind, text || null, bg, media, aud, now(), now() + DAY, e2e, music).lastInsertRowid);
  if (media) run(`UPDATE media SET scope='status', ref=? WHERE id=?`, id, media);
  if (music) run(`UPDATE media SET scope='status', ref=? WHERE id=?`, id, music);
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
  if (s.media) dropMedia(s.media); if (s.music) dropMedia(s.music); run(`DELETE FROM statuses WHERE id=?`, s.id); pushMany(contactIds(me.id), { t: 'statuses' }); return { ok: true };
});

// Les sauvegardes de clés sont chiffrées une seconde fois avec une clé du serveur gardée hors de la base :
// une copie volée de la base seule ne permet pas d'essayer les codes.
const BK_KEY = /^[0-9a-f]{64}$/.test(process.env.BACKUP_KEY || '') ? Buffer.from(process.env.BACKUP_KEY, 'hex') : null;
function wrapBk(txt) {
  if (!BK_KEY || !txt || txt.startsWith('w1:')) return txt;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', BK_KEY, iv), ct = Buffer.concat([c.update(txt, 'utf8'), c.final()]);
  return 'w1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function unwrapBk(txt) {
  if (!txt || !txt.startsWith('w1:')) return txt; if (!BK_KEY) return null;
  const b = Buffer.from(txt.slice(3), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', BK_KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
if (BK_KEY) for (const r of qa(`SELECT id, keybackup FROM users WHERE keybackup IS NOT NULL AND keybackup NOT LIKE 'w1:%'`)) run(`UPDATE users SET keybackup=? WHERE id=?`, wrapBk(r.keybackup), r.id);
/* clés de chiffrement de bout en bout : le serveur garde la clé publique et une sauvegarde chiffrée par le code du membre */
R('POST', /^\/api\/keys$/, async ({ me, body }) => {
  const pk = body.pubkey; if (!pk || pk.kty !== 'EC' || pk.crv !== 'P-256' || typeof pk.x !== 'string' || typeof pk.y !== 'string' || pk.d) E(400, 'Clé invalide.');
  const b = body.backup; if (!b || typeof b.ct !== 'string' || typeof b.iv !== 'string' || typeof b.salt !== 'string' || !(+b.iter >= 100000)) E(400, 'Sauvegarde invalide.');
  if (JSON.stringify(b).length > 8000) E(413, 'Sauvegarde trop grande.');
  const old = me.pubkey;
  run(`UPDATE users SET pubkey=?, keybackup=? WHERE id=?`, JSON.stringify({ kty: 'EC', crv: 'P-256', x: pk.x, y: pk.y }), wrapBk(JSON.stringify({ ct: b.ct, iv: b.iv, salt: b.salt, iter: +b.iter })), me.id);
  if (old && J(old, {}).x !== pk.x) for (const c of qa(`SELECT chat_id FROM members WHERE user_id=?`, me.id)) sysMsg(c.chat_id, `Le code de sécurité de @${me.handle} a changé (nouvel appareil ou nouvelle clé).`);
  pushMany(contactIds(me.id), { t: 'contacts' });
  return { ok: true };
});
// La sauvegarde n'est remise que juste après une connexion (moins de 30 minutes) : un cookie volé ne suffit pas.
R('GET', /^\/api\/keys\/backup$/, async ({ me }) => {
  const pubkey = me.pubkey ? J(me.pubkey, null) : null; if (!me.keybackup) return { backup: null, has: false, pubkey };
  if (now() - me.s_created > 30 * 60_000) return { backup: null, has: true, stale: true, pubkey };
  if (tooMany('kb:' + me.id, 10, DAY)) E(429, 'Trop d’essais aujourd’hui. Réessayez demain.');
  return { backup: J(unwrapBk(me.keybackup), null), has: true, pubkey };
});

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
    try { await sendMail(email, `Votre code tam-tam : ${code}`, mailHtml('Réinitialiser votre mot de passe', `<p>Bonjour ${String(u.name || '').replace(/[<>&]/g, '')},</p><p>Voici votre code pour choisir un nouveau mot de passe :</p><p style="font-size:30px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p><p>Il est valable 15 minutes.</p>`)); }
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
  passOk(body.pass, email);
  const u = q1(`SELECT * FROM users WHERE email=?`, email); if (!u) E(400, 'Code incorrect.');
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(body.pass), u.id); run(`DELETE FROM codes WHERE email=?`, email); run(`DELETE FROM sessions WHERE user_id=?`, u.id);
  setSession(res, u.id); return { me: meOut(getUser(u.id)) };
}, false);

/* administration (propriétaire) */
/* ---------- connexion avec Google ---------- */
function googleSettings() { const r = q1(`SELECT v FROM settings WHERE k='google'`); const g = r ? J(r.v, null) : null; return g && g.id && g.secret ? g : null; }
const G_REDIRECT = () => `${BASE_URL}/api/oauth/google/callback`;
function redirect(res, to, cookie) { const h = { Location: to, 'Cache-Control': 'no-store' }; if (cookie) h['Set-Cookie'] = cookie; res.writeHead(302, h); res.end(); return null; }
R('GET', /^\/api\/oauth\/google\/start$/, async ({ req, res, url }) => {
  const g = googleSettings(); if (!g) return redirect(res, '/?g_err=' + encodeURIComponent('La connexion Google n’est pas encore activée.'));
  if (tooMany('gstart:' + ipOf(req), 30)) return redirect(res, '/?g_err=' + encodeURIComponent('Trop de tentatives. Réessayez plus tard.'));
  const state = rnd(24), invite = clean(url.searchParams.get('invite'), 60).replace(/[^A-Za-z0-9_-]/g, '');
  const q = new URLSearchParams({ client_id: g.id, redirect_uri: G_REDIRECT(), response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + q, `tt_g=${state}.${invite}; Path=/api/oauth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}`);
}, false);
R('GET', /^\/api\/oauth\/google\/callback$/, async ({ req, res, url }) => {
  const bad = msg => redirect(res, '/?g_err=' + encodeURIComponent(msg), 'tt_g=; Path=/api/oauth/google; Max-Age=0');
  const g = googleSettings(); if (!g) return bad('La connexion Google n’est pas encore activée.');
  const [state, invite] = String(cookies(req).tt_g || '').split('.');
  if (!state || state !== url.searchParams.get('state')) return bad('La connexion Google a expiré. Réessayez.');
  if (url.searchParams.get('error') || !url.searchParams.get('code')) return bad('Connexion Google annulée.');
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: g.id, client_secret: g.secret, redirect_uri: G_REDIRECT(), grant_type: 'authorization_code' }) });
    const t = await r.json(); if (!r.ok || !t.id_token) throw new Error(t.error_description || t.error || 'réponse vide');
    info = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString('utf8'));
    if (info.aud !== g.id || !/^(https:\/\/)?accounts\.google\.com$/.test(info.iss) || info.exp * 1000 < now()) throw new Error('jeton refusé');
  } catch (e) { console.error('google', e.message); return bad('Google n’a pas pu confirmer votre compte. Réessayez.'); }
  const email = String(info.email || '').toLowerCase(), sub = String(info.sub || '');
  if (!email || !sub || info.email_verified === false) return bad('Ce compte Google n’a pas d’adresse e-mail confirmée.');
  let u = q1(`SELECT * FROM users WHERE google_sub=?`, sub) || q1(`SELECT * FROM users WHERE email=?`, email);
  if (u) { if (!u.google_sub) run(`UPDATE users SET google_sub=? WHERE id=?`, sub, u.id); setSession(res, u.id); const c = res.getHeader('Set-Cookie'); return redirect(res, '/', [c, 'tt_g=; Path=/api/oauth/google; Max-Age=0']); }
  const first = q1(`SELECT COUNT(*) n FROM users`).n === 0;
  if (first ? (OWNER && email !== OWNER) : !inviteValid(invite)) return bad(first ? 'Le premier compte est réservé au propriétaire de tam-tam.' : 'Aucun compte tam-tam n’existe pour ' + email + '. Pour vous inscrire, ouvrez d’abord le lien d’invitation reçu d’un membre.');
  const tok = rnd(24); run(`INSERT INTO gpending(token,email,name,sub,invite,expires) VALUES(?,?,?,?,?,?)`, sha(tok), email, clean(info.name || email.split('@')[0], 40), sub, invite || null, now() + 30 * 60_000);
  return redirect(res, '/?g=' + tok, 'tt_g=; Path=/api/oauth/google; Max-Age=0');
}, false);
R('GET', /^\/api\/oauth\/google\/pending$/, async ({ url }) => {
  const gp = q1(`SELECT email,name,invite FROM gpending WHERE token=? AND expires>?`, sha(String(url.searchParams.get('t') || '')), now()); if (!gp) E(404, 'La connexion Google a expiré. Recommencez.');
  const inv = inviteValid(gp.invite);
  return { email: gp.email, name: gp.name, invite: gp.invite, by: inv ? (u => u ? (inv.qr || !u.name ? '@' + u.handle : u.name) : '')(getUser(inv.by_user)) : '' };
}, false);

function adminOnly(me) { if (!me.admin) E(403, 'Réservé au propriétaire.'); }
/* ---------- traduction (Google Cloud Translation, plafonnée à la partie gratuite) ---------- */
const TR_URL = process.env.TR_URL || 'https://translation.googleapis.com/language/translate/v2';
const TR_CAP = 480_000; // caractères par mois : Google en offre 500 000
const TR_LANGS = ['fr', 'en', 'wo', 'ff', 'bm', 'ln', 'sw', 'ha', 'yo', 'ig', 'ee', 'ak', 'rw', 'sg', 'ar', 'pt', 'es', 'de', 'it', 'zh', 'ru', 'tr', 'nl', 'hi', 'am', 'so', 'zu', 'xh', 'mg', 'rn', 'kg', 'ts', 'tn', 'st', 'sn', 'ny', 'om', 'ti', 'lg', 'ki'];
const trConf = () => { const r = q1(`SELECT v FROM settings WHERE k='translate'`); const c = r ? J(r.v, {}) : {}; return { key: c.key || '', provider: c.provider === 'claude' ? 'claude' : 'google', budget: +c.budget > 0 ? +c.budget : 1.65 }; };
// Dépense réelle de Claude ce mois-ci, calculée à partir des jetons facturés (en millionièmes de dollar).
const PRICE_IN = +process.env.CLAUDE_PRICE_IN || 0.10, PRICE_OUT = +process.env.CLAUDE_PRICE_OUT || 0.50; // $ par million de jetons
const usdKey = () => 'trusd:' + new Date().toISOString().slice(0, 7);
const usdSpent = () => +(q1(`SELECT v FROM settings WHERE k=?`, usdKey())?.v || 0) / 1e6;
const usdAdd = u => { const inT = +(u && u.input_tokens) || 0, outT = +(u && u.output_tokens) || 0; const micro = Math.ceil(inT * PRICE_IN + outT * PRICE_OUT);
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, usdKey(), String(Math.round(usdSpent() * 1e6) + micro)); };
const trKey = () => trConf().key;
// Langues que seul Claude sait traduire (qualité variable, marquées « essai » dans l'application).
const TR_LANGS_CLAUDE = ['bas', 'dua', 'ewo', 'srr', 'mnk', 'snk', 'dyo', 'fan', 'bum', 'mos', 'fon', 'dyu', 'kab', 'tzm', 'ber', 'kri'];
const trLangs = c => c.provider === 'claude' ? TR_LANGS.concat(TR_LANGS_CLAUDE) : TR_LANGS;
const CLAUDE_URL = process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages';
const LANG_EN = { bas: 'Basaa (Bassa, Cameroon)', dua: 'Duala (Cameroon)', ewo: 'Ewondo (Cameroon)', srr: 'Serer (Senegal)', mnk: 'Mandinka', snk: 'Soninke', dyo: 'Jola-Fonyi (Diola)', fan: 'Fang', bum: 'Bulu (Cameroon)', mos: 'Mooré (Burkina Faso)', fon: 'Fon (Benin)', dyu: 'Dioula (Jula)', kab: 'Kabyle', tzm: 'Central Atlas Tamazight', ber: 'Berber', kri: 'Krio (Sierra Leone)', fr: 'French', en: 'English', wo: 'Wolof', ff: 'Fula (Pulaar)', bm: 'Bambara', ln: 'Lingala', sw: 'Swahili', ha: 'Hausa', yo: 'Yoruba', ig: 'Igbo', ee: 'Ewe', ak: 'Twi', rw: 'Kinyarwanda', sg: 'Sango', ar: 'Arabic', pt: 'Portuguese', es: 'Spanish', de: 'German', it: 'Italian', zh: 'Chinese', ru: 'Russian', tr: 'Turkish', nl: 'Dutch', hi: 'Hindi', am: 'Amharic', so: 'Somali', zu: 'Zulu', xh: 'Xhosa', mg: 'Malagasy', rn: 'Kirundi', kg: 'Kikongo', ts: 'Tsonga', tn: 'Tswana', st: 'Sotho', sn: 'Shona', ny: 'Chichewa', om: 'Oromo', ti: 'Tigrinya', lg: 'Luganda', ki: 'Kikuyu' };
// Traduit avec le moteur choisi ; renvoie { text, from }.
let trLastErr = '';
async function trCall(c, text, to, ctx) {
  if (c.provider === 'claude') {
    const r = await fetch(CLAUDE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5', max_tokens: 1500,
        system: `You translate informal chat messages between friends into ${LANG_EN[to] || to}. The messages may contain typos, slang, missing punctuation or repeated words: understand the intended meaning and write it the way a native speaker would naturally write it in a chat (for example "je dis je vais super bien et toi" means "I said I'm doing great, and you?"). Keep the tone, emojis and names. Reply with JSON only: {"from":"<ISO 639-1 code of the source language>","text":"<translation>"}. Never add comments. If the message is already in ${LANG_EN[to] || to}, return it unchanged.` + (ctx && ctx.length ? `\n\nEarlier messages in this conversation, for context only (do not translate them):\n${ctx.map(x => '- ' + x).join('\n')}` : ''),
        messages: [{ role: 'user', content: text }] }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) return { err: (j.error && j.error.message) || 'HTTP ' + r.status };
    usdAdd(j.usage); const out = (j.content || []).map(x => x.text || '').join('').trim(); let o; try { o = JSON.parse(out.replace(/^```(json)?|```$/g, '').trim()); } catch { o = { text: out }; }
    return { text: String(o.text || ''), from: /^[a-z]{2,3}$/.test(o.from || '') ? o.from : null };
  }
  const r = await fetch(TR_URL + '?key=' + encodeURIComponent(c.key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, target: to, format: 'text' }), signal: AbortSignal.timeout(10_000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) return { err: (j.error && j.error.message) || 'HTTP ' + r.status };
  const t = j.data && j.data.translations && j.data.translations[0]; return t ? { text: t.translatedText, from: t.detectedSourceLanguage || null } : { err: 'réponse vide' };
}
const trMonth = () => 'tr:' + new Date().toISOString().slice(0, 7);
const trUsed = () => +(q1(`SELECT v FROM settings WHERE k=?`, trMonth())?.v || 0);
R('GET', /^\/api\/translate\/status$/, async () => { const c = trConf(); return { on: !!c.key, left: c.provider === 'claude' ? (usdSpent() < c.budget ? 1 : 0) : Math.max(0, TR_CAP - trUsed()), langs: trLangs(c) }; });
R('POST', /^\/api\/translate$/, async ({ me, body }) => {
  const key = trKey(); if (!key) E(503, 'La traduction n’est pas encore activée sur Tam-Tam.');
  const text = String(body.text || '').slice(0, 2000).trim(), to = String(body.to || 'fr');
  if (!text) E(400, 'Rien à traduire.'); if (!trLangs(trConf()).includes(to)) E(400, 'Langue non prise en charge.');
  if (tooMany('tr:' + me.id, 120, 60 * 60_000)) E(429, 'Trop de traductions d’un coup. Réessayez dans un moment.');
  const conf = trConf(), used = trUsed();
  if (conf.provider === 'claude' ? usdSpent() >= conf.budget : used + text.length > TR_CAP) E(429, 'Traduction indisponible jusqu’au 1er du mois : la réserve de ce mois est épuisée.');
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, trMonth(), String(used + text.length));
  const ctx = (Array.isArray(body.ctx) ? body.ctx : []).slice(-4).map(x => String(x || '').slice(0, 300)).filter(Boolean);
  let t; try { t = await trCall(conf, text, to, ctx); } catch (e) { trLastErr = new Date().toISOString() + ' ' + e.message; E(502, 'Le service de traduction ne répond pas. Réessayez.'); }
  if (t.err || !t.text) { trLastErr = new Date().toISOString() + ' ' + t.err; console.error('traduction', t.err); E(502, 'La traduction a échoué. Réessayez plus tard.'); }
  return t;
});
// Traductions partagées : chiffrées par l'appareil avec une clé tirée du texte lui-même.
// Le serveur ne peut pas les lire ; un même message n'est payé qu'une fois pour tout le monde.
R('GET', /^\/api\/translate\/cache\/([0-9a-f]{64})$/, async ({ m }) => { const r = q1(`SELECT iv, ct FROM tr_cache WHERE id=?`, m[1]); return { hit: r || null }; });
// Corrections personnelles : chacun retrouve ses propres corrections, les autres gardent la traduction commune.
R('GET', /^\/api\/translate\/mine\/([0-9a-f]{64})$/, async ({ me, m }) => ({ hit: q1(`SELECT iv, ct FROM tr_mine WHERE user_id=? AND id=?`, me.id, m[1]) || null }));
R('POST', /^\/api\/translate\/mine$/, async ({ me, body }) => {
  const id = String(body.id || ''), iv = String(body.iv || ''), ct = String(body.ct || '');
  if (!/^[0-9a-f]{64}$/.test(id) || iv.length > 40 || !ct || ct.length > 12000) E(400, 'Invalide.');
  if (tooMany('trm:' + me.id, 200, 60 * 60_000)) E(429, 'Trop de corrections d’un coup.');
  run(`INSERT OR REPLACE INTO tr_mine(user_id,id,iv,ct,at) VALUES(?,?,?,?,?)`, me.id, id, iv, ct, now()); return { ok: true };
});
// Vote de correction : une même correction proposée par TR_VOTES personnes différentes devient la traduction commune.
// Le serveur ne compte que des empreintes : il ne lit ni la phrase ni la correction.
const TR_VOTES = 3;
R('POST', /^\/api\/translate\/vote$/, async ({ me, body }) => {
  const id = String(body.id || ''), cid = String(body.cid || ''); if (!/^[0-9a-f]{64}$/.test(id) || !/^[0-9a-f]{64}$/.test(cid)) E(400, 'Invalide.');
  if (!me.tr_consent) return { n: 0, promote: false };
  if (tooMany('trv:' + me.id, 200, 60 * 60_000)) E(429, 'Trop de corrections d’un coup.');
  run(`INSERT OR REPLACE INTO tr_votes(id,user_id,cid,at) VALUES(?,?,?,?)`, id, me.id, cid, now());
  const n = q1(`SELECT COUNT(*) n FROM tr_votes WHERE id=? AND cid=?`, id, cid).n; return { n, need: TR_VOTES, promote: n >= TR_VOTES };
});
R('POST', /^\/api\/translate\/promote$/, async ({ me, body }) => {
  const id = String(body.id || ''), cid = String(body.cid || ''), iv = String(body.iv || ''), ct = String(body.ct || '');
  if (!/^[0-9a-f]{64}$/.test(id) || !/^[0-9a-f]{64}$/.test(cid) || iv.length > 40 || !ct || ct.length > 12000) E(400, 'Invalide.');
  const mine = q1(`SELECT cid FROM tr_votes WHERE id=? AND user_id=?`, id, me.id);
  if (!mine || mine.cid !== cid || q1(`SELECT COUNT(*) n FROM tr_votes WHERE id=? AND cid=?`, id, cid).n < TR_VOTES) E(403, 'Pas assez de votes.');
  run(`INSERT OR REPLACE INTO tr_cache(id,iv,ct,at,promoted) VALUES(?,?,?,?,1)`, id, iv, ct, now()); return { ok: true };
});
R('POST', /^\/api\/translate\/cache$/, async ({ me, body }) => {
  const id = String(body.id || ''), iv = String(body.iv || ''), ct = String(body.ct || '');
  if (!/^[0-9a-f]{64}$/.test(id) || iv.length > 40 || !ct || ct.length > 12000) E(400, 'Invalide.');
  if (tooMany('trc:' + me.id, 300, 60 * 60_000)) return { ok: true };
  run(`INSERT OR IGNORE INTO tr_cache(id,iv,ct,at) VALUES(?,?,?,?)`, id, iv, ct, now()); return { ok: true };
});
// Base linguistique de Tam-Tam : seulement avec l'accord des personnes, sans nom ni identifiant, numéros et adresses retirés.
const scrub = t => String(t || '').replace(/\S+@\S+\.\S+/g, '[e-mail]').replace(/https?:\/\/\S+|www\.\S+/gi, '[lien]').replace(/\+?\d[\d .-]{5,}\d/g, '[numéro]').slice(0, 2000).trim();
R('POST', /^\/api\/corpus$/, async ({ me, body }) => {
  const kind = body.kind === 'fix' ? 'fix' : 'mt', author = getUser(+body.author || 0);
  if (!author || !author.tr_consent || (kind === 'fix' && !me.tr_consent)) return { ok: false };
  if (author.id !== me.id && relation(me.id, author.id) !== 'contact' && !q1(`SELECT 1 FROM members a JOIN members b ON a.chat_id=b.chat_id WHERE a.user_id=? AND b.user_id=?`, me.id, author.id)) return { ok: false };
  if (tooMany('corpus:' + me.id, 300, 60 * 60_000)) return { ok: false };
  const src = scrub(body.src), tgt = scrub(body.tgt), tl = String(body.tl || '').slice(0, 8), sl = String(body.sl || '').slice(0, 8);
  if (!src || !tgt || !tl || src === tgt) return { ok: false };
  run(`INSERT OR IGNORE INTO corpus(src,sl,tgt,tl,kind,at) VALUES(?,?,?,?,?,?)`, src, sl, tgt, tl, kind, now()); return { ok: true };
});
// L'expéditeur corrige la traduction de son propre message : il le rechiffre, le destinataire voit la version corrigée.
R('POST', /^\/api\/messages\/(\d+)\/reseal$/, async ({ me, m, body }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg || msg.sender !== me.id || !msg.e2e || msg.once || msg.deleted || msg.media) E(404, 'Message introuvable.');
  if (now() - msg.created_at > 7 * DAY) E(400, 'Ce message est trop ancien pour être corrigé.');
  const env = body.enc; if (!env || typeof env.ct !== 'string' || typeof env.iv !== 'string' || typeof env.keys !== 'object') E(400, 'Message chiffré invalide.');
  const text = JSON.stringify({ v: 1, iv: env.iv, ct: env.ct, keys: env.keys, from: env.from }); if (text.length > 60000) E(413, 'Message trop long.');
  run(`UPDATE messages SET text=? WHERE id=?`, text, msg.id);
  pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true }); return { ok: true };
});
R('GET', /^\/api\/admin\/translate$/, async ({ me }) => { adminOnly(me); const c = trConf(); return { has: !!c.key, provider: c.key ? c.provider : null, used: trUsed(), cap: TR_CAP, spent: usdSpent(), budget: c.budget, lastErr: trLastErr, promoted: q1(`SELECT COUNT(*) n FROM tr_cache WHERE promoted=1`).n, corpus: Object.fromEntries(qa(`SELECT kind, COUNT(*) n FROM corpus GROUP BY kind`).map(r => [r.kind, r.n])) }; });
R('POST', /^\/api\/admin\/translate$/, async ({ me, body }) => {
  adminOnly(me);
  if (body.off) { run(`DELETE FROM settings WHERE k='translate'`); return { ok: true }; }
  const old = trConf(), budget = Math.min(100, Math.max(0.1, +body.budget || old.budget));
  if (!body.key && old.key) { run(`INSERT OR REPLACE INTO settings(k,v) VALUES('translate',?)`, JSON.stringify({ provider: old.provider, key: old.key, budget })); return { ok: true }; }
  const provider = body.provider === 'claude' ? 'claude' : 'google', key = clean(body.key, 300);
  if (provider === 'claude' ? !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key) : !/^[A-Za-z0-9_-]{30,}$/.test(key))
    E(400, provider === 'claude' ? 'Cette clé ne ressemble pas à une clé Anthropic (elle commence par « sk-ant- »).' : 'Cette clé ne ressemble pas à une clé Google (elle commence souvent par « AIza »).');
  let t; try { t = await trCall({ provider, key }, 'Bonjour', 'en'); } catch { t = { err: 'pas de réponse' }; }
  if (t.err) E(400, (provider === 'claude' ? 'Anthropic' : 'Google') + ' refuse cette clé : ' + String(t.err).slice(0, 200));
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES('translate',?)`, JSON.stringify({ provider, key, budget })); run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, trMonth(), String(trUsed() + 7));
  return { ok: true };
});
R('GET', /^\/api\/admin\/google$/, async ({ me }) => { adminOnly(me); const r = q1(`SELECT v FROM settings WHERE k='google'`), g = r ? J(r.v, {}) : {}; return { id: g.id || '', hasSecret: !!g.secret, redirect: G_REDIRECT(), origin: BASE_URL }; });
R('POST', /^\/api\/admin\/google$/, async ({ me, body }) => {
  adminOnly(me); const r = q1(`SELECT v FROM settings WHERE k='google'`), old = r ? J(r.v, {}) : {};
  if (body.off) { run(`DELETE FROM settings WHERE k='google'`); return { ok: true }; }
  const g = { id: clean(body.id, 200).replace(/\s/g, ''), secret: body.secret ? String(body.secret).trim().slice(0, 200) : old.secret };
  if (!/\.apps\.googleusercontent\.com$/.test(g.id)) E(400, 'L’ID client doit se terminer par « .apps.googleusercontent.com ».');
  if (!g.secret) E(400, 'Collez aussi le code secret du client.');
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES('google',?)`, JSON.stringify(g)); return { ok: true };
});
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
// Empreinte de la version de l'application : quand elle change (mise à jour), les écrans ouverts se rechargent.
const APP_VER = sha(['app.js', 'tabs.js', 'call.js', 'gcall.js', 'kit.js', 'device.js', 'secure.js', 'style.css', 'app.html'].map(f => { try { return fs.readFileSync(path.join(PUB, f), 'utf8'); } catch { return ''; } }).join('|')).slice(0, 12);
R('GET', /^\/api\/stream$/, async ({ me, req, res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ t: 'hello', v: APP_VER })}\n\n`);
  if (!streams.has(me.id)) streams.set(me.id, new Set());
  const set = streams.get(me.id), first = set.size === 0; set.add(res);
  if (first) presence(me.id);
  req.on('close', () => {
    set.delete(res);
    if (!set.size) {
      streams.delete(me.id); run(`UPDATE users SET last_seen=? WHERE id=?`, now(), me.id); presence(me.id);
      setTimeout(() => { if (!online(me.id)) for (const [id, g] of gcalls) if (g.parts.has(me.id)) gleave(me.id, id); }, 20_000);
    }
  });
  return null;
});

/* ---------- serveur ---------- */
const SEC = { ...(secure ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), 'Permissions-Policy': 'geolocation=(), payment=()', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" };
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
    if (p === '/' || /^\/(invite|reset|add)\/[A-Za-z0-9_-]+$/.test(p)) return serveFile(res, path.join(PUB, 'app.html'), SEC);
    const f = path.normalize(path.join(PUB, p)); if (!f.startsWith(PUB + path.sep) || f.includes(path.join(PUB, 'demo'))) return send(res, 404, 'Page introuvable');
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(res, f, SEC);
    send(res, 404, 'Page introuvable');
  } catch (e) {
    if (e instanceof HttpError) return fail(res, e.code, e.message);
    console.error(e); if (!res.headersSent) fail(res, 500, 'Erreur du serveur. Réessayez.');
  }
});
server.listen(PORT, () => console.log(`tam-tam en écoute sur ${PORT} — ${BASE_URL}`));
