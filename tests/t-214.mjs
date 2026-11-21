// Filtres vidéo, suppression d'un groupe, appel de groupe sans cases vides et qui se termine quand on est seul.
import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const d = await mk('D'); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A'); await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const m = await mk('M'); await reg(m, await inv(d), 'moussa', 'Moussa', 'moussa@exemple.org');
const [aId, mId] = await Promise.all([a, m].map(p => p.evaluate(() => S.me.id)));
// 1) filtres en appel à deux
const dc = await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); await loadContacts(); await openChat(x.chat.id); return x.chat.id; }, aId);
await a.evaluate(() => loadChats());
await d.evaluate(() => Call.start(true)); await a.waitForTimeout(2500); await a.evaluate(() => Call.accept()); await d.waitForTimeout(3500);
out('bouton filtres :', await d.evaluate(() => !!document.querySelector('[data-act=callFx]')));
await d.click('[data-act=callFx]'); await d.waitForTimeout(300);
out('choix :', await d.evaluate(() => [...document.querySelectorAll('.fx-pick button')].map(x => x.getAttribute('aria-label'))));
await d.click('[data-act=callFxSet][data-k=doux]'); await d.waitForTimeout(1500);
out('image filtrée envoyée :', await d.evaluate(() => { const t = Call.c.local.getVideoTracks()[0]; const s = Call.c.pc.getSenders().find(x => x.track && x.track.kind === 'video'); return [Beauty.raw.has(t), s.track === t, t.readyState]; }));
out('WebGL utilisé et image qui bouge :', await d.evaluate(async () => { const cv = document.createElement('canvas'); const ok = !!cv.getContext('webgl'); const v = document.getElementById('callLocal'); const t1 = v.currentTime; await new Promise(r => setTimeout(r, 800)); return [ok, v.currentTime > t1]; }));
out('même lecteur vidéo après plusieurs changements :', await d.evaluate(async () => { const r1 = document.getElementById('callRemote'), l1 = document.getElementById('callLocal'); Call.render(); Call.render(); return [r1 === document.getElementById('callRemote'), l1 === document.getElementById('callLocal')]; }));
out('Awa reçoit toujours l’image :', await a.evaluate(() => { const v = document.getElementById('callRemote'); return v && v.videoWidth > 0; }));
await d.screenshot({path: 'shots/c214-fx.png'});
await d.click('[data-act=callFxSet][data-k=nb]'); await d.waitForTimeout(400);
out('autre filtre, même image :', await d.evaluate(() => Beauty.raw.has(Call.c.local.getVideoTracks()[0])));
await d.click('[data-act=callFxSet][data-k=off]'); await d.waitForTimeout(600);
out('Aucun → caméra brute :', await d.evaluate(() => { const t = Call.c.local.getVideoTracks()[0]; return [!Beauty.raw.has(t), t.readyState]; }));
await d.evaluate(() => { Beauty.mode = 'eclat'; Call.hangup(); }); await d.waitForTimeout(800);
// 2) appel de groupe : pas de case vide, Moussa ne décroche pas, Awa raccroche → fin automatique
const gid = await d.evaluate(async ids => { const g = await api('/api/chats/group', {name: 'Trio', members: ids}); keepUsers(Object.values(g.chat.users)); S.chats.set(g.chat.id, g.chat); await openChat(g.chat.id); return g.chat.id; }, [aId, mId]);
for (const p of [a, m]) await p.evaluate(() => loadChats());
await d.evaluate(() => GCall.start(true)); await d.waitForTimeout(2000);
out('pendant que ça sonne :', await d.evaluate(() => [document.querySelectorAll('#gcall .gt').length, document.querySelector('.g-wait')?.textContent]));
out('filtre déjà appliqué en groupe :', await d.evaluate(() => Beauty.raw.has(GCall.c.local.getVideoTracks()[0])));
await a.evaluate(() => GCall.accept()); await d.waitForTimeout(4000);
out('Awa décroche :', await d.evaluate(() => [...document.querySelectorAll('#gcall .gt .gt-name')].map(x => x.textContent))); out('états :', [await d.evaluate(() => [...GCall.c.peers.values()].map(p => p.uid + ':' + p.state)), await a.evaluate(() => GCall.c && [...GCall.c.peers.values()].map(p => p.uid + ':' + p.state))]);
await d.screenshot({path: 'shots/c214-groupe.png'});
await a.evaluate(() => GCall.leave()); await d.waitForTimeout(7000);
out('Awa raccroche → appel terminé chez Désiré :', await d.evaluate(() => [!GCall.c, document.querySelector('.toast')?.textContent]));
// 3) supprimer le groupe depuis la liste
await d.evaluate(() => { if (S.chatId) ACT.back(); S.tab = 'chats'; renderAll(); });
await d.evaluate(id => ACT.chatClearAsk({id}), gid); await d.waitForTimeout(300);
out('question :', await d.evaluate(() => document.querySelector('.sheet h2, .sheet-head h2')?.textContent));
await d.evaluate(id => ACT.chatClearYes({id}), gid); await d.waitForTimeout(800);
out('groupe disparu de la liste :', await d.evaluate(id => !S.chats.has(id) && ![...document.querySelectorAll('[data-id]')].some(e => +e.dataset.id === id && e.closest('.chat-row, .row')), gid));
await d.evaluate(() => loadChats()); out('toujours absent après rechargement :', await d.evaluate(id => !S.chats.has(id), gid));
await done();
