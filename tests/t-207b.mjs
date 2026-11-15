import { B, b, reg, inv, done, errs, skip } from './lib.mjs';
const mkEN = async n => { const c = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, locale: 'en-US', deviceScaleFactor: 2}); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); return p; };
const scan = (p, tag) => p.evaluate(tag => { const fr = /[àâéèêîôûçœ]|\b(le|la|les|des|du|de|une|un|vos|votre|vous|pour|avec|dans|est|pas|qui|et|sur|au|aux|mon|ma|mes|ce|cette|ici)\b/i, out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t && fr.test(t) && !/Kofi|Emma|Bonjour Kofi/.test(t) && !n.parentElement.closest('script,style,[data-noi18n]')) out.push(t.slice(0, 120)); } document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(e => ['aria-label','placeholder','title'].forEach(k => { const v = e.getAttribute(k); if (v && fr.test(v)) out.push('@' + k + ': ' + v.slice(0, 100)); })); return [...new Set(out)].map(s => tag + ' | ' + s); }, tag);
const all = new Set(); const add = l => l.forEach(x => all.add(x));
const a = await mkEN('A');
await reg(a, B, 'emma', 'Emma', 'owner@exemple.org');
const url = await inv(a);
const c = await mkEN('C'); await c.goto(url); await c.waitForTimeout(800); add(await scan(c, 'invite')); await c.screenshot({path: '/tmp/en/0-invite.png'});
await reg(c, url, 'kofi', 'Kofi', 'kofi@exemple.org');
await a.reload(); await a.waitForTimeout(3000); await skip(a); await a.waitForTimeout(500);
for (const t of ['chats', 'contacts', 'souvenirs', 'calls', 'settings']) { await a.evaluate(t => ACT.tab({t}), t).catch(e => console.log(t, e.message)); await a.waitForTimeout(1200); add(await scan(a, t)); await a.screenshot({path: `/tmp/en/t-${t}.png`, fullPage: true}); }
await a.evaluate(async () => { const u = (S.contacts.contacts || [])[0]; await ACT.write({id: u.id}); }); await a.waitForTimeout(1500);
await a.locator('textarea').first().fill('Bonjour Kofi !'); await a.keyboard.press('Enter'); await a.waitForTimeout(1500);
add(await scan(a, 'chat')); await a.screenshot({path: '/tmp/en/t-chat.png'});
await a.evaluate(() => { const b = document.querySelector('.msg-more'); b && b.click(); }); await a.waitForTimeout(800); add(await scan(a, 'chatmenu')); await a.screenshot({path: '/tmp/en/t-chatmenu.png'});
console.log([...all].join('\n'));
await done();
