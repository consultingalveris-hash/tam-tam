import { B, mk, reg, inv, sendPhoto, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A', true); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id);
const chatId = await p.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadChats(); return r.chat.id; }, aId);
await p.evaluate(cid => openChat(cid), chatId); await p.waitForTimeout(800);
await a.evaluate(async cid => { await loadChats(); renderAll(); openChat(cid); }, chatId); await a.waitForTimeout(800);
const say = (pg, t) => pg.evaluate(t => { $('#msgIn').value = t; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); }, t);
// 1. envoi normal
await say(p, 'Bonjour'); await p.waitForTimeout(1200);
out('envoi normal :', await p.evaluate(() => (S.msgs.get(S.chatId) || []).map(m => [m.text, !!m.pending])));
// 2. sans réseau
await p.context().setOffline(true);
await say(p, 'Message hors ligne'); await p.waitForTimeout(800);
out('hors ligne (horloge) :', await p.evaluate(() => [document.querySelectorAll('#msgs .bubble.pending').length, Outbox.list().length]));
await p.screenshot({path: 'shots/outbox191.png'});
await p.context().setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(2500);
out('réseau revenu :', await p.evaluate(() => [document.querySelectorAll('#msgs .bubble.pending').length, Outbox.list().length, (S.msgs.get(S.chatId) || []).filter(m => m.text === 'Message hors ligne').length]));
out('reçu une seule fois chez Awa :', await a.evaluate(() => (S.msgs.get(S.chatId) || []).filter(m => m.text === 'Message hors ligne').length));
// 3. pas de doublon si la réponse s'était perdue
out('doublon évité :', await p.evaluate(async () => { const c = S.chats.get(S.chatId); const m1 = await sendCore(c, 'Une fois', null, false, -42), m2 = await sendCore(c, 'Une fois', null, false, -42); return m1.id === m2.id; }));
// 4. photo : WebP + aperçu flou
out('WebP :', await p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; cv.getContext('2d').fillRect(0, 0, 50, 50); return (await encImg(cv, .82)).type; }));
await sendPhoto(p); await p.waitForTimeout(1500);
out('aperçu flou chez Awa :', await a.evaluate(() => { const m = (S.msgs.get(S.chatId) || []).find(x => x.media); const el = document.querySelector(`#msgs img[data-enc="${m && m.id}"]`); return [!!(m && m.th), m && m.th ? m.th.length : 0, !!el && /data:image/.test(el.getAttribute('style') || '')]; }));
// 5. vidéo : allégement
out('vidéo allégée :', await p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d'); const st = cv.captureStream(30); const rec = new MediaRecorder(st, {mimeType: MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ? 'video/mp4;codecs=avc1' : 'video/webm;codecs=vp9', videoBitsPerSecond: 9_000_000}); const ch = []; rec.ondataavailable = e => ch.push(e.data); rec.start(); const t0 = performance.now(); await new Promise(r => { const f = () => { const t = performance.now() - t0; for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${Math.random() * 360} 80% 50%)`; g.fillRect(Math.random() * 1280, Math.random() * 720, 80, 80); } if (t < 4000) requestAnimationFrame(f); else r(); }; f(); }); rec.stop(); await new Promise(r => rec.onstop = r); const f = new File(ch, 'v.mp4', {type: rec.mimeType.split(';')[0]});
  try { const parts = await VFast.cut(f, () => {}, {stop: false}); return {avant: Math.round(f.size / 1e3) + ' Ko', après: Math.round(parts[0].blob.size / 1e3) + ' Ko'}; } catch (e) { return 'erreur ' + e.message + ' (' + Math.round(f.size / 1e3) + ' Ko)'; } }));
// 6. mesures
await p.evaluate(() => Perf.flush()); await a.evaluate(() => Perf.flush()); await p.waitForTimeout(800);
out('mesures :', await p.evaluate(async () => (await api('/api/admin/perf')).metrics.filter(x => x.n).map(x => `${x.k}:${x.n}×${x.med}ms`)));
await p.evaluate(() => { S.tab = 'settings'; renderAll(); }); await p.waitForTimeout(400); await p.evaluate(() => ACT.perfLoad()); await p.waitForTimeout(600);
out('tableau propriétaire :', await p.evaluate(() => document.querySelectorAll('#perfBox tbody tr').length));
await p.evaluate(() => document.getElementById('perfBox').scrollIntoView()); await p.screenshot({path: 'shots/perf191.png'});
out('réglage HD :', await p.evaluate(() => { ACT.hdSet({v: '1'}); const a = hdOn(); ACT.hdSet({v: ''}); return [a, hdOn()]; }));
await done();
