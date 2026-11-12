import { B, mk, reg, done } from './lib.mjs';
const p = await mk('D'); await reg(p, B, 'desire', 'Désiré', 'owner@exemple.org', 'Kc-123456');
await p.evaluate(() => { S.sc = {kind: 'text', text: '', aud: 'public', bg: 0}; stComposer(); }); await p.waitForTimeout(600);
await p.screenshot({path: 'shots/stcomp.png'}); await done();
