import { B, mk, reg, inv, sendPhoto, done } from './lib.mjs';
const out = (k, v) => console.log(k, JSON.stringify(v));
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); const aId = await a.evaluate(() => S.me.id);
const chatId = await p.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadChats(); return r.chat.id; }, aId);
const say = (pg, t) => pg.evaluate(t => { $('#msgIn').value = t; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); }, t);
await p.evaluate(cid => openChat(cid), chatId); await p.waitForTimeout(500); await say(p, 'Message en version 2'); await p.waitForTimeout(1200);
// ancien format (v1) fabriqué à la main avec l'ancienne méthode
await p.evaluate(async cid => { const c = S.chats.get(cid), rec = recipients(c), raw = crypto.getRandomValues(new Uint8Array(32)), k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, new TextEncoder().encode(JSON.stringify({t: 'Ancien format v1'}))); const keys = {};
  for (const [uid, pub] of rec) { const wiv = crypto.getRandomValues(new Uint8Array(12)); keys[uid] = {iv: b64(wiv), wk: b64(await crypto.subtle.encrypt({name: 'AES-GCM', iv: wiv}, await E2E.sharedWith(pub), raw))}; }
  await api(`/api/chats/${cid}/messages`, {enc: {iv: b64(iv), ct: b64(ct), keys, from: {x: E2E.pubJwk.x, y: E2E.pubJwk.y}}}); }, chatId);
await p.waitForTimeout(800);
await sendPhoto(p).catch(() => {}); await p.waitForTimeout(2500);
await a.evaluate(async cid => { await loadChats(); await openChat(cid); }, chatId); await a.waitForTimeout(2500);
out('Awa lit les messages', await a.evaluate(() => S.msgs.get(S.chatId).map(m => ({t: (m.text || '').slice(0, 30), v: m.enc ? m.enc.v : null, k: m.kind, lock: !!m.locked}))));
out('enveloppe gardée par le serveur', await a.evaluate(async cid => { const r = await api(`/api/chats/${cid}/messages`); const e = r.messages.find(m => m.enc && m.enc.v === 2); return e ? {v: e.enc.v, eph: !!e.enc.eph, salt: !!e.enc.salt} : null; }, chatId));
await say(a, 'Réponse de Awa'); await a.waitForTimeout(1200);
await p.evaluate(async cid => { await loadMessages(cid, true); }, chatId); await p.waitForTimeout(1000);
out('Désiré lit la réponse', await p.evaluate(() => S.msgs.get(S.chatId).slice(-1).map(m => ({t: m.text, lock: !!m.locked}))));
// Awa change de clé (réinstallation) -> Désiré est prévenu
await a.evaluate(async () => { await E2E.create(S.me.id); await api('/api/keys', {pubkey: E2E.pubJwk, backup: await E2E.backup('Kc-222222')}); });
await p.evaluate(async () => { await loadContacts(); await loadChats(); renderMessages(true); }); await p.waitForTimeout(800);
out('alerte de changement de clé', await p.evaluate(() => { const el = document.querySelector('.key-alert'); return el ? el.innerText.slice(0, 60) : null; }));
await p.evaluate(() => document.querySelector('.key-alert button').click()); await p.waitForTimeout(300);
out('alerte fermée', await p.evaluate(() => !document.querySelector('.key-alert')));
await p.evaluate(async () => { await loadContacts(); renderMessages(true); });
out('pas de nouvelle alerte sans nouveau changement', await p.evaluate(() => !document.querySelector('.key-alert')));
await done();
