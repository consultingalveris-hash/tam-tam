// Appel de groupe : cases « appel… » (disparaissent quand on quitte, qu'on ignore ou qu'on annule par appui long) ; petite image déplaçable.
import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const d = await mk('D'); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A'); await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const m = await mk('M'); await reg(m, await inv(d), 'moussa', 'Moussa', 'moussa@exemple.org');
const k = await mk('K'); await reg(k, await inv(d), 'kadi', 'Kadi', 'kadi@exemple.org');
const ids = await Promise.all([a, m, k].map(p => p.evaluate(() => S.me.id)));
await d.evaluate(async ids => { await loadContacts(); const g = await api('/api/chats/group', {name: 'Quatre', members: ids}); keepUsers(Object.values(g.chat.users)); S.chats.set(g.chat.id, g.chat); await openChat(g.chat.id); }, ids);
for (const p of [a, m, k]) await p.evaluate(async () => { await loadChats(); });
// le clavier : zone de message active au moment de l'appel
await d.focus('#msgIn'); await d.evaluate(() => GCall.start(true)); await d.waitForTimeout(2500);
out('clavier refermé :', await d.evaluate(() => document.activeElement.id !== 'msgIn'));
const wait = p => p.evaluate(() => [document.querySelectorAll('#gcall .gt.wait').length, document.querySelector('.g-wait')?.textContent || '']);
out('en attente au début :', await wait(d));
await a.evaluate(() => GCall.accept()); await m.evaluate(() => GCall.accept()); await d.waitForTimeout(4000);
out('après arrivée Awa et Moussa :', await wait(d));
await k.evaluate(() => ACT.gcallDecline()); await d.waitForTimeout(800);
out('Kadi ignore → sa case disparaît :', await wait(d));
await m.evaluate(() => GCall.leave()); await d.waitForTimeout(1500);
out('Moussa raccroche → plus parmi les participants :', await d.evaluate(() => [...document.querySelectorAll('#gcall .gt .gt-name')].map(x => x.textContent)));
// on refait sonner Moussa puis on annule par appui long
await d.evaluate(id => GCall.addPerson(id), ids[1]); await d.waitForTimeout(1000);
out('Moussa sonne de nouveau :', [await m.evaluate(() => !!GCall.inc), await wait(d)]);
out('texte « ça sonne » au lieu d’une case vide :', await d.evaluate(() => document.querySelector('.g-wait')?.textContent));
await d.screenshot({path: 'shots/c213-groupe.png'});
for (const p of [d, a]) await p.evaluate(() => GCall.c && GCall.leave()); await d.waitForTimeout(800);
// appel à deux : petite image déplaçable
const dc = await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); await openChat(x.chat.id); return x.chat.id; }, ids[0]);
await a.evaluate(() => loadChats());
await d.evaluate(() => Call.start(true)); await a.waitForTimeout(2500); await a.evaluate(() => Call.accept()); await d.waitForTimeout(3500);
const lb = await (await d.$('#callLocal')).boundingBox();
await d.mouse.move(lb.x + 20, lb.y + 20); await d.mouse.down(); await d.waitForTimeout(400); await d.mouse.move(60, 200, {steps: 8}); await d.mouse.up(); await d.waitForTimeout(300);
const nb = await (await d.$('#callLocal')).boundingBox();
out('petite image déplacée :', [Math.round(lb.x), Math.round(lb.y), '→', Math.round(nb.x), Math.round(nb.y)]);
await d.evaluate(() => Call.render()); await d.waitForTimeout(200);
out('place gardée :', await d.evaluate(() => { const r = document.getElementById('callLocal').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; }));
await d.screenshot({path: 'shots/c213-pip.png'});
await d.evaluate(() => Call.hangup());
await done();
