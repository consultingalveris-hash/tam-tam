import { B, mk, reg, inv, sendPhoto, done, skip } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A', true); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id);
const chatId = await p.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadChats(); return r.chat.id; }, aId);
await p.evaluate(cid => openChat(cid), chatId); await p.waitForTimeout(600);
const say = (pg, t) => pg.evaluate(t => { $('#msgIn').value = t; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); }, t);
await say(p, 'Bonjour Awa'); await p.waitForTimeout(600); await say(p, 'Voici une vidéo'); await p.waitForTimeout(600);
// vidéo de ~3 Mo, chiffrée par morceaux
const vinfo = await p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d'); const st = cv.captureStream(30); const mt = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9'; const rec = new MediaRecorder(st, {mimeType: mt, videoBitsPerSecond: 8_000_000}); const ch = []; rec.ondataavailable = e => ch.push(e.data); rec.start(); const t0 = performance.now(); await new Promise(r => { const f = () => { for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${Math.random() * 360} 80% 50%)`; g.fillRect(Math.random() * 1280, Math.random() * 720, 90, 90); } if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r(); }; f(); }); rec.stop(); await new Promise(r => rec.onstop = r);
  const blob = new Blob(ch, {type: mt.split(';')[0]}), c = S.chats.get(S.chatId); const sealed = await E2E.seal({t: '', mime: blob.type, dur: 5}, recipients(c), await blob.arrayBuffer()); const up = await upMedia(sealed.blob); const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env, kind: 'video'}); onMsg(r.msg); return {taille: Math.round(blob.size / 1e3) + ' Ko', chiffré: Math.round(sealed.blob.size / 1e3) + ' Ko', type: blob.type}; });
out('vidéo envoyée :', vinfo);
await a.evaluate(async cid => { await loadChats(); renderAll(); await openChat(cid); }, chatId); await a.waitForTimeout(4000);
out('lecture en direct :', await a.evaluate(() => { const v = document.querySelector('#msgs video[data-vid]'); const m = (S.msgs.get(S.chatId) || []).find(x => x.kind === 'video'); return {src: v && v.getAttribute('src'), pret: v && v.readyState, durée: v && Math.round(v.duration), morceaux: m && m.miv && m.miv.slice(0, 8)}; }));
await a.evaluate(() => { const v = document.querySelector('#msgs video[data-vid]'); v.currentTime = 3.5; }); await a.waitForTimeout(1500);
out('saut à 3,5 s :', await a.evaluate(() => { const v = document.querySelector('#msgs video[data-vid]'); return [Math.round(v.currentTime * 10) / 10, v.readyState]; }));
await sendPhoto(p); await p.waitForTimeout(1500); await a.waitForTimeout(2500);
// stockage
await a.evaluate(() => Stock.sheet()); await a.waitForTimeout(1500);
out('gérer le stockage :', await a.evaluate(() => [document.querySelector('.sto-tot') && document.querySelector('.sto-tot').textContent, [...document.querySelectorAll('.sto-row span')].map(x => x.textContent)]));
await a.screenshot({path: 'shots/sto192.png'}); await a.evaluate(() => closeLayer());
// hors connexion : tout s'ouvre depuis l'appareil
await a.waitForTimeout(2000);
await a.context().setOffline(true); await a.reload(); await a.waitForTimeout(3500); await skip(a).catch(() => {});
out('sans réseau, liste :', await a.evaluate(() => [!!S.me, S.offline, document.querySelectorAll('.chat-row').length]));
await a.evaluate(cid => openChat(cid), chatId).catch(() => {}); await a.waitForTimeout(1500);
out('sans réseau, messages :', await a.evaluate(() => [...document.querySelectorAll('#msgs .msg .txt')].map(x => x.textContent).slice(0, 4)));
out('photo sans réseau :', await a.evaluate(() => { const i = document.querySelector('#msgs img.photo'); return i ? [!!i.getAttribute('src'), i.naturalWidth] : 'aucune'; }));
await a.screenshot({path: 'shots/offline192.png'});
await say(a, 'Écrit sans réseau'); await a.waitForTimeout(600);
await a.context().setOffline(false); await a.evaluate(() => window.dispatchEvent(new Event('online'))); await a.waitForTimeout(3500);
out('réseau revenu chez Awa :', await a.evaluate(() => [S.offline, Outbox.list().length]));
out('Désiré a reçu :', await p.evaluate(() => (S.msgs.get(S.chatId) || []).some(m => m.text === 'Écrit sans réseau')));
// déconnexion : tout est effacé
out('effacé à la déconnexion :', await a.evaluate(async () => { await Stock.wipe(); const ks = await caches.keys(); return !ks.includes('tt-media'); }));
await done();
