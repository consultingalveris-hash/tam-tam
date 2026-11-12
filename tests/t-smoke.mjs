import { B, mk, reg, inv, done } from './lib.mjs';
const p = await mk('Tel'); await reg(p, B, 'teluser', 'Tel', 'owner@exemple.org', 'Kc-123456');
const q = await mk('PC', true); await reg(q, await inv(p), 'pcuser', 'Pc', 'pc@exemple.org', 'Kc-222222');
for (const [pg, desk] of [[p, false], [q, true]]) {
  for (const t of ['chats', 'contacts', 'memories', 'calls', 'settings']) { await pg.evaluate(t => { if (t === 'settings' && isDesk()) pmOpen('settings'); else { S.tab = t; renderAll(); } }, t); await pg.waitForTimeout(500); }
  await pg.evaluate(() => { closeLayer(); stComposer(); }); await pg.waitForTimeout(300); await pg.evaluate(() => closeLayer());
  console.log(desk ? 'ordinateur' : 'téléphone', ': réglages affichés', await pg.evaluate(() => [!!document.querySelector('.tone-rows'), !!document.querySelector('.loc-det')]));
}
await done();
