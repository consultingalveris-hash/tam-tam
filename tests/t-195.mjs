import { B, mk, reg, done } from './lib.mjs';
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
await p.evaluate(() => ACT.tab({t: 'souvenirs'})); await p.waitForTimeout(800);
const r = await p.evaluate(() => { const ch = [...document.querySelectorAll('.mem-filts .chip')]; ch[2].insertAdjacentHTML('beforeend', actDot('act-mem', 'test')); return ch.map(c => Math.round(c.getBoundingClientRect().top)); });
console.log('hauteur des filtres (même ligne si identiques) :', r);
await p.screenshot({path: 'shots/memfilt195.png', clip: {x: 0, y: 0, width: 390, height: 140}}); await done();
