// Changement d'adresse : l'ancienne adresse renvoie vers la principale si elle répond, sinon reste (secours).
import { chromium } from 'playwright';
const b = await chromium.launch(); const errs = [];
const out = (k, v) => console.log(k, JSON.stringify(v));
const P = 'http://localhost:3601', A = 'http://localhost:3602';
const c = await b.newContext(); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
await p.goto(A + '/conditions'); await p.goto(A + '/'); await p.waitForTimeout(3000);
out('ancienne adresse, principale en marche -> redirigé', p.url());
await p.goto(A + '/?rester'); await p.waitForTimeout(2500);
out('avec ?rester -> reste', p.url());
const c2 = await b.newContext(); const q = await c2.newPage(); await q.addInitScript(() => { window.Capacitor = {}; });
await q.goto(A + '/'); await q.waitForTimeout(2500); out('dans l application Android -> reste', q.url());
process.kill(+process.env.P1, 'SIGTERM'); await p.waitForTimeout(500);
const c3 = await b.newContext(); const r = await c3.newPage(); await r.goto(A + '/'); await r.waitForTimeout(6000);
out('principale en panne -> reste sur le secours', r.url());
console.log(errs.length ? errs : 'NO ERRORS'); await b.close();
