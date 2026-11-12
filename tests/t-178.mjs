import { B, mk, reg, inv, done } from './lib.mjs';
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts().then(loadChats).then(renderAll)); await p.waitForTimeout(500);
console.log('avatars :', await p.evaluate(() => [JSON.stringify(S.me.avatar), JSON.stringify(S.contacts.contacts[0].avatar), document.querySelectorAll('.av svg').length, document.querySelectorAll('.av img').length]));
console.log('ancien refusé :', await p.evaluate(async () => { try { await api('/api/me', {avatar: {v: 2, st: 'court', sk: 'c', sh: '#14b8c9'}}); return 'accepté'; } catch (e) { return e.message; } }));
await p.screenshot({path: 'shots/av178.png'}); await done();
