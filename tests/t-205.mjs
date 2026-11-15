// Connexion par code e-mail (nov. 2026) : inscription en 3 étapes, reconnexion par code, bandeau « Protégez vos messages ».
import { B, b, mk, reg, done, errs } from './lib.mjs';
const S = '/tmp/claude-0/-home-claude/2d8221e3-4f69-5cf7-8ee4-4297e639f621/scratchpad/';
const p = await mk('Porteur'); await p.goto(B); await p.waitForTimeout(600); await p.screenshot({path: S + 'auth-1.png'});
await p.fill('#cMail', 'owner@exemple.org'); await p.click('button[type=submit]'); await p.waitForTimeout(700); await p.screenshot({path: S + 'auth-2.png'});
await p.fill('#cCode', '000000'); await p.click('button[type=submit]'); await p.waitForTimeout(500);
console.log('mauvais code refusé :', await p.textContent('#aErr'));
await p.fill('#cCode', await p.evaluate(() => A.demo)); await p.click('button[type=submit]'); await p.waitForTimeout(700); await p.screenshot({path: S + 'auth-3.png'});
await p.fill('#aHandle', 'porteur'); await p.click('button[type=submit]'); await p.waitForTimeout(4500);
const st = await p.evaluate(() => ({ me: !!S.me && S.me.handle, key: E2E.ready(), backup: S.me.hasBackup, lock: !!document.getElementById('lockScreen') }));
console.log('compte créé :', st);
await p.evaluate(async () => { const salt = btoa('sel-de-test-1234'); S.lock = {type: 'pattern', delay: 86400, salt, hash: await Lock.hashPattern([0, 1, 2, 5], salt)}; await Lock.set(S.me.id, S.lock); document.getElementById('lockScreen')?.remove(); });
await p.waitForTimeout(500);
console.log('bandeau visible :', await p.isVisible('.inst.bk'));
await p.screenshot({path: S + 'auth-4.png'});
await p.click('.inst.bk [data-act=keyCode]'); await p.waitForTimeout(400); await p.fill('#rk1', 'Baobab-2026'); await p.fill('#rk2', 'Baobab-2026'); await p.click('form[data-form=rekey] button[type=submit]'); await p.waitForTimeout(1500);
console.log('code de secours enregistré :', await p.evaluate(() => S.me.hasBackup), '· bandeau caché :', !(await p.isVisible('.inst.bk')));
// nouvel appareil : reconnexion par code, puis récupération des messages avec le code de secours
const q = await mk('Nouveau téléphone'); await q.goto(B); await q.waitForTimeout(500);
await q.fill('#cMail', 'owner@exemple.org'); await q.click('button[type=submit]'); await q.waitForTimeout(700);
await q.fill('#cCode', await q.evaluate(() => A.demo)); await q.click('button[type=submit]'); await q.waitForTimeout(2500);
console.log('reconnexion : écran de récupération :', await q.evaluate(() => S.ks && S.ks.mode));
await q.fill('#kCode', 'Baobab-2026'); await q.click('button[type=submit]'); await q.waitForTimeout(2500);
console.log('messages récupérés, même clé :', await q.evaluate(() => E2E.ready() && E2E.pubJwk.x === S.me.pubkey.x));
await done();
