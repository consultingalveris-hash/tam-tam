import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id), pId = await p.evaluate(() => S.me.id);
const cid = await p.evaluate(async aid => { const r = await api('/api/chats/direct', {userId: aid}); S.chats.set(r.chat.id, r.chat); keepUsers(Object.values(r.chat.users)); await openChat(r.chat.id); return r.chat.id; }, aId);
await a.evaluate(() => loadChats()); await a.waitForTimeout(400); await a.evaluate(id => openChat(id), cid); await a.waitForTimeout(500);
// Désiré : je reçois en français, Awa reçoit en anglais (proposition)
await p.evaluate(id => { Tr.setIn(id, 'fr'); Tr.setOut(id, 'en'); }, cid); await a.waitForTimeout(1500);
out('Awa toast :', await a.evaluate(() => document.querySelector('.toast')?.textContent));
out('Awa voit :', await a.evaluate(id => ({in: Tr.inL(id), out: Tr.outL(id), note: trNote(S.chats.get(id), 'in', l => l)}), cid));
// Awa garde puis Désiré essaie de changer -> refus
await a.evaluate(id => Tr.setIn(id, 'en'), cid); await p.waitForTimeout(1500);
out('Désiré toast :', await p.evaluate(() => document.querySelector('.toast')?.textContent));
out('Désiré change pour Awa :', await p.evaluate(id => { const ok = Tr.setOut(id, 'wo'); return [ok, document.querySelector('.toast')?.textContent, Tr.outL(id), trNote(S.chats.get(id), 'out', l => l)]; }, cid));
// Awa propose à Désiré une autre langue alors que Désiré a choisi lui-même -> refus
out('Awa change pour Désiré :', await a.evaluate(id => [Tr.setOut(id, 'pt'), Tr.outL(id)], cid));
// persistance après rechargement
await p.reload(); await p.waitForTimeout(4000);
out('Désiré après rechargement :', await p.evaluate(id => [Tr.inL(id), Tr.outL(id)], cid));
await done();
