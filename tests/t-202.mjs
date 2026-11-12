import { B, mk, reg, inv, sendPhoto, done } from './lib.mjs';
import { execFileSync } from 'node:child_process'; import fs from 'node:fs';
const S = '/tmp/claude-0/-home-claude/2d8221e3-4f69-5cf7-8ee4-4297e639f621/scratchpad';
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const a = await mk('A'); await reg(a, await inv(p), 'awa', 'Awa', 'awa@exemple.org', 'Kc-222222');
await p.evaluate(() => loadContacts()); const aId = await a.evaluate(() => S.me.id);
const chatId = await p.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadChats(); return r.chat.id; }, aId);
await p.evaluate(cid => openChat(cid), chatId); await p.waitForTimeout(500);
for (let i = 0; i < 3; i++) { await sendPhoto(p); await p.waitForTimeout(1500); }
let since = '0', n = 0, packs = 0;
for (let i = 0; i < 10; i++) {
  const r = await fetch(B + '/api/backup/media?since=' + since); const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${S}/m${i}.ttbk`, buf); packs++;
  n += +r.headers.get('x-tt-count'); since = r.headers.get('x-tt-next'); if (r.headers.get('x-tt-more') !== '1') break;
}
console.log('paquets', packs, 'fichiers', n);
fs.rmSync(`${S}/mout`, {recursive: true, force: true});
console.log(execFileSync('node', ['/home/claude/tam-tam/outils/ouvrir-sauvegarde.mjs', `${S}/m0.ttbk`, `${S}/tk/p.pem`, `${S}/mout`]).toString().trim());
const files = fs.readdirSync(`${S}/mout`), srv = fs.readdirSync('/home/claude/tam-tam/app/var/media').filter(f => !f.endsWith('.part'));
console.log('identiques au serveur', files.length === srv.length && files.every(f => Buffer.compare(fs.readFileSync(`${S}/mout/${f}`), fs.readFileSync('/home/claude/tam-tam/app/var/media/' + f)) === 0));
const r2 = await fetch(B + '/api/backup/media?since=' + since); console.log('rien de neuf ensuite', r2.headers.get('x-tt-count'), r2.headers.get('x-tt-more'));
await done();
