// Empreinte dans l'application Android (pont TamTamAndroid simulé) : activation, puis ouverture par l'empreinte.
import { B, b, reg, done, errs } from './lib.mjs';
const c = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
await c.addInitScript(() => { window.__bioOk = localStorage.getItem('bioNo') !== '1'; window.TamTamAndroid = { version: () => 2, setSecure() {}, bioAvailable: () => true, bioAuth: r => { window.__bioAsked = (window.__bioAsked || 0) + 1; setTimeout(() => window.dispatchEvent(new CustomEvent('tt-bio', {detail: {ok: window.__bioOk}})), 200); } }; });
const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await reg(p, B, 'emma', 'Emma', 'owner@exemple.org');
console.log('empreinte proposée :', await p.evaluate(async () => Lock.bioCheck()));
await p.evaluate(() => ACT.bioOn()); await p.waitForTimeout(800);
console.log('empreinte activée :', await p.evaluate(() => S.lock.bio));
await p.reload(); await p.waitForTimeout(3500);
console.log('ouverture par empreinte :', await p.evaluate(() => ({ demandée: window.__bioAsked, verrou: !!document.getElementById('lockScreen') })));
// échec : retour au schéma
await p.evaluate(() => localStorage.setItem('bioNo', '1')); await p.reload(); await p.waitForTimeout(3500);
console.log('empreinte refusée → schéma :', await p.evaluate(() => ({ verrou: !!document.getElementById('lockScreen'), étape: S.lockStep })));
await done();
