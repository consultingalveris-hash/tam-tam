import { chromium } from 'playwright';
const b = await chromium.launch(); const errs = [];
const mk = async () => { const c = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); }); return p; };
const skip = pg => pg.evaluate(async () => { const salt = btoa('sel-de-test-1234'); S.lock = {type: 'pattern', delay: 86400, salt, hash: await Lock.hashPattern([0, 1, 2, 5], salt)}; await Lock.set(S.me.id, S.lock); document.getElementById('lockScreen')?.remove(); });
const out = (k, v) => console.log(k, JSON.stringify(v));
const P = 'http://localhost:3601', A = 'http://localhost:3602';
const p = await mk(); await p.goto(P); await p.waitForTimeout(500);
await p.fill('#aHandle', 'desire'); await p.fill('#aName', 'Désiré'); await p.fill('#aMail', 'owner@exemple.org'); await p.fill('#aPass', 'Baobab#mdp1'); await p.check('#aAge'); await p.check('#aCgu'); await p.click('button[type=submit]'); await p.waitForTimeout(800);
await p.fill('#kCode', 'Kc-123456'); await p.fill('#kCode2', 'Kc-123456'); await p.click('button[type=submit]'); await p.waitForTimeout(4500); await skip(p);
// un message dans une discussion avec soi-même n'existe pas : on vérifie juste que les adresses sont connues
await p.waitForTimeout(1500);
out('liste gardée', await p.evaluate(() => Secours.list()));
// réglages : bloc visible
await p.evaluate(() => { S.tab = 'settings'; S.fold.add('sec'); renderAll(); }); await p.waitForTimeout(400);
out('réglages', await p.evaluate(() => { const el = document.getElementById('secSet'); return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 160) : null; }));
await p.fill('#relaisIn', 'https://relais.exemple.org/abc'); await p.click('form[data-form=relais] button[type=submit]'); await p.waitForTimeout(400);
out('relais ajouté', await p.evaluate(() => Secours.mine()));
// panne de l'adresse principale
process.kill(+process.env.P1, 'SIGTERM'); await p.waitForTimeout(500);
for (let i = 0; i < 4; i++) { await p.evaluate(() => api('/api/chats').catch(() => {})); await p.waitForTimeout(300); }
await p.waitForSelector('.secours', {timeout: 20000}).catch(() => {});
out('bandeau', await p.evaluate(() => { const el = document.querySelector('.secours'); return el ? {texte: el.innerText.slice(0, 70), lien: el.querySelector('a').getAttribute('href')} : null; }));
await p.click('.secours a'); await p.waitForURL(A + '/', {timeout: 15000}); await p.waitForTimeout(1500);
// connexion sur l'adresse de secours
out('écran', await p.evaluate(() => ({mail: !!document.getElementById('aMail'), txt: document.body.innerText.slice(0, 200), ids: [...document.querySelectorAll('input')].map(i => i.id)})));
if (await p.$('#aMail')) { await p.fill('#aMail', 'owner@exemple.org'); await p.fill('#aPass', 'Baobab#mdp1'); await p.click('button[type=submit]'); await p.waitForTimeout(2500); }
if (await p.$('#kCode')) { await p.fill('#kCode', 'Kc-123456'); const k2 = await p.$('#kCode2'); if (k2) await k2.fill('Kc-123456'); await p.click('button[type=submit]'); await p.waitForTimeout(3500); }
await skip(p).catch(() => {});
out('connecté sur le secours', await p.evaluate(() => ({me: S.me && S.me.handle, origin: location.origin, primaire: Secours.onPrimary()})));
out('envoi accepté (origine de secours)', await p.evaluate(async () => { try { await api('/api/me', {avail: 'on'}); return true; } catch (e) { return e.message; } }));
console.log(errs.length ? errs : 'NO ERRORS'); await b.close();
