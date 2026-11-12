import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, JSON.stringify(v));
const p = await mk('D', true); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');   // ordinateur
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');      // téléphone
await p.evaluate(() => loadContacts()); const aId = await a.evaluate(() => S.me.id);
const chatId = await p.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadChats(); return r.chat.id; }, aId);
const say = (pg, t) => pg.evaluate(t => { $('#msgIn').value = t; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); }, t);
await p.evaluate(cid => openChat(cid), chatId); await p.waitForTimeout(500); await say(p, 'Écrit depuis mon ordinateur'); await p.waitForTimeout(1200);
await a.evaluate(async cid => { await loadChats(); await openChat(cid); }, chatId); await a.waitForTimeout(1500);
await say(a, 'Réponse depuis le téléphone'); await a.waitForTimeout(1500);
out('chez Awa (téléphone) : icône sur le message de Désiré', await a.evaluate(() => [...document.querySelectorAll('#msgs .msg')].map(m => ({t: m.innerText.split('\n')[0].slice(0, 30), pc: !!m.querySelector('.pc-ic')}))));
await p.evaluate(async cid => { await openChat(cid); }, chatId); await p.waitForTimeout(1200);
out('chez Désiré (ordinateur) : pas d’icône sur ses propres messages ni sur ceux du téléphone', await p.evaluate(() => [...document.querySelectorAll('#msgs .msg')].map(m => ({t: m.innerText.split('\n')[0].slice(0, 30), pc: !!m.querySelector('.pc-ic')}))));
out('conditions', await p.evaluate(async () => { const t = await (await fetch('/conditions')).text(); return {v: /Version 1\.2/.test(t), pc: /symbole d’ordinateur/.test(t), tr: /quitte donc le chiffrement de bout en bout/.test(t), audit: /audit par un organisme indépendant/.test(t)}; }));
out('réglages', await p.evaluate(() => { S.tab = 'settings'; renderAll(); return /sauf les textes que vous faites traduire/.test(document.body.innerText); }));
await done();
