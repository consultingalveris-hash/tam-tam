// Inscription : pas de schéma imposé ; un message le propose ensuite dans la liste.
import { B, b, done, errs } from './lib.mjs';
const c = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2}); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(B); await p.waitForTimeout(500); await p.fill('#cMail', 'owner@exemple.org'); await p.click('button[type=submit]'); await p.waitForTimeout(700);
await p.fill('#cCode', await p.evaluate(() => A.demo)); await p.click('button[type=submit]'); await p.waitForTimeout(700);
await p.fill('#aHandle', 'emma'); await p.check('#aAge'); await p.check('#aCgu'); await p.click('button[type=submit]'); await p.waitForTimeout(4500);
console.log('écran schéma imposé :', await p.evaluate(() => !!document.getElementById('lockScreen')));
console.log('message proposé :', await p.evaluate(() => document.querySelector('.inst.bk b')?.textContent));
await p.screenshot({path: '/tmp/en/lk-banner.png'});
await p.click('.inst.bk [data-act="lockSetup"]'); await p.waitForTimeout(600);
console.log('feuille schéma ouverte :', await p.evaluate(() => !!document.getElementById('setPad')));
await p.click('.inst.bk [data-act="lkLater"]').catch(() => {}); 
await done();
