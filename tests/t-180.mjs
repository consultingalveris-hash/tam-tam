import { B, mk, reg, inv, done } from './lib.mjs';
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); await p.waitForTimeout(400); const aId = await a.evaluate(() => S.me.id);
const r = await p.evaluate(async aid => {
  const g = await api('/api/chats/group', {name: 'Famille', members: [aid]}); keepUsers(Object.values(g.chat.users)); S.chats.set(g.chat.id, g.chat); await openChat(g.chat.id);
  const cv = document.createElement('canvas'); cv.width = 800; cv.height = 500; const x = cv.getContext('2d'); x.fillStyle = '#e84'; x.fillRect(0, 0, 800, 500); x.fillStyle = '#148'; x.fillRect(300, 100, 200, 300);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .9)); const f = new File([blob], 'g.jpg', {type: 'image/jpeg'});
  cropPhoto(f, 'grp'); await new Promise(r => setTimeout(r, 600));
  const hint = document.querySelector('.crop-body .hint').textContent;
  document.querySelector('[data-act=cropOk]').click(); await new Promise(r => setTimeout(r, 2000));
  return {hint, photo: S.chats.get(g.chat.id).photo, sheet: !!document.querySelector('.grp-ph img')};
}, aId);
console.log(JSON.stringify(r)); await done();
