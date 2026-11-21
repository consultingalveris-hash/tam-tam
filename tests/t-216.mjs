// Raccrocher en fermant la page : l'autre personne voit l'appel se terminer.
import { B, mk, reg, inv, done } from './lib.mjs';
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const d = await mk('D'); await reg(d, B, 'desire', 'Désiré', 'owner@exemple.org');
const a = await mk('A'); await reg(a, await inv(d), 'awa', 'Awa', 'awa@exemple.org');
const aId = await a.evaluate(() => S.me.id);
await d.evaluate(async id => { const x = await api('/api/chats/direct', {userId: id}); await loadChats(); await openChat(x.chat.id); }, aId);
await a.evaluate(() => loadChats());
await d.evaluate(() => Call.start(true)); await a.waitForTimeout(2500); await a.evaluate(() => Call.accept()); await d.waitForTimeout(3500);
out('en ligne :', await d.evaluate(() => Call.c && Call.c.state));
await a.close({runBeforeUnload: true}); await d.waitForTimeout(3000);
out('Awa ferme la page → fin chez Désiré :', await d.evaluate(() => !Call.c || Call.c.state === 'ended'));
await done();
