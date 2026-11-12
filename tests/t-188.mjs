import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A', true); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id);
out('portraits :', await p.evaluate(async () => { S.tab = 'settings'; S.showAv = true; renderAll(); await new Promise(r => setTimeout(r, 300)); const n = document.querySelectorAll('.avb-pt').length; const r = await api('/api/me', {avatar: {v: 3, p: 'p20'}}); return [n, r.me.avatar.p]; }));
// appels
await p.evaluate(() => ACT.tab({t: 'calls'})); await p.waitForTimeout(800);
out('appels fermé :', await p.evaluate(() => [!!document.querySelector('.dial-fab'), document.querySelector('.dial').hidden]));
await p.screenshot({path: 'shots/calls-closed.png'});
await p.click('.dial-fab'); await p.waitForTimeout(400);
out('ouvert :', await p.evaluate(() => [!!document.querySelector('.dial.open'), !document.querySelector('.dial-fab')]));
await p.click('.dk[data-k="7"]'); await p.waitForTimeout(150);
out('touche :', await p.evaluate(() => Calls.num));
const box = await (await p.$('.dial.open')).boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + 30); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + 200, {steps: 8}); await p.mouse.up(); await p.waitForTimeout(500);
out('après glissement vers le bas :', await p.evaluate(() => [!!document.querySelector('.dial-fab'), !document.querySelector('.dial.open')]));
// appui long sur un message (téléphone) : barre d'émojis
await p.evaluate(id => ACT.write({id}), aId); await p.waitForTimeout(800);
await p.evaluate(() => { $('#msgIn').value = 'Bonjour'; document.querySelector('form[data-form=send]').requestSubmit(); }); await p.waitForTimeout(1000);
const row = await p.$('#msgs .msg[data-mid]'); const rb = await row.boundingBox();
await p.touchscreen.tap(rb.x + 20, rb.y + rb.height / 2); 
await p.evaluate(() => { const r = document.querySelector('#msgs .msg[data-mid]'); mselToggle(+r.dataset.mid); }); await p.waitForTimeout(300);
out('barre émojis :', await p.evaluate(() => document.querySelectorAll('#rrail button').length));
await p.screenshot({path: 'shots/rail.png'});
await p.click('#rrail button'); await p.waitForTimeout(800);
out('réaction posée :', await p.evaluate(() => [!document.getElementById('rrail'), !!document.querySelector('.reacts')]));
// ordinateur : bande turquoise
await a.evaluate(() => loadChats().then(renderAll)); await a.waitForTimeout(500); await a.click('.chat-row'); await a.waitForTimeout(1200);
const r2 = await a.$('#msgs .msg[data-mid]'); const b2 = await r2.boundingBox(); await a.mouse.click(b2.x + b2.width - 30, b2.y + b2.height / 2); await a.waitForTimeout(300);
out('surligné :', await a.evaluate(() => !!document.querySelector('#msgs .msg.menu-on')));
await a.screenshot({path: 'shots/menu-on.png'});
await a.evaluate(() => closeLayer()); out('retiré :', await a.evaluate(() => !document.querySelector('#msgs .msg.menu-on')));
await done();
