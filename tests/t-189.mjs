import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A', true); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id);
// 1. clavier : flèche et case centrée
await p.evaluate(() => ACT.tab({t: 'calls'})); await p.waitForTimeout(600); await p.click('.dial-fab'); await p.waitForTimeout(400);
out('clavier centré (écart px) :', await p.evaluate(() => { const i = $('#dialIn').getBoundingClientRect(), k = document.querySelector('.dk[data-k="2"]').getBoundingClientRect(), g = document.querySelector('.dial-grab').getBoundingClientRect(); return [Math.round(i.left + i.width / 2 - (k.left + k.width / 2)), Math.round(g.left + g.width / 2 - (k.left + k.width / 2))]; }));
await p.screenshot({path: 'shots/dial189.png'});
await p.click('.dial-grab'); await p.waitForTimeout(500);
out('flèche range le clavier :', await p.evaluate(() => [!!document.querySelector('.dial-fab'), !document.querySelector('.dial.open')]));
// 2. fiche depuis l'historique
const chatId = await p.evaluate(async id => (await api('/api/chats/direct', {userId: id})).chat.id, aId);
await p.evaluate(([cid, id]) => { loadChats().then(() => { Calls.log = [{chatId: cid, peer: id, kind: 'direct', dir: 'out', status: 'done', at: Date.now(), dur: 65, video: false}]; renderBody(); }); }, [chatId, aId]); await p.waitForTimeout(700);
await p.click('.cl-who'); await p.waitForTimeout(400);
out('fiche :', await p.evaluate(() => [...document.querySelectorAll('.cl-acts button span')].map(x => x.textContent)));
await p.screenshot({path: 'shots/card189.png'});
await p.click('.cl-acts button[data-act="clGo"]'); await p.waitForTimeout(800);
out('discussion ouverte :', await p.evaluate(() => S.chatId > 0 && !document.querySelector('.cl-acts')));
// 3. Souvenirs : point turquoise
await p.evaluate(() => { ACT.back && ACT.back(); ACT.tab({t: 'souvenirs'}); }); await p.waitForTimeout(800);
await p.click('.mem-topdot'); await p.waitForTimeout(300);
out('menu souvenirs :', await p.evaluate(() => [...document.querySelectorAll('#pop .menu button, .sheet .menu button')].map(b => b.textContent.trim())));
await p.screenshot({path: 'shots/memtop189.png'});
await p.evaluate(() => { ACT.memFilt({f: 'friends'}); }); await p.waitForTimeout(300);
out('plus de bouton en bas :', await p.evaluate(() => !/Envoyer un souvenir/.test(document.querySelector('.mem').textContent)));
// 4. taille d'un souvenir ouvert (image très haute) — sur ordinateur
const tall = await a.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 600; cv.height = 2400; const g = cv.getContext('2d'); g.fillStyle = '#3a7'; g.fillRect(0, 0, 600, 2400); g.fillStyle = '#c22'; g.fillRect(0, 2300, 600, 100); const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
  Mem.items = Mem.items || []; await Mem.saveOne({kind: 'photo', blob}, {aud: 'public', to: []}, '', dayISO(new Date())); const it = Mem.items[Mem.items.length - 1]; S.tab = 'souvenirs'; renderAll(); await Mem.view(it.id); await new Promise(r => setTimeout(r, 900));
  const st = document.querySelector('.mv-stage').getBoundingClientRect(), im = document.querySelector('.mv-stage img'), ir = im.getBoundingClientRect(); const h = Math.min(ir.height, ir.width * im.naturalHeight / im.naturalWidth); return {stage: Math.round(st.height), imgVisible: Math.round(h), entier: h <= st.height + 1}; });
out('souvenir entier :', tall); await a.screenshot({path: 'shots/memview189.png'}); await a.evaluate(() => closeLayer());
// 5. traduction : activer, Awa reçoit en anglais
out('clé :', await p.evaluate(async () => { await api('/api/admin/translate', {key: 'AIzaTESTTESTTESTTESTTESTTESTTESTTEST', provider: 'google'}); await saveNow({trConsent: true}); return 'ok'; }));
await a.evaluate(async () => { await saveNow({trConsent: true}); await Tr.loadSt(); await loadChats(); renderAll(); }); await a.waitForTimeout(400);
await a.evaluate(cid => openChat(cid), chatId); await a.waitForTimeout(600);
await a.evaluate(cid => { Tr.setIn(cid, 'en'); }, chatId); await a.waitForTimeout(600);
// l'expéditeur envoie 6 messages coup sur coup, sans traduction de son côté (ancienne version)
await p.evaluate(async cid => { const c = S.chats.get(cid); for (const t of ['Bonjour Awa', 'Comment vas-tu ?', 'ECHEC une fois', 'On se voit demain', 'À quelle heure ?', 'Merci beaucoup']) { const s = await E2E.seal({t}, recipients(c)); await api(`/api/chats/${cid}/messages`, {enc: s.env}); } }, chatId);
await a.waitForTimeout(3500);
const tr = () => a.evaluate(() => [...document.querySelectorAll('#msgs .msg.in .txt')].map(x => x.textContent));
out('traduits tout de suite :', await tr());
await a.waitForTimeout(21000);
out('après nouvelle tentative :', await tr());
// statut de traduction arrivé APRÈS l'ouverture de la discussion
await a.evaluate(async () => { Tr.st = null; Tr.shown.clear(); Object.keys(localStorage).filter(k => k.startsWith('tt-tr:')).forEach(k => localStorage.removeItem(k)); S.chatId = 0; }); await a.evaluate(cid => openChat(cid), chatId); await a.waitForTimeout(3000);
out('statut tardif, toujours traduits :', await tr());
// groupe : la langue choisie est gardée sur le compte
const gid = await p.evaluate(async id => (await api('/api/chats/group', {name: 'Essai', members: [id]})).chat.id, aId).catch(e => 'ERR ' + e.message);
out('groupe :', await a.evaluate(async g => { await loadChats(); Tr.setIn(g, 'en'); await new Promise(r => setTimeout(r, 600)); const r = await api('/api/chats'); const c = r.chats.find(x => x.id === g); return c ? c.members.find(m => m.id === S.me.id).trIn : 'introuvable'; }, gid));
// 6. ordinateur : menu en haut à droite, petit
await a.evaluate(cid => openChat(cid), chatId); await a.waitForTimeout(800);
const r2 = await a.$('#msgs .msg.in[data-mid]'); const b2 = await r2.boundingBox(); await a.mouse.click(b2.x + 600, b2.y + b2.height / 2); await a.waitForTimeout(300);
out('menu ordi :', await a.evaluate(() => { const p = document.querySelector('#pop .pop'); if (!p) return 'pas de petite fenêtre'; const r = p.getBoundingClientRect(); return {droite: Math.round(innerWidth - r.right), haut: Math.round(r.top), largeur: Math.round(r.width), bande: !!document.querySelector('#msgs .msg.menu-on')}; }));
await a.screenshot({path: 'shots/deskmenu189.png'}); await a.evaluate(() => closeLayer());
// 7. téléphone : barre d'émojis cachée quand le menu du point est ouvert
await p.evaluate(() => closeLayer()); await p.evaluate(cid => openChat(cid), chatId); await p.waitForTimeout(800);
await p.evaluate(() => { const r = document.querySelector('#msgs .msg[data-mid]'); mselToggle(+r.dataset.mid); }); await p.waitForTimeout(300);
await p.click('#chatHead .dotb'); await p.waitForTimeout(300);
out('barre cachée sous le menu :', await p.evaluate(() => { const r = document.getElementById('rrail'); return [!!document.getElementById('pop'), r ? getComputedStyle(r).display : 'absente']; }));
await p.screenshot({path: 'shots/rail189.png'});
await p.evaluate(() => popClose()); await p.waitForTimeout(200);
out('barre revenue :', await p.evaluate(() => { const r = document.getElementById('rrail'); return r ? getComputedStyle(r).display : 'absente'; }));
await done();
