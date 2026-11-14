import crypto from 'node:crypto';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import path from 'node:path';
import { BASE_URL, DAY, E, J, MEDIA, Rfor, backup, blockedEither, blockedNow, bodyToFile, canSeePriv, chatOut, checkPass, clean, contactIds, dropMedia, firstFor, getUser, gsetOf, hashPass, ipOf, isEmail, isMember, locTargets, meOut, mediaUrl, memberIds, msgFor, msgOut, nameFor, nameInChat, now, passGuard, passOk, push, pushMany, pushMsg, q1, qa, relation, rnd, run, secure, sentCids, setSession, sha, statusVisible, tooMany, ups, userCard } from './core.mjs';
const R = Rfor(4);
import { envOk, envPick, sysMsg } from './comptes.mjs';
import { webPush } from './appels.mjs';
import { gcallOf, gleave, lkKick } from './groupes.mjs';

/* ---------- favoris et répertoire du téléphone ---------- */
R('POST', /^\/api\/chats\/(\d+)\/fav$/, async ({ me, m, body }) => { const c = chatFor(me, +m[1]); run(`UPDATE members SET fav=? WHERE chat_id=? AND user_id=?`, body.fav ? 1 : 0, c.id, me.id); return { ok: true }; });
// Le téléphone envoie des empreintes des numéros (pas les numéros eux-mêmes) ; on répond lesquels ont Tam-Tam.
export const matchQuota = new Map();
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

// Groupes : le créateur et les administrateurs (4 au plus, créateur compris) gèrent le groupe.
export const isAdmin = (c, uid) => c.created_by === uid || !!q1(`SELECT 1 FROM members WHERE chat_id=? AND user_id=? AND admin=1`, c.id, uid);
export const can = (c, uid, what) => isAdmin(c, uid) || gsetOf(c)[what] === 'all';
/* Langues de traduction d'une discussion à deux : chacun choisit la langue dans laquelle il reçoit.
   On peut proposer une langue à son contact ; tant qu'il n'a pas choisi lui-même, la proposition s'applique. */
R('POST', /^\/api\/chats\/(\d+)\/trlang$/, async ({ me, m, body }) => {
  const c = chatTalk(me, +m[1]); if (c.type !== 'direct' && !(c.type === 'group' && body.who !== 'peer')) E(400, 'Réservé aux discussions à deux.');
  const lang = String(body.lang || '').slice(0, 12); if (lang && !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang)) E(400, 'Langue inconnue.');
  const peer = c.type === 'direct' ? memberIds(c.id).find(x => x !== me.id) : 0, who = body.who === 'peer' ? peer : me.id; if (!who) E(400, 'Contact introuvable.');
  const row = q1(`SELECT tr_in, tr_by FROM members WHERE chat_id=? AND user_id=?`, c.id, who);
  if (who !== me.id && row && row.tr_by === who) E(409, `${nameFor(getUser(who), me.id)} a choisi sa propre langue de réception : vous ne pouvez plus la changer.`);
  run(`UPDATE members SET tr_in=?, tr_by=? WHERE chat_id=? AND user_id=?`, lang, me.id, c.id, who);
  if (peer) push(peer, { t: 'trlang', chatId: c.id, by: me.id, who: who === peer ? 'you' : 'them', lang }); push(me.id, { t: 'chats' });
  return { chat: chatOut(c, me.id) };
});
// Dans une discussion à deux : rien n'est possible avec une personne bloquée, et seuls les contacts peuvent écrire, réagir, épingler…
// (une ligne « appel par numéro » ne sert qu'aux appels).
export function chatTalk(me, id) {
  const c = chatFor(me, id); if (c.type !== 'direct') return c;
  const o = memberIds(c.id).find(x => x !== me.id);
  if (!o || blockedEither(me.id, o) || relation(me.id, o) !== 'contact' || c.expires) E(403, 'Vous ne pouvez plus écrire à cette personne.');
  return c;
}
export function chatFor(me, id) { const c = q1(`SELECT * FROM chats WHERE id=?`, id); if (!c || !isMember(id, me.id)) E(404, 'Discussion introuvable.'); return c; }
R('POST', /^\/api\/chats\/(\d+)\/members$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Seuls les groupes acceptent de nouveaux membres.');
  if (!can(c, me.id, 'add')) E(403, 'Seuls les administrateurs peuvent ajouter des membres dans ce groupe.');
  const ok = new Set(contactIds(me.id)), ids = (Array.isArray(body.add) ? body.add : []).map(Number).filter(x => ok.has(x) && !isMember(c.id, x));
  for (const u of ids) { run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, c.id, u, now()); sysMsg(c.id, `@${me.handle} a ajouté @${getUser(u).handle}`); }
  pushMany(memberIds(c.id), { t: 'chats' });
  return { chat: chatOut(c, me.id) };
});
R('POST', /^\/api\/chats\/(\d+)\/group$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Ce n’est pas un groupe.');
  if ((body.name != null || body.photo !== undefined) && !can(c, me.id, 'edit')) E(403, 'Seuls les administrateurs peuvent modifier le nom et la photo du groupe.');
  if (body.name != null) { const n = clean(body.name, 50); if (!n) E(400, 'Donnez un nom au groupe.'); if (n !== c.name) { run(`UPDATE chats SET name=? WHERE id=?`, n, c.id); sysMsg(c.id, `@${me.handle} a renommé le groupe « ${n} »`); } }
  if (body.photo === null) { if (c.photo) dropMedia(c.photo); run(`UPDATE chats SET photo=NULL WHERE id=?`, c.id); sysMsg(c.id, `@${me.handle} a retiré la photo du groupe`); }
  else if (body.photo) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.photo), me.id); if (!md) E(400, 'Photo introuvable.'); if (c.photo) dropMedia(c.photo); run(`UPDATE media SET scope='grp', ref=? WHERE id=?`, c.id, md.id); run(`UPDATE chats SET photo=? WHERE id=?`, md.id, c.id); sysMsg(c.id, `@${me.handle} a changé la photo du groupe`); }
  if (body.gset) {
    if (!isAdmin(c, me.id)) E(403, 'Seuls les administrateurs peuvent changer les réglages du groupe.');
    const g = gsetOf(c); for (const k of ['add', 'edit']) if (['all', 'admins'].includes(body.gset[k])) g[k] = body.gset[k]; if (['admins', 'none'].includes(body.gset.del)) g.del = body.gset.del;
    run(`UPDATE chats SET gset=? WHERE id=?`, JSON.stringify(g), c.id);
  }
  pushMany(memberIds(c.id), { t: 'chats' }); return { chat: chatOut(q1(`SELECT * FROM chats WHERE id=?`, c.id), me.id) };
});
R('POST', /^\/api\/chats\/(\d+)\/role$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]), uid = +body.userId; if (c.type !== 'group' || !isAdmin(c, me.id)) E(403, 'Réservé aux administrateurs du groupe.');
  if (!isMember(c.id, uid)) E(404, 'Cette personne n’est pas dans le groupe.'); if (uid === c.created_by) E(400, 'Le créateur du groupe reste administrateur.');
  const u = getUser(uid);
  if (body.kick) { run(`DELETE FROM members WHERE chat_id=? AND user_id=?`, c.id, uid); const gc = gcallOf(c.id); if (gc) { gleave(uid, gc[0]); if (gc[1].mode === 'sfu') lkKick(uid, gc[0]); } if (c.inv_code) run(`UPDATE chats SET inv_code=NULL WHERE id=?`, c.id); sysMsg(c.id, `@${me.handle} a retiré @${u.handle} du groupe`); push(uid, { t: 'chats' }); }
  else if (body.admin) {
    const n = q1(`SELECT COUNT(*) n FROM members WHERE chat_id=? AND (admin=1 OR user_id=?)`, c.id, c.created_by).n;
    if (n >= 4) E(400, 'Il y a déjà 4 administrateurs (créateur compris). Retirez d’abord ce rôle à quelqu’un.');
    run(`UPDATE members SET admin=1 WHERE chat_id=? AND user_id=?`, c.id, uid); sysMsg(c.id, `@${u.handle} est maintenant administrateur du groupe`);
  } else { run(`UPDATE members SET admin=0 WHERE chat_id=? AND user_id=?`, c.id, uid); sysMsg(c.id, `@${u.handle} n’est plus administrateur du groupe`); }
  pushMany(memberIds(c.id), { t: 'chats' }); return { chat: chatOut(c, me.id) };
});
// Lien d'invitation du groupe : réservé aux membres de Tam-Tam ; créé par ceux qui ont le droit d'ajouter.
R('POST', /^\/api\/chats\/(\d+)\/link$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Ce n’est pas un groupe.'); if (!can(c, me.id, 'add')) E(403, 'Seuls les administrateurs peuvent partager le lien de ce groupe.');
  let code = c.inv_code; if (!code || body.reset) { code = rnd(9); run(`UPDATE chats SET inv_code=? WHERE id=?`, code, c.id); }
  return { code, url: `${BASE_URL}/?g=${code}` };
});
R('GET', /^\/api\/groups\/join\/([A-Za-z0-9_-]{6,40})$/, async ({ me, m }) => {
  const c = q1(`SELECT * FROM chats WHERE inv_code=? AND type='group'`, m[1]); if (!c) E(404, 'Ce lien de groupe n’est plus valable.');
  return { id: c.id, name: c.name, count: q1(`SELECT COUNT(*) n FROM members WHERE chat_id=?`, c.id).n, member: isMember(c.id, me.id) };
});
R('POST', /^\/api\/groups\/join$/, async ({ me, body }) => {
  if (tooMany('gjoin:' + me.id, 20, 60 * 60_000)) E(429, 'Trop d’essais. Réessayez plus tard.');
  const c = q1(`SELECT * FROM chats WHERE inv_code=? AND type='group'`, String(body.code || '')); if (!c) E(404, 'Ce lien de groupe n’est plus valable.');
  if (!isMember(c.id, me.id)) {
    if (q1(`SELECT COUNT(*) n FROM members WHERE chat_id=?`, c.id).n >= 256) E(400, 'Ce groupe est complet (256 membres).');
    run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, c.id, me.id, now()); sysMsg(c.id, `@${me.handle} a rejoint le groupe avec le lien d’invitation`);
    pushMany(memberIds(c.id), { t: 'chats' });
  }
  return { chat: chatOut(c, me.id) };
});
// Médias, liens et documents d'une discussion : les messages sont chiffrés, le tri se fait sur l'appareil.
R('GET', /^\/api\/chats\/(\d+)\/media$/, async ({ me, m }) => {
  const c = chatFor(me, +m[1]), cl = q1(`SELECT cleared FROM members WHERE chat_id=? AND user_id=?`, c.id, me.id)?.cleared || 0;
  const rows = qa(`SELECT * FROM messages WHERE chat_id=? AND id>? AND deleted=0 AND once=0 AND kind<>'sys' AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?) ORDER BY id DESC LIMIT 600`, c.id, cl, me.id);
  return { messages: rows.map(r => msgOut(r)) };
});
R('POST', /^\/api\/chats\/(\d+)\/leave$/, async ({ me, m }) => {
  const c = chatFor(me, +m[1]); if (c.type !== 'group') E(400, 'Impossible de quitter une discussion à deux.');
  { const gc = gcallOf(c.id); if (gc) gleave(me.id, gc[0]); }
  run(`DELETE FROM members WHERE chat_id=? AND user_id=?`, c.id, me.id); sysMsg(c.id, `@${me.handle} a quitté le groupe`);
  if (!q1(`SELECT 1 FROM members WHERE chat_id=?`, c.id)) run(`DELETE FROM chats WHERE id=?`, c.id);
  else if (c.created_by === me.id) {
    // Le créateur s'en va : un administrateur (ou, à défaut, le plus ancien membre) prend le relais.
    const nx = q1(`SELECT user_id FROM members WHERE chat_id=? ORDER BY admin DESC, joined_at LIMIT 1`, c.id);
    if (nx) { run(`UPDATE chats SET created_by=? WHERE id=?`, nx.user_id, c.id); run(`UPDATE members SET admin=1 WHERE chat_id=? AND user_id=?`, c.id, nx.user_id); sysMsg(c.id, `@${getUser(nx.user_id).handle} gère maintenant le groupe`); pushMany(memberIds(c.id), { t: 'chats' }); }
  }
  return { ok: true };
});
R('GET', /^\/api\/chats\/(\d+)\/messages$/, async ({ me, m, url }) => {
  const c = chatFor(me, +m[1]), before = +url.searchParams.get('before') || 9e15;
  const cl = q1(`SELECT cleared FROM members WHERE chat_id=? AND user_id=?`, c.id, me.id)?.cleared || 0;
  const rows = qa(`SELECT * FROM messages WHERE chat_id=? AND id<? AND id>? AND id NOT IN (SELECT msg_id FROM msg_hidden WHERE user_id=?) ORDER BY id DESC LIMIT 60`, c.id, before, cl, me.id).reverse();
  return { messages: rows.map(r => msgFor(r, me.id)), more: rows.length === 60 };
});
R('POST', /^\/api\/chats\/(\d+)\/messages$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]);
  const cidK = body.cid ? me.id + ':' + String(body.cid).slice(0, 40) : null;
  if (cidK && sentCids.has(cidK)) { const old = q1(`SELECT * FROM messages WHERE id=?`, sentCids.get(cidK).id); if (old) return { msg: msgOut(old) }; }
  if (tooMany('msg:' + me.id, 40, 10_000)) E(429, 'Vous envoyez trop vite. Patientez un instant.');
  if (c.type === 'direct') {
    const o = memberIds(c.id).find(x => x !== me.id);
    if (!o || blockedEither(me.id, o)) E(403, 'Vous ne pouvez plus écrire à cette personne.');
    if (relation(me.id, o) !== 'contact') E(403, 'Vous n’êtes plus en contact avec cette personne.');
  }
  // Tout message de membre doit être chiffré de bout en bout : un texte en clair (application modifiée) est refusé,
  // pour que le serveur ne garde jamais une conversation lisible.
  if (!body.enc) E(400, 'Message non chiffré refusé : mettez Tam-Tam à jour.');
  let text = '', media = null, e2e = 0;
  if (body.enc) {
    // Message chiffré de bout en bout : le serveur ne garde qu'une enveloppe illisible.
    const env = body.enc; if (typeof env !== 'object' || typeof env.ct !== 'string' || typeof env.iv !== 'string' || typeof env.keys !== 'object') E(400, 'Message chiffré invalide.');
    text = JSON.stringify(envPick(env)); if (text.length > 60000) E(413, 'Message trop long.'); e2e = 1;
  }
  if (body.media) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.'); media = md.id; }
  if (!text && !media) E(400, 'Message vide.');
  const reply = body.replyTo && q1(`SELECT id FROM messages WHERE id=? AND chat_id=?`, +body.replyTo, c.id) ? +body.replyTo : null;
  const id = Number(run(`INSERT INTO messages(chat_id,sender,kind,text,media,reply_to,e2e,once,fwd,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, c.id, me.id, media ? (e2e && ['audio', 'video', 'doc'].includes(body.kind) ? body.kind : 'image') : (e2e && body.kind === 'loc' ? 'loc' : 'text'), text || null, media, body.once ? null : reply, e2e, body.once ? 1 : 0, body.fwd && !body.once ? 1 : 0, now()).lastInsertRowid);
  if (media) run(`UPDATE media SET scope='chat', ref=? WHERE id=?`, c.id, media);
  if (cidK) sentCids.set(cidK, { id, at: now() });
  run(`UPDATE members SET last_read=? WHERE chat_id=? AND user_id=?`, id, c.id, me.id);
  const msg = msgOut(q1(`SELECT * FROM messages WHERE id=?`, id));
  pushMany(memberIds(c.id), { t: 'msg', msg });
  const hiddenFor = new Set(qa(`SELECT user_id FROM members WHERE chat_id=? AND hidden=1`, c.id).map(r => r.user_id));
  const mutedFor = new Set(qa(`SELECT user_id FROM members WHERE chat_id=? AND muted=1`, c.id).map(r => r.user_id));
  for (const uid of memberIds(c.id)) if (uid !== me.id && !mutedFor.has(uid)) webPush(uid, hiddenFor.has(uid) ? { title: 'tam-tam', body: 'Nouveau message', tag: 'chat-p', url: '/' } : c.type === 'group'
    ? { title: c.name || 'Groupe', body: `${firstFor(me, uid)} : ${media ? (body.kind === 'video' ? '🎥 Vidéo' : body.kind === 'audio' ? '🎤 Vocal' : '📷 Photo') : 'nouveau message'}`, tag: 'chat-' + c.id, url: '/?chat=' + c.id }
    : { title: nameFor(me, uid), body: body.flame ? '🔥 t’a envoyé une flamme' : body.stReply ? '💬 a répondu à ton statut' : body.kind === 'loc' ? '📍 Position' : body.kind === 'doc' ? '📄 Document' : media ? (body.kind === 'video' ? '🎥 Vidéo' : body.kind === 'audio' ? '🎤 Vocal' : '📷 Photo') : 'Nouveau message', tag: 'chat-' + c.id, url: '/?chat=' + c.id });
  return { msg };
});
R('POST', /^\/api\/statuses\/(\d+)\/flame$/, async ({ me, m, body }) => {
  const st = q1(`SELECT * FROM statuses WHERE id=?`, +m[1]); if (!st || st.user_id === me.id || !statusVisible(st, me.id)) E(404, 'Statut introuvable.');
  // Flamme : rien dans la discussion, seulement une notification ; re-toucher l'enlève.
  if (tooMany('flame:' + me.id, 120, 60 * 60_000)) E(429, 'Trop de flammes d’un coup. Patientez un peu.');
  if (body.on === false) run(`DELETE FROM status_flames WHERE status_id=? AND user_id=?`, st.id, me.id);
  else if (run(`INSERT OR IGNORE INTO status_flames(status_id,user_id,at) VALUES(?,?,?)`, st.id, me.id, now()).changes) webPush(st.user_id, { title: nameFor(me, st.user_id), body: '🔥 t’a envoyé une flamme', tag: 'flame-' + st.id, url: '/' });
  push(st.user_id, { t: 'statuses' }); return { ok: true };
});
R('POST', /^\/api\/chats\/(\d+)\/read$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]), up = Math.max(0, +body.upTo || 0);
  const mx = q1(`SELECT MAX(id) x FROM messages WHERE chat_id=?`, c.id).x || 0, v = Math.min(up, mx);
  run(`UPDATE members SET last_read=MAX(last_read,?), unread_mark=0 WHERE chat_id=? AND user_id=?`, v, c.id, me.id);
  pushMany(me.avail === 'off' ? [me.id] : memberIds(c.id), { t: 'read', chatId: c.id, user: me.id, upTo: v });
  return { ok: true };
});
R('POST', /^\/api\/chats\/(\d+)\/typing$/, async ({ me, m }) => {
  let c; try { c = chatTalk(me, +m[1]); } catch { return { ok: true }; } if (tooMany('typ:' + me.id, 60, 60_000)) return { ok: true }; pushMany(memberIds(c.id).filter(x => x !== me.id), { t: 'typing', chatId: c.id, user: me.id }); return { ok: true };
});
// Réaction : une émoticône par personne et par message (la même une seconde fois l'enlève).
R('POST', /^\/api\/messages\/(\d+)\/react$/, async ({ me, m, body }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg || msg.deleted || msg.kind === 'sys') E(404, 'Message introuvable.'); const c = chatTalk(me, msg.chat_id);
  const e = String(body.emo || '').trim().slice(0, 16); if (/[<>&"'`=\\/\s]/.test(e) || /^[\x20-\x7e]+$/.test(e)) E(400, 'Réaction inconnue.');
  const cur = q1(`SELECT emo FROM reactions WHERE msg_id=? AND user_id=?`, msg.id, me.id);
  if (!e || (cur && cur.emo === e)) run(`DELETE FROM reactions WHERE msg_id=? AND user_id=?`, msg.id, me.id);
  else run(`INSERT INTO reactions(msg_id,user_id,emo,at) VALUES(?,?,?,?) ON CONFLICT(msg_id,user_id) DO UPDATE SET emo=excluded.emo, at=excluded.at`, msg.id, me.id, e, now());
  pushMsg(c.id, msg.id); return { ok: true };
});
// Message épinglé en haut de la discussion (un seul à la fois, visible par tous les membres).
R('POST', /^\/api\/chats\/(\d+)\/pinmsg$/, async ({ me, m, body }) => {
  const c = chatTalk(me, +m[1]); let id = body.msgId ? +body.msgId : null;
  if (tooMany('pin:' + me.id, 20, 60 * 60_000)) E(429, 'Patientez un peu avant d’épingler à nouveau.');
  if (id) { const msg = q1(`SELECT * FROM messages WHERE id=? AND chat_id=?`, id, c.id); if (!msg || msg.deleted || msg.once || msg.kind === 'sys') E(400, 'Ce message ne peut pas être épinglé.'); }
  run(`UPDATE chats SET pinned_msg=? WHERE id=?`, id, c.id);
  sysMsg(c.id, id ? `📌 ${nameInChat(me, c)} a épinglé un message` : `${nameInChat(me, c)} a retiré le message épinglé`);
  pushMany(memberIds(c.id), { t: 'chats' }); return { ok: true };
});
// Réglages de la discussion propres à chacun : épinglée en haut (4 au plus), non lue, effacée.
R('POST', /^\/api\/chats\/(\d+)\/mine$/, async ({ me, m, body }) => {
  const c = chatFor(me, +m[1]);
  if (body.pin != null) {
    if (body.pin && q1(`SELECT COUNT(*) n FROM members WHERE user_id=? AND pinned>0 AND chat_id<>?`, me.id, c.id).n >= 4) E(400, 'Vous avez déjà 4 discussions épinglées. Retirez-en une d’abord.');
    run(`UPDATE members SET pinned=? WHERE chat_id=? AND user_id=?`, body.pin ? now() : 0, c.id, me.id);
  }
  if (body.unread != null) {
    if (body.unread) run(`UPDATE members SET unread_mark=1 WHERE chat_id=? AND user_id=?`, c.id, me.id);
    else { const mx = q1(`SELECT MAX(id) x FROM messages WHERE chat_id=?`, c.id).x || 0; run(`UPDATE members SET unread_mark=0, last_read=MAX(last_read,?) WHERE chat_id=? AND user_id=?`, mx, c.id, me.id); pushMany(me.avail === 'off' ? [me.id] : memberIds(c.id), { t: 'read', chatId: c.id, user: me.id, upTo: mx }); }
  }
  // Archives : la discussion quitte la liste principale et se range dans « Archives » (elle y reste même si un message arrive).
  if (body.mute != null) run(`UPDATE members SET muted=? WHERE chat_id=? AND user_id=?`, body.mute ? 1 : 0, c.id, me.id);
  if (body.archive != null) run(`UPDATE members SET archived=?, pinned=CASE WHEN ? THEN 0 ELSE pinned END WHERE chat_id=? AND user_id=?`, body.archive ? 1 : 0, body.archive ? 1 : 0, c.id, me.id);
  if (body.clear) { const mx = q1(`SELECT MAX(id) x FROM messages WHERE chat_id=?`, c.id).x || 0; run(`UPDATE members SET cleared=?, last_read=MAX(last_read,?), pinned=0, unread_mark=0 WHERE chat_id=? AND user_id=?`, mx, mx, c.id, me.id); }
  push(me.id, { t: 'chats' }); return { chat: chatOut(c, me.id) };
});
// Supprimer pour moi : le message disparaît seulement de mon côté, à tout moment.
R('POST', /^\/api\/messages\/(\d+)\/hide$/, async ({ me, m }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg) E(404, 'Message introuvable.'); chatFor(me, msg.chat_id);
  run(`INSERT OR IGNORE INTO msg_hidden(user_id,msg_id) VALUES(?,?)`, me.id, msg.id);
  push(me.id, { t: 'hide', chatId: msg.chat_id, id: msg.id }); return { ok: true };
});
// Supprimer pour tout le monde : seulement ses propres messages, et dans l'heure qui suit l'envoi.
export const DEL_ALL_MAX = 2 * 60_000; // supprimer pour tout le monde : 2 minutes, comme pour modifier
R('POST', /^\/api\/messages\/(\d+)\/delete$/, async ({ me, m }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg) E(404, 'Message introuvable.');
  const gc = msg.sender !== me.id ? q1(`SELECT * FROM chats WHERE id=? AND type='group'`, msg.chat_id) : null;
  if (msg.sender !== me.id && !(gc && isMember(gc.id, me.id) && isAdmin(gc, me.id) && gsetOf(gc).del === 'admins' && msg.kind !== 'sys')) E(404, 'Message introuvable.');
  if (gc) { if (msg.media) dropMedia(msg.media); run(`UPDATE messages SET deleted=1, text=NULL, media=NULL, del_by=? WHERE id=?`, me.id, msg.id); pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true }); return { ok: true }; }
  if (now() - msg.created_at > DEL_ALL_MAX) E(403, 'Ce message a été envoyé il y a plus de 2 minutes : il ne peut plus être supprimé pour tout le monde. Vous pouvez le supprimer pour vous seul.');
  if (msg.media) dropMedia(msg.media);
  run(`UPDATE messages SET deleted=1, text=NULL, media=NULL WHERE id=?`, msg.id);
  pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true });
  return { ok: true };
});

/* partage de position permanent (choisi par le membre lui-même, chiffré de bout en bout) */
R('POST', /^\/api\/loc\/settings$/, async ({ me, body }) => {
  const cs = new Set(contactIds(me.id)), to = [...new Set((Array.isArray(body.to) ? body.to : []).map(Number))].filter(id => cs.has(id)).slice(0, 20);
  run(`UPDATE users SET loc_to=?${to.length ? '' : ', loc_env=NULL, loc_at=NULL'} WHERE id=?`, JSON.stringify(to), me.id);
  for (const id of to) push(id, { t: 'contacts' });
  return { locTo: to };
});
R('POST', /^\/api\/loc$/, async ({ me, body }) => {
  const targets = locTargets(me); if (!targets.length) E(400, 'Le partage de position est désactivé.');
  if (tooMany('loc:' + me.id, 240, 3600_000)) E(429, 'Trop de mises à jour de position.');
  const env = JSON.stringify(body.env || null); if (env.length > 20000) E(413, 'Trop lourd.');
  run(`UPDATE users SET loc_env=?, loc_at=? WHERE id=?`, env, now(), me.id);
  for (const id of targets) push(id, { t: 'loc', id: me.id });
  return { ok: true };
});
R('GET', /^\/api\/loc\/(\d+)$/, async ({ me, m }) => {
  const u = getUser(+m[1]); if (!u || !locTargets(u).includes(me.id)) E(404, 'Cette personne ne partage pas sa position avec vous.');
  return { env: J(u.loc_env, null), at: u.loc_at || null };
});

/* photos */
R('POST', /^\/api\/media$/, async ({ me, req }) => {
  const ct = String(req.headers['content-type'] || ''), enc = ct === 'application/octet-stream';
  if (!enc && !/^image\/(jpeg|png|webp)$/.test(ct)) E(415, 'Seules les photos (JPEG, PNG, WebP) sont acceptées.');
  if (tooMany('up:' + me.id, 60, 10 * 60_000)) E(429, 'Trop de photos envoyées. Patientez un peu.');
  upQuota(me, Math.min(+req.headers['content-length'] || (enc ? 42_000_000 : 6_000_000), enc ? 42_000_000 : 6_000_000));
  const id = rnd(18), tmp = path.join(MEDIA, id + '.part');
  let r; try { r = await bodyToFile(req, tmp, enc ? 42_000_000 : 6_000_000); } catch (e) { try { fs.rmSync(tmp); } catch {} throw e; }
  const bad = msg => { try { fs.rmSync(tmp); } catch {} E(400, msg); };
  if (r.size < (enc ? 17 : 100)) bad('Fichier vide.');
  const sig = r.head.toString('hex');
  if (!enc && !(sig.startsWith('ffd8ff') || sig.startsWith('89504e47') || (sig.startsWith('52494646') && r.head.subarray(8, 12).toString() === 'WEBP'))) { try { fs.rmSync(tmp); } catch {} E(415, 'Ce fichier n’est pas une photo valide.'); }
  fs.renameSync(tmp, path.join(MEDIA, id));
  run(`INSERT INTO media(id,owner,mime,size,enc,created_at) VALUES(?,?,?,?,?,?)`, id, me.id, ct, r.size, enc ? 1 : 0, now());
  return { id, url: mediaUrl(id) };
});
/* Envoi par morceaux avec reprise : si le réseau coupe, on reprend là où on s'était arrêté.
   Réservé aux fichiers chiffrés (vidéos, documents…) ; le serveur ne voit que des octets illisibles. */
export const UP_MAX = 42_000_000, CHUNK_MAX = 2_200_000;
// Garde-fou contre le remplissage du disque : fichiers en attente (pas encore envoyés dans un message) et volume envoyé par jour.
export const PEND_MAX = 400_000_000, DAY_MAX = 3_000_000_000, upDay = new Map();
export function upQuota(me, size) {
  const pend = (q1(`SELECT COALESCE(SUM(size),0) n FROM media WHERE owner=? AND scope IS NULL`, me.id).n || 0) + [...ups.values()].filter(u => u.owner === me.id).reduce((t, u) => t + u.size, 0);
  if (pend + size > PEND_MAX) E(429, 'Trop de fichiers en attente d’envoi. Patientez un peu ou envoyez d’abord ceux en cours.');
  const day = new Date().toISOString().slice(0, 10), d = upDay.get(me.id), used = d && d.day === day ? d.n : 0;
  if (used + size > DAY_MAX) E(429, 'Vous avez envoyé beaucoup de fichiers aujourd’hui. Réessayez demain.');
  upDay.set(me.id, { day, n: used + size });
}
export const upPart = id => path.join(MEDIA, id + '.part');
export const upHave = id => { try { return fs.statSync(upPart(id)).size; } catch { return -1; } };
R('POST', /^\/api\/media\/up$/, async ({ me, body }) => {
  const size = +body.size; if (!(size >= 17 && size <= UP_MAX)) E(413, 'Fichier trop lourd pour être envoyé (40 Mo au maximum).');
  if (tooMany('up:' + me.id, 60, 10 * 60_000)) E(429, 'Trop de fichiers envoyés. Patientez un peu.');
  upQuota(me, size);
  const id = rnd(18); fs.writeFileSync(upPart(id), ''); ups.set(id, { owner: me.id, size, at: now() });
  return { id, have: 0 };
});
export const upOf = (id, me) => { const u = ups.get(id); if (!u || u.owner !== me.id || upHave(id) < 0) E(404, 'Envoi introuvable : recommencez.'); u.at = now(); return u; };
R('GET', /^\/api\/media\/up\/([A-Za-z0-9_-]{24})$/, async ({ me, m }) => { upOf(m[1], me); return { have: upHave(m[1]) }; });
R('POST', /^\/api\/media\/up\/([A-Za-z0-9_-]{24})\/chunk$/, async ({ me, m, req, url }) => {
  const u = upOf(m[1], me), have = upHave(m[1]), off = +url.searchParams.get('off');
  if (off !== have || u.busy) return { have, retry: true };           // morceau déjà reçu, ou décalé : le client repart de « have »
  u.busy = true; let r;
  try { r = await bodyToFile(req, upPart(m[1]), Math.min(CHUNK_MAX, u.size - have), 'a'); } finally { u.busy = false; }
  return { have: have + r.size };
});
R('POST', /^\/api\/media\/up\/([A-Za-z0-9_-]{24})\/done$/, async ({ me, m }) => {
  const u = upOf(m[1], me), have = upHave(m[1]); if (have !== u.size) E(409, 'Envoi incomplet.');
  fs.renameSync(upPart(m[1]), path.join(MEDIA, m[1])); ups.delete(m[1]);
  run(`INSERT INTO media(id,owner,mime,size,enc,created_at) VALUES(?,?,?,?,?,?)`, m[1], me.id, 'application/octet-stream', have, 1, now());
  return { id: m[1], url: mediaUrl(m[1]) };
});
R('GET', /^\/api\/media\/([A-Za-z0-9_-]{10,40})$/, async ({ me, m, res, req }) => {
  const md = q1(`SELECT * FROM media WHERE id=?`, m[1]); if (!md) E(404, 'Introuvable');
  let ok = md.owner === me.id;
  if (!ok && md.scope === 'avatar') ok = true;
  if (!ok && md.scope === 'ppub') ok = !blockedEither(md.owner, me.id);
  if (!ok && md.scope === 'ppriv') { const o = getUser(md.owner); ok = !!o && canSeePriv(o, me.id); }
  if (!ok && md.scope === 'chat') {
    ok = isMember(md.ref, me.id);
    const om = ok && q1(`SELECT id FROM messages WHERE media=? AND once=1`, md.id); if (om && q1(`SELECT 1 FROM once_views WHERE msg_id=? AND user_id=?`, om.id, me.id)) ok = false;
    if (om) res.__nostore = true; // vue unique : jamais gardée sur l'appareil
  }
  if (!ok && md.scope === 'grp') ok = isMember(md.ref, me.id);
  if (!ok && md.scope === 'mem') {
    const mm = q1(`SELECT * FROM memories WHERE id=?`, md.ref); ok = !!mm && memVisible(mm, me.id);
    if (ok && mm && mm.once) res.__nostore = true;
    if (ok && mm.once && mm.user_id !== me.id) { const a = q1(`SELECT opened FROM mem_access WHERE mem_id=? AND user_id=?`, mm.id, me.id); if (!a || a.opened) ok = false; else if (md.id === mm.media) run(`UPDATE mem_access SET opened=1, seen=1 WHERE mem_id=? AND user_id=?`, mm.id, me.id); }
  }
  if (!ok && md.scope === 'status') { const s = q1(`SELECT * FROM statuses WHERE id=?`, md.ref); ok = !!s && statusVisible(s, me.id); }
  if (!ok) E(404, 'Introuvable');
  // Lecture par morceaux (Range) : une vidéo démarre sans attendre la fin du téléchargement.
  const fp = path.join(MEDIA, md.id); let size = 0; try { size = fs.statSync(fp).size; } catch { E(404, 'Introuvable'); }
  const head = { 'Content-Type': md.mime, 'Cache-Control': res.__nostore ? 'no-store' : 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
  const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (rg && size) {
    let a = rg[1] === '' ? Math.max(0, size - +rg[2]) : +rg[1], b = rg[1] !== '' && rg[2] !== '' ? +rg[2] : size - 1; b = Math.min(b, size - 1);
    if (a > b || a >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return null; }
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1) });
    fs.createReadStream(fp, { start: a, end: b }).on('error', () => res.end()).pipe(res); return null;
  }
  res.writeHead(200, { ...head, 'Content-Length': String(size) });
  fs.createReadStream(fp).on('error', () => res.end()).pipe(res);
  return null;
});

/* souvenirs : photos et vidéos gardées dans le temps (publiques, privées ou restreintes) */
export function memVisible(m, viewer) {
  if (m.user_id === viewer) return true;
  if (blockedEither(m.user_id, viewer)) return false;
  if (m.aud === 'public') return true;
  if (m.aud === 'restricted' || m.aud === 'friends') return !!q1(`SELECT 1 FROM mem_access WHERE mem_id=? AND user_id=?`, m.id, viewer);
  return false;
}
export const memOut = m => ({ id: m.id, kind: m.kind, media: mediaUrl(m.media), thumb: m.once ? null : mediaUrl(m.thumb), env: J(m.env, null), aud: m.aud === 'restricted' ? 'friends' : m.aud, lock: !!m.lock, once: !!m.once, takenAt: m.taken_at, at: m.created_at });
R('GET', /^\/api\/memories$/, async ({ me, url }) => {
  const uid = +url.searchParams.get('user') || me.id, u = getUser(uid); if (!u) E(404, 'Personne introuvable.');
  // Sur le profil d'un autre : seulement ses souvenirs publics (les souvenirs envoyés arrivent dans « Amis Tam-Tam »).
  const rows = qa(`SELECT * FROM memories WHERE user_id=? ORDER BY taken_at DESC LIMIT 600`, uid).filter(m => uid === me.id || (m.aud === 'public' && memVisible(m, me.id)));
  return { items: rows.map(m => uid === me.id ? { ...memOut(m), to: ['restricted', 'friends'].includes(m.aud) ? qa(`SELECT user_id FROM mem_access WHERE mem_id=?`, m.id).map(r => r.user_id) : undefined, openedBy: m.once ? qa(`SELECT user_id FROM mem_access WHERE mem_id=? AND opened=1`, m.id).map(r => r.user_id) : undefined } : memOut(m)) };
});
// Souvenirs reçus de mes amis Tam-Tam.
R('GET', /^\/api\/memories\/received$/, async ({ me }) => {
  const rows = qa(`SELECT m.*, a.seen, a.opened FROM memories m JOIN mem_access a ON a.mem_id=m.id AND a.user_id=? WHERE m.user_id<>? ORDER BY m.created_at DESC LIMIT 600`, me.id, me.id).filter(m => !blockedEither(m.user_id, me.id));
  return { items: rows.map(m => ({ ...memOut(m), from: m.user_id, fromUser: userCard(getUser(m.user_id), me.id), seen: !!m.seen, opened: !!m.opened })), unseen: rows.filter(m => !m.seen).length };
});
R('POST', /^\/api\/memories\/received\/seen$/, async ({ me, body }) => {
  if (body && body.id) run(`UPDATE mem_access SET seen=1 WHERE user_id=? AND mem_id=?`, me.id, +body.id);
  else run(`UPDATE mem_access SET seen=1 WHERE user_id=? AND seen=0`, me.id);
  return { ok: true };
});
/* Activité à signaler par un point lumineux : appels manqués et flammes reçues sur le profil. */
export const actOf = u => ({
  calls: q1(`SELECT COUNT(*) n FROM calls WHERE callee=? AND kind='direct' AND status='missed' AND started>?`, u.id, u.calls_seen || u.created_at).n,
  prof: q1(`SELECT COUNT(DISTINCT user_id) n FROM prof_flames WHERE owner=? AND user_id<>? AND at>?`, u.id, u.id, u.prof_seen || 0).n });
R('GET', /^\/api\/me\/act$/, async ({ me }) => actOf(me));
R('POST', /^\/api\/me\/act\/seen$/, async ({ me, body }) => {
  if (body.k === 'calls') run(`UPDATE users SET calls_seen=? WHERE id=?`, now(), me.id);
  else if (body.k === 'prof') run(`UPDATE users SET prof_seen=? WHERE id=?`, now(), me.id);
  else E(400, 'Inconnu.');
  return actOf(getUser(me.id));
});
// Flammes sur les photos et vidéos du profil (publiques ou privées).
export function profMediaOk(owner, mediaId, viewer) {
  const md = q1(`SELECT id, owner, scope FROM media WHERE id=?`, String(mediaId || '')); if (!md || md.owner !== owner.id) return false;
  if (viewer === owner.id) return md.scope === 'ppub' || md.scope === 'ppriv';
  if (md.scope === 'ppub') return !blockedEither(owner.id, viewer);
  if (md.scope === 'ppriv') return canSeePriv(owner, viewer);
  return false;
}
R('GET', /^\/api\/users\/(\d+)\/flames$/, async ({ me, m }) => {
  const u = getUser(+m[1]); if (!u) E(404, 'Personne introuvable.');
  const rows = qa(`SELECT media, user_id, at FROM prof_flames WHERE owner=? ORDER BY at DESC`, u.id).filter(r => profMediaOk(u, r.media, me.id));
  const items = {};
  for (const r of rows) { const it = items[r.media] || (items[r.media] = { n: 0, mine: false }); it.n++; if (r.user_id === me.id) it.mine = true;
    if (u.id === me.id) { const c = userCard(getUser(r.user_id), me.id); if (c) (it.who || (it.who = [])).push({ user: c, at: r.at }); } }
  return { items };
});
R('POST', /^\/api\/users\/(\d+)\/flame$/, async ({ me, m, body }) => {
  const u = getUser(+m[1]); if (!u) E(404, 'Personne introuvable.'); if (u.id === me.id) E(400, 'Vous ne pouvez pas vous envoyer une flamme.');
  if (!profMediaOk(u, body.media, me.id)) E(404, 'Photo introuvable.');
  if (tooMany('flame:' + me.id, 120, 60 * 60_000)) E(429, 'Trop de flammes d’un coup. Patientez un peu.');
  if (body.on === false) run(`DELETE FROM prof_flames WHERE media=? AND user_id=?`, String(body.media), me.id);
  else if (run(`INSERT OR IGNORE INTO prof_flames(media,owner,user_id,at) VALUES(?,?,?,?)`, String(body.media), u.id, me.id, now()).changes) {
    push(u.id, { t: 'act' }); webPush(u.id, { title: nameFor(me, u.id), body: '🔥 a aimé une photo de votre profil', tag: 'pflame-' + u.id, url: '/' });
  }
  const n = q1(`SELECT COUNT(*) n FROM prof_flames WHERE media=?`, String(body.media)).n;
  return { n, mine: body.on !== false };
});
// Code à 4 chiffres des souvenirs privés : créé une fois, vérifié par le serveur (essais limités).
R('POST', /^\/api\/mem\/code$/, async ({ me, body }) => {
  const code = String(body.code || '');
  if (body.set != null) {
    const nc = String(body.set); if (!/^\d{4}$/.test(nc)) E(400, 'Le code doit faire exactement 4 chiffres.');
    if (me.mem_code && !body.pass && blockedNow('memc:' + me.id, 8)) E(429, 'Trop d’essais. Réessayez dans 15 minutes, ou changez le code avec votre mot de passe.');
    if (me.mem_code && !(body.pass ? passGuard(me, body.pass) : checkPass(code, me.mem_code))) { tooMany('memc:' + me.id, 8, 15 * 60_000); E(403, body.pass ? 'Mot de passe incorrect.' : 'Code actuel incorrect.'); }
    run(`UPDATE users SET mem_code=? WHERE id=?`, hashPass(nc), me.id); return { ok: true };
  }
  if (!me.mem_code) return { ok: false, none: true };
  if (blockedNow('memc:' + me.id, 8)) E(429, 'Trop d’essais. Réessayez dans 15 minutes, ou changez le code avec votre mot de passe.');
  const ok = checkPass(code, me.mem_code); if (!ok) { tooMany('memc:' + me.id, 8, 15 * 60_000); E(403, 'Code incorrect.'); }
  return { ok: true };
});
R('POST', /^\/api\/memories$/, async ({ me, body }) => {
  if (tooMany('mem:' + me.id, 120, DAY)) E(429, 'Beaucoup de souvenirs ajoutés aujourd’hui. Réessayez demain.');
  if (q1(`SELECT COUNT(*) n FROM memories WHERE user_id=?`, me.id).n >= 2000) E(400, 'Vous avez atteint 2 000 souvenirs. Supprimez-en quelques-uns.');
  const aud = body.aud === 'restricted' ? 'friends' : ['public', 'private', 'friends'].includes(body.aud) ? body.aud : null, kind = body.kind === 'video' ? 'video' : body.kind === 'doc' ? 'doc' : 'image';
  if (!aud) E(400, 'Choisissez qui peut voir ce souvenir.');
  const env = body.env; if (!env || typeof env !== 'object' || typeof env.ct !== 'string' || typeof env.iv !== 'string' || JSON.stringify(env).length > 200_000) E(400, 'Souvenir invalide.');
  if (aud === 'public' ? typeof env.k !== 'string' : (!env.keys || env.k)) E(400, 'Souvenir invalide.');
  const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.');
  const th = body.thumb ? q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.thumb), me.id) : null;
  const taken = Math.min(now() + DAY, Math.max(0, +body.taken || now()));
  const id = Number(run(`INSERT INTO memories(user_id,kind,media,thumb,env,aud,lock,once,taken_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, me.id, kind, md.id, th ? th.id : null, JSON.stringify(env), aud, aud === 'private' || (aud === 'friends' && body.lock) ? 1 : 0, aud === 'friends' && body.once ? 1 : 0, taken, now()).lastInsertRowid);
  for (const x of [md, th]) if (x) run(`UPDATE media SET scope='mem', ref=? WHERE id=?`, id, x.id);
  if (aud === 'friends') {
    const ok = new Set(contactIds(me.id)), to = (Array.isArray(body.to) ? body.to : []).map(Number).filter(u => ok.has(u) && !blockedEither(me.id, u));
    if (!to.length) { for (const x of [md, th]) if (x) dropMedia(x.id); run(`DELETE FROM memories WHERE id=?`, id); E(400, 'Choisissez au moins un ami.'); }
    for (const uid of to) { run(`INSERT OR IGNORE INTO mem_access(mem_id,user_id) VALUES(?,?)`, id, uid); push(uid, { t: 'mem' }); webPush(uid, { title: nameFor(me, uid), body: `📸 vous a envoyé un souvenir${body.once ? ' à vue unique' : ''}`, tag: 'mem-' + id, url: '/?tab=souvenirs' }); }
  }
  return { item: memOut(q1(`SELECT * FROM memories WHERE id=?`, id)) };
});
// Retirer de ma liste un souvenir reçu d'un ami (il reste chez lui).
R('POST', /^\/api\/memories\/(\d+)\/remove$/, async ({ me, m }) => { run(`DELETE FROM mem_access WHERE mem_id=? AND user_id=?`, +m[1], me.id); return { ok: true }; });
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
    if (s.user_id === me.id) { const fl = new Set(qa(`SELECT user_id FROM status_flames WHERE status_id=?`, s.id).map(r => r.user_id)); it.views = qa(`SELECT v.viewer, v.at FROM status_views v WHERE v.status_id=? ORDER BY v.at DESC`, s.id).map(v => ({ user: userCard(getUser(v.viewer), me.id), at: v.at, flame: fl.has(v.viewer) })).filter(v => v.user); it.flames = fl.size; }
    else it.flamed = !!q1(`SELECT 1 FROM status_flames WHERE status_id=? AND user_id=?`, s.id, me.id);
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
  if (body.enc) { if (!envOk(body.enc) || JSON.stringify(body.enc).length > 60000) E(400, 'Statut chiffré invalide.'); text = JSON.stringify(envPick(body.enc)); e2e = 1; }
  if (body.media) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.media), me.id); if (!md) E(400, 'Photo introuvable.'); media = md.id; }
  let music = null; if (body.music && e2e) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL`, String(body.music), me.id); if (!md) E(400, 'Musique introuvable.'); music = md.id; }
  if (!media && !text) E(400, 'Écrivez un texte ou ajoutez une photo.');
  const bg = Math.max(0, Math.min(362, +body.bg || 170)), kind = media ? (body.kind === 'video' && e2e ? 'video' : 'image') : 'text';
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
export const BK_KEY = /^[0-9a-f]{64}$/.test(process.env.BACKUP_KEY || '') ? Buffer.from(process.env.BACKUP_KEY, 'hex') : null;
export function wrapBk(txt) {
  if (!BK_KEY || !txt || txt.startsWith('w1:')) return txt;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', BK_KEY, iv), ct = Buffer.concat([c.update(txt, 'utf8'), c.final()]);
  return 'w1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function unwrapBk(txt) {
  if (!txt || !txt.startsWith('w1:')) return txt; if (!BK_KEY) return null;
  const b = Buffer.from(txt.slice(3), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', BK_KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
if (BK_KEY) for (const r of qa(`SELECT id, keybackup FROM users WHERE keybackup IS NOT NULL AND keybackup NOT LIKE 'w1:%'`)) run(`UPDATE users SET keybackup=? WHERE id=?`, wrapBk(r.keybackup), r.id);
/* clés de chiffrement de bout en bout : le serveur garde la clé publique et une sauvegarde chiffrée par le code du membre */
// Anciens messages « code de sécurité changé » (avant la 2.01) : retirés, ils comptaient comme non lus dans toutes les discussions.
run(`DELETE FROM messages WHERE kind='sys' AND text LIKE 'Le code de sécurité de @% a changé%'`);
R('POST', /^\/api\/keys$/, async ({ me, body }) => {
  const pk = body.pubkey; if (!pk || pk.kty !== 'EC' || pk.crv !== 'P-256' || typeof pk.x !== 'string' || typeof pk.y !== 'string' || pk.d) E(400, 'Clé invalide.');
  const b = body.backup; if (!b || typeof b.ct !== 'string' || typeof b.iv !== 'string' || typeof b.salt !== 'string' || !(+b.iter >= 100000)) E(400, 'Sauvegarde invalide.');
  if (JSON.stringify(b).length > 8000) E(413, 'Sauvegarde trop grande.');
  const old = me.pubkey;
  run(`UPDATE users SET pubkey=?, keybackup=? WHERE id=?`, JSON.stringify({ kty: 'EC', crv: 'P-256', x: pk.x, y: pk.y }), wrapBk(JSON.stringify({ ct: b.ct, iv: b.iv, salt: b.salt, iter: +b.iter })), me.id);
  // Plus de message « code de sécurité changé » posté par le serveur dans toutes les discussions (bruyant, et il venait du serveur) :
  // depuis la 2.00, chaque appareil de ses contacts repère lui-même le changement et l'affiche discrètement (KeyPin).
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
export function mailSettings() { const r = q1(`SELECT v FROM settings WHERE k='mail'`); return r ? J(r.v, null) : null; }
export let transport = null, transportKey = '';
export const resetTransport = () => { transportKey = ''; };
export function getTransport() {
  const m = mailSettings(); if (!m || !m.host || !m.user || !m.pass || !m.from) return null;
  const key = JSON.stringify(m);
  if (key !== transportKey) { transport = nodemailer.createTransport({ host: m.host, port: +m.port || 465, secure: (+m.port || 465) === 465, auth: { user: m.user, pass: m.pass } }); transportKey = key; }
  return { t: transport, from: m.from };
}
export const mailHtml = (title, inner) => `<div style="font-family:Arial,Helvetica,sans-serif;background:#eef6f7;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;padding:26px;color:#0f2430;font-size:15px;line-height:1.5"><div style="font-weight:800;font-size:20px;color:#0b7a89;margin-bottom:14px">tam-tam</div><h1 style="font-size:19px;margin:0 0 10px">${title}</h1>${inner}<p style="color:#5d7380;font-size:12px;margin-top:26px">Message envoyé automatiquement par tam-tam. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre compte reste protégé.</p></div></div>`;
export async function sendMail(to, subject, html) { const tr = getTransport(); if (!tr) return false; await tr.t.sendMail({ from: tr.from, to, subject, html }); return true; }
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
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(String(body.pass)), u.id); run(`DELETE FROM codes WHERE email=?`, email); run(`DELETE FROM sessions WHERE user_id=?`, u.id);
  setSession(res, u.id); return { me: meOut(getUser(u.id)) };
}, false);

/* administration (propriétaire) */
