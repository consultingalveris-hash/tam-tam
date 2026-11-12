import { B, mk, reg, inv, sendPhoto, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D', true); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const pId = await p.evaluate(() => S.me.id);
await a.evaluate(async pid => { const r = await api('/api/chats/direct', {userId: pid}); S.chats.set(r.chat.id, r.chat); keepUsers(Object.values(r.chat.users)); await openChat(r.chat.id); }, pId);
const send = async (pg, t) => { await pg.evaluate(t => { $('#msgIn').value = t; document.querySelector('form[data-form=send]').requestSubmit(); }, t); await pg.waitForTimeout(350); };
// vidéo envoyée par Awa (portrait 360x640)
await a.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 360; cv.height = 640; const g = cv.getContext('2d'); const st = cv.captureStream(15); const rec = new MediaRecorder(st, {mimeType: 'video/webm'}); const ch = []; rec.ondataavailable = e => ch.push(e.data); rec.start();
  for (let i = 0; i < 15; i++) { g.fillStyle = `hsl(${i * 20} 70% 50%)`; g.fillRect(0, 0, 360, 640); await new Promise(r => setTimeout(r, 60)); } rec.stop(); await new Promise(r => rec.onstop = r);
  const blob = new Blob(ch, {type: 'video/webm'}), c = S.chats.get(S.chatId); const sealed = await E2E.seal({t: '', mime: 'video/webm', dur: 1}, recipients(c), await blob.arrayBuffer()); const up = await upMedia(sealed.blob); const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env, kind: 'video'}); onMsg(r.msg); });
await a.waitForTimeout(500); await sendPhoto(a); await a.waitForTimeout(400);
for (let i = 0; i < 4; i++) await send(a, 'Après ' + i);
await p.evaluate(() => { S.msgs.clear(); E2E.vids.clear(); E2E.imgs.clear(); return loadChats().then(renderAll); }); await p.waitForTimeout(500);
// suivre les mouvements : position du dernier message à chaque image
await p.click('.chat-row'); 
const track = await p.evaluate(async () => { const pos = []; const t0 = performance.now(); while (performance.now() - t0 < 3000) { const last = [...document.querySelectorAll('#msgs .msg')].pop(), box = $('#msgs'); if (last) pos.push(Math.round(box.scrollHeight - box.scrollTop - box.clientHeight)); await new Promise(r => requestAnimationFrame(r)); } return [...new Set(pos)]; });
out('écarts vus pendant le chargement :', track);
out('taille vidéo (réservée) :', await p.evaluate(() => { const v = document.querySelector('video[data-vid]'); return [v.style.width, v.style.aspectRatio, Math.round(v.getBoundingClientRect().height)]; }));
// les noeuds sont-ils réutilisés après une re-création ?
const same = await p.evaluate(async () => { const v = document.querySelector('video[data-vid]'); renderMessages(true); await new Promise(r => setTimeout(r, 100)); return v === document.querySelector('video[data-vid]'); });
out('vidéo conservée après redessin :', same);
await a.evaluate(() => markRead()); await send(p, 'hey'); await p.waitForTimeout(1500);
out('après envoi, écart :', await p.evaluate(() => { const b = $('#msgs'); return Math.round(b.scrollHeight - b.scrollTop - b.clientHeight); }));
// clic à côté d'un message court
const row = await p.$$('#msgs .msg.in'); const rb = await row[row.length - 1].boundingBox(); await p.mouse.click(rb.x + rb.width - 40, rb.y + rb.height / 2); await p.waitForTimeout(400);
out('menu ouvert par la zone :', await p.evaluate(() => !!document.querySelector('.react-bar')));
await done();
