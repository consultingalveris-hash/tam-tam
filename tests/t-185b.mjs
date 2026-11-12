import { B, mk, reg, done } from './lib.mjs';
const p = await mk('D', true); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
const r = await p.evaluate(() => { S.me.trConsent = true; Tr.st = {on: true, langs: ['fr', 'en']}; S.chatId = 1;
  const m = {id: 99, chatId: 1, from: 12345, text: "I'm doing very well, thanks", orig: 'Ça va très bien merci', olang: 'fr', tlang: 'en', kind: 'text'};
  const strip = h => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
  const a = strip(Tr.txt(m)); const menu = strip(trMenu(m, 99)); Tr.once.add(99); const b = strip(Tr.txt(m)); Tr.once.clear(); Tr.setOrigAll(1, true); const c = strip(Tr.txt(m));
  const mine = {id: 100, chatId: 1, from: S.me.id, text: 'Je vais bien', orig: "I'm fine", olang: 'en', tlang: 'fr'}; const d = strip(Tr.txt(mine)), dm = strip(trMenu(mine, 100));
  return {a, menu, b, c, d, dm}; });
console.log(JSON.stringify(r, null, 1)); await done();
