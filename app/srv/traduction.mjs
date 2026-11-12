import fs from 'node:fs';
import path from 'node:path';
import { BASE_URL, DAY, E, J, PUB, Rfor, clean, getUser, memberIds, msgOut, now, online, presence, pushMany, q1, qa, relation, rnd, run, send, sha, streams, tooMany } from './core.mjs';
const R = Rfor(6);
import { envPick } from './comptes.mjs';
import { gcalls, gleave } from './groupes.mjs';
import { chatTalk, mailHtml, mailSettings, resetTransport, sendMail } from './messages.mjs';
import { G_REDIRECT, adminOnly, redirect } from './google.mjs';

/* ---------- traduction (Google Cloud Translation, plafonnée à la partie gratuite) ---------- */
export const TR_URL = process.env.TR_URL || 'https://translation.googleapis.com/language/translate/v2';
export const TR_CAP = 450_000; // caractères Google par mois : Google en offre 500 000, on s'arrête avant pour ne jamais être prélevé
export const TR_LANGS = ['fr', 'en', 'wo', 'ff', 'bm', 'ln', 'sw', 'ha', 'yo', 'ig', 'ee', 'ak', 'rw', 'sg', 'ar', 'pt', 'es', 'de', 'it', 'zh', 'ru', 'tr', 'nl', 'hi', 'am', 'so', 'zu', 'xh', 'mg', 'rn', 'kg', 'ts', 'tn', 'st', 'sn', 'ny', 'om', 'ti', 'lg', 'ki'];
// Deux moteurs possibles : Google d'abord (gratuit jusqu'au plafond), puis Claude (budget mensuel) en relais
// et pour les langues que Google ne connaît pas. Ancien réglage à une seule clé repris tel quel.
export const trConf = () => { const r = q1(`SELECT v FROM settings WHERE k='translate'`); const c = r ? J(r.v, {}) : {};
  const gkey = c.gkey || (c.key && c.provider !== 'claude' ? c.key : ''), ckey = c.ckey || (c.key && c.provider === 'claude' ? c.key : '');
  return { gkey, ckey, key: gkey || ckey, budget: +c.budget > 0 ? +c.budget : 1.65 }; };
// Dépense réelle de Claude ce mois-ci, calculée à partir des jetons facturés (en millionièmes de dollar).
export const PRICE_IN = +process.env.CLAUDE_PRICE_IN || 0.10, PRICE_OUT = +process.env.CLAUDE_PRICE_OUT || 0.50; // $ par million de jetons
export const usdKey = () => 'trusd:' + new Date().toISOString().slice(0, 7);
export const usdSpent = () => +(q1(`SELECT v FROM settings WHERE k=?`, usdKey())?.v || 0) / 1e6;
export const usdAdd = u => { const inT = +(u && u.input_tokens) || 0, outT = +(u && u.output_tokens) || 0; const micro = Math.ceil(inT * PRICE_IN + outT * PRICE_OUT);
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, usdKey(), String(Math.round(usdSpent() * 1e6) + micro)); };
export const trKey = () => trConf().key;
export const trSave = c => run(`INSERT OR REPLACE INTO settings(k,v) VALUES('translate',?)`, JSON.stringify({ gkey: c.gkey || '', ckey: c.ckey || '', budget: c.budget }));
// Langues que seul Claude sait traduire (qualité variable, marquées « essai » dans l'application).
export const TR_LANGS_CLAUDE = ['bas', 'dua', 'ewo', 'srr', 'mnk', 'snk', 'dyo', 'fan', 'bum', 'mos', 'fon', 'dyu', 'kab', 'tzm', 'ber', 'kri'];
export const trLangs = c => c.ckey || c.provider === 'claude' ? TR_LANGS.concat(TR_LANGS_CLAUDE) : TR_LANGS;
export const CLAUDE_URL = process.env.CLAUDE_URL || 'https://api.anthropic.com/v1/messages';
export const LANG_EN = { bas: 'Basaa (Bassa, Cameroon)', dua: 'Duala (Cameroon)', ewo: 'Ewondo (Cameroon)', srr: 'Serer (Senegal)', mnk: 'Mandinka', snk: 'Soninke', dyo: 'Jola-Fonyi (Diola)', fan: 'Fang', bum: 'Bulu (Cameroon)', mos: 'Mooré (Burkina Faso)', fon: 'Fon (Benin)', dyu: 'Dioula (Jula)', kab: 'Kabyle', tzm: 'Central Atlas Tamazight', ber: 'Berber', kri: 'Krio (Sierra Leone)', fr: 'French', en: 'English', wo: 'Wolof', ff: 'Fula (Pulaar)', bm: 'Bambara', ln: 'Lingala', sw: 'Swahili', ha: 'Hausa', yo: 'Yoruba', ig: 'Igbo', ee: 'Ewe', ak: 'Twi', rw: 'Kinyarwanda', sg: 'Sango', ar: 'Arabic', pt: 'Portuguese', es: 'Spanish', de: 'German', it: 'Italian', zh: 'Chinese', ru: 'Russian', tr: 'Turkish', nl: 'Dutch', hi: 'Hindi', am: 'Amharic', so: 'Somali', zu: 'Zulu', xh: 'Xhosa', mg: 'Malagasy', rn: 'Kirundi', kg: 'Kikongo', ts: 'Tsonga', tn: 'Tswana', st: 'Sotho', sn: 'Shona', ny: 'Chichewa', om: 'Oromo', ti: 'Tigrinya', lg: 'Luganda', ki: 'Kikuyu' };
// Traduit avec le moteur choisi ; renvoie { text, from }.
export let trLastErr = '';
export async function trCall(c, text, to, ctx) {
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
export const trMonth = () => 'tr:' + new Date().toISOString().slice(0, 7);
export const trUsed = () => +(q1(`SELECT v FROM settings WHERE k=?`, trMonth())?.v || 0);
R('GET', /^\/api\/translate\/status$/, async () => { const c = trConf(); return { on: !!c.key, left: (c.gkey ? Math.max(0, TR_CAP - trUsed()) : 0) + (c.ckey && usdSpent() < c.budget ? 1 : 0), langs: trLangs(c) }; });
R('POST', /^\/api\/translate$/, async ({ me, body }) => {
  const key = trKey(); if (!key) E(503, 'La traduction n’est pas encore activée sur Tam-Tam.');
  const text = String(body.text || '').slice(0, 2000).trim(), to = String(body.to || 'fr');
  if (!text) E(400, 'Rien à traduire.'); if (!trLangs(trConf()).includes(to)) E(400, 'Langue non prise en charge.');
  if (tooMany('tr:' + me.id, 120, 60 * 60_000)) E(429, 'Trop de traductions d’un coup. Réessayez dans un moment.');
  const conf = trConf(), ctx = (Array.isArray(body.ctx) ? body.ctx : []).slice(-4).map(x => String(x || '').slice(0, 300)).filter(Boolean);
  // Google d'abord, tant que le plafond gratuit du mois n'est pas atteint ; sinon (ou en cas d'échec) Claude, dans son budget.
  const engines = [];
  if (conf.gkey && TR_LANGS.includes(to) && trUsed() + text.length <= TR_CAP) engines.push('google');
  if (conf.ckey && usdSpent() < conf.budget) engines.push('claude');
  if (!engines.length) E(429, 'Traduction indisponible jusqu’au 1er du mois : la réserve de ce mois est épuisée.');
  let t = null, last = '';
  for (const eng of engines) {
    if (eng === 'google') run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, trMonth(), String(trUsed() + text.length));
    try { t = await trCall({ provider: eng, key: eng === 'google' ? conf.gkey : conf.ckey }, text, to, ctx); } catch (e) { t = { err: e.message }; }
    if (t && !t.err && t.text) break;
    last = (eng === 'google' ? 'Google : ' : 'Claude : ') + (t && t.err); trLastErr = new Date().toISOString() + ' ' + last; console.error('traduction', last); t = null;
  }
  if (!t) E(502, 'La traduction a échoué. Réessayez plus tard.');
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
export const TR_VOTES = 3;
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
export const scrub = t => String(t || '').replace(/\S+@\S+\.\S+/g, '[e-mail]').replace(/https?:\/\/\S+|www\.\S+/gi, '[lien]').replace(/\+?\d[\d .-]{5,}\d/g, '[numéro]').slice(0, 2000).trim();
R('POST', /^\/api\/corpus$/, async ({ me, body }) => {
  const kind = body.kind === 'fix' ? 'fix' : 'mt', author = getUser(+body.author || 0);
  if (!author || !author.tr_consent || (kind === 'fix' && !me.tr_consent)) return { ok: false };
  if (author.id !== me.id && relation(me.id, author.id) !== 'contact' && !q1(`SELECT 1 FROM members a JOIN members b ON a.chat_id=b.chat_id WHERE a.user_id=? AND b.user_id=?`, me.id, author.id)) return { ok: false };
  if (tooMany('corpus:' + me.id, 300, 60 * 60_000)) return { ok: false };
  const src = scrub(body.src), tgt = scrub(body.tgt), tl = String(body.tl || '').slice(0, 8), sl = String(body.sl || '').slice(0, 8);
  if (!src || !tgt || !tl || src === tgt) return { ok: false };
  run(`INSERT OR IGNORE INTO corpus(src,sl,tgt,tl,kind,at) VALUES(?,?,?,?,?,?)`, src, sl, tgt, tl, kind, now()); return { ok: true };
});
// Modifier son message : texte seulement, dans les 2 minutes qui suivent l'envoi.
R('POST', /^\/api\/messages\/(\d+)\/edit$/, async ({ me, m, body }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg || msg.sender !== me.id || !msg.e2e || msg.once || msg.deleted || msg.media || msg.kind !== 'text') E(404, 'Message introuvable.');
  if (now() - msg.created_at > 2 * 60_000) E(403, 'Un message ne peut plus être modifié 2 minutes après son envoi.');
  const env = body.enc; if (!env || typeof env.ct !== 'string' || typeof env.iv !== 'string' || typeof env.keys !== 'object') E(400, 'Message chiffré invalide.');
  const text = JSON.stringify(envPick(env)); if (text.length > 60000) E(413, 'Message trop long.');
  run(`UPDATE messages SET text=?, edited=1 WHERE id=?`, text, msg.id);
  pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true }); return { ok: true };
});
// L'expéditeur corrige la traduction de son propre message : il le rechiffre, le destinataire voit la version corrigée.
R('POST', /^\/api\/messages\/(\d+)\/reseal$/, async ({ me, m, body }) => {
  const msg = q1(`SELECT * FROM messages WHERE id=?`, +m[1]); if (!msg || msg.sender !== me.id || !msg.e2e || msg.once || msg.deleted || msg.media || msg.kind !== 'text') E(404, 'Message introuvable.');
  chatTalk(me, msg.chat_id);
  if (now() - msg.created_at > 7 * DAY) E(400, 'Ce message est trop ancien pour être corrigé.');
  const env = body.enc; if (!env || typeof env.ct !== 'string' || typeof env.iv !== 'string' || typeof env.keys !== 'object') E(400, 'Message chiffré invalide.');
  const text = JSON.stringify(envPick(env)); if (text.length > 60000) E(413, 'Message trop long.');
  run(`UPDATE messages SET text=? WHERE id=?`, text, msg.id);
  pushMany(memberIds(msg.chat_id), { t: 'msg', msg: msgOut(q1(`SELECT * FROM messages WHERE id=?`, msg.id)), update: true }); return { ok: true };
});
// Vitesse mesurée chez les vrais utilisateurs (temps seulement : aucun contenu, aucun nom).
export const PERF_K = ['open', 'chat', 'send', 'recv', 'img', 'vid', 'call', 'up'];
R('POST', /^\/api\/perf$/, async ({ me, body }) => {
  if (tooMany('perf:' + me.id, 30, 60 * 60_000)) return { ok: true };
  const v = String(body.v || '').slice(0, 12), items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  for (const it of items) { const k = String(it && it[0]), ms = Math.round(+(it && it[1])); if (PERF_K.includes(k) && ms >= 0 && ms <= 120_000) run(`INSERT INTO perf(at,v,k,ms) VALUES(?,?,?,?)`, now(), v, k, ms); }
  return { ok: true };
});
R('GET', /^\/api\/admin\/perf$/, async ({ me }) => {
  adminOnly(me);
  const rows = qa(`SELECT v, k, ms FROM perf WHERE at>? ORDER BY ms`, now() - 14 * DAY), by = new Map();
  for (const r of rows) { const key = r.k + '|' + r.v; if (!by.has(key)) by.set(key, []); by.get(key).push(r.ms); }
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const vs = [...new Set(rows.map(r => r.v))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const cur = vs.at(-1), prev = vs.at(-2);
  const out = PERF_K.map(k => { const a = by.get(k + '|' + cur) || [], b = by.get(k + '|' + prev) || []; const med = a.length ? q(a, .5) : null, pmed = b.length ? q(b, .5) : null;
    return { k, n: a.length, med, p90: a.length ? q(a, .9) : null, prev: pmed, slower: med != null && pmed != null && b.length >= 10 && a.length >= 10 && med > pmed * 1.2 }; });
  return { version: cur || null, previous: prev || null, metrics: out };
});
R('GET', /^\/api\/admin\/translate$/, async ({ me }) => { adminOnly(me); const c = trConf(); return { has: !!c.key, g: !!c.gkey, c: !!c.ckey, used: trUsed(), cap: TR_CAP, spent: usdSpent(), budget: c.budget, lastErr: trLastErr, promoted: q1(`SELECT COUNT(*) n FROM tr_cache WHERE promoted=1`).n, corpus: Object.fromEntries(qa(`SELECT kind, COUNT(*) n FROM corpus GROUP BY kind`).map(r => [r.kind, r.n])) }; });
R('POST', /^\/api\/admin\/translate$/, async ({ me, body }) => {
  adminOnly(me);
  if (body.key) { if (body.provider === 'claude') body.ckey = body.key; else body.gkey = body.key; } // ancienne forme
  const c = trConf(); c.budget = Math.min(100, Math.max(0.1, +body.budget || c.budget));
  if (body.off === 'google') c.gkey = ''; else if (body.off === 'claude') c.ckey = ''; else if (body.off) { c.gkey = ''; c.ckey = ''; }
  for (const [eng, k] of [['google', clean(body.gkey, 300)], ['claude', clean(body.ckey, 300)]]) {
    if (!k) continue;
    if (eng === 'claude' ? !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k) : !/^[A-Za-z0-9_-]{30,}$/.test(k))
      E(400, eng === 'claude' ? 'Cette clé ne ressemble pas à une clé Anthropic (elle commence par « sk-ant- »).' : 'Cette clé ne ressemble pas à une clé Google (elle commence souvent par « AIza »).');
    let t; try { t = await trCall({ provider: eng, key: k }, 'Bonjour', 'en'); } catch { t = { err: 'pas de réponse' }; }
    if (t.err) E(400, (eng === 'claude' ? 'Anthropic' : 'Google') + ' refuse cette clé : ' + String(t.err).slice(0, 200));
    if (eng === 'google') { c.gkey = k; run(`INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)`, trMonth(), String(trUsed() + 7)); } else c.ckey = k;
  }
  if (!c.gkey && !c.ckey) run(`DELETE FROM settings WHERE k='translate'`); else trSave(c);
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
  return { users: qa(`SELECT id,name,handle,email,created_at,last_seen,amb FROM users ORDER BY created_at DESC LIMIT 500`).map(u => ({ ...u, online: online(u.id) })),
    reports: qa(`SELECT * FROM reports WHERE done=0 ORDER BY created_at DESC LIMIT 200`).map(r => ({ ...r, by: getUser(r.by_user)?.name || '—', target: r.target_user ? getUser(r.target_user)?.name || '—' : null, chat: r.chat_id ? q1(`SELECT name,type FROM chats WHERE id=?`, r.chat_id) : null })),
    counts: { users: q1(`SELECT COUNT(*) n FROM users`).n, messages: q1(`SELECT COUNT(*) n FROM messages`).n, chats: q1(`SELECT COUNT(*) n FROM chats`).n } };
});
// Ambassadeurs des langues : un responsable nomme un membre ambassadeur d'une langue (badge sur son profil)
R('POST', /^\/api\/admin\/amb$/, async ({ me, body }) => {
  adminOnly(me); const u = getUser(+body.userId); if (!u) E(404, 'Compte introuvable.');
  const lang = clean(body.lang || '', 40); run(`UPDATE users SET amb=? WHERE id=?`, lang || null, u.id); return { ok: true, amb: lang || null };
});
R('GET', /^\/api\/ambassadors$/, async ({ me }) => ({ list: qa(`SELECT id,handle,amb FROM users WHERE amb IS NOT NULL AND amb<>'' ORDER BY amb, handle`).map(u => ({ id: u.id, handle: u.handle, lang: u.amb })) }));
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
  run(`INSERT OR REPLACE INTO settings(k,v) VALUES('mail',?)`, JSON.stringify(m)); resetTransport();
  if (body.test) { try { await sendMail(me.email, 'Test d’envoi tam-tam', mailHtml('L’envoi d’e-mails fonctionne', '<p>Les codes « mot de passe oublié » partiront depuis cette adresse.</p>')); } catch (e) { E(502, 'Réglage enregistré, mais le test a échoué : ' + String(e.message || e).slice(0, 160)); } }
  return { ok: true };
});
R('POST', /^\/api\/admin\/report-done$/, async ({ me, body }) => { adminOnly(me); run(`UPDATE reports SET done=1 WHERE id=?`, +body.id); return { ok: true }; });

/* flux temps réel */
// Empreinte de la version de l'application : quand elle change (mise à jour), les écrans ouverts se rechargent.
// Tous les fichiers de l'application comptent (avant : camera.js, memories.js et emoji.js étaient oubliés, leurs mises à jour n'arrivaient qu'au rechargement manuel).
export const APP_VER = sha(fs.readdirSync(PUB).filter(f => /\.(js|css|html)$/.test(f) && f !== 'jsqr.js' && f !== 'mb.js').sort().map(f => { try { return fs.readFileSync(path.join(PUB, f), 'utf8'); } catch { return ''; } }).join('|')).slice(0, 12);
R('GET', /^\/api\/stream$/, async ({ me, req, res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\ndata: ${JSON.stringify({ t: 'hello', v: APP_VER })}\n\n`);
  if (!streams.has(me.id)) streams.set(me.id, new Set());
  const set = streams.get(me.id), first = set.size === 0;
  if (set.size >= 12) { const old = set.values().next().value; set.delete(old); try { old.end(); } catch {} }
  set.add(res);
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

