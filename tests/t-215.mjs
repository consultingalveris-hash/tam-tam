// Caméra occupée : nouvel essai puis appel en audio avec explication ; appel depuis le menu de la liste.
import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const d = await mk('D', true); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A'); await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const aId = await a.evaluate(() => S.me.id);
const dc = await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); S.tab = 'chats'; renderAll(); return x.chat.id; }, aId);
await a.evaluate(() => loadChats());
// caméra qui refuse les réglages HD une fois, puis accepte
await d.evaluate(() => { const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); let n = 0; window.__tries = []; navigator.mediaDevices.getUserMedia = c => { window.__tries.push(JSON.stringify(c.video)); if (c.video && c.video.width && n++ === 0) return Promise.reject(Object.assign(new Error('x'), {name: 'OverconstrainedError'})); return g(c); }; });
await d.evaluate(id => chatListMenu(id), dc); await d.waitForTimeout(300);
out('menu de la liste :', await d.evaluate(() => [...document.querySelectorAll('.menu button')].slice(0, 2).map(b => b.textContent.trim())));
await d.click('[data-act=chatCall][data-v="1"]'); await d.waitForTimeout(2500);
out('caméra ouverte au 2e essai :', await d.evaluate(() => [Call.c && Call.c.cam, window.__tries.length]));
await d.evaluate(() => Call.hangup()); await d.waitForTimeout(1500);
// caméra occupée : appel en audio + message
await d.evaluate(() => { const g = window.__g || navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = c => c.video ? Promise.reject(Object.assign(new Error('busy'), {name: 'NotReadableError'})) : navigator.mediaDevices.__proto__.getUserMedia.call(navigator.mediaDevices, c); });
await d.evaluate(id => openChat(id), dc); await d.evaluate(() => Call.start(true)); await d.waitForTimeout(1500);
out('caméra occupée :', await d.evaluate(() => [Call.c && Call.c.cam, document.querySelector('.toast')?.textContent]));
await d.evaluate(() => Call.hangup());
await done();
