import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import QRCode from 'qrcode';

// tam-tam — version 1 (serveur)
// Comptes sur invitation, demandes d'ami, discussions en temps réel (SSE), photos, statuts 24 h, blocage, signalement.
// Node 22 (node:sqlite intégré) ; nodemailer pour les e-mails, web-push pour les notifications.

export const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const PORT = +process.env.PORT || 3000;
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'var');
export const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
export const OWNER = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
// Inscription : ouverte à tous par défaut (test fermé du Play Store : les testeurs n'ont pas de lien d'invitation).
// Pour revenir à « sur invitation seulement » : lancer le serveur avec INSCRIPTION=invitation.
export const OPEN_SIGNUP = (process.env.INSCRIPTION || '').trim().toLowerCase() !== 'invitation';
// Adresses de secours (autre nom de domaine, relais) : même serveur, joignable par un autre chemin en cas de panne.
export const ALT_ORIGINS = String(process.env.ALT_ORIGINS || '').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(x => (/^https:\/\/[a-z0-9.-]+$/i.test(x) || (BASE_URL.startsWith('http://localhost') && /^http:\/\/localhost:\d+$/.test(x))) && x !== BASE_URL);
export const PUB = path.join(ROOT, 'public');
export const MEDIA = path.join(DATA_DIR, 'media');
fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'tamtam.db'));
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
for (const sql of [`ALTER TABLE users ADD COLUMN pubkey TEXT`, `ALTER TABLE users ADD COLUMN keybackup TEXT`, `ALTER TABLE messages ADD COLUMN e2e INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE media ADD COLUMN enc INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN google_sub TEXT`, `ALTER TABLE members ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN hide_code TEXT`, `ALTER TABLE users ADD COLUMN qr_token TEXT`, `ALTER TABLE contacts ADD COLUMN lim INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE members ADD COLUMN fav INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN pics TEXT NOT NULL DEFAULT '{}'`, `ALTER TABLE messages ADD COLUMN once INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE sessions ADD COLUMN created INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE sessions ADD COLUMN seen INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE sessions ADD COLUMN ua TEXT`, `ALTER TABLE users ADD COLUMN listed INTEGER NOT NULL DEFAULT 1`, `ALTER TABLE users ADD COLUMN avail TEXT NOT NULL DEFAULT 'on'`, `ALTER TABLE users ADD COLUMN tr_consent INTEGER`, `ALTER TABLE users ADD COLUMN priv_env TEXT`, `ALTER TABLE users ADD COLUMN tel_env TEXT`, `ALTER TABLE users ADD COLUMN tel_hash TEXT`, `ALTER TABLE statuses ADD COLUMN e2e INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE chats ADD COLUMN expires INTEGER`, `ALTER TABLE statuses ADD COLUMN music TEXT`, `ALTER TABLE users ADD COLUMN handle_set INTEGER NOT NULL DEFAULT 0`, `CREATE TABLE IF NOT EXISTS msg_hidden(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, msg_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, PRIMARY KEY(user_id, msg_id))`, `ALTER TABLE users ADD COLUMN handle_at INTEGER`, `CREATE TABLE IF NOT EXISTS reactions(msg_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, emo TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(msg_id, user_id))`, `ALTER TABLE messages ADD COLUMN fwd INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE chats ADD COLUMN pinned_msg INTEGER`, `ALTER TABLE members ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE members ADD COLUMN unread_mark INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE members ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE members ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE chats ADD COLUMN photo TEXT`, `ALTER TABLE chats ADD COLUMN gset TEXT NOT NULL DEFAULT '{}'`, `ALTER TABLE chats ADD COLUMN inv_code TEXT`, `ALTER TABLE messages ADD COLUMN del_by INTEGER`, `ALTER TABLE messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN mem_code TEXT`, `CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, media TEXT NOT NULL, thumb TEXT, env TEXT NOT NULL, aud TEXT NOT NULL, taken_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`, `CREATE INDEX IF NOT EXISTS mem_user ON memories(user_id, taken_at)`, `CREATE TABLE IF NOT EXISTS mem_access(mem_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(mem_id, user_id))`, `CREATE TABLE IF NOT EXISTS corpus(id INTEGER PRIMARY KEY, src TEXT NOT NULL, sl TEXT, tgt TEXT NOT NULL, tl TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL)`, `CREATE UNIQUE INDEX IF NOT EXISTS corpus_u ON corpus(src, tl, tgt, kind)`, `CREATE TABLE IF NOT EXISTS tr_mine(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(user_id, id))`, `CREATE TABLE IF NOT EXISTS tr_votes(id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, cid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(id, user_id))`, `CREATE TABLE IF NOT EXISTS tr_cache(id TEXT PRIMARY KEY, iv TEXT NOT NULL, ct TEXT NOT NULL, at INTEGER NOT NULL)`, `ALTER TABLE tr_cache ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0`, `CREATE TABLE IF NOT EXISTS once_views(msg_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(msg_id, user_id))`, `CREATE TABLE IF NOT EXISTS tel_share(owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, viewer INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(owner, viewer))`, `CREATE TABLE IF NOT EXISTS status_flames(status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, at INTEGER NOT NULL, PRIMARY KEY(status_id, user_id))`, `ALTER TABLE memories ADD COLUMN lock INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE memories ADD COLUMN once INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE mem_access ADD COLUMN seen INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE mem_access ADD COLUMN opened INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE members ADD COLUMN muted INTEGER NOT NULL DEFAULT 0`, `ALTER TABLE users ADD COLUMN loc_to TEXT`, `ALTER TABLE users ADD COLUMN loc_env TEXT`, `ALTER TABLE users ADD COLUMN loc_at INTEGER`, `ALTER TABLE users ADD COLUMN amb TEXT`, `ALTER TABLE users ADD COLUMN prof_seen INTEGER`, `ALTER TABLE members ADD COLUMN tr_in TEXT`, `ALTER TABLE members ADD COLUMN tr_by INTEGER`, `ALTER TABLE users ADD COLUMN calls_seen INTEGER`, `CREATE TABLE IF NOT EXISTS perf(at INTEGER NOT NULL, v TEXT NOT NULL, k TEXT NOT NULL, ms INTEGER NOT NULL)`, `CREATE INDEX IF NOT EXISTS perf_at ON perf(at)`, `CREATE TABLE IF NOT EXISTS prof_flames(media TEXT NOT NULL, owner INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, at INTEGER NOT NULL, PRIMARY KEY(media, user_id))`]) { try { db.exec(sql); } catch {} }
db.exec(`CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS codes(email TEXT PRIMARY KEY, code TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS calls(id INTEGER PRIMARY KEY, call_id TEXT NOT NULL, kind TEXT NOT NULL, chat_id INTEGER NOT NULL, caller INTEGER NOT NULL, callee INTEGER, video INTEGER NOT NULL, status TEXT NOT NULL, joined TEXT NOT NULL DEFAULT '[]', started INTEGER NOT NULL, answered INTEGER, ended INTEGER);
CREATE INDEX IF NOT EXISTS calls_cid ON calls(call_id);
CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, keys TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS gpending(token TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, sub TEXT NOT NULL, invite TEXT, expires INTEGER NOT NULL);`);
export const q1 = (sql, ...a) => db.prepare(sql).get(...a);
export const qa = (sql, ...a) => db.prepare(sql).all(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);
export const now = () => Date.now();
export const DAY = 864e5;

/* ---------- outils ---------- */
export const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const rnd = (n = 24) => crypto.randomBytes(n).toString('base64url');
// Mots de passe trop faciles à deviner : refusés à la création et au changement.
export const WEAK = new Set(['12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', 'password', 'password1', 'motdepasse', 'motdepasse1', 'azertyui', 'azertyuiop', 'qwertyui', 'qwertyuiop', 'iloveyou', 'senegal1', 'senegal221', 'dakar221', 'bonjour1', 'soleil123', 'jetaime1', 'abcd1234', 'abc12345', 'azerty123', 'qwerty123', 'tamtam123', 'tam-tam1', 'admin123', 'welcome1', '12341234', '123123123', 'aaaaaaaa', 'football', 'princesse']);
export function passOk(p, email) {
  p = String(p || ''); if (p.length < 8) E(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  const l = p.toLowerCase(), local = String(email || '').split('@')[0].toLowerCase();
  if (WEAK.has(l) || /^(.)\1+$/.test(p) || '0123456789012345678901234567890'.includes(p) || '9876543210987654321'.includes(p) || (local.length >= 4 && l.includes(local)))
    E(400, 'Ce mot de passe est trop facile à deviner. Mélangez des lettres, des chiffres et un signe, par exemple « Baobab-2026! ».');
}
export function hashPass(p) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(p, salt, 64); return salt.toString('hex') + ':' + h.toString('hex'); }
export function checkPass(p, stored) {
  const [s, h] = String(stored).split(':'); if (!s || !h) return false;
  const c = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), 64); return crypto.timingSafeEqual(c, Buffer.from(h, 'hex'));
}
export const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
export const clean = (s, max = 200) => String(s ?? '').trim().slice(0, max);
export const pair = (x, y) => x < y ? [x, y] : [y, x];
export const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
export const AV_D = /^[fm][1-6]$/, AV_C = ['turq', 'bleu', 'violet', 'rouge', 'orange', 'vert', 'rose', 'brun', 'noir'];
export const AV_ST = ['court', 'afro', 'tresses', 'foulard', 'locks', 'chignon', 'carre', 'chauve'], AV_SH = ['#14b8c9', '#1d4e89', '#2f9e66', '#f2b705', '#e2531f', '#c8102e', '#7b2cbf', '#db2777', '#475569'];
// Depuis la v1.78, seuls les portraits illustrés existent : les anciens avatars dessinés sont remplacés une fois pour toutes.
export const PORTRAITS_ONLY = true, PORTRAIT_N = 12;
export const portraitFor = id => JSON.stringify({ v: 3, p: 'p' + String((id % PORTRAIT_N) + 1).padStart(2, '0') });
export function avatarJson(a) {
  if (a && a.v === 3) { const p = String(a.p || ''); return /^p(0[1-9]|1[0-9]|2[0-4])$/.test(p) ? JSON.stringify({ v: 3, p }) : null; }
  if (a && a.v === 2 && !PORTRAITS_ONLY) { if (!AV_ST.includes(a.st) || !/^[a-f]$/.test(a.sk) || !AV_SH.includes(a.sh)) return null; return JSON.stringify({ v: 2, st: a.st, sk: a.sk, sh: a.sh, f: !!a.f, b: !!a.b, g: !!a.g, e: !!a.e }); }
  if (a && !PORTRAITS_ONLY && AV_D.test(a.d) && AV_C.includes(a.c)) return JSON.stringify({ d: a.d, c: a.c });
  return null;
}
for (const u of db.prepare(`SELECT id, avatar FROM users`).all()) { let a = null; try { a = JSON.parse(u.avatar || 'null'); } catch {} if (!(a && a.v === 3)) db.prepare(`UPDATE users SET avatar=? WHERE id=?`).run(portraitFor(u.id), u.id); }
export const PUB_K = ['bio', 'metier', 'ville', 'langues', 'interets', 'bd', 'bm'];
export const PRIV_K = ['tel', 'annee', 'mail', 'adresse', 'travail', 'famille'];
export function slugHandle(name) {
  const base = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 20) || 'membre';
  let h = base, i = 1; while (q1(`SELECT 1 FROM users WHERE handle=?`, h)) h = `${base}${++i}`; return h;
}

/* ---------- relations ---------- */
export const blockedEither = (x, y) => !!q1(`SELECT 1 FROM blocks WHERE (user_id=? AND blocked=?) OR (user_id=? AND blocked=?)`, x, y, y, x);
export const iBlocked = (x, y) => !!q1(`SELECT 1 FROM blocks WHERE user_id=? AND blocked=?`, x, y);
export function relation(me, other) {
  if (me === other) return 'me';
  const [a, b] = pair(me, other), r = q1(`SELECT * FROM contacts WHERE a=? AND b=?`, a, b);
  if (!r) return 'none';
  if (r.status === 'accepted') return 'contact';
  return r.requester === me ? 'sent' : 'received';
}
export const contactIds = me => qa(`SELECT CASE WHEN a=? THEN b ELSE a END AS id FROM contacts WHERE (a=? OR b=?) AND status='accepted'`, me, me, me).map(r => r.id);
export const isMember = (chatId, uid) => !!q1(`SELECT 1 FROM members WHERE chat_id=? AND user_id=?`, chatId, uid);
export const memberIds = chatId => qa(`SELECT user_id FROM members WHERE chat_id=?`, chatId).map(r => r.user_id);

/* ---------- temps réel (Server-Sent Events) ---------- */
export const streams = new Map(); // userId -> Set(res)
export const online = uid => (streams.get(uid)?.size || 0) > 0;
// Disponibilité choisie par le membre : en ligne (réel), occupé, ou hors ligne (masque sa présence).
export const availOf = uid => q1(`SELECT avail FROM users WHERE id=?`, uid)?.avail || 'on';
export const shownOnline = uid => { const a = availOf(uid); return a !== 'off' && online(uid); };
export function push(uid, ev) {
  const s = streams.get(uid); if (!s) return;
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of s) { try { res.write(data); } catch {} }
}
export const pushMany = (ids, ev) => ids.forEach(id => push(id, ev));
// Mise à jour d'un message : chacun reçoit sa propre version (un message à vue unique déjà ouvert ne renvoie plus son contenu).
export const pushMsg = (chatId, msgId) => { const row = q1(`SELECT * FROM messages WHERE id=?`, msgId); for (const id of memberIds(chatId)) push(id, { t: 'msg', msg: msgFor(row, id), update: true }); };
// Le vrai nom (facultatif) n'est montré qu'à soi-même et à ses contacts acceptés ; les autres ne voient que le pseudo.
export const nameFor = (u, viewer) => { if (!u) return ''; const r = viewer == null ? 'none' : relation(viewer, u.id); return (r === 'me' || r === 'contact') && u.name ? u.name : '@' + u.handle; };
export const firstFor = (u, viewer) => { const n = nameFor(u, viewer); return n.startsWith('@') ? n : n.split(' ')[0]; };
// Dans un groupe, les membres ne se connaissent pas tous : le message système montre le pseudo.
export const nameInChat = (u, c) => c.type === 'direct' && !c.expires && u.name ? u.name : '@' + u.handle;
export function normHandle(v) {
  const h = String(v || '').trim().replace(/^@/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!/^[a-z0-9][a-z0-9._]{2,19}$/.test(h)) E(400, 'Pseudo : 3 à 20 caractères, lettres, chiffres, point ou tiret bas (sans espace).');
  return h;
}
export function handleIdeas(u, seed) {
  const b = String(seed || u?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const f = b[0] || 'membre', l = b[1] || '', y = String(new Date().getFullYear()).slice(2);
  const raw = [u && u.handle, l ? `${f}.${l}` : `${f}.tt`, l ? `${f[0]}${l}` : `${f}${y}`, `${f}_${Math.floor(10 + Math.random() * 89)}`, `${f}${l}${Math.floor(1 + Math.random() * 98)}`];
  const out = [];
  for (let h of raw) { if (!h) continue; h = h.replace(/[^a-z0-9._]/g, '').slice(0, 20); if (h.length < 3) h = (h + 'tam').slice(0, 20);
    const own = u && h === u.handle; if (!out.includes(h) && (own || !q1(`SELECT 1 FROM users WHERE handle=?`, h))) out.push(h); if (out.length >= 3) break; }
  return out;
}
export function presence(uid) { const ids = contactIds(uid).filter(x => !blockedEither(uid, x)), a = availOf(uid); pushMany(ids, { t: 'presence', id: uid, online: shownOnline(uid), busy: a === 'busy', lastSeen: a === 'off' ? null : q1(`SELECT last_seen FROM users WHERE id=?`, uid)?.last_seen || null }); }
setInterval(() => { for (const s of streams.values()) for (const res of s) { try { res.write(': ping\n\n'); } catch {} } }, 25_000);

/* ---------- formats de sortie ---------- */
export const mediaUrl = id => id ? `/api/media/${id}` : null;
export function userCard(u, me) {
  if (!u) return null;
  const pub = J(u.pub, {}), rel0 = me ? relation(me, u.id) : 'none', blk = rel0 === 'contact' && blockedEither(me, u.id);
  const rel = rel0; const live = rel === 'contact' && !blk;
  const card = { id: u.id, name: (rel === 'me' || rel === 'contact') && u.name ? u.name : '@' + u.handle, handle: u.handle, avatar: J(u.avatar, null), photo: mediaUrl(u.photo), rel, online: rel === 'me' ? online(u.id) : live ? (u.avail !== 'off' && online(u.id)) : undefined,
    busy: live && u.avail === 'busy' ? true : undefined,
    lastSeen: live && u.avail !== 'off' ? u.last_seen : undefined, pub: {}, mutual: 0, pubkey: u.pubkey ? J(u.pubkey, null) : null, amb: u.amb || undefined };
  for (const k of PUB_K) if (pub[k] != null && pub[k] !== '') card.pub[k] = pub[k];
  card.pics = picsOf(u, 'pub'); card.vids = vidsOf(u); card.trc = !!u.tr_consent;
  // partage de position permanent : seules les personnes choisies par le membre le voient
  if (me && me !== u.id && rel === 'contact' && locTargets(u).includes(me)) card.locMe = true;
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
export const telShared = (owner, viewer) => !!q1(`SELECT 1 FROM tel_share WHERE owner=? AND viewer=?`, owner, viewer);
export const vidsOf = u => (J(u.pics, {}).pubv || [null, null, null]).map(v => v && v.id ? { id: v.id, url: mediaUrl(v.id), k: v.k, iv: v.iv, t: v.t } : null);
export const picsOf = (u, set) => (J(u.pics, {})[set] || [null, null, null]).map(mediaUrl);
export function canSeePriv(u, me) {
  if (u.id === me) return true;
  if (u.priv_to === 'me') return false;
  if (relation(me, u.id) !== 'contact' || blockedEither(me, u.id)) return false;
  if (limOf(me, u.id) === u.id) return false;
  if (u.priv_to === 'grp') return !!q1(`SELECT 1 FROM close_group WHERE owner=? AND member=?`, u.id, me);
  return true;
}
export const getUser = id => q1(`SELECT * FROM users WHERE id=?`, id);
export function msgOut(m) {
  if (!m) return null;
  return { id: m.id, chatId: m.chat_id, from: m.sender, kind: m.kind, text: m.deleted || m.e2e ? '' : m.text, enc: m.e2e && !m.deleted ? J(m.text, null) : null,
    media: m.deleted ? null : mediaUrl(m.media), replyTo: m.reply_to, deleted: !!m.deleted, delBy: m.deleted && m.del_by && m.del_by !== m.sender ? m.del_by : undefined, at: m.created_at, edited: m.edited && !m.deleted ? true : undefined, fwd: m.fwd && !m.deleted ? true : undefined,
    reacts: m.deleted ? undefined : (r => r.length ? r : undefined)(qa(`SELECT user_id u, emo e FROM reactions WHERE msg_id=? ORDER BY at`, m.id)),
    ...(m.once ? { once: true, opened: qa(`SELECT user_id FROM once_views WHERE msg_id=?`, m.id).map(r => r.user_id) } : {}) };
}
// Un message à vue unique déjà ouvert ne renvoie plus son contenu à celui qui l'a ouvert (ni à l'expéditeur).
export function msgFor(m, uid) {
  const o = msgOut(m); if (!o || !o.once) return o;
  if (m.sender === uid || o.opened.includes(uid)) { o.enc = null; o.text = ''; o.media = o.media ? 'x' : null; }
  return o;
}
export function chatOut(c, me) {
  const mem = qa(`SELECT m.user_id, m.last_read, m.admin, m.hidden, m.fav, m.pinned, m.unread_mark, m.cleared, m.archived, m.muted, m.tr_in, m.tr_by FROM members m WHERE m.chat_id=?`, c.id);
  const mine = mem.find(x => x.user_id === me);
  const cl = mine ? mine.cleared : 0;
  const last = q1(`SELECT * FROM messages WHERE chat_id=? AND id>? AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?) ORDER BY id DESC LIMIT 1`, c.id, cl, me);
  const unread = q1(`SELECT COUNT(*) n FROM messages WHERE chat_id=? AND id>? AND (sender IS NULL OR sender<>?) AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?)`, c.id, Math.max(cl, mine ? mine.last_read : 0), me, me).n;
  const others = mem.filter(x => x.user_id !== me);
  const out = { id: c.id, type: c.type, name: c.name, createdAt: c.created_at, unread, last: msgFor(last, me), hidden: !!(mine && mine.hidden), fav: !!(mine && mine.fav), pinned: mine && mine.pinned ? mine.pinned : 0, archived: !!(mine && mine.archived), muted: !!(mine && mine.muted), marked: !!(mine && mine.unread_mark) && !unread,
    pinMsg: c.pinned_msg ? (pm => pm && !pm.deleted && pm.id > cl ? msgOut(pm) : null)(q1(`SELECT * FROM messages WHERE id=?`, c.pinned_msg)) : null,
    // Un membre « hors ligne » ne révèle pas qu'il a lu : ses coches restent grises chez les autres.
    members: mem.map(x => ({ id: x.user_id, lastRead: x.user_id !== me && availOf(x.user_id) === 'off' ? 0 : x.last_read, admin: !!x.admin, trIn: x.tr_in == null ? undefined : x.tr_in, trBy: x.tr_by || undefined })),
    users: Object.fromEntries(mem.map(x => [x.user_id, userCard(getUser(x.user_id), me)])) };
  if (c.type === 'group') { out.photo = mediaUrl(c.photo); out.gset = gsetOf(c); out.createdBy = c.created_by; out.admin = c.created_by === me || !!(mine && mine.admin); }
  if (c.type === 'direct') { const o = others[0] && getUser(others[0].user_id); out.peer = o ? o.id : null; out.blocked = o ? blockedEither(me, o.id) : false; }
  return out;
}
export function statusVisible(s, viewer) {
  if (s.user_id === viewer) return true;
  if (s.expires < now() || blockedEither(s.user_id, viewer)) return false;
  if (relation(viewer, s.user_id) !== 'contact') return false;
  if (s.aud === 'private') return !!q1(`SELECT 1 FROM close_group WHERE owner=? AND member=?`, s.user_id, viewer);
  return true;
}

/* ---------- entretien et sauvegardes ---------- */
export const attempts = new Map();
export const ups = new Map(); // envois par morceaux en cours : id -> { owner, size, at }
// Un message renvoyé après une coupure (la réponse s'était perdue) n'est enregistré qu'une fois.
export const sentCids = new Map();
export function sweep() {
  // compteurs anti-abus : on oublie les essais de plus d'une heure (sinon la mémoire grossit sans fin)
  { const t = now(); for (const [k, a] of attempts) { const b = a.filter(x => t - x < 3600_000); if (b.length) attempts.set(k, b); else attempts.delete(k); } }
  for (const c of qa(`SELECT id FROM chats WHERE expires IS NOT NULL AND expires<?`, now())) { run(`DELETE FROM calls WHERE chat_id=?`, c.id); run(`DELETE FROM chats WHERE id=?`, c.id); }
  run(`DELETE FROM sessions WHERE expires<?`, now()); run(`DELETE FROM tr_cache WHERE at<?`, now() - 180 * DAY); run(`DELETE FROM resets WHERE expires<?`, now());
  for (const s of qa(`SELECT id, media, music FROM statuses WHERE expires<?`, now())) { if (s.media) dropMedia(s.media); if (s.music) dropMedia(s.music); run(`DELETE FROM statuses WHERE id=?`, s.id); }
  for (const m of qa(`SELECT id FROM media WHERE scope IS NULL AND created_at<?`, now() - DAY)) dropMedia(m.id);
  try { for (const f of fs.readdirSync(MEDIA)) if (f.endsWith('.part')) { const fp = path.join(MEDIA, f); if (now() - fs.statSync(fp).mtimeMs > DAY) fs.rmSync(fp); } } catch {}
  for (const [id, u] of ups) if (now() - u.at > DAY) ups.delete(id);
  for (const [k, v] of sentCids) if (now() - v.at > 3600_000) sentCids.delete(k);
  run(`DELETE FROM perf WHERE at<?`, now() - 30 * DAY);
}
export function dropMedia(id) { try { fs.rmSync(path.join(MEDIA, id)); } catch {} run(`DELETE FROM media WHERE id=?`, id); }
setInterval(sweep, 5 * 60_000); sweep();
export function backup() {
  const day = new Date().toISOString().slice(0, 10), f = path.join(DATA_DIR, 'backups', `tamtam-${day}.db`);
  if (!fs.existsSync(f)) { try { db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); } catch (e) { console.error('sauvegarde', e.message); } }
  for (const x of fs.readdirSync(path.join(DATA_DIR, 'backups')).sort().slice(0, -14)) fs.rmSync(path.join(DATA_DIR, 'backups', x));
}
backup(); setInterval(backup, 3600_000);
// Copie de sauvegarde à emporter hors du serveur (chaque nuit, sur l'ordinateur de l'Éditeur) :
// la base est compressée puis chiffrée avec une clé publique ; seule la clé privée, gardée sur cet ordinateur, peut l'ouvrir.
// Le fichier est donc illisible pour quiconque le téléchargerait. Une seule copie fraîche toutes les 30 minutes au plus.
export const BK_PUB = (() => { try { return crypto.createPublicKey(fs.readFileSync(process.env.BACKUP_PUB_FILE || path.join(ROOT, 'backup-pub.pem'))); } catch { return null; } })();
export let bkCache = null;
// Chiffre un paquet avec la clé publique de sauvegarde (même format que la base : TTBK1).
export function bkSeal(plain) {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]), tag = c.getAuthTag();
  const wrapped = crypto.publicEncrypt({ key: BK_PUB, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.concat([key, iv]));
  const len = Buffer.alloc(4); len.writeUInt32BE(wrapped.length);
  return Buffer.concat([Buffer.from('TTBK1\n'), len, wrapped, tag, body]);
}
// Photos et vidéos à emporter hors du serveur, par paquets d'environ 40 Mo, dans l'ordre d'arrivée.
// Elles sont déjà chiffrées de bout en bout ; le paquet est en plus chiffré pour la clé de sauvegarde.
// Contenu (avant chiffrement) : 4 octets = taille de l'index JSON, l'index [{id, size, at}], puis les fichiers à la suite.
export function exportMedia(cur) {
  // Curseur « date:identifiant » : reprend exactement après le dernier fichier emporté, même à date égale.
  const [at0, id0] = [Math.max(0, +String(cur).split(':')[0] || 0), String(cur).split(':')[1] || ''];
  const rows = qa(`SELECT id, size, created_at FROM media WHERE created_at > ? OR (created_at = ? AND id > ?) ORDER BY created_at, id LIMIT 500`, at0, at0, id0);
  const index = [], parts = []; let total = 0, next = `${at0}:${id0}`, done = 0;
  for (const r of rows) {
    let b = null; try { b = fs.readFileSync(path.join(MEDIA, r.id)); } catch {}
    if (b && parts.length && total + b.length > 40_000_000) break;
    if (b) { index.push({ id: r.id, size: b.length, at: r.created_at }); parts.push(b); total += b.length; }
    next = `${r.created_at}:${r.id}`; done++;
  }
  const more = done < rows.length || rows.length === 500;
  const ix = Buffer.from(JSON.stringify(index)), n = Buffer.alloc(4); n.writeUInt32BE(ix.length);
  return { buf: bkSeal(Buffer.concat([n, ix, ...parts])), last: next, more, count: index.length };
}
export function exportBackup() {
  if (bkCache && Date.now() - bkCache.at < 30 * 60_000) return bkCache.buf;
  const tmp = path.join(DATA_DIR, 'backups', `export-${process.pid}.tmp`); try { fs.rmSync(tmp); } catch {}
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  // La clé qui protège une seconde fois les sauvegardes de clés des membres voyage avec la copie (elle-même chiffrée) :
  // sans elle, une base restaurée sur un nouveau serveur ne permettrait plus aux membres de retrouver leurs messages.
  if (process.env.BACKUP_KEY) { const t = new DatabaseSync(tmp); t.prepare(`INSERT OR REPLACE INTO settings(k,v) VALUES('backup_key_copy',?)`).run(process.env.BACKUP_KEY); t.close(); }
  const plain = zlib.gzipSync(fs.readFileSync(tmp)); fs.rmSync(tmp);
  const buf = bkSeal(plain);
  bkCache = { at: Date.now(), buf }; return buf;
}

/* ---------- HTTP ---------- */
export const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.apk': 'application/vnd.android.package-archive', '.mjs': 'text/javascript; charset=utf-8' };
export function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
export const fail = (res, code, msg) => send(res, code, { error: msg });
export class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
export const E = (code, msg) => { throw new HttpError(code, msg); };
export function serveFile(res, file, extra = {}) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Page introuvable');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', ...extra, 'Cache-Control': ['.mp3', '.jpg'].includes(path.extname(file)) ? 'public, max-age=604800' : 'no-cache' }); res.end(buf);
  });
}
export async function readBody(req, max) {
  let size = 0; const chunks = [];
  for await (const ch of req) { size += ch.length; if (size > max) E(413, 'Fichier trop lourd'); chunks.push(ch); }
  return Buffer.concat(chunks);
}
// Écrit le corps de la requête directement dans un fichier, morceau par morceau : une vidéo de 40 Mo n'occupe jamais 40 Mo de mémoire.
export async function bodyToFile(req, file, max, flags = 'w') {
  const ws = fs.createWriteStream(file, { flags }); let size = 0, head = Buffer.alloc(0);
  try {
    for await (const ch of req) {
      size += ch.length; if (size > max) E(413, 'Fichier trop lourd');
      if (head.length < 12) head = Buffer.concat([head, ch]).subarray(0, 12);
      if (!ws.write(ch)) await new Promise(r => ws.once('drain', r));
    }
    await new Promise((ok, ko) => ws.end(e => e ? ko(e) : ok()));
    return { size, head };
  } catch (e) { ws.destroy(); throw e; }
}
export async function readJson(req) {
  if (!/application\/json/.test(req.headers['content-type'] || '')) E(415, 'Format attendu : JSON');
  let o; try { o = JSON.parse((await readBody(req, 200_000)).toString('utf8') || '{}'); } catch (e) { if (e instanceof HttpError) throw e; E(400, 'Requête illisible'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) E(400, 'Requête illisible'); return o;
}
export function cookies(req) { const o = {}; for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch {} } } return o; }
export const secure = BASE_URL.startsWith('https');
// Une connexion reste valable 90 jours après la dernière utilisation (au lieu d'un an fixe).
export const SESSION_DAYS = 90;
export function setSession(res, userId) {
  const tok = rnd(32), ua = String(res.req?.headers['user-agent'] || '').slice(0, 300);
  run(`INSERT INTO sessions(token,user_id,expires,created,seen,ua) VALUES(?,?,?,?,?,?)`, sha(tok), userId, now() + SESSION_DAYS * DAY, now(), now(), ua);
  res.setHeader('Set-Cookie', `tt_s=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${secure ? '; Secure' : ''}`);
}
export function currentUser(req) {
  const tok = cookies(req).tt_s; if (!tok) return null;
  const h = sha(tok), u = q1(`SELECT u.*, s.created AS s_created, s.seen AS s_seen, s.rowid AS s_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?`, h, now());
  if (!u) return null;
  if (now() - u.s_seen > 3600_000) run(`UPDATE sessions SET seen=?, expires=? WHERE token=?`, now(), now() + SESSION_DAYS * DAY, h);
  return u;
}
// Vérification du mot de passe d'un membre déjà connecté (changer, supprimer le compte, code des souvenirs) : essais limités,
// pour qu'un cookie volé ne permette pas de deviner le mot de passe à l'infini.
export function passGuard(me, pass) {
  if (blockedNow('pw:' + me.id, 8)) E(429, 'Trop d’essais. Réessayez dans 15 minutes.');
  if (!checkPass(String(pass ?? ''), me.pass)) { tooMany('pw:' + me.id, 8); return false; }
  return true;
}
export function blockedNow(key, max = 10, win = 15 * 60_000) { const t = now(); return (attempts.get(key) || []).filter(x => t - x < win).length >= max; }
export function tooMany(key, max = 10, win = 15 * 60_000) {
  const t = now(), a = (attempts.get(key) || []).filter(x => t - x < win); a.push(t); attempts.set(key, a); return a.length > max;
}
// Derrière le relais Cloudflare, la vraie adresse du visiteur arrive dans cf-connecting-ip.
// On ne la croit que si la demande vient vraiment de Cloudflare (sinon n'importe qui pourrait s'inventer une adresse
// à chaque essai et contourner les limites d'essais de mot de passe). Caddy remplace x-forwarded-for par l'adresse réelle.
export const CF_NETS = new net.BlockList();
for (const c of ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22']) { const [a, n] = c.split('/'); CF_NETS.addSubnet(a, +n, 'ipv4'); }
for (const c of ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']) { const [a, n] = c.split('/'); CF_NETS.addSubnet(a, +n, 'ipv6'); }
export const fromCF = ip => { try { const v = ip.replace(/^::ffff:/, ''); return CF_NETS.check(v, net.isIPv6(v) ? 'ipv6' : 'ipv4'); } catch { return false; } };
export const ipOf = req => {
  const peer = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!fromCF(peer)) return peer;
  // Relais Tam-Tam (Cloudflare Workers) : il transmet l'adresse réelle de la personne, sinon tous ses utilisateurs auraient la même.
  const rl = String(req.headers['x-tt-client'] || '').trim(), ro = String(req.headers['x-tt-origin'] || '').toLowerCase();
  if (rl && net.isIP(rl) && ALT_ORIGINS.some(o => new URL(o).host === ro)) return rl;
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  return cf && net.isIP(cf) ? cf : peer;
};
export function meOut(u) {
  return { ...userCard(u, u.id), locTo: locTargets(u), rawName: u.name || '', handleSet: !!u.handle_set, handleAt: u.handle_at || null, email: u.email, priv: u.priv_env ? {} : J(u.priv, {}), privPics: u.priv_env ? [null, null, null] : picsOf(u, 'priv'), privEnv: u.priv_env ? J(u.priv_env, null) : null, telEnv: u.tel_env ? J(u.tel_env, null) : null, legacyPriv: !u.priv_env, listed: !!u.listed, avail: u.avail || 'on', trConsent: u.tr_consent == null ? null : !!u.tr_consent, privTo: u.priv_to, admin: !!u.admin, hasHideCode: !!u.hide_code, hasMemCode: !!u.mem_code,
    close: qa(`SELECT member FROM close_group WHERE owner=?`, u.id).map(r => r.member),
    blocked: qa(`SELECT blocked FROM blocks WHERE user_id=?`, u.id).map(r => userCard(getUser(r.blocked), u.id)).filter(Boolean),
    cguAt: u.cgu_at, createdAt: u.created_at };
}
export function inviteValid(code) {
  if (!code) return null;
  const i = q1(`SELECT * FROM invites WHERE code=?`, code); if (i) return i.expires > now() && i.uses < i.max_uses ? i : null;
  // le code QR personnel d'un membre vaut aussi invitation
  const o = q1(`SELECT id FROM users WHERE qr_token=?`, code); return o ? { code, by_user: o.id, qr: true } : null;
}
// Partage de position : seulement avec des contacts actuels, jamais avec une personne bloquée.
export const locTargets = u => { const cs = new Set(contactIds(u.id)); return (J(u.loc_to, null) || []).filter(id => cs.has(id) && !blockedEither(u.id, id)); };
export function locDrop(x, y) { for (const [a, b] of [[x, y], [y, x]]) { const u = getUser(a); if (!u) continue; const l = J(u.loc_to, null) || []; if (l.includes(b)) { const n = l.filter(i => i !== b); run(`UPDATE users SET loc_to=?${n.length ? '' : ', loc_env=NULL, loc_at=NULL'} WHERE id=?`, JSON.stringify(n), a); push(a, { t: 'contacts' }); } } }
export const limOf = (x, y) => { const [a, b] = pair(x, y); return q1(`SELECT lim FROM contacts WHERE a=? AND b=?`, a, b)?.lim || 0; };


/* ---------- routes : table commune (chaque fichier de srv/ y ajoute les siennes) ---------- */
export const routes = [];
// Chaque fichier de srv/ déclare ses routes avec son rang : l'ordre des routes reste celui des fichiers
// (index.mjs les trie une fois tout chargé), quel que soit l'ordre réel de chargement des modules.
export const Rfor = rank => (method, re, fn, auth = true) => routes.push({ method, re, fn, auth, rank });
export const R = Rfor(0);
// Groupes : réglages par défaut (qui peut ajouter, modifier, supprimer).
export const GSET_DEF = { add: 'all', edit: 'admins', del: 'admins' };
export const gsetOf = c => Object.assign({}, GSET_DEF, J(c.gset, {}));
