// 20 personnes dans un même groupe, qui écrivent en même temps ; puis contrôles de sécurité.
// Serveur : cd app && rm -rf var && OWNER_EMAIL=owner@exemple.org BASE_URL=http://localhost:3555 PORT=3555 node index.mjs
// Usage : node t-20-simultanes.mjs <dossier des captures>
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { B, b, skip, errs } from './lib.mjs';
const OUT = process.argv[2] || 'shots20'; fs.mkdirSync(OUT, {recursive: true});
const R = {}; const log = (k, v) => { R[k] = v; console.log(k, JSON.stringify(v)); };
const NAMES = ['Désiré', 'Awa', 'Moussa', 'Fatou', 'Ibrahima', 'Aminata', 'Cheikh', 'Mariama', 'Ousmane', 'Khady', 'Pape', 'Ndeye', 'Samba', 'Coumba', 'Lamine', 'Adja', 'Babacar', 'Rokhaya', 'Modou', 'Bineta'];
let ipN = 10;
const mk = async (n, desk) => { const c = await b.newContext({...(desk ? {viewport: {width: 1280, height: 800}} : {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}), extraHTTPHeaders: {'x-forwarded-for': '10.20.0.' + (ipN++)}}); const p = await c.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); p.on('dialog', d => { errs.push(n + ' DIALOGUE OUVERT: ' + d.message()); d.dismiss(); }); return p; };
const reg = async (pg, url, h, nm, mail, code) => { await pg.goto(url); await pg.waitForTimeout(500); await pg.fill('#aHandle', h); await pg.fill('#aName', nm); await pg.fill('#aMail', mail); await pg.fill('#aPass', 'Baobab#mdp1'); await pg.check('#aAge'); await pg.check('#aCgu'); await pg.click('button[type=submit]'); await pg.waitForTimeout(800); await pg.fill('#kCode', code); await pg.fill('#kCode2', code); await pg.click('button[type=submit]'); await pg.waitForFunction(() => typeof S !== 'undefined' && S.me && typeof E2E !== 'undefined' && E2E.pubJwk, null, {timeout: 30000}); await pg.waitForTimeout(1500); await skip(pg); };
const inv = pg => pg.evaluate(async () => (await (await fetch('/api/invites', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'})).json()).url);
const handle = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '.tt';

// ---------- 1. Inscription des 20 personnes ----------
const t0 = Date.now();
const owner = await mk('Désiré', true); await reg(owner, B, handle('Désiré'), 'Désiré', 'owner@exemple.org', 'Kc-123456');
const ps = [owner];
for (const n of NAMES.slice(1)) { const p = await mk(n); await reg(p, await inv(owner), handle(n), n, handle(n) + '@exemple.org', 'Kc-' + handle(n).slice(0, 6).padEnd(6, '1')); ps.push(p); }
log('inscriptions', {comptes: ps.length, secondes: Math.round((Date.now() - t0) / 1000)});

// ---------- 2. Groupe de 20 ----------
await owner.evaluate(() => loadContacts());
const ids = await Promise.all(ps.slice(1).map(p => p.evaluate(() => S.me.id)));
const gid = await owner.evaluate(async ids => { const r = await api('/api/chats/group', {name: 'Test à 20 personnes', members: ids}); await loadChats(); return r.chat.id; }, ids);
await Promise.all(ps.map(p => p.evaluate(async g => { await loadContacts(); await loadChats(); renderAll(); await openChat(g); }, gid)));
await owner.waitForTimeout(2500);
log('groupe', {id: gid, membres: await owner.evaluate(g => (S.chats.get(g).members || []).length, gid)});

// ---------- 3. Tout le monde écrit en même temps ----------
// chaque page note l'instant où elle voit (déchiffré) chaque message des autres
await Promise.all(ps.map(p => p.evaluate(g => { window.__seen = new Map(); window.__iv = setInterval(() => { for (const m of S.msgs.get(g) || []) { const x = /^#(\d+)-(\d+)-(\d+) /.exec(m.text || ''); if (x && !window.__seen.has(x[1] + '-' + x[2])) window.__seen.set(x[1] + '-' + x[2], Date.now() - +x[3]); } }, 50); }, gid)));
const PER = 5, say = (p, i, k) => p.evaluate(([i, k]) => { $('#msgIn').value = `#${i}-${k}-${Date.now()} Bonjour, message ${k + 1} de ${S.me.name}`; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); }, [i, k]);
const tS = Date.now();
await Promise.all(ps.map(async (p, i) => { for (let k = 0; k < PER; k++) { await say(p, i, k); await p.waitForTimeout(250); } }));
await owner.waitForTimeout(25000);
const expect = ps.length * PER;
const per = await Promise.all(ps.map(p => p.evaluate(() => { clearInterval(window.__iv); const v = [...window.__seen.values()].sort((a, b) => a - b); return {vus: v.length, med: v[Math.floor(v.length / 2)] || 0, max: v[v.length - 1] || 0}; })));
const locked = await Promise.all(ps.map(p => p.evaluate(g => (S.msgs.get(g) || []).filter(m => m.locked).length, gid)));
const all = per.flatMap(x => [x.med]); const mx = Math.max(...per.map(x => x.max));
log('envoi simultané', {messages_envoyes: expect, chaque_personne_a_tout_recu: per.every(x => x.vus === expect), recus_par_personne: per.map(x => x.vus), delai_median_ms: Math.round(all.sort((a, b) => a - b)[Math.floor(all.length / 2)]), delai_max_ms: mx, messages_illisibles: locked.reduce((a, b) => a + b, 0)});

// captures
await owner.evaluate(() => renderMessages(true)); await owner.screenshot({path: path.join(OUT, '01-desire-ordinateur.png')});
for (const [i, n] of [[1, '02-awa-telephone'], [7, '03-mariama-telephone'], [19, '04-bineta-telephone']]) await ps[i].screenshot({path: path.join(OUT, n + '.png')});
for (let i = 0; i < ps.length; i++) await ps[i].screenshot({path: path.join(OUT, `g-${String(i).padStart(2, '0')}.png`)});

// ---------- 4. Sécurité ----------
const S = {};
// a) base de données du serveur : on cherche un message en clair
const DB = path.join(process.env.DATA_DIR || '../app/var', 'tamtam.db'); const db = new DatabaseSync(DB, {readOnly: true});
const cols = db.prepare(`PRAGMA table_info(messages)`).all().map(c => c.name);
const rows = db.prepare(`SELECT * FROM messages WHERE chat_id=? AND kind!='system' ORDER BY id DESC LIMIT 4`).all(gid);
db.close();
const raw = fs.readFileSync(DB).toString('latin1') + (fs.existsSync(DB + '-wal') ? fs.readFileSync(DB + '-wal').toString('latin1') : '');
S.db = {colonnes: cols, exemple: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && v.length > 70 ? v.slice(0, 70) + '…' : v]))), texte_en_clair_trouve: /Bonjour, message/.test(raw)};
// b) sans être connecté
const anon = await mk('Anonyme', true); await anon.goto(B + '/conditions');
S.sans_connexion = await anon.evaluate(async g => { const r = await fetch(`/api/chats/${g}/messages`); return {statut: r.status, reponse: (await r.json()).error}; }, gid);
// c) membre inscrit mais hors du groupe
const intrus = await mk('Intrus'); await reg(intrus, await inv(owner), 'intrus.tt', 'Intrus', 'intrus@exemple.org', 'Kc-999999');
S.hors_groupe_lire = await intrus.evaluate(async g => { const r = await fetch(`/api/chats/${g}/messages`); return {statut: r.status, reponse: (await r.json()).error}; }, gid);
S.hors_groupe_ecrire = await intrus.evaluate(async g => { const r = await fetch(`/api/chats/${g}/messages`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: 'je force la porte'})}); return {statut: r.status, reponse: (await r.json()).error}; }, gid);
S.admin_non_proprietaire = await intrus.evaluate(async () => { const r = await fetch('/api/admin'); return {statut: r.status, reponse: (await r.json()).error}; });
// d) mot de passe deviné en boucle
S.mot_de_passe_force = await anon.evaluate(async () => { const st = []; for (let i = 0; i < 25; i++) { const r = await fetch('/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: 'owner@exemple.org', pass: 'essai' + i})}); st.push(r.status); if (r.status === 429) return {bloque_apres_essais: i, reponse: (await r.json()).error}; } return {bloque_apres_essais: null, statuts: st}; });
// e) envoi en rafale (60 messages lancés d'un coup) et message en clair forcé
S.rafale = await ps[2].evaluate(async g => { const st = await Promise.all(Array.from({length: 60}, (_, i) => fetch(`/api/chats/${g}/messages`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({enc: {iv: 'x', ct: 'x', keys: {}}, cid: 'rafale' + i})}).then(r => r.status))); return {acceptes: st.filter(x => x === 200).length, bloques: st.filter(x => x === 429).length}; }, gid);
S.message_en_clair = await ps[4].evaluate(async g => { const r = await fetch(`/api/chats/${g}/messages`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: 'texte en clair forcé'})}); return {statut: r.status, reponse: (await r.json()).error}; }, gid);
// f) code piégé envoyé comme message
await ps[3].evaluate(() => { $('#msgIn').value = '<img src=x onerror="alert(\'piratage\')"><script>alert(1)</script>'; syncSend(); document.querySelector('form[data-form=send]').requestSubmit(); });
await owner.waitForTimeout(2500); await owner.evaluate(() => renderMessages(true)); await owner.waitForTimeout(500);
S.code_piege = await owner.evaluate(() => ({affiche_comme_texte: [...document.querySelectorAll('.msg, .bubble, [data-mid]')].some(e => (e.innerText || '').includes('<img src=x')), image_piegee_dans_la_page: !!document.querySelector('img[src="x"]'), dialogue_ouvert: false}));
S.code_piege.dialogue_ouvert = errs.some(e => /DIALOGUE OUVERT/.test(e));
await owner.screenshot({path: path.join(OUT, '06-code-piege-affiche-en-texte.png')});
// g) changement de clé d'un membre (réinstallation ou usurpation) -> alerte
await ps[1].evaluate(async () => { await E2E.create(S.me.id); await api('/api/keys', {pubkey: E2E.pubJwk, backup: await E2E.backup('Kc-awa.tt')}); });
const awaId = ids[0];
const dm = await owner.evaluate(async id => { const r = await api('/api/chats/direct', {userId: id}); await loadContacts(); await loadChats(); await openChat(r.chat.id); renderMessages(true); return r.chat.id; }, awaId);
await owner.waitForTimeout(1500);
S.alerte_cle = await owner.evaluate(() => { const el = document.querySelector('.key-alert'); return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 160) : null; });
await owner.screenshot({path: path.join(OUT, '07-alerte-changement-de-cle.png')});
log('securite', S);
R.erreurs = errs.filter(e => !/40[0349]|429/.test(e));
fs.writeFileSync(path.join(OUT, 'resultats.json'), JSON.stringify(R, null, 2));
console.log(R.erreurs.length ? R.erreurs : 'NO ERRORS');
await b.close();
