import { B, mk, reg, done } from './lib.mjs';
const p = await mk('D', true); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
console.log(await p.evaluate(() => { S.me.trConsent = true; const m = {id: 99, chatId: 1, from: 12345, text: 'Hello', orig: 'Bonjour', olang: 'fr', tlang: 'en'};
  const off = Tr.txt(m).replace(/<[^>]+>/g, '|'); Tr.ls('tt-trcontrib', '1'); const on = Tr.txt(m).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|'); return {off, on}; }));
await done();
