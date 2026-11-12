import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D', true); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A', true); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
const c3 = await mk('C'); await reg(c3, await inv(p), 'coco', 'Coco', 'coco@exemple.org', 'Kc-333333');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id);
// contacts : zones
await p.evaluate(() => ACT.tab({t: 'contacts'})); await p.waitForTimeout(800);
out('zones :', await p.evaluate(() => [...document.querySelectorAll('.cz-h span')].map(x => x.textContent)));
out('défilement propre :', await p.evaluate(() => getComputedStyle(document.querySelector('.cz-b')).overflowY));
await p.click('.cz-h'); await p.waitForTimeout(200);
out('repliée :', await p.evaluate(() => document.querySelector('.cz').classList.contains('shut')));
await p.click('.cz-h'); await p.screenshot({path: 'shots/cz190.png'});
// point jaune
await p.evaluate(() => ACT.tab({t: 'souvenirs'})); await p.waitForTimeout(500); out('anneau du point :', await p.evaluate(() => getComputedStyle(document.querySelector('.dot1')).boxShadow)); await p.screenshot({path: 'shots/dot190.png', clip: {x: 0, y: 0, width: 400, height: 120}});
// langue imposée
await p.evaluate(async () => { await api('/api/admin/translate', {key: 'AIzaTESTTESTTESTTESTTESTTESTTESTTEST', provider: 'google'}); await saveNow({trConsent: true}); await Tr.loadSt(); });
const chatId = await p.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadChats(); return r.chat.id; }, aId);
await a.evaluate(async () => { await saveNow({trConsent: true}); await Tr.loadSt(); await loadChats(); renderAll(); });
await p.evaluate(cid => { S.chatId = cid; Tr.setOut(cid, 'en'); }, chatId); await p.waitForTimeout(800);
await a.evaluate(async cid => { await loadChats(); openChat(cid); }, chatId); await a.waitForTimeout(800);
await p.evaluate(async cid => { await openChat(cid); $('#msgIn').value = 'Bonsoir Awa'; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); }, chatId); await p.waitForTimeout(2500);
out('bandeau chez Awa :', await a.evaluate(() => !!document.querySelector('.tr-imp')));
out('message avant accord :', await a.evaluate(() => [...document.querySelectorAll('#msgs .msg.in .txt')].map(x => x.textContent)));
await a.screenshot({path: 'shots/imp190.png'});
await a.click('[data-act="trImpKeep"]'); await a.waitForTimeout(1500);
out('après Accepter :', await a.evaluate(() => [!document.querySelector('.tr-imp'), ...[...document.querySelectorAll('#msgs .msg.in .txt')].map(x => x.textContent)]));
out('Désiré ne peut plus changer :', await p.evaluate(async cid => { await loadChats(); return Tr.setOut(cid, 'fr'); }, chatId));
await done();
