import { ALT_ORIGINS, BASE_URL, OPEN_SIGNUP, BK_PUB, DAY, E, J, OWNER, PRIV_K, PUB_K, Rfor, avatarJson, backup, blockedEither, blockedNow, chatOut, checkPass, clean, contactIds, cookies, dropMedia, exportBackup, exportMedia, getUser, handleIdeas, hashPass, iBlocked, inviteValid, ipOf, isEmail, isMember, locDrop, meOut, memberIds, msgOut, nameInChat, normHandle, now, pair, passGuard, passOk, portraitFor, presence, push, pushMany, pushMsg, q1, qa, relation, rnd, routes, run, secure, setSession, sha, tooMany, userCard } from './core.mjs';
const R = Rfor(1);
import { chatTalk, getTransport } from './messages.mjs';
import { googleSettings } from './google.mjs';

/* ---------- routes ---------- */

R('GET', /^\/api\/meta$/, async ({ req, url }) => {
  const code = url.searchParams.get('invite'), inv = inviteValid(code);
  const n = q1(`SELECT COUNT(*) n FROM users`).n;
  return { mail: !!getTransport(), google: !!googleSettings(), open: OPEN_SIGNUP, ownerSetup: n === 0, ownerEmail: n === 0 && OWNER ? OWNER.replace(/^(.).*(@.*)$/, '$1•••$2') : null,
    invite: inv ? { by: (u => u ? (inv.qr || !u.name ? '@' + u.handle : u.name) : '')(getUser(inv.by_user)) } : null };
}, false);

R('GET', /^\/api\/backup\/export$/, async ({ req, res }) => {
  if (!BK_PUB) E(404, 'Adresse inconnue.');
  if (tooMany('bk:' + ipOf(req), 6, 60 * 60_000)) E(429, 'Trop de demandes.');
  const buf = exportBackup();
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="tamtam-${new Date().toISOString().slice(0, 10)}.ttbk"` });
  res.end(buf); return null;
}, false);
R('GET', /^\/api\/backup\/media$/, async ({ req, res, url }) => {
  if (!BK_PUB) E(404, 'Adresse inconnue.');
  if (tooMany('bkm:' + ipOf(req), 120, 60 * 60_000)) E(429, 'Trop de demandes.');
  const since = String(url.searchParams.get('since') || '0').slice(0, 80), x = exportMedia(/^\d+(:[A-Za-z0-9_-]{0,40})?$/.test(since) ? since : '0');
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': x.buf.length, 'Cache-Control': 'no-store', 'X-TT-Next': String(x.last), 'X-TT-More': x.more ? '1' : '0', 'X-TT-Count': String(x.count) });
  res.end(x.buf); return null;
}, false);
// Adresses de secours : la liste est publique (elle sert quand l'adresse principale ne répond plus).
R('GET', /^\/api\/alt$/, async () => ({ primary: BASE_URL, alt: ALT_ORIGINS }), false);
R('GET', /^\/api\/ping$/, async ({ res }) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'no-store'); return { ok: true }; }, false);

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
  else { inv = inviteValid(clean(body.invite, 60)); if (!inv && !OPEN_SIGNUP) E(403, 'Il faut un lien d’invitation valide pour s’inscrire.');
    if (inv && inv.qr && q1(`SELECT COUNT(*) n FROM users WHERE invited_by=? AND created_at>?`, inv.by_user, now() - DAY).n >= 5) E(429, 'Ce code QR a déjà servi à beaucoup d’inscriptions aujourd’hui. Demandez plutôt un lien d’invitation.'); }
  if (q1(`SELECT 1 FROM users WHERE email=?`, email)) E(409, 'Un compte existe déjà avec cette adresse. Connectez-vous.');
  if (!body.handle) E(400, 'Choisissez un pseudo : c’est lui que voient les membres.');
  const handle = normHandle(body.handle);
  if (q1(`SELECT 1 FROM users WHERE handle=?`, handle)) E(409, 'Ce pseudo est déjà pris. Choisissez-en un autre.');
  const av = avatarJson(body.avatar);
  const id = run(`INSERT INTO users(email,pass,name,handle,avatar,admin,invited_by,cgu_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
    email, hashPass(pass), name, handle, av, first ? 1 : 0, inv ? inv.by_user : null, now(), now()).lastInsertRowid;
  run(`UPDATE users SET tr_consent=?, handle_set=1 WHERE id=?`, body.trc ? 1 : 0, Number(id));
  if (!av) run(`UPDATE users SET avatar=? WHERE id=?`, portraitFor(Number(id)), Number(id));
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
  passOk(body.pass, getUser(r.user_id)?.email);
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(String(body.pass)), r.user_id); run(`DELETE FROM resets WHERE user_id=?`, r.user_id);
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
  if (body.pub && typeof body.pub === 'object') { const p = J(me.pub, {}); for (const k of PUB_K) if (k in body.pub) p[k] = clean(body.pub[k], k === 'bio' ? 200 : 80); run(`UPDATE users SET pub=? WHERE id=?`, JSON.stringify(p), me.id); }
  if (body.priv && typeof body.priv === 'object' && !me.priv_env) { const p = J(me.priv, {}); for (const k of PRIV_K) if (k in body.priv) p[k] = clean(body.priv[k], 120); run(`UPDATE users SET priv=? WHERE id=?`, JSON.stringify(p), me.id); }
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
// Enveloppe de bout en bout telle qu'elle est gardée : version 1 (ancienne) ou 2 (clé jetable par message, voir secure.js).
export const envPick = e => { const o = { v: e.v === 2 ? 2 : 1, iv: e.iv, ct: e.ct, keys: e.keys, from: e.from };
  if (o.v === 2) { o.salt = String(e.salt || '').slice(0, 40); o.eph = e.eph && typeof e.eph === 'object' ? { x: String(e.eph.x || '').slice(0, 64), y: String(e.eph.y || '').slice(0, 64) } : null; }
  return o; };
export const envOk = e => e && typeof e === 'object' && typeof e.ct === 'string' && typeof e.iv === 'string' && e.keys && typeof e.keys === 'object' && JSON.stringify(e).length < 200_000;
R('POST', /^\/api\/me\/privenv$/, async ({ me, body }) => {
  if (!envOk(body.privEnv) || (body.telEnv && !envOk(body.telEnv))) E(400, 'Profil chiffré invalide.');
  const keep = new Set((Array.isArray(body.mediaIds) ? body.mediaIds : []).map(String).slice(0, 6));
  for (const id of keep) { const md = q1(`SELECT * FROM media WHERE id=? AND owner=?`, id, me.id); if (md && md.enc && (md.scope == null || md.scope === 'ppriv')) run(`UPDATE media SET scope='ppriv', ref=? WHERE id=?`, me.id, id); else keep.delete(id); }
  for (const r of qa(`SELECT id FROM media WHERE owner=? AND scope='ppriv'`, me.id)) if (!keep.has(r.id)) { dropMedia(r.id); run(`DELETE FROM prof_flames WHERE media=?`, r.id); }
  const pics = J(me.pics, {}); pics.priv = [null, null, null];
  const th = /^[0-9a-f]{64}$/.test(String(body.telHash || '')) ? String(body.telHash) : null;
  run(`UPDATE users SET priv_env=?, tel_env=?, tel_hash=?, priv='{}', pics=? WHERE id=?`, JSON.stringify(body.privEnv), body.telEnv ? JSON.stringify(body.telEnv) : null, th, JSON.stringify(pics), me.id);
  pushMany(contactIds(me.id), { t: 'contacts' }); return { me: meOut(getUser(me.id)) };
});
// Trois photos publiques et trois photos privées sur le profil.
R('POST', /^\/api\/me\/pics$/, async ({ me, body }) => {
  const set = body.set === 'priv' ? 'priv' : 'pub', slot = +body.slot; if (![0, 1, 2, 3, 4, 5].includes(slot)) E(400, 'Emplacement inconnu.');
  if (slot >= 3) { // vidéos publiques : fichier chiffré envoyé par morceaux, clé rangée avec le profil public
    if (set !== 'pub') E(400, 'Les vidéos privées sont chiffrées sur l’appareil.');
    const all = J(me.pics, {}), list = (all.pubv || [null, null, null]).slice(0, 3), i = slot - 3, b64 = v => /^[A-Za-z0-9+/=_-]{8,64}$/.test(String(v || ''));
    let v = null;
    if (body.media) {
      const m = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL AND enc=1`, String(body.media), me.id); if (!m) E(400, 'Vidéo introuvable.');
      if (!b64(body.k) || !b64(body.iv)) E(400, 'Vidéo invalide.');
      run(`UPDATE media SET scope='ppub', ref=? WHERE id=?`, me.id, m.id);
      v = { id: m.id, k: String(body.k), iv: String(body.iv), t: /^video\/[a-z0-9.+-]{2,30}$/.test(String(body.t || '')) ? String(body.t) : 'video/mp4' };
    }
    if (list[i] && list[i].id) { dropMedia(list[i].id); run(`DELETE FROM prof_flames WHERE media=?`, list[i].id); }
    list[i] = v; all.pubv = list; run(`UPDATE users SET pics=? WHERE id=?`, JSON.stringify(all), me.id);
    return { me: meOut(getUser(me.id)) };
  }
  if (set === 'priv' && me.priv_env) E(400, 'Les photos privées sont chiffrées : mettez à jour l’application.');
  const all = J(me.pics, {}), list = (all[set] || [null, null, null]).slice(0, 3);
  if (body.media) {
    const m = q1(`SELECT * FROM media WHERE id=? AND owner=? AND scope IS NULL AND enc=0`, String(body.media), me.id); if (!m) E(400, 'Photo introuvable.');
    run(`UPDATE media SET scope=?, ref=? WHERE id=?`, set === 'pub' ? 'ppub' : 'ppriv', me.id, m.id);
  }
  if (list[slot]) { dropMedia(list[slot]); run(`DELETE FROM prof_flames WHERE media=?`, list[slot]); }
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
  pushMsg(msg.chat_id, msg.id);
  return { ok: true };
});
// Capture d'écran repérée sur l'appareil : on prévient tout le monde dans la discussion.
R('POST', /^\/api\/chats\/(\d+)\/shot$/, async ({ me, m, body }) => {
  const c = chatTalk(me, +m[1]); if (tooMany('shot:' + me.id, 10, 60_000)) return { ok: true };
  sysMsg(c.id, `📸 ${nameInChat(me, c)} a fait une capture d’écran${body.once ? ' d’un message à vue unique' : ''}`); return { ok: true };
});
// Déverrouillage de secours : le mot de passe Tam-Tam, vérifié sans déconnecter.
R('POST', /^\/api\/me\/unlock$/, async ({ me, body }) => {
  if (blockedNow('unlock:' + me.id, 8)) E(429, 'Trop d’essais. Réessayez dans 15 minutes.');
  if (!checkPass(String(body.pass || ''), me.pass)) { tooMany('unlock:' + me.id, 8); E(400, 'Mot de passe incorrect.'); }
  return { ok: true };
});
R('POST', /^\/api\/me\/password$/, async ({ me, body }) => {
  if (!passGuard(me, body.old)) E(400, 'Le mot de passe actuel est incorrect.');
  passOk(body.pass, me.email);
  run(`UPDATE users SET pass=? WHERE id=?`, hashPass(String(body.pass)), me.id);
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
  if (!passGuard(me, body.pass)) E(400, 'Mot de passe incorrect.');
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
  } else { run(`DELETE FROM contacts WHERE a=? AND b=?`, a, b); locDrop(me.id, id); run(`DELETE FROM tel_share WHERE (owner=? AND viewer=?) OR (owner=? AND viewer=?)`, me.id, id, id, me.id); }
  push(id, { t: 'contacts' }); push(me.id, { t: 'contacts' });
  return { user: userCard(u, me.id) };
});
R('POST', /^\/api\/block$/, async ({ me, body }) => {
  const id = +body.id; if (!getUser(id) || id === me.id) E(404, 'Personne introuvable.');
  if (body.on) { run(`INSERT OR IGNORE INTO blocks(user_id,blocked,created_at) VALUES(?,?,?)`, me.id, id, now()); const [a, b] = pair(me.id, id); run(`DELETE FROM contacts WHERE a=? AND b=? AND status='pending'`, a, b); locDrop(me.id, id); }
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
  if (tooMany('grp:' + me.id, 20, DAY)) E(429, 'Vous avez créé beaucoup de groupes aujourd’hui. Réessayez demain.');
  const ok = new Set(contactIds(me.id)), ids = [...new Set((Array.isArray(body.members) ? body.members : []).map(Number))].filter(x => ok.has(x)).slice(0, 100);
  if (!ids.length) E(400, 'Choisissez au moins un contact.');
  const cid = Number(run(`INSERT INTO chats(type,name,created_by,created_at) VALUES('group',?,?,?)`, name, me.id, now()).lastInsertRowid);
  run(`INSERT INTO members(chat_id,user_id,admin,joined_at) VALUES(?,?,1,?)`, cid, me.id, now());
  for (const u of ids) run(`INSERT INTO members(chat_id,user_id,joined_at) VALUES(?,?,?)`, cid, u, now());
  sysMsg(cid, `@${me.handle} a créé le groupe « ${name} »`);
  pushMany(ids, { t: 'chats' });
  return { chat: chatOut(q1(`SELECT * FROM chats WHERE id=?`, cid), me.id) };
});
export function sysMsg(cid, text) {
  const id = run(`INSERT INTO messages(chat_id,sender,kind,text,created_at) VALUES(?,NULL,'sys',?,?)`, cid, text, now()).lastInsertRowid;
  pushMany(memberIds(cid), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, id)) });
}
