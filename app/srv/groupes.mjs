import QRCode from 'qrcode';
import crypto from 'node:crypto';
import http from 'node:http';
import { ALT_ORIGINS, BASE_URL, E, J, Rfor, blockedEither, blockedNow, canSeePriv, chatOut, checkPass, clean, contactIds, getUser, hashPass, isMember, memberIds, now, pair, push, pushMany, q1, qa, relation, rnd, run, sha, tooMany, userCard } from './core.mjs';
const R = Rfor(3);
import { sysMsg } from './comptes.mjs';
import { sigData, webPush } from './appels.mjs';
import { chatFor } from './messages.mjs';

/* ---------- appels de groupe (jusqu'à 8) : le serveur tient la liste des participants ---------- */
export const GMAX = 8, GMAX_SFU = 32, gcalls = new Map(); // callId -> {chatId, video, parts:Set, started, mode, keyEnv}
// Appels de groupe de plus de 4 personnes : un serveur de répartition (LiveKit) reçoit l'image de chacun une seule fois
// et la renvoie aux autres. Le son et l'image restent chiffrés de bout en bout (clé de l'appel remise aux seuls membres).
export const LK_URL = process.env.LK_URL || '', LK_KEY = process.env.LK_KEY || '', LK_SECRET = process.env.LK_SECRET || '';
export const sfuOn = () => !!(LK_URL && LK_KEY && LK_SECRET);
// Adresse d'administration du serveur LiveKit (par défaut : la même que celle des appels, en https).
// Le serveur des appels de groupe est joint par l'adresse que la personne utilise (principale ou de secours).
export const reqOrigin = req => { const h = String(req.headers['x-tt-origin'] || req.headers.host || '').toLowerCase(); return [BASE_URL, ...ALT_ORIGINS].find(o => new URL(o).host === h) || BASE_URL; };
export const lkUrlFor = req => { const o = reqOrigin(req); return o === BASE_URL || !LK_URL.includes(new URL(BASE_URL).host) ? LK_URL : LK_URL.replace(new URL(BASE_URL).host, new URL(o).host); };
export const LK_API = (process.env.LK_API || LK_URL.replace(/^ws/, 'http')).replace(/\/+$/, '');
// Membre retiré du groupe pendant un appel : il est aussi sorti de la salle LiveKit (sinon il pourrait y revenir avec son ancien jeton).
export function lkKick(uid, callId) {
  if (!sfuOn()) return;
  const room = 'tt-' + callId, b = o => Buffer.from(JSON.stringify(o)).toString('base64url'), t = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ iss: LK_KEY, nbf: t - 10, exp: t + 120, video: { roomAdmin: true, room } });
  const tok = h + '.' + p + '.' + crypto.createHmac('sha256', LK_SECRET).update(h + '.' + p).digest('base64url');
  fetch(LK_API + '/twirp/livekit.RoomService/RemoveParticipant', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ room, identity: String(uid) }), signal: AbortSignal.timeout(5000) }).catch(() => {});
}
export function lkToken(uid, name, room) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'), t = Math.floor(Date.now() / 1000);
  const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ iss: LK_KEY, sub: String(uid), name: String(name || '').slice(0, 60), nbf: t - 10, exp: t + 3 * 3600, video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false } });
  return h + '.' + p + '.' + crypto.createHmac('sha256', LK_SECRET).update(h + '.' + p).digest('base64url');
}
// appel de groupe lancé mais que personne n'a rejoint : terminé au bout de 10 minutes
setInterval(() => { for (const [id, g] of gcalls) if (!g.parts.size && now() - g.started > 10 * 60_000) { gcalls.delete(id); run(`UPDATE calls SET ended=? WHERE call_id=?`, now(), id); } }, 60_000);
export const gcallOf = chatId => [...gcalls.entries()].find(([, g]) => g.chatId === chatId);
export function gstate(g, id) { pushMany(memberIds(g.chatId), { t: 'gcall', type: 'state', callId: id, chatId: g.chatId, video: g.video, parts: [...g.parts], mode: g.mode }); }
export function gleave(uid, id) {
  const g = gcalls.get(id); if (!g || !g.parts.has(uid)) return;
  g.parts.delete(uid);
  for (const p of g.parts) push(p, { t: 'gcall', type: 'left', callId: id, user: uid });
  if (!g.parts.size) {
    gcalls.delete(id); const d = Math.round((now() - g.started) / 1000); run(`UPDATE calls SET ended=? WHERE call_id=?`, now(), id);
    sysMsg(g.chatId, `Appel de groupe terminé · ${d >= 60 ? Math.floor(d / 60) + ' min' : d + ' s'}`);
  }
  gstate(g, id);
}
R('POST', /^\/api\/gcall\/start$/, async ({ req, me, body }) => {
  const c = chatFor(me, +body.chatId); if (c.type !== 'group') E(400, 'Les appels de groupe se font dans un groupe.');
  const ex = gcallOf(c.id); if (ex) return { callId: ex[0], existing: true };
  if (tooMany('gcall:' + me.id, 10, 10 * 60_000)) E(429, 'Trop d’appels. Patientez quelques minutes.');
  const id = crypto.randomBytes(9).toString('base64url'), video = !!body.video;
  const env = body.keyEnv && typeof body.keyEnv === 'object' && typeof body.keyEnv.ct === 'string' && JSON.stringify(body.keyEnv).length < 60_000 ? body.keyEnv : null;
  const mode = body.sfu && sfuOn() && env ? 'sfu' : 'mesh';
  gcalls.set(id, { chatId: c.id, video, parts: new Set(), started: now(), mode, keyEnv: mode === 'sfu' ? env : null });
  run(`INSERT INTO calls(call_id,kind,chat_id,caller,callee,video,status,started) VALUES(?,?,?,?,NULL,?,?,?)`, id, 'group', c.id, me.id, video ? 1 : 0, 'answered', now());
  const fn = '@' + me.handle;
  sysMsg(c.id, `${fn} a lancé un appel ${video ? 'vidéo' : 'vocal'} de groupe`);
  for (const uid of memberIds(c.id)) if (uid !== me.id) {
    push(uid, { t: 'gcall', type: 'ring', callId: id, chatId: c.id, from: me.id, video });
    webPush(uid, { title: c.name || 'Groupe', body: `${fn} lance un appel ${video ? 'vidéo' : 'vocal'} de groupe`, tag: 'gcall-' + c.id, url: '/?chat=' + c.id });
  }
  return { callId: id, mode };
});
R('POST', /^\/api\/gcall\/join$/, async ({ req, me, body }) => {
  const id = String(body.callId || ''), g = gcalls.get(id); if (!g) E(404, 'Cet appel est terminé.');
  chatFor(me, g.chatId);
  const cap = g.mode === 'sfu' ? GMAX_SFU : GMAX;
  if (!g.parts.has(me.id) && g.parts.size >= cap) E(409, `L’appel est complet (${cap} personnes au maximum).`);
  const others = [...g.parts].filter(x => x !== me.id);
  g.parts.add(me.id);
  const row = q1(`SELECT joined FROM calls WHERE call_id=?`, id); if (row) { const j = new Set(J(row.joined, [])); j.add(me.id); run(`UPDATE calls SET joined=? WHERE call_id=?`, JSON.stringify([...j]), id); }
  for (const p of others) push(p, { t: 'gcall', type: 'joined', callId: id, user: me.id });
  gstate(g, id);
  return { parts: others, video: g.video, chatId: g.chatId, mode: g.mode, ...(g.mode === 'sfu' ? { sfu: { url: lkUrlFor(req), token: lkToken(me.id, me.handle, 'tt-' + id) }, keyEnv: g.keyEnv } : {}) };
});
R('POST', /^\/api\/gcall\/signal$/, async ({ me, body }) => {
  const id = String(body.callId || ''), g = gcalls.get(id), to = +body.to, type = String(body.type || '');
  if (!g || !g.parts.has(me.id) || !g.parts.has(to) || !isMember(g.chatId, me.id) || !['offer', 'answer', 'ice', 'media'].includes(type)) E(400, 'Signal d’appel invalide.');
  const data = sigData(body.data);
  push(to, { t: 'gcall', type, callId: id, from: me.id, data });
  return { ok: true };
});
R('POST', /^\/api\/gcall\/leave$/, async ({ me, body }) => { gleave(me.id, String(body.callId || '')); return { ok: true }; });
R('GET', /^\/api\/gcall\/active$/, async ({ me }) => {
  const mine = new Set(qa(`SELECT chat_id FROM members WHERE user_id=?`, me.id).map(r => r.chat_id));
  return { sfu: sfuOn(), calls: [...gcalls.entries()].filter(([, g]) => mine.has(g.chatId)).map(([id, g]) => ({ callId: id, chatId: g.chatId, video: g.video, parts: [...g.parts], mode: g.mode })) };
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
export const digits = s => String(s || '').replace(/\D/g, '');
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
export const NUM_TTL = 2 * 3600_000;
export function numLine(me, other) {
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
export function qrUrl(me) {
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

