// Vitrine : bulle de discussion visiteur ↔ porteur, et formulaire « Nous écrire ».
import { B, b, mk, reg, done, errs } from './lib.mjs';
const p = await mk('Porteur'); await reg(p, B, 'porteur', 'Porteur', 'owner@exemple.org', 'Kc-123456');
const vc = await b.newContext({viewport: {width: 1280, height: 860}}); const v = await vc.newPage();
v.on('pageerror', e => errs.push('Visiteur: ' + e.message)); v.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts/.test(m.text())) errs.push('Visiteur console: ' + m.text()); });
await v.goto(B + '/vitrine/index.html'); await v.waitForTimeout(800);
console.log('bulle visible :', await v.isVisible('#bulle button'), '· porteur en ligne :', await v.isVisible('#bulle .pt'));
await v.click('#bulle button'); await v.fill('#bp [name=nom]', 'Awa'); await v.fill('#bp [name=contact]', 'awa@exemple.org'); await v.fill('#bp [name=msg]', 'Bonjour, Tam-Tam est-il gratuit ?');
await v.click('[data-commencer]'); await v.waitForTimeout(1500);
const chat = await p.evaluate(async () => { await loadChats(); const c = [...S.chats.values()].find(c => Object.values(c.users).some(u => /visiteur du site/.test(u.name))); if (!c) return null; await openChat(c.id); await new Promise(r => setTimeout(r, 800)); const t = [...document.querySelectorAll('.msg, .bubble, [data-mid]')].map(x => x.textContent).join(' | '); return {id: c.id, name: Object.values(c.users).find(u => u.id !== S.me.id).name, t: t.slice(0, 300)}; });
console.log('chez le porteur :', chat && chat.name, '· message lu :', !!(chat && /gratuit/.test(chat.t)));
const contacts = await p.evaluate(async () => (await api('/api/contacts')).contacts.map(c => c.name));
console.log('visiteur absent des contacts :', !contacts.some(n => /visiteur/.test(n)));
await p.evaluate(() => { $('#msgIn').value = 'Bonjour Awa, oui, Tam-Tam est gratuit !'; document.querySelector('form[data-form=send]').requestSubmit(); }); await p.waitForTimeout(1500);
console.log('réponse reçue dans la bulle :', await v.evaluate(() => [...document.querySelectorAll('#bp .m.eux')].map(x => x.firstChild.textContent)));
await v.fill('#bp form textarea', 'Merci beaucoup !'); await v.press('#bp form textarea', 'Enter'); await v.waitForTimeout(1000);
await v.screenshot({path: '/tmp/claude-0/-home-claude/2d8221e3-4f69-5cf7-8ee4-4297e639f621/scratchpad/bulle-test.png'});
// rechargement : la discussion revient
await v.reload(); await v.waitForTimeout(1200); await v.click('#bulle button'); await v.waitForTimeout(500);
console.log('après rechargement :', await v.evaluate(() => document.querySelectorAll('#bp .m').length), 'messages');
await v.click('#bp [data-fermer]');
// formulaire
await v.click('[data-ouvrir=ecrire]'); await v.fill('#ecrire [name=nom]', 'Awa Diop'); await v.fill('#ecrire [name=email]', 'awa@exemple.org'); await v.fill('#ecrire [name=tel]', '+221 77 000 00 00'); await v.fill('#ecrire [name=objet]', 'Partenariat'); await v.fill('#ecrire [name=message]', 'Nous aimerions travailler avec vous.');
await v.screenshot({path: '/tmp/claude-0/-home-claude/2d8221e3-4f69-5cf7-8ee4-4297e639f621/scratchpad/form-test.png'});
await v.click('#ecrire [type=submit]'); await v.waitForTimeout(1500);
console.log('formulaire :', await v.textContent('#ecrire .ok'));
const t2 = await p.evaluate(async id => { await new Promise(r => setTimeout(r, 300)); return [...document.querySelectorAll('.msg, .bubble, [data-mid]')].map(x => x.textContent).join(' | '); }, chat && chat.id);
console.log('formulaire arrivé chez le porteur :', /Partenariat/.test(t2));
// visiteur dans la recherche ?
console.log('visiteur absent de la recherche :', await p.evaluate(async () => { try { const r = await api('/api/users/search?q=visiteur'); return !JSON.stringify(r).includes('visiteur.'); } catch (e) { return 'n/a ' + e.message; } }));
await done();
