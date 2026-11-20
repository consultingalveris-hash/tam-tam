// Haut-parleur pendant un appel : bouton présent, pont Android (version 4) piloté, message clair dans le navigateur.
import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const d = await mk('D'); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A');
await a.addInitScript(() => { window.__spk = []; window.TamTamAndroid = {version: () => 4, setSecure() {}, bioAvailable: () => false, bioAuth() {}, pxPrepare() {}, pxStart() {}, pxStop() {}, pxSend() {}, pxPeers: () => '[]', pxRadios: () => '{"bt":true,"wifi":true,"on":false}', pxAskBt() {},
  speaker(on) { window.__spk.push(on ? 'HP' : 'écouteur'); }, callOver() { window.__spk.push('fin'); }}; });
await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const aId = await a.evaluate(() => S.me.id);
const chatId = await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); return x.chat.id; }, aId);
await a.evaluate(async () => { await loadChats(); });
await d.evaluate(cid => openChat(cid), chatId); await d.waitForTimeout(400);
await d.evaluate(() => Call.start(true)); await a.waitForTimeout(2500);
await a.evaluate(() => Call.accept()); await a.waitForTimeout(4000);
out('appel établi :', [await d.evaluate(() => Call.c && Call.c.state), await a.evaluate(() => Call.c && Call.c.state)]);
out('boutons chez Awa :', await a.evaluate(() => [...document.querySelectorAll('#call .ci')].map(x => x.getAttribute('aria-label') + (x.classList.contains('off') ? ' (barré)' : ''))));
out('appel vidéo : haut-parleur allumé d’office :', await a.evaluate(() => [window.__spk, document.querySelector('[data-act=callSpk]').classList.contains('off') === false]));
await a.screenshot({path: 'shots/spk-a.png'});
await a.click('[data-act=callSpk]'); await a.waitForTimeout(300);
out('après appui :', await a.evaluate(() => [window.__spk, document.querySelector('[data-act=callSpk]').classList.contains('off') === false, document.querySelector('.toast').textContent]));
await d.click('[data-act=callSpk]'); await d.waitForTimeout(400);
out('navigateur (Désiré) :', await d.evaluate(() => [Spk.on, document.querySelector('.toast')?.textContent]));
await d.evaluate(() => Call.hangup()); await a.waitForTimeout(1500);
out('fin d’appel chez Awa :', await a.evaluate(() => window.__spk));
await done();
