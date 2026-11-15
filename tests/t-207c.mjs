import { B, b, reg, inv, done, errs, skip } from './lib.mjs';
const mk = async (n, loc) => { const c = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, locale: loc, deviceScaleFactor: 2}); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); return p; };
const a = await mk('A', 'en-GB'); await reg(a, B, 'emma', 'Emma', 'owner@exemple.org');
const url = await inv(a); const c = await mk('C', 'fr-FR'); await reg(c, url, 'kofi', 'Kofi', 'kofi@exemple.org');
await a.reload(); await a.waitForTimeout(3000); await skip(a);
await a.evaluate(async () => { const u = (S.contacts.contacts || [])[0]; await ACT.write({id: u.id}); }); await a.waitForTimeout(1500);
for (const t of ['Annuler', 'Bonjour']) { await a.locator('textarea').first().fill(t); await a.click('button[type=submit], .send, [data-act="send"]').catch(e => console.log(e.message)); await a.waitForTimeout(1200); }
console.log('bubbles A:', await a.evaluate(() => [...document.querySelectorAll('.bubble .txt')].map(e => e.textContent)));
await a.screenshot({path: '/tmp/en/t-chat2.png'});
await c.reload(); await c.waitForTimeout(3000); await skip(c); await c.waitForTimeout(500);
console.log('C lang:', await c.evaluate(() => [I18N.lang, document.querySelector('.tabbar, nav')?.innerText.slice(0, 80)]));
await c.screenshot({path: '/tmp/en/t-fr.png'});
await done();
