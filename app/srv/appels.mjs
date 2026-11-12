import crypto from 'node:crypto';
import webpush from 'web-push';
import { E, J, OWNER, Rfor, blockedEither, clean, firstFor, isMember, nameFor, now, online, push, q1, qa, relation, run, shownOnline, tooMany, userCard } from './core.mjs';
const R = Rfor(2);
import { sysMsg } from './comptes.mjs';
import { NUM_TTL } from './groupes.mjs';
import { chatFor, transport } from './messages.mjs';

/* ---------- appels audio et vidéo (signalisation seulement : le son et l'image passent d'un appareil à l'autre) ---------- */
export const TURN_SECRET = process.env.TURN_SECRET || '', TURN_HOST = process.env.TURN_HOST || '';
R('GET', /^\/api\/call\/ice$/, async ({ me }) => {
  const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (TURN_SECRET && TURN_HOST) {
    const username = `${Math.floor(now() / 1000) + 12 * 3600}:${me.id}`;
    ice.push({ urls: [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`], username, credential: crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64') });
  }
  return { ice };
});
// Données d'appel (offre, réponse, réseau) : refusées si trop lourdes, au lieu d'être coupées en morceaux illisibles.
export const sigData = d => { if (d == null) return null; const t = JSON.stringify(d); if (t.length > 60_000) E(413, 'Signal d’appel trop lourd.'); return JSON.parse(t); };
export const pendingRings = new Map(); // personne appelée -> sonnerie en attente (45 s)
export const CALL_T = ['ring', 'accept', 'decline', 'busy', 'end', 'offer', 'answer', 'ice', 'media'];
R('POST', /^\/api\/call\/signal$/, async ({ me, body }) => {
  const type = String(body.type || ''), callId = clean(body.callId, 40), to = +body.to, cid = +body.chatId;
  if (!CALL_T.includes(type) || !/^[A-Za-z0-9_-]{8,40}$/.test(callId)) E(400, 'Signal d’appel invalide.');
  const c = chatFor(me, cid); if (c.type !== 'direct' || !isMember(cid, to) || to === me.id) E(400, 'Les appels se font en discussion à deux.');
  if (blockedEither(me.id, to)) E(403, 'Appel impossible avec cette personne.');
  if (type === 'ring' && !c.expires && relation(me.id, to) !== 'contact') E(403, 'Vous n’êtes plus en contact avec cette personne.');
  const mine = type === 'ring' ? null : q1(`SELECT * FROM calls WHERE call_id=? AND chat_id=? AND (caller=? OR callee=?)`, callId, cid, me.id, me.id);
  if (type === 'ring' && tooMany('call:' + me.id, 20, 10 * 60_000)) E(429, 'Trop d’appels. Patientez quelques minutes.');
  const data = sigData(body.data);
  const ev = { t: 'call', type, callId, chatId: cid, from: me.id, video: !!body.video, data };
  if (type === 'ring') { ev.fromUser = userCard(me, to); if (c.expires) run(`UPDATE chats SET expires=? WHERE id=?`, now() + NUM_TTL, c.id); }
  const wasOffline = type === 'ring' && !shownOnline(to);
  // journal des appels (onglet « Appels »)
  if (type === 'ring' && !q1(`SELECT 1 FROM calls WHERE call_id=?`, callId)) run(`INSERT INTO calls(call_id,kind,chat_id,caller,callee,video,status,started) VALUES(?,?,?,?,?,?,?,?)`, callId, 'direct', cid, me.id, to, body.video ? 1 : 0, 'ringing', now());
  else if (!mine) { /* appel inconnu ou d'autres personnes : on ne touche pas au journal */ }
  else if (type === 'accept') run(`UPDATE calls SET status='answered', answered=? WHERE call_id=? AND answered IS NULL`, now(), callId);
  else if (type === 'decline' || type === 'busy') run(`UPDATE calls SET status=?, ended=? WHERE call_id=? AND status='ringing'`, type === 'busy' ? 'busy' : 'declined', now(), callId);
  else if (type === 'end') { const was = q1(`SELECT callee, status FROM calls WHERE call_id=?`, callId); run(`UPDATE calls SET ended=COALESCE(ended,?), status=CASE WHEN status='ringing' THEN 'missed' ELSE status END WHERE call_id=?`, now(), callId); if (was && was.status === 'ringing' && was.callee) push(was.callee, { t: 'act' }); }
  if (type === 'ring') {
    // Le téléphone de la personne appelée sonne même si tam-tam est fermé : notification « touchez pour répondre ».
    pendingRings.set(to, { ev, at: now() });
    webPush(to, { title: nameFor(me, to), body: `📞 ${body.video ? 'Appel vidéo' : 'Appel vocal'} entrant · touchez pour répondre`, tag: 'ring-' + callId, url: '/?call=' + callId, ring: true }, true);
  }
  if (['accept', 'decline', 'busy', 'end'].includes(type)) { const who = type === 'end' ? to : me.id, pr = pendingRings.get(who); if (pr && pr.ev.callId === callId) pendingRings.delete(who); }
  if (type === 'end') webPush(to, { title: nameFor(me, to), body: 'Appel terminé', tag: 'ring-' + callId, url: '/?chat=' + cid, close: true }, true);
  push(to, ev);
  if (type === 'accept' || type === 'decline') push(me.id, { ...ev, elsewhere: true }); // arrête la sonnerie sur mes autres appareils
  if (type === 'end' && body.log && mine) {
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
export function vapid() {
  let r = q1(`SELECT v FROM settings WHERE k='vapid'`), v = r ? J(r.v, null) : null;
  if (!v) { v = webpush.generateVAPIDKeys(); run(`INSERT OR REPLACE INTO settings(k,v) VALUES('vapid',?)`, JSON.stringify(v)); }
  return v;
}
export const VAPID = vapid();
webpush.setVapidDetails('mailto:' + (OWNER || 'contact@alveris-consulting.com'), VAPID.publicKey, VAPID.privateKey);
// Le contenu des messages reste chiffré : la notification dit seulement qui écrit.
export function unreadCount(uid) {
  return q1(`SELECT COUNT(*) n FROM messages m JOIN members mb ON mb.chat_id=m.chat_id AND mb.user_id=? WHERE m.id>mb.last_read AND m.deleted=0 AND (m.sender IS NULL OR m.sender<>?)`, uid, uid).n;
}
export function webPush(uid, payload, always = false) {
  if (!always && online(uid)) return;
  if (payload.badge === undefined) payload.badge = unreadCount(uid);
  for (const sub of qa(`SELECT * FROM push_subs WHERE user_id=?`, uid)) {
    if (!pushHostOk(sub.endpoint)) { run(`DELETE FROM push_subs WHERE endpoint=?`, sub.endpoint); continue; }
    webpush.sendNotification({ endpoint: sub.endpoint, keys: J(sub.keys, {}) }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' })
      .catch(e => { if (e && (e.statusCode === 404 || e.statusCode === 410)) run(`DELETE FROM push_subs WHERE endpoint=?`, sub.endpoint); });
  }
}
// Seuls les services de notification des navigateurs sont acceptés : le serveur n'envoie jamais de requête vers une adresse choisie par un membre.
export const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;
export const pushHostOk = ep => { try { const u = new URL(ep); return u.protocol === 'https:' && !u.port && PUSH_HOSTS.test(u.hostname); } catch { return false; } };
R('GET', /^\/api\/push\/key$/, async () => ({ key: VAPID.publicKey }));
R('POST', /^\/api\/push\/sub$/, async ({ me, body }) => {
  const s = body.sub || {}, ep = String(s.endpoint || '');
  if (!/^https:\/\/[^\s]{10,800}$/.test(ep) || !pushHostOk(ep) || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') E(400, 'Abonnement invalide.');
  run(`INSERT OR REPLACE INTO push_subs(endpoint,user_id,keys,created_at) VALUES(?,?,?,?)`, ep, me.id, JSON.stringify({ p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) }), now());
  return { ok: true };
});
R('POST', /^\/api\/push\/unsub$/, async ({ me, body }) => { run(`DELETE FROM push_subs WHERE endpoint=? AND user_id=?`, String(body.endpoint || ''), me.id); return { ok: true }; });
R('POST', /^\/api\/push\/test$/, async ({ me }) => { webPush(me.id, { title: 'tam-tam', body: 'Les notifications fonctionnent sur cet appareil 🥁', tag: 'test', url: '/' }, true); return { ok: true }; });

