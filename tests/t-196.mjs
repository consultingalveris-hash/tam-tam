import { B, mk, reg, inv, done } from './lib.mjs';
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
await p.evaluate(() => ACT.tab({t: 'souvenirs'})); await p.waitForTimeout(800);
await p.screenshot({path: 'shots/dot196a.png', clip: {x: 240, y: 10, width: 150, height: 50}});
await p.emulateMedia({colorScheme: 'dark'}); await p.waitForTimeout(300);
await p.screenshot({path: 'shots/dot196b.png', clip: {x: 240, y: 10, width: 150, height: 50}});
await done();
