// Messages sans internet (téléphones proches) : le pont Android est simulé (TamTamAndroid version 3),
// les « ondes » passent par Playwright. Désiré et Awa sont contacts ; Rémi (pas leur contact) sert de relais.
// 1) liaison directe Désiré ↔ Awa sans internet ; 2) de proche en proche Désiré ↔ Rémi ↔ Awa ; 3) retour d'internet : un seul exemplaire.
import { B, b, mk, reg, inv, done, errs } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const pages = {}, links = new Set(), started = {};
const mock = () => {
  window.__px = {started: false};
  window.TamTamAndroid = {
    version: () => 3, setSecure() {}, bioAvailable: () => false, bioAuth() {},
    pxPrepare() { window.__px.prepared = true; },
    pxStart() { window.__px.started = true; window.__pxUp(); setTimeout(() => window.dispatchEvent(new CustomEvent('tt-px', {detail: {k: 'up'}})), 10); },
    pxStop() { window.__px.started = false; },
    pxSend(ep, d) { window.__pxOut(ep, d); },
    pxPeers: () => '[]', pxRadios: () => '{"bt":true,"wifi":true,"on":true}', pxAskBt() { window.__px.askBt = true; },
  };
};
const edge = (x, y) => [x, y].sort().join('|');
const fire = (name, detail) => pages[name].evaluate(d => window.dispatchEvent(new CustomEvent('tt-px', {detail: d})), detail).catch(() => {});
async function wire(name, pg) {
  pages[name] = pg;
  await pg.exposeBinding('__pxUp', () => { started[name] = true; });
  await pg.exposeBinding('__pxOut', (_s, ep, d) => {
    for (const other of Object.keys(pages)) if (other !== name && links.has(edge(name, other)) && (!ep || ep === other)) fire(other, {k: 'data', ep: name, d});
  });
  await pg.addInitScript(mock);
}
async function link(x, y) { links.add(edge(x, y)); await fire(x, {k: 'peer', ep: y}); await fire(y, {k: 'peer', ep: x}); }
async function unlink(x, y) { links.delete(edge(x, y)); await fire(x, {k: 'gone', ep: y}); await fire(y, {k: 'gone', ep: x}); }

const d = await mk('D'); await wire('D', d); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A'); await wire('A', a); await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const r = await mk('R'); await wire('R', r); await reg(r, await inv(d), 'remi', 'Rémi', 'remi@exemple.org');
out('autorisation demandée une fois au lancement :', await d.evaluate(() => window.__px.prepared === true));
const aId = await a.evaluate(() => S.me.id);
const chatId = await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); await loadContacts(); return x.chat.id; }, aId);
for (const p of [a, r]) await p.evaluate(async () => { await loadChats(); await loadContacts(); renderAll(); });
await d.evaluate(cid => openChat(cid), chatId); await a.evaluate(cid => openChat(cid), chatId); await d.waitForTimeout(800);
// Rémi doit retirer son lien d'amitié avec Désiré et Awa ? Non : invité par Désiré, il est son contact, pas celui d'Awa.
out('Rémi contact d’Awa :', await a.evaluate(rid => S.contacts.contacts.some(u => u.id === rid), await r.evaluate(() => S.me.id)));
out('avec internet, rien ne démarre :', await d.evaluate(() => Px.on));

// --- 1) coupure d'internet, Désiré et Awa côte à côte ---
for (const p of [d, a, r]) await p.context().setOffline(true);
await d.waitForTimeout(6500);
out('sans internet, recherche lancée :', [await d.evaluate(() => Px.on), await a.evaluate(() => Px.on), await r.evaluate(() => Px.on)]);
await link('D', 'A'); await d.waitForTimeout(400);
out('en-tête chez Désiré :', await d.evaluate(() => document.querySelector('#chatHead small').textContent));
await d.evaluate(() => { $('#msgIn').value = 'Coupure générale, tu me reçois ?'; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); });
await d.waitForTimeout(1500);
out('reçu chez Awa sans internet :', await a.evaluate(() => [...document.querySelectorAll('#msgs .msg.in')].map(x => x.querySelector('.txt')?.textContent + (x.querySelector('.px-m') ? ' [px]' : ''))));
out('chez Désiré, remis sans internet :', await d.evaluate(() => { const el = [...document.querySelectorAll('#msgs .msg.out')].pop(); return !!el.querySelector('.px-m') && !el.textContent.includes('🕓'); }));
await a.evaluate(() => { $('#msgIn').value = 'Oui, je te reçois par Bluetooth'; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); });
await a.waitForTimeout(1500);
out('réponse chez Désiré :', await d.evaluate(() => [...document.querySelectorAll('#msgs .msg.in .txt')].map(x => x.textContent)));
await d.screenshot({path: 'shots/px-d.png'}); await a.screenshot({path: 'shots/px-a.png'});

// --- 2) Désiré et Awa éloignés, Rémi entre les deux ---
await unlink('D', 'A'); await link('D', 'R'); await d.waitForTimeout(300);
await d.evaluate(() => { $('#msgIn').value = 'Message porté par Rémi'; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); });
await d.waitForTimeout(1200);
out('Rémi transporte sans pouvoir lire :', await r.evaluate(() => ({n: Px.box.filter(p => p.k === 'm').length, lisible: JSON.stringify(Px.box).includes('Rémi')})));
await unlink('D', 'R'); await link('R', 'A'); await a.waitForTimeout(1500);
out('arrivé chez Awa par Rémi :', await a.evaluate(() => [...document.querySelectorAll('#msgs .msg.in .txt')].map(x => x.textContent).includes('Message porté par Rémi')));
await unlink('R', 'A'); await link('D', 'R'); await d.waitForTimeout(1500);
out('accusé revenu chez Désiré par Rémi :', await d.evaluate(() => { const el = [...document.querySelectorAll('#msgs .msg.out')].pop(); return el.textContent.includes('Message porté par Rémi') && !!el.querySelector('.px-m'); }));
out('faux expéditeur ignoré :', await a.evaluate(async rid => { const before = Px.mine().length; await Px.got({k: 'm', id: Px.hex(16), c: S.chatId, f: rid, to: [S.me.id], at: Date.now(), h: 0, env: {v: 2, from: {x: 'x', y: 'y'}, keys: {}}}, 'X'); return Px.mine().length === before; }, await r.evaluate(() => S.me.id)));

// --- 3) internet revient ---
for (const p of [d, a, r]) await p.context().setOffline(false);
await d.waitForTimeout(12000);
await a.evaluate(cid => loadMessages(cid, true), chatId).catch(() => {}); await a.waitForTimeout(2500);
const texts = await a.evaluate(() => [...document.querySelectorAll('#msgs .msg .txt')].map(x => x.textContent));
out('chez Awa après retour d’internet (un seul exemplaire chacun) :', ['Coupure générale, tu me reçois ?', 'Message porté par Rémi'].map(t => texts.filter(x => x === t).length));
out('copies locales effacées :', await a.evaluate(() => Px.mine().length));
out('recherche arrêtée :', await d.evaluate(() => Px.on));
out('file d’envoi vide :', await d.evaluate(() => Outbox.list().length));
await done();
