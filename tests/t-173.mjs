import { B, mk, reg, inv, sendPhoto, done, b as browser } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
// 1. page de connexion
const z = await mk('Z'); await z.goto(B); await z.waitForTimeout(600);
const p = await mk('D', true); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
await z.goto(B); await z.waitForTimeout(600);
out('login liens :', await z.evaluate(() => [...document.querySelectorAll('.linkb')].map(b => b.textContent)));
await z.screenshot({path: 'shots/login.png'});
await z.click('text=Créer un compte'); await z.waitForTimeout(300);
out('page création :', await z.evaluate(() => document.querySelector('.auth-card h2').textContent + ' | ' + document.querySelector('.auth-card .hint').textContent.slice(0, 80)));
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400);
const aId = await a.evaluate(() => S.me.id), pId = await p.evaluate(() => S.me.id);
// 2. réglages
await p.evaluate(() => { S.showAv = true; pmOpen('settings'); }); await p.waitForTimeout(500);
out('réglages :', await p.evaluate(() => { const h = document.querySelector('#pmodal .pm-head'), x = h.querySelector('[data-act=pmClose]').getBoundingClientRect(), hr = h.getBoundingClientRect(); return {xRightGap: Math.round(hr.right - x.right), maquette: !!document.querySelector('a[href="/demo/"]'), portraits: document.querySelectorAll('.avb-pt').length, ancienCompo: document.querySelectorAll('.avb-st,.skin').length, danger: !!document.querySelector('.danger-zone [data-act=delSheet]'), version: document.body.textContent.includes('version 1.80')}; }));
await p.screenshot({path: 'shots/settings-top.png'});
await p.evaluate(() => { const b = document.getElementById('pmBody'); b.scrollTop = b.scrollHeight; }); await p.waitForTimeout(300);
await p.screenshot({path: 'shots/settings-bottom.png'});
await p.evaluate(() => { S.modal = null; renderModal(); });
// 3. transfert : points
await p.evaluate(id => ACT.write({id}), aId); await p.waitForTimeout(800);
const mid = await sendPhoto(p); await p.waitForTimeout(500);
await p.evaluate(id => fwdSheet(id), mid); await p.waitForTimeout(300);
await p.click('.fwd-row input'); await p.waitForTimeout(250);
await p.screenshot({path: 'shots/fwd.png'});
await p.evaluate(() => closeLayer());
// 4. souvenir reçu : point jaune
await p.evaluate(async aid => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300; const g = cv.getContext('2d'); g.fillStyle = '#3a6'; g.fillRect(0, 0, 300, 300); const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .9)); await Mem.saveOne({kind: 'photo', blob, mime: 'image/jpeg'}, {aud: 'friends', to: [aid], lock: false, once: false}, '', dayISO(new Date())); }, aId);
await a.waitForTimeout(1500);
out('Awa onglets :', await a.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.dataset.t + ':' + (t.querySelector('.act-dot')?.className || '-'))));
await a.evaluate(() => { ACT.tab({t: 'souvenirs'}); }); await a.waitForTimeout(400); await a.evaluate(() => ACT.memFilt({f: 'friends'})); await a.waitForTimeout(800);
out('Awa tuile :', await a.evaluate(() => document.querySelector('.mem-tile .mem-more')?.className + ' | chip:' + (document.querySelector('.mem-filts .act-dot')?.className || '-')));
await a.screenshot({path: 'shots/mem-new.png'});
await a.evaluate(() => { const t = document.querySelector('.mem-tile'); ACT.memView({id: t.dataset.id}); }); await a.waitForTimeout(1200); await a.evaluate(() => closeLayer()); await a.waitForTimeout(300);
out('Awa après vue :', await a.evaluate(() => document.querySelector('.mem-tile .mem-more')?.className + ' | onglet:' + (document.querySelector('#tabs [data-t=souvenirs] .act-dot') ? 'point' : 'aucun')));
await a.evaluate(() => Mem.loadRecv(true)); await a.waitForTimeout(500);
out('Awa après rechargement :', await a.evaluate(() => Mem.unseen));
// 5. discussions / groupes / non lues / +
await p.evaluate(() => ACT.back && ACT.back()); 
await a.evaluate(() => { ACT.tab({t: 'chats'}); }); await a.waitForTimeout(400);
out('Awa chips :', await a.evaluate(() => [...document.querySelectorAll('#filts .chip')].map(c => c.textContent.trim() + (c.querySelector('.act-dot') ? '•' : ''))));
// 6. profil : vidéo publique + flamme
const vid = await p.evaluate(async () => {
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120; const g = cv.getContext('2d'); const st = cv.captureStream(15); const rec = new MediaRecorder(st, {mimeType: 'video/webm'}); const ch = []; rec.ondataavailable = e => ch.push(e.data); rec.start();
  for (let i = 0; i < 20; i++) { g.fillStyle = `hsl(${i * 18} 70% 50%)`; g.fillRect(0, 0, 160, 120); await new Promise(r => setTimeout(r, 60)); }
  rec.stop(); await new Promise(r => rec.onstop = r); const blob = new Blob(ch, {type: 'video/webm'});
  const e = await PP.encVid(await blob.arrayBuffer(), 'video/webm'); const r = await api('/api/me/pics', {set: 'pub', slot: 3, media: e.id, k: e.k, iv: e.iv, t: e.t});
  const cv2 = document.createElement('canvas'); cv2.width = 400; cv2.height = 500; cv2.getContext('2d').fillStyle = '#e84'; cv2.getContext('2d').fillRect(0, 0, 400, 500); const pb = await new Promise(r => cv2.toBlob(r, 'image/jpeg', .9)); const up = await upload(pb); const r2 = await api('/api/me/pics', {set: 'pub', slot: 0, media: up.id});
  // vidéo privée
  await PP.setVid(0, await blob.arrayBuffer(), 'video/webm');
  return {vids: r.me.vids.filter(Boolean).length, pics: r2.me.pics.filter(Boolean).length, privVids: (S.me.privVids || []).filter(Boolean).length};
});
out('vidéos :', vid);
await a.evaluate(() => loadContacts()); await a.waitForTimeout(300);
await a.evaluate(id => profSheet(id), pId); await a.waitForTimeout(2500);
out('profil vu par Awa :', await a.evaluate(() => ({flames: document.querySelectorAll('.pf-btn').length, videos: document.querySelectorAll('video[data-pvid]').length, srcOk: [...document.querySelectorAll('video[data-pvid]')].map(v => !!v.src && v.src.startsWith('blob:'))})));
await a.screenshot({path: 'shots/prof-awa.png', fullPage: true});
await a.click('.pf-btn'); await a.waitForTimeout(800);
out('après flamme :', await a.evaluate(() => document.querySelector('.pf-btn').getAttribute('aria-pressed') + ' ' + document.querySelector('.pf-btn').textContent));
await p.waitForTimeout(800);
out('Désiré act :', await p.evaluate(() => S.act));
out('chip Mon profil :', await p.evaluate(() => { S.filt = 'all'; renderHead(); return !!document.querySelector('#filts [data-f=me] .act-dot'); }));
await p.evaluate(() => ACT.goProfile()); await p.waitForTimeout(1500);
out('Mon profil propriétaire :', await p.evaluate(() => ({act: S.act, bars: [...document.querySelectorAll('.pf-bar')].map(b => b.textContent.trim())})));
await p.screenshot({path: 'shots/prof-me.png'});
await p.evaluate(() => { const b = document.querySelector('.pf-who'); b && b.click(); }); await p.waitForTimeout(400);
out('qui a aimé :', await p.evaluate(() => [...document.querySelectorAll('.sheet .row-name')].map(r => r.textContent)));
await p.screenshot({path: 'shots/who.png'});
// 7. appel manqué
await p.evaluate(() => closeLayer());
const cid = await a.evaluate(id => [...S.chats.values()].find(c => c.peer === id).id, pId);
await a.evaluate(async cid => { const callId = 'test' + Date.now(); const to = [...S.chats.get(cid).members].find(m => m.id !== S.me.id).id; await api('/api/call/signal', {chatId: cid, to, type: 'ring', callId, video: false}); await api('/api/call/signal', {chatId: cid, to, type: 'end', callId}); }, cid).catch(e => out('appel err', e.message));
await p.waitForTimeout(1200);
out('Désiré appels :', await p.evaluate(() => [S.act, !!document.querySelector('#tabs [data-t=calls] .act-dot')]));
await p.evaluate(() => ACT.tab({t: 'calls'})); await p.waitForTimeout(800);
out('après visite appels :', await p.evaluate(() => [S.act, !!document.querySelector('#tabs [data-t=calls] .act-dot')]));
await done();
