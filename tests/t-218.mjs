// Conditions 1.3 : bandeau d'information pour les anciens membres, paragraphe « Vos contributions aux langues ».
import { B, mk, reg, done } from './lib.mjs';
const p = await mk('Tel'); await reg(p, B, 'teluser', 'Tel', 'owner@exemple.org', 'Kc-123456');
const has = () => p.evaluate(() => [...document.querySelectorAll('.inst b')].some(b => b.textContent.includes('6 décembre')));
console.log('nouveau membre, pas de bandeau :', !(await has()));
console.log('ancien membre, bandeau :', await p.evaluate(() => { S.me.cguAt = Date.UTC(2026, 10, 1); S.tab = 'chats'; renderBody(); return [...document.querySelectorAll('.inst b')].some(b => b.textContent.includes('6 décembre')); }));
await p.click('[data-act="cguOk"]'); await p.waitForTimeout(300);
console.log('fermé :', !(await has()));
await p.evaluate(() => { renderBody(); }); await p.waitForTimeout(200);
console.log('reste fermé :', !(await has()));
await p.goto(B + '/conditions#contributions'); 
console.log('paragraphe :', await p.evaluate(() => { const e = document.getElementById('contributions'); return !!e && e.textContent.includes('fins commerciales'); }));
await done();
