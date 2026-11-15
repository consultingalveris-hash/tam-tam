// Application en anglais : téléphone réglé en anglais → écrans en anglais, puis bascule FR/EN.
import { B, b, reg, inv, done, errs, skip } from './lib.mjs';
const mkEN = async n => { const c = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, locale: 'en-US', deviceScaleFactor: 2}); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); return p; };
const a = await mkEN('A');
await a.goto(B); await a.waitForTimeout(800); await a.screenshot({path: '/tmp/en/1-start.png'});
await reg(a, B, 'emma', 'Emma', 'owner@exemple.org');
await a.waitForTimeout(800); await a.screenshot({path: '/tmp/en/2-chats.png'});
const url = await inv(a);
const c = await mkEN('C'); await reg(c, url, 'kofi', 'Kofi', 'kofi@exemple.org');
await a.reload(); await a.waitForTimeout(3000); await skip(a); await a.waitForTimeout(500);
await a.screenshot({path: '/tmp/en/3-list.png'});
await a.evaluate(() => { const r = document.querySelector('[data-act="open"]'); r && r.click(); }); await a.waitForTimeout(1200);
await a.fill('#msgIn, textarea', 'Bonjour Kofi !').catch(() => {}); await a.keyboard.press('Enter'); await a.waitForTimeout(1200);
await a.screenshot({path: '/tmp/en/4-chat.png'});
await a.evaluate(() => ACT.tab({t: 'settings'})); await a.waitForTimeout(1200); await a.screenshot({path: '/tmp/en/5-settings.png'});
await a.evaluate(() => ACT.tab({t: 'souvenirs'})).catch(() => {}); await a.waitForTimeout(1200); await a.screenshot({path: '/tmp/en/6-memories.png'});
const left = await a.evaluate(() => { const fr = /[àâéèêîôûç]|\b(le|la|les|des|une|vos|votre|vous|pour|avec|dans|est|pas|qui)\b/i, out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t && fr.test(t) && !n.parentElement.closest('.txt,.row-name,.row-prev,[data-noi18n],script,style')) out.push(t.slice(0, 90)); } document.querySelectorAll('[aria-label],[placeholder],[title]').forEach(e => ['aria-label','placeholder','title'].forEach(k => { const v = e.getAttribute(k); if (v && fr.test(v)) out.push('@' + k + ': ' + v.slice(0, 80)); })); return [...new Set(out)]; });
console.log('FRENCH LEFT:', JSON.stringify(left, null, 1));
await done();
