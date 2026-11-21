// Allumer la caméra pendant un appel commencé sans image (groupe et à deux).
import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const d = await mk('D', true); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A'); await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const m = await mk('M'); await reg(m, await inv(d), 'moussa', 'Moussa', 'moussa@exemple.org');
const [aId, mId] = await Promise.all([a, m].map(p => p.evaluate(() => S.me.id)));
await d.evaluate(async ids => { await loadContacts(); const g = await api('/api/chats/group', {name: 'Trio', members: ids}); keepUsers(Object.values(g.chat.users)); S.chats.set(g.chat.id, g.chat); await openChat(g.chat.id); }, [aId, mId]);
for (const p of [a, m]) await p.evaluate(() => loadChats());
await d.evaluate(() => GCall.start(false)); await d.waitForTimeout(1500);
await a.evaluate(() => GCall.accept()); await m.evaluate(() => GCall.accept()); await d.waitForTimeout(4000);
out('appel vocal de groupe à trois :', await d.evaluate(() => [GCall.c.peers.size + 1, GCall.c.local.getVideoTracks().length]));
await d.click('[data-act=gcallCam]'); await d.waitForTimeout(3500);
out('caméra allumée chez Désiré :', await d.evaluate(() => [GCall.c.cam, GCall.c.local.getVideoTracks().length, !document.querySelector('[data-act=gcallCam]').classList.contains('off')]));
out('Awa et Moussa voient son image :', await Promise.all([a, m].map(p => p.evaluate(id => { const v = document.querySelector(`#gcall video[data-v="${id}"]`); return !!v && v.videoWidth > 0; }, 1))));
await d.click('[data-act=gcallCam]'); await d.waitForTimeout(800);
out('coupée de nouveau :', await d.evaluate(() => [GCall.c.cam, document.querySelector('[data-act=gcallCam]').classList.contains('off')]));
for (const p of [d, a, m]) await p.evaluate(() => GCall.c && GCall.leave()); await d.waitForTimeout(1500);
// à deux
await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); await openChat(x.chat.id); }, aId);
await a.evaluate(() => loadChats());
await d.evaluate(() => Call.start(false)); await a.waitForTimeout(2500); await a.evaluate(() => Call.accept()); await d.waitForTimeout(3500);
await d.click('[data-act=callCam]'); await d.waitForTimeout(3500);
out('appel à deux : caméra ajoutée et vue par Awa :', [await d.evaluate(() => Call.c.cam), await a.evaluate(() => { const v = document.getElementById('callRemote'); return !!v && !v.hidden && v.videoWidth > 0; })]);
await d.evaluate(() => Call.hangup());
await done();
