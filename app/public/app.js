/* tam-tam — version 1 (interface). Tout passe par le serveur : comptes, contacts, messages en direct, statuts. */
'use strict';
const $ = s => document.querySelector(s);
const root = $('#root'), layer = $('#layer');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const first = n => String(n || '').split(' ')[0];
const deN = n => (/^[aeiouyhâàéèêîïôûAEIOUYHÂÀÉÈÊÎÏÔÛ]/.test(n) ? 'd’' : 'de ') + n;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = n => String(n).padStart(2, '0');
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayLabel(t) {
  const d = dayStart(t), today = dayStart(Date.now());
  if (d === today) return 'Aujourd’hui'; if (d === today - 864e5) return 'Hier';
  return new Date(t).toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});
}
const listTime = t => dayStart(t) === dayStart(Date.now()) ? hm(t) : dayStart(t) === dayStart(Date.now()) - 864e5 ? 'Hier' : new Date(t).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit'});
function seenLabel(t) {
  if (!t) return 'hors ligne';
  const d = dayStart(t), today = dayStart(Date.now());
  return 'vu ' + (d === today ? 'aujourd’hui' : d === today - 864e5 ? 'hier' : 'le ' + new Date(t).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})) + ' à ' + hm(t);
}

/* ---------- état ---------- */
const S = {me: null, chats: new Map(), msgs: new Map(), more: new Map(), contacts: {contacts: [], incoming: [], outgoing: [], suggestions: []},
  statuses: {mine: {items: []}, others: []}, users: new Map(), tab: 'chats', chatId: null, q: '', typing: new Map(), lastFrom: new Map(), replyTo: null, invite: null};
const uOf = id => S.users.get(id) || {id, name: 'Membre', handle: '', avatar: {d: 'm2', c: 'turq'}};
function keepUsers(list) { for (const u of list || []) if (u) S.users.set(u.id, Object.assign(S.users.get(u.id) || {}, u)); }

/* ---------- appels au serveur ---------- */
async function api(path, body, opts = {}) {
  const init = {method: body !== undefined ? 'POST' : 'GET', headers: {}, credentials: 'same-origin'};
  if (body !== undefined) { if (opts.raw) { init.body = body; init.headers['Content-Type'] = opts.type; } else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; } }
  let r;
  try { r = await fetch(path, init); } catch { throw new Error('Pas de connexion internet. Réessayez.'); }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && S.me) { S.me = null; boot(); }
  if (!r.ok) throw new Error(data.error || 'Erreur. Réessayez.');
  return data;
}
let toastT;
function toast(t) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }

/* ---------- avatars ---------- */
function avatar(u, cls = '') {
  if (!u) return `<span class="av ${cls}"></span>`;
  if (u.photo) return `<span class="av ${cls}"><img src="${esc(u.photo)}" alt=""></span>`;
  return `<span class="av ${cls}" aria-hidden="true">${avFace(u.avatar)}</span>`;
}
const avOn = (u, cls) => `<span class="avw">${avatar(u, cls)}${u && u.online ? '<span class="dot-on" aria-label="en ligne"></span>' : ''}</span>`;
const grpAv = (c, cls = '') => `<span class="av grp ${cls}" style="--h:${(c.id * 47) % 360}" aria-hidden="true">${I.users}</span>`;
function avGallery(sel, who) {
  const a = avNorm(sel), mini = st => avFace(Object.assign({}, a, {st, f: FEM.includes(st) ? true : a.f}));
  return `<div class="avb" id="avg-${who}"><div class="avb-top"><span class="av">${avFace(a)}</span><span class="hint">Composez votre avatar : coiffure, teint, couleur de la tenue et détails.</span></div>
    <span class="lbl">Coiffure</span><div class="avb-row">${AV2.styles.map(([k, l]) => `<button class="avb-st" type="button" data-act="avSet" data-who="${who}" data-k="st" data-v="${k}" aria-pressed="${a.st === k}"><span class="av">${mini(k)}</span>${l}</button>`).join('')}</div>
    <span class="lbl">Teint</span><div class="avg-sw">${AV2.skins.map(k => `<button class="skin" type="button" data-act="avSet" data-who="${who}" data-k="sk" data-v="${k}" style="--c:${SKIN[k]}" aria-pressed="${a.sk === k}" aria-label="Teint ${k.toUpperCase()}"></button>`).join('')}</div>
    <span class="lbl">Couleur de la tenue${a.st === 'foulard' ? ' et du foulard' : ''}</span><div class="avg-sw">${AV2.shirts.map(c => `<button class="sw" type="button" data-act="avSet" data-who="${who}" data-k="sh" data-v="${c}" style="--c:${c}" aria-pressed="${a.sh === c}" aria-label="Couleur ${c}"></button>`).join('')}</div>
    <span class="lbl">Détails</span><div class="chips">${[['f', 'Traits féminins'], ['b', 'Barbe'], ['g', 'Lunettes'], ['e', 'Boucles d’oreilles']].map(([k, l]) => `<button class="chip" type="button" data-act="avSet" data-who="${who}" data-k="${k}" data-v="t" aria-pressed="${!!a[k]}">${l}</button>`).join('')}</div></div>`;
}

/* ---------- connexion et inscription ---------- */
const A = {mode: 'login', avatar: {v: 2, st: 'court', sk: 'c', sh: '#14b8c9', f: false, b: false, g: false, e: false}};
async function boot() {
  const p = location.pathname, inv = (p.match(/^\/invite\/([A-Za-z0-9_-]+)$/) || [])[1], rst = (p.match(/^\/reset\/([A-Za-z0-9_-]+)$/) || [])[1];
  if (inv) S.invite = inv;
  if (rst) { A.mode = 'reset'; A.token = rst; return renderAuth(); }
  const qs = new URLSearchParams(location.search), gtok = qs.get('g'), gerr = qs.get('g_err');
  if (gtok || gerr) history.replaceState(null, '', location.pathname);
  try { const r = await api('/api/me'); S.me = r.me; keepUsers([r.me]); history.replaceState(null, '', '/'); return start(); } catch {}
  try { const m = await api('/api/meta' + (S.invite ? '?invite=' + encodeURIComponent(S.invite) : '')); A.meta = m; if (m.ownerSetup || m.invite) A.mode = 'register'; } catch { A.meta = {}; }
  if (gtok) { try { A.g = await api('/api/oauth/google/pending?t=' + encodeURIComponent(gtok)); A.g.tok = gtok; A.mode = 'register'; if (A.g.invite) S.invite = A.g.invite; } catch (e) { return renderAuth(e.message); } }
  renderAuth(gerr || undefined);
}
const gIcon = () => '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const gBtn = () => (A.meta || {}).google ? `<a class="btn gbtn" href="/api/oauth/google/start${S.invite ? '?invite=' + encodeURIComponent(S.invite) : ''}">${gIcon()}Continuer avec Google</a><div class="or"><span>ou</span></div>` : '';
function renderAuth(msg) {
  const m = A.meta || {}, top = `<div class="auth-top">${LOGO}<h1 class="brand">${WORD}</h1></div>`;
  let h;
  if (A.mode === 'forgot') h = A.step === 1
    ? `<h2>Mot de passe oublié</h2><p class="hint">Entrez l’adresse e-mail de votre compte : nous vous envoyons un code à 6 chiffres.</p>
      <div class="field"><label for="fMail">Adresse e-mail</label><input id="fMail" type="email" autocomplete="email" value="${esc(A.fmail || '')}" required></div>
      <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Recevoir un code</button><button class="linkb" type="button" data-act="authMode" data-m="login">Retour</button>`
    : `<h2>Vérifiez vos e-mails</h2><p class="hint">Si un compte existe pour <b>${esc(A.fmail)}</b>, un code vient d’y être envoyé (pensez aux indésirables). Il est valable 15 minutes.</p>
      <div class="field"><label for="fCode">Code reçu</label><input id="fCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></div>
      <div class="field"><label for="aPass">Nouveau mot de passe (8 caractères minimum)</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-act="pwShow">Voir</button></div></div>
      <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Changer le mot de passe</button><button class="linkb" type="button" data-act="forgot">Renvoyer un code</button>`;
  else if (A.mode === 'reset') h = `<h2>Nouveau mot de passe</h2><p class="hint">Choisissez un nouveau mot de passe pour votre compte.</p>
    <div class="field"><label for="aPass">Nouveau mot de passe (8 caractères minimum)</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-act="pwShow">Voir</button></div></div>
    <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Enregistrer et me connecter</button>`;
  else if (A.mode === 'register') h = `<h2>${m.ownerSetup ? 'Créer le compte du propriétaire' : 'Créer mon compte'}</h2>
    <p class="hint">${A.g && !m.ownerSetup ? (A.g.by ? `${esc(A.g.by)} vous invite sur tam-tam.` : 'Bienvenue sur tam-tam.') : m.ownerSetup ? `Premier compte de tam-tam${m.ownerEmail ? ` : utilisez l’adresse ${esc(m.ownerEmail)}` : ''}.` : m.invite ? `${esc(m.invite.by)} vous invite sur tam-tam.` : 'L’inscription se fait uniquement avec un lien d’invitation envoyé par un membre.'}</p>
    ${m.ownerSetup || m.invite || A.g ? `${A.g ? `<p class="g-ok">${gIcon()}<span>Compte Google confirmé : <b>${esc(A.g.email)}</b>. Il reste à choisir votre avatar et à accepter les conditions.</span></p>` : gBtn()}
    <div class="field"><label for="aName">Votre nom</label><input id="aName" autocomplete="name" maxlength="40" required placeholder="Prénom et nom" value="${esc(A.g ? A.g.name : '')}"></div>
    ${A.g ? '' : `<div class="field"><label for="aMail">Adresse e-mail</label><input id="aMail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Mot de passe (8 caractères minimum)</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-act="pwShow">Voir</button></div></div>`}
    <span class="lbl">Votre avatar</span>${avGallery(A.avatar, 'auth')}
    <label class="pick chk"><input type="checkbox" id="aAge"><span>J’ai 16 ans ou plus.</span></label>
    <label class="pick chk"><input type="checkbox" id="aCgu"><span>J’ai lu et j’accepte les <a href="/conditions" target="_blank" rel="noopener">Conditions générales et la Politique de confidentialité</a>.</span></label>
    <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Créer mon compte</button>` : ''}
    <button class="linkb" type="button" data-act="authMode" data-m="login">J’ai déjà un compte : me connecter</button>`;
  else h = `<h2>Bienvenue</h2><p class="hint">La messagerie qui fait vivre nos langues. Connectez-vous pour retrouver vos proches.</p>
    ${gBtn()}
    <div class="field"><label for="aMail">Adresse e-mail</label><input id="aMail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Mot de passe</label><div class="pw"><input id="aPass" type="password" autocomplete="current-password" required><button type="button" data-act="pwShow">Voir</button></div></div>
    <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Me connecter</button>
    ${m.invite || m.ownerSetup ? '<button class="linkb" type="button" data-act="authMode" data-m="register">Créer un compte</button>' : ''}
    ${m.mail ? '<button class="linkb" type="button" data-act="forgot">Mot de passe oublié ?</button>' : '<p class="hint">Mot de passe oublié ? Demandez un lien de réinitialisation au responsable de tam-tam.</p>'}`;
  root.innerHTML = `<div class="auth"><form class="auth-card" data-form="auth" novalidate>${top}${h}</form></div>`;
  const f = root.querySelector('input'); if (f) f.focus();
}
async function submitAuth() {
  const v = id => ($('#' + id) || {}).value || '', err = t => { const e = $('#aErr'); if (e) { e.textContent = t; e.hidden = false; } };
  const btn = root.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
  try {
    let r;
    if (A.mode === 'forgot' && A.step === 1) { A.fmail = v('fMail').trim(); await api('/api/forgot', {email: A.fmail}); A.step = 2; return renderAuth(); }
    if (A.mode === 'forgot') r = await api('/api/forgot/verify', {email: A.fmail, code: v('fCode'), pass: v('aPass')});
    else if (A.mode === 'reset') r = await api('/api/reset', {token: A.token, pass: v('aPass')});
    else if (A.mode === 'register') r = await api('/api/register', {name: v('aName'), email: v('aMail'), pass: v('aPass'), gtok: A.g ? A.g.tok : undefined, avatar: A.avatar, age: $('#aAge').checked, cgu: $('#aCgu').checked, invite: S.invite});
    else r = await api('/api/login', {email: v('aMail'), pass: v('aPass')});
    S.me = r.me; keepUsers([r.me]); history.replaceState(null, '', '/'); start();
  } catch (e) { err(e.message); if (btn) btn.disabled = false; }
}

/* ---------- démarrage ---------- */
let es = null;
async function start() {
  if (!(await E2E.load(S.me.id))) return keySetup();
  const srv = S.me.pubkey;
  if (!srv || srv.x !== E2E.pubJwk.x) { /* clé locale sans sauvegarde côté serveur : on redemande un code */ return keySetup(true); }
  const L = await Lock.get(S.me.id); S.lock = L; S.locked = L.type !== 'off';
  startApp();
}
async function startApp() {
  root.innerHTML = `<div class="app" data-view="list"><aside class="side" id="side"><div class="head" id="head"></div><div class="body" id="body"></div><nav class="tabs" id="tabs" aria-label="Rubriques"></nav><button class="fab" id="fab" type="button" data-act="fab" aria-label="Nouvelle discussion">${I.newchat}</button></aside><main class="main" id="main"></main></div>`;
  renderMain();
  await Promise.all([loadChats(), loadContacts(), loadStatuses()]).catch(e => toast(e.message));
  renderAll(); connect(); if (S.locked) showLock();
}
function connect() {
  if (es) es.close();
  es = new EventSource('/api/stream');
  es.onmessage = e => { let ev; try { ev = JSON.parse(e.data); } catch { return; } onEvent(ev); };
  es.onerror = () => { /* le navigateur se reconnecte tout seul */ };
}
let resync = null;
function onEvent(ev) {
  if (ev.t === 'hello') { if (resync) { loadChats().then(renderAll); if (S.chatId) loadMessages(S.chatId, true); } resync = true; }
  else if (ev.t === 'msg') onMsg(ev.msg, ev.update);
  else if (ev.t === 'read') { const c = S.chats.get(ev.chatId); if (c) { const m = c.members.find(x => x.id === ev.user); if (m) m.lastRead = Math.max(m.lastRead, ev.upTo); if (S.chatId === ev.chatId) renderMessages(true); if (S.tab === 'chats') renderBody(); } }
  else if (ev.t === 'typing') { const k = ev.chatId; if (Date.now() - (S.lastFrom.get(k + ':' + ev.user) || 0) < 2500) return; S.typing.set(k, {user: ev.user, until: Date.now() + 4000}); refreshTyping(k); setTimeout(() => refreshTyping(k), 4100); }
  else if (ev.t === 'contacts') { loadContacts().then(() => { renderTabs(); if (S.tab !== 'chats') renderBody(); }); loadChats().then(() => { if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); }); }
  else if (ev.t === 'chats') loadChats().then(() => { if (S.tab === 'chats') renderBody(); });
  else if (ev.t === 'statuses') loadStatuses().then(renderStories);
  else if (ev.t === 'presence') { const u = S.users.get(ev.id); if (u) { u.online = ev.online; u.lastSeen = ev.lastSeen; } if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); }
  else if (ev.t === 'report' && S.me.admin) toast('Nouveau signalement reçu (Réglages, Administration)');
}
function refreshTyping(chatId) { if (S.tab === 'chats') renderBody(); if (S.chatId === chatId) { renderChatHead(); } }
const typingIn = id => { const t = S.typing.get(id); return t && t.until > Date.now() ? t.user : null; };

async function reveal(m) {
  if (!m || !m.enc || m._done) return m;
  m._done = true;
  if (!E2E.ready()) { m.text = '🔒 Message chiffré'; m.locked = true; return m; }
  const r = await E2E.open(m.enc, S.me.id);
  if (r.err === 'absent') { m.text = '🔒 Message chiffré avant votre arrivée, ou pour une ancienne clé'; m.locked = true; }
  else if (r.err) { m.text = '🔒 Message illisible sur cet appareil'; m.locked = true; }
  else { m.text = r.payload.t || ''; m.miv = r.payload.miv || null; m._key = r.key; }
  return m;
}
async function loadChats() { const r = await api('/api/chats'); const map = new Map(); for (const c of r.chats) { keepUsers(Object.values(c.users)); await reveal(c.last); map.set(c.id, c); } S.chats = map; }
async function loadContacts() { const r = await api('/api/contacts'); S.contacts = r; keepUsers([...r.contacts, ...r.incoming, ...r.outgoing, ...r.suggestions]); }
async function loadStatuses() { const r = await api('/api/statuses'); S.statuses = r; keepUsers([r.mine.user, ...r.others.map(g => g.user)]); }

function renderAll() { renderTabs(); renderHead(); renderBody(); }

/* ---------- liste ---------- */
const TABS = [['chats', 'Discussions', I.chats], ['contacts', 'Contacts', I.users], ['settings', 'Réglages', I.settings]];
function renderTabs() {
  const unread = [...S.chats.values()].filter(c => c.unread > 0).length, inc = S.contacts.incoming.length;
  $('#tabs').innerHTML = TABS.map(([id, l, ic]) => `<button class="tab" type="button" data-act="tab" data-t="${id}"${S.tab === id ? ' aria-current="page"' : ''}><span class="pill">${ic}</span>${l}${id === 'chats' && unread ? `<span class="badge" aria-label="${unread} non lues">${unread}</span>` : ''}${id === 'contacts' && inc ? `<span class="badge" aria-label="${inc} demandes">${inc}</span>` : ''}</button>`).join('');
  $('#fab').hidden = S.tab !== 'chats';
  const n = [...S.chats.values()].reduce((a, c) => a + (c.unread || 0), 0); document.title = n ? `(${n}) tam-tam` : 'tam-tam';
}
function renderHead() {
  const h = $('#head');
  if (S.tab === 'chats') {
    h.innerHTML = `<div class="title"><button class="me-btn" type="button" data-act="tab" data-t="settings" aria-label="Mon profil">${avatar(S.me, 'xs')}</button>${LOGO}<h1 class="brand">${WORD}</h1><span class="grow"></span><button class="ib" type="button" data-act="tab" data-t="contacts" aria-label="Ajouter des contacts">${I.userplus}</button></div>
      <div class="stories" id="stories" aria-label="Statuts"></div>
      <label class="search">${I.search}<span class="sr">Rechercher</span><input id="q" type="search" placeholder="Rechercher une discussion" value="${esc(S.q)}" autocomplete="off"></label>`;
    renderStories();
  } else h.innerHTML = `<div class="title"><h1>${S.tab === 'contacts' ? 'Contacts' : 'Réglages'}</h1></div>`;
}
function renderBody() {
  const b = $('#body'); if (!b) return;
  if (S.tab === 'chats') b.innerHTML = chatRows();
  else if (S.tab === 'contacts') b.innerHTML = contactsBody();
  else { b.innerHTML = settingsBody(); fillFp(); }
}
const chatTitle = c => c.type === 'group' ? c.name : uOf(c.peer).name;
function snippet(m) {
  if (!m) return 'Aucun message';
  if (m.deleted) return 'Message supprimé'; if (m.kind === 'sys') return m.text; if (m.locked) return m.text;
  return (m.media ? '📷 Photo' + (m.text ? ' · ' : '') : '') + (m.text || '');
}
function readState(c, m) {
  const others = c.members.filter(x => x.id !== S.me.id);
  return others.length && others.every(x => x.lastRead >= m.id) ? 'read' : 'sent';
}
const tick = st => st === 'read'
  ? `<svg class="tick read" viewBox="0 0 18 12" role="img" aria-label="Lu"><path d="M1 6.5 4.5 10 12 1.5"/><path d="M7.6 8.9 8.7 10 16.2 1.5"/></svg>`
  : `<svg class="tick" viewBox="0 0 18 12" role="img" aria-label="Envoyé"><path d="M4 6.5 7.5 10 15 1.5"/></svg>`;
function chatRows() {
  const q = S.q.trim().toLowerCase();
  let list = [...S.chats.values()].filter(c => c.last || c.type === 'group' || c.id === S.chatId);
  if (q) list = list.filter(c => chatTitle(c).toLowerCase().includes(q));
  list.sort((a, b) => (b.last?.at || b.createdAt) - (a.last?.at || a.createdAt));
  if (!list.length) return q ? `<p class="empty">Aucune discussion ne correspond.</p>`
    : `<div class="empty"><p>Aucune discussion pour l’instant.</p><p>Invitez vos proches depuis l’onglet <b>Contacts</b>, puis appuyez sur le bouton turquoise pour leur écrire.</p><button class="btn" type="button" data-act="tab" data-t="contacts">${I.userplus}Inviter mes proches</button></div>`;
  return list.map(c => {
    const m = c.last, tu = typingIn(c.id), u = c.type === 'direct' ? uOf(c.peer) : null;
    let prev = esc(snippet(m));
    if (tu) prev = `<span class="typing-t">${c.type === 'group' ? esc(first(uOf(tu).name)) + ' écrit…' : 'écrit…'}</span>`;
    else if (m && c.type === 'group' && m.from && m.kind !== 'sys') prev = esc(m.from === S.me.id ? 'Vous' : first(uOf(m.from).name)) + ' : ' + prev;
    const mine = m && m.from === S.me.id && !m.deleted && m.kind !== 'sys';
    return `<button class="row${c.id === S.chatId ? ' active' : ''}" type="button" data-act="open" data-id="${c.id}">
      ${c.type === 'group' ? grpAv(c) : avOn(u)}
      <span class="row-name">${esc(chatTitle(c))}</span><span class="row-time${c.unread ? ' new' : ''}">${m ? listTime(m.at) : ''}</span>
      <span class="row-prev">${mine && !tu ? tick(readState(c, m)) : ''}<span>${prev}</span>${c.unread ? `<span class="badge" style="margin-left:auto">${c.unread}</span>` : ''}</span></button>`;
  }).join('');
}

/* ---------- statuts : barre ---------- */
function renderStories() {
  const el = $('#stories'); if (!el) return;
  const mine = S.statuses.mine, has = mine.items.length;
  el.innerHTML = `<button class="story" type="button" data-act="${has ? 'stOpen' : 'stNew'}" data-u="${S.me.id}" aria-label="Mon statut"><span class="ring${has ? '' : ' empty'}">${avatar(S.me)}<span class="plus" data-act="stNew" role="button" aria-label="Ajouter un statut">${I.plus}</span></span><span class="story-n">Mon statut</span></button>`
    + S.statuses.others.map(g => `<button class="story" type="button" data-act="stOpen" data-u="${g.user.id}" aria-label="Statut ${esc(deN(g.user.name))}"><span class="ring${g.allSeen ? ' seen' : ''}">${avatar(g.user)}${g.items.some(i => i.aud === 'private') ? `<span class="lock" aria-hidden="true">${I.lock}</span>` : ''}</span><span class="story-n">${esc(first(g.user.name))}</span></button>`).join('');
}

/* ---------- contacts ---------- */
function relBtn(u) {
  if (u.rel === 'contact') return `<button class="btn sm ghost" type="button" data-act="write" data-id="${u.id}">Écrire</button>`;
  if (u.rel === 'received') return `<button class="btn sm" type="button" data-act="cAccept" data-id="${u.id}">Accepter</button>`;
  if (u.rel === 'sent') return `<button class="btn sm ghost" type="button" data-act="cRemove" data-id="${u.id}">Annuler</button>`;
  return `<button class="btn sm" type="button" data-act="cRequest" data-id="${u.id}">${I.plus}Ajouter</button>`;
}
const userRow = (u, extra) => `<div class="row">${avOn(u)}<button class="row-name linkless" type="button" data-act="prof" data-id="${u.id}" style="border:0;background:none;padding:0;text-align:left">${esc(u.name)}</button><span class="row-end">${extra || relBtn(u)}</span>
  <span class="row-prev"><span>@${esc(u.handle)}${u.pub && u.pub.ville ? ' · ' + esc(u.pub.ville) : ''}${u.mutual ? ` · ${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun` : ''}</span></span></div>`;
function contactsBody() {
  const C = S.contacts;
  return `<div class="invite-box"><b>Invitez vos proches</b><span class="hint">Seules les personnes qui ont un lien d’invitation peuvent s’inscrire. La personne invitée devient directement votre contact.</span>
      ${S.lastInvite ? `<div class="invite-url">${esc(S.lastInvite.url)}</div><div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-act="invCopy">${I.copy}Copier le lien</button><a class="btn sm ghost" href="https://wa.me/?text=${encodeURIComponent(inviteText())}" target="_blank" rel="noopener">WhatsApp</a>${navigator.share ? '<button class="btn sm ghost" type="button" data-act="invShare">Partager… (SMS, e-mail, autres)</button>' : ''}${'contacts' in navigator && navigator.contacts && navigator.contacts.select ? '<button class="btn sm ghost" type="button" data-act="invContacts">Choisir dans mes contacts</button>' : ''}</div><span class="hint">Valable 14 jours, pour 20 personnes au plus.</span>`
      : `<div><button class="btn" type="button" data-act="invNew">${I.userplus}Créer un lien d’invitation</button></div>`}</div>
    <div style="padding:0 16px"><label class="search">${I.search}<span class="sr">Chercher un membre</span><input id="fq" type="search" placeholder="Chercher un membre : nom, @pseudo ou e-mail" autocomplete="off" value="${esc(S.fq || '')}"></label></div>
    <div id="fres">${S.fres ? (S.fres.length ? S.fres.map(u => userRow(u)).join('') : '<p class="empty">Personne ne correspond.</p>') : ''}</div>
    ${C.incoming.length ? `<div class="sec">Demandes reçues · ${C.incoming.length}</div>${C.incoming.map(u => userRow(u, `<button class="btn sm ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button><button class="btn sm" type="button" data-act="cAccept" data-id="${u.id}">Accepter</button>`)).join('')}` : ''}
    <div class="sec">Mes contacts · ${C.contacts.length}</div>${C.contacts.length ? C.contacts.map(u => userRow(u)).join('') : '<p class="empty">Pas encore de contact. Envoyez un lien d’invitation à vos proches.</p>'}
    ${C.outgoing.length ? `<div class="sec">Demandes envoyées</div>${C.outgoing.map(u => userRow(u)).join('')}` : ''}
    ${C.suggestions.length ? `<div class="sec">Vous les connaissez peut-être</div>${C.suggestions.map(u => userRow(u)).join('')}` : ''}<div style="height:20px"></div>`;
}
let fqT;
async function searchPeople(q) {
  S.fq = q; clearTimeout(fqT);
  if (q.trim().length < 2) { S.fres = null; $('#fres').innerHTML = ''; return; }
  fqT = setTimeout(async () => { try { const r = await api('/api/users/search?q=' + encodeURIComponent(q.trim())); keepUsers(r.users); S.fres = r.users; const el = $('#fres'); if (el) el.innerHTML = r.users.length ? r.users.map(u => userRow(u)).join('') : '<p class="empty">Personne ne correspond.</p>'; } catch (e) { toast(e.message); } }, 300);
}
async function contactAct(kind, id) {
  try { const r = await api('/api/contacts/' + kind, {id}); keepUsers([r.user]); await loadContacts(); if (S.fres) S.fres = S.fres.map(u => u.id === id ? r.user : u); renderTabs(); renderBody();
    toast({request: 'Demande envoyée : la personne doit l’accepter.', accept: 'Vous êtes maintenant en contact.', decline: 'Demande refusée. La personne n’est pas prévenue.', remove: 'C’est fait.'}[kind]);
    if (layer.firstChild && $('.prof')) profSheet(id);
  } catch (e) { toast(e.message); }
}

/* ---------- profil d'une personne ---------- */
const PUB_L = [['bio', 'Qui suis-je'], ['metier', 'Métier ou études'], ['ville', 'Ville'], ['langues', 'Langues parlées'], ['interets', 'Centres d’intérêt']];
const PRIV_L = [['tel', 'Téléphone'], ['annee', 'Année de naissance'], ['mail', 'E-mail de contact'], ['adresse', 'Quartier ou adresse'], ['travail', 'Lieu de travail'], ['famille', 'Famille']];
function dl(rows) { const r = rows.filter(x => x[1]); return r.length ? `<dl class="dl">${r.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''; }
async function fillFp() { const a = $('#myFp'); if (a) a.textContent = await myFingerprint(); }
async function profSheet(id) {
  let u = uOf(id);
  try { const r = await api('/api/users/' + id); u = r.user; keepUsers([u]); } catch (e) { return toast(e.message); }
  const p = u.pub || {}, bd = p.bd && p.bm ? `${p.bd} ${MOIS[p.bm - 1]}` : '';
  sheet(`${head('Profil')}<div class="sheet-body"><div class="prof">${avatar(u, 'xl')}<b>${esc(u.name)}</b><span>@${esc(u.handle)}</span>${u.rel === 'contact' ? `<small>${u.online ? 'En ligne' : seenLabel(u.lastSeen)}</small>` : ''}${u.mutual ? `<small>${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun</small>` : ''}</div>
    ${dl(PUB_L.map(([k, l]) => [l, p[k]]).concat([['Anniversaire', bd]])) || '<p class="hint" style="text-align:center">Profil public encore vide.</p>'}
    ${u.rel === 'contact' && u.pubkey ? `<p class="hint">${I.shield} Code de sécurité de ${esc(first(u.name))} : <b class="fp" id="peerFp">…</b></p>` : ''}
    ${u.priv ? `<span class="lbl">${I.lock} Profil privé</span>${dl(PRIV_L.map(([k, l]) => [l, u.priv[k]])) || '<p class="hint">Rien de renseigné.</p>'}` : ''}
    ${u.rel === 'sent' ? '<p class="hint">Demande envoyée : vous pourrez échanger quand elle sera acceptée.</p>' : u.rel === 'none' ? '<p class="hint">Après votre demande, cette personne doit l’accepter pour que vous puissiez échanger.</p>' : ''}
    ${u.rel === 'me' ? '<p class="hint" style="text-align:center">C’est ainsi que les autres membres voient votre profil.</p>' : `<div class="actions">${u.rel === 'received' ? `<button class="btn ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button>` : ''}${u.blocked ? '' : relBtn(u).replace(/btn sm/g, 'btn')}</div>
    <div class="actions" style="justify-content:flex-start">${u.rel === 'contact' ? `<button class="btn sm ghost" type="button" data-act="cRemoveAsk" data-id="${u.id}">Retirer des contacts</button>` : ''}<button class="btn sm ghost" type="button" data-act="${u.blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${u.blocked ? 'Débloquer' : 'Bloquer'}</button><button class="btn sm ghost" type="button" data-act="reportAsk" data-id="${u.id}">Signaler</button></div>`}</div>`, 'Profil');
  const pf = $('#peerFp'); if (pf) pf.textContent = await E2E.fingerprint(u.pubkey);
}

/* ---------- discussion ---------- */
async function openChat(id) {
  S.chatId = id; S.replyTo = null;
  $('.app').dataset.view = 'chat'; renderMain(); if (S.tab === 'chats') renderBody();
  await loadMessages(id);
}
async function loadMessages(id, fresh) {
  try {
    const r = await api(`/api/chats/${id}/messages`); for (const m of r.messages) await reveal(m); S.msgs.set(id, r.messages); S.more.set(id, r.more);
    if (S.chatId === id) { renderMessages(); markRead(); }
  } catch (e) { toast(e.message); }
}
async function loadOlder() {
  const id = S.chatId, list = S.msgs.get(id) || []; if (!list.length) return;
  const box = $('#msgs'), h0 = box.scrollHeight;
  const r = await api(`/api/chats/${id}/messages?before=${list[0].id}`); for (const m of r.messages) await reveal(m); S.msgs.set(id, r.messages.concat(list)); S.more.set(id, r.more);
  renderMessages(true); box.scrollTop = box.scrollHeight - h0;
}
function renderMain() {
  const main = $('#main'); if (!main) return;
  const c = S.chats.get(S.chatId);
  if (!c) { main.innerHTML = `<div class="chat-empty">${LOGO}<b>${WORD}</b><span>Choisissez une discussion, ou invitez vos proches depuis l’onglet Contacts.</span></div>`; return; }
  main.innerHTML = `<header class="chat-head" id="chatHead"></header><div class="msgs" id="msgs" tabindex="0" aria-label="Messages"></div><div id="replyBar"></div><div id="compose"></div>`;
  renderChatHead(); renderComposer(); renderMessages();
  $('#msgs').addEventListener('scroll', e => { if (e.target.scrollTop < 40 && S.more.get(S.chatId) && !S.loadingOld) { S.loadingOld = true; loadOlder().finally(() => { S.loadingOld = false; }); } });
}
function renderChatHead() {
  const c = S.chats.get(S.chatId), h = $('#chatHead'); if (!c || !h) return;
  const tu = typingIn(c.id); let sub;
  if (c.type === 'group') sub = tu ? `<small class="on">${esc(first(uOf(tu).name))} écrit…</small>` : `<small>${c.members.map(m => m.id === S.me.id ? 'Vous' : first(uOf(m.id).name)).join(', ')}</small>`;
  else { const u = uOf(c.peer); sub = tu ? '<small class="on">écrit…</small>' : `<small${u.online ? ' class="on"' : ''}>${u.online ? 'en ligne' : seenLabel(u.lastSeen)}</small>`; }
  h.innerHTML = `<button class="ib back" type="button" data-act="back" aria-label="Retour">${I.back}</button>
    <button class="chat-id" type="button" data-act="chatInfo">${c.type === 'group' ? grpAv(c, 'sm') : avatar(uOf(c.peer), 'sm')}<span style="min-width:0"><b>${esc(chatTitle(c))}</b>${sub}</span></button>
    <button class="ib" type="button" data-act="chatMenu" aria-label="Options de la discussion">${I.more}</button>`;
}
function renderComposer() {
  const c = S.chats.get(S.chatId), el = $('#compose'); if (!c || !el) return;
  if (c.type === 'direct' && c.blocked) {
    const u = uOf(c.peer), mine = (S.me.blocked || []).some(b => b.id === c.peer);
    el.innerHTML = `<div class="blocked-bar">${I.block}<span>${mine ? `Vous avez bloqué ${esc(first(u.name))}.` : 'Vous ne pouvez plus écrire à cette personne.'}</span>${mine ? `<button class="btn sm ghost" type="button" data-act="unblock" data-id="${u.id}">Débloquer</button>` : ''}</div>`; return;
  }
  el.innerHTML = `<form class="composer" data-form="send" autocomplete="off"><div class="inwrap"><textarea id="msgIn" rows="1" placeholder="Message" aria-label="Écrire un message" maxlength="4000"></textarea>
    <button class="ib" type="button" data-act="attach" aria-label="Joindre une photo">${I.clip}</button><button class="ib" type="button" data-act="camera" aria-label="Prendre une photo">${I.camera}</button></div>
    <input type="file" id="fileIn" accept="image/*" hidden><input type="file" id="camIn" accept="image/*" capture="environment" hidden>
    <button class="send" type="submit" aria-label="Envoyer">${I.send}</button></form>`;
}
function quoteHtml(c, id) {
  const q = (S.msgs.get(c.id) || []).find(x => x.id === id); if (!q) return '';
  return `<span class="quote" data-act="jump" data-id="${q.id}"><b>${esc(q.from === S.me.id ? 'Vous' : uOf(q.from).name)}</b><span>${esc(snippet(q))}</span></span>`;
}
function renderMessages(keep) {
  const c = S.chats.get(S.chatId), box = $('#msgs'); if (!c || !box) return;
  const list = S.msgs.get(c.id); if (!list) { box.innerHTML = '<p class="empty">Chargement…</p>'; return; }
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  let h = S.more.get(c.id) ? '<button class="btn sm ghost more-old" type="button" data-act="older">Messages plus anciens</button>' : '';
  if (!list.length) h += `<div class="sys">Début de la discussion. Les messages sont visibles uniquement par ${c.type === 'group' ? 'les membres du groupe' : 'vous deux'}.</div>`;
  let pd = null, pf = null;
  for (const m of list) {
    const d = dayStart(m.at); if (d !== pd) { h += `<div class="day">${dayLabel(m.at)}</div>`; pd = d; pf = null; }
    if (m.kind === 'sys') { h += `<div class="sys">${esc(m.text)}</div>`; pf = null; continue; }
    const out = m.from === S.me.id, isFirst = m.from !== pf; pf = m.from;
    const u = uOf(m.from);
    let body;
    if (m.deleted) body = `<span class="txt gone">${out ? 'Vous avez supprimé ce message' : 'Ce message a été supprimé'}</span>`;
    else body = (m.replyTo ? quoteHtml(c, m.replyTo) : '') + (m.media ? (m.enc ? `<img class="photo" data-enc="${m.id}" alt="Photo chiffrée"${E2E.imgs.has(m.id) ? ` src="${E2E.imgs.get(m.id)}"` : ''} data-act="zoom">` : `<img class="photo" src="${esc(m.media)}" alt="Photo" loading="lazy" data-act="zoom">`) : '') + (m.text ? `<span class="txt">${esc(m.text)}</span>` : '');
    h += `<div class="msg ${out ? 'out' : 'in'}${isFirst ? ' first' : ''}" data-mid="${m.id}"><div class="bubble">
      ${!out && c.type === 'group' && isFirst ? `<span class="who" style="--h:${(m.from * 67) % 360}">${esc(u.name)}</span>` : ''}${body}<span class="meta">${hm(m.at)}${out && !m.deleted ? tick(readState(c, m)) : ''}</span>
      ${m.deleted ? '' : `<button class="msg-more" type="button" data-act="msgMenu" data-id="${m.id}" aria-label="Options du message">${I.chev}</button>`}</div></div>`;
  }
  const tu = typingIn(c.id); if (tu) h += `<div class="msg in first typing-b"><div class="bubble" aria-label="En train d’écrire"><span class="dots"><i></i><i></i><i></i></span></div></div>`;
  box.innerHTML = h;
  if (!keep || atBottom) box.scrollTop = box.scrollHeight;
  hydrateImgs(c.id);
}
function onMsg(m, update) { reveal(m).then(() => onMsgIn(m, update)); }
async function hydrateImgs(chatId) {
  const list = S.msgs.get(chatId) || [];
  for (const el of document.querySelectorAll('#msgs img[data-enc]:not([src])')) {
    const m = list.find(x => x.id === +el.dataset.enc); if (!m || !m._key || !m.miv) continue;
    try {
      const r = await fetch(m.media, {credentials: 'same-origin'}); const buf = await r.arrayBuffer();
      const url = URL.createObjectURL(new Blob([await E2E.decBytes(m._key, m.miv, buf)], {type: 'image/jpeg'}));
      E2E.imgs.set(m.id, url); const box = $('#msgs'), stick = box && box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      el.src = url; el.onload = () => { if (stick && box) box.scrollTop = box.scrollHeight; };
    } catch { el.alt = 'Photo illisible sur cet appareil'; }
  }
}
function onMsgIn(m, update) {
  let c = S.chats.get(m.chatId);
  if (!c) { S.typing.delete(m.chatId); if (m.from) S.lastFrom.set(m.chatId + ':' + m.from, Date.now()); loadChats().then(() => { renderAll(); const cc = S.chats.get(m.chatId); if (cc && m.from !== S.me.id && !update) notify(cc, m); }); return; }
  const list = S.msgs.get(m.chatId);
  if (list) { const i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; else if (!update) list.push(m); }
  if (!update || (c.last && c.last.id === m.id)) c.last = m;
  if (m.from !== S.me.id && !update) {
    S.typing.delete(m.chatId); S.lastFrom.set(m.chatId + ':' + m.from, Date.now());
    const visible = S.chatId === m.chatId && !document.hidden && ($('.app').dataset.view === 'chat' || matchMedia('(min-width:821px)').matches);
    if (visible) markRead(); else { c.unread = (c.unread || 0) + 1; notify(c, m); }
  } else if (m.from === S.me.id) { const me = c.members.find(x => x.id === S.me.id); if (me) me.lastRead = Math.max(me.lastRead, m.id); }
  if (S.chatId === m.chatId) renderMessages(true);
  renderTabs(); if (S.tab === 'chats') renderBody();
}
let readT;
function markRead() {
  const c = S.chats.get(S.chatId), list = S.msgs.get(S.chatId); if (!c || !list || !list.length) return;
  const last = list[list.length - 1].id; c.unread = 0; const me = c.members.find(x => x.id === S.me.id); if (me) me.lastRead = Math.max(me.lastRead, last);
  clearTimeout(readT); readT = setTimeout(() => api(`/api/chats/${c.id}/read`, {upTo: last}).catch(() => {}), 300);
  renderTabs(); if (S.tab === 'chats') renderBody();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.chatId) markRead(); });
function notify(c, m) {
  const who = m.from ? uOf(m.from).name : '', t = c.type === 'group' ? `${c.name} · ${first(who)}` : who;
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { const n = new Notification(t, {body: snippet(m).slice(0, 120), tag: 'tt-' + c.id, icon: '/icon.svg'}); n.onclick = () => { window.focus(); openChat(c.id); n.close(); }; } catch {}
  } else if (!document.hidden) toast(`${t} : ${snippet(m).slice(0, 80)}`);
}
let typT = 0;
function recipients(c) {
  const out = [], missing = [];
  for (const mm of c.members) { if (mm.id === S.me.id) { out.push([mm.id, E2E.pubJwk]); continue; } const u = uOf(mm.id); if (u.pubkey) out.push([mm.id, u.pubkey]); else missing.push(first(u.name)); }
  if (missing.length) throw new Error(`${missing.join(', ')} doi${missing.length > 1 ? 'vent' : 't'} d’abord ouvrir tam-tam une fois pour activer le chiffrement.`);
  return out;
}
async function sendText() {
  const i = $('#msgIn'), t = i.value.trim(), c = S.chats.get(S.chatId); if (!t || !c) return;
  i.value = ''; autoGrow(i); const reply = S.replyTo; S.replyTo = null; renderReplyBar();
  try {
    const {env} = await E2E.seal({t}, recipients(c));
    const body = {enc: env}; if (reply) body.replyTo = reply;
    const r = await api(`/api/chats/${c.id}/messages`, body); onMsg(r.msg);
  } catch (e) { toast(e.message); i.value = t; }
}
function autoGrow(t) { t.style.height = '42px'; t.style.height = Math.min(130, t.scrollHeight) + 'px'; }
function renderReplyBar() {
  const c = S.chats.get(S.chatId), el = $('#replyBar'); if (!el || !c) return;
  el.innerHTML = S.replyTo ? `<div class="replybar">${quoteHtml(c, S.replyTo)}<button class="ib" type="button" data-act="replyCancel" aria-label="Annuler la réponse">${I.close}</button></div>` : '';
}

/* ---------- photos ---------- */
function shrink(file, max = 1600) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('Choisissez une photo.'));
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cv.toBlob(b => b ? res(b) : rej(new Error('Photo illisible.')), 'image/jpeg', .85); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Cette photo n’a pas pu être lue.')); };
    im.src = url;
  });
}
async function upload(blob) { return api('/api/media', blob, {raw: true, type: 'image/jpeg'}); }
async function photoPreview(file) {
  let blob; try { blob = await shrink(file); } catch (e) { return toast(e.message); }
  const url = URL.createObjectURL(blob); S.pend = {blob, url};
  layer.innerHTML = `<div class="ph-prev" role="dialog" aria-modal="true" aria-label="Envoyer une photo"><div class="bar"><button class="ib" type="button" data-act="phCancel" aria-label="Annuler">${I.close}</button><b>Envoyer à ${esc(chatTitle(S.chats.get(S.chatId)))}</b></div>
    <div class="stage"><img src="${url}" alt="Aperçu"></div><form class="send-row" data-form="photo"><input id="phCap" maxlength="1000" placeholder="Ajouter une légende…"><button class="send" type="submit" aria-label="Envoyer">${I.send}</button></form></div>`;
  $('#phCap').focus();
}
async function sendPhoto() {
  const p = S.pend; if (!p) return; const cap = $('#phCap').value.trim(), btn = layer.querySelector('.send'); btn.disabled = true;
  try {
    const c = S.chats.get(S.chatId), sealed = await E2E.seal({t: cap}, recipients(c), await p.blob.arrayBuffer());
    const up = await api('/api/media', sealed.blob, {raw: true, type: 'application/octet-stream'});
    const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env}); E2E.imgs.set(r.msg.id, p.url); S.pend = null; closeLayer(); onMsg(r.msg);
  }
  catch (e) { toast(e.message); btn.disabled = false; }
}

/* ---------- feuilles ---------- */
const head = t => `<div class="sheet-head"><h2>${t}</h2><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>`;
function sheet(html, label, focus) {
  layer.innerHTML = `<div class="layer" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div></div>`;
  const f = layer.querySelector(focus || '.sheet button, .sheet input'); if (f) f.focus({preventScroll: true});
}
function closeLayer() { clearTimeout(svT); layer.innerHTML = ''; S.sv = null; if (S.pend) { URL.revokeObjectURL(S.pend.url); S.pend = null; } }
function confirmSheet(title, text, yes, act, id) {
  sheet(`${head(title)}<div class="sheet-body"><p>${text}</p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn danger" type="button" data-act="${act}" data-id="${id || ''}">${yes}</button></div></div>`, title);
}
function newChatSheet() {
  const cs = S.contacts.contacts;
  sheet(`${head('Nouvelle discussion')}<div class="menu"><button type="button" data-act="groupNew">${I.users}Nouveau groupe</button><button type="button" data-act="tab" data-t="contacts">${I.userplus}Inviter ou ajouter des contacts</button></div>
    <div class="sec" style="padding-top:0">Mes contacts</div><div class="sheet-scroll">${cs.length ? cs.map(u => `<button class="row" type="button" data-act="write" data-id="${u.id}">${avOn(u)}<span class="row-name">${esc(u.name)}</span><span class="row-prev"><span>@${esc(u.handle)}</span></span></button>`).join('') : '<p class="empty">Pas encore de contact.</p>'}</div>`, 'Nouvelle discussion');
}
function groupSheet(chat) {
  const inG = chat ? new Set(chat.members.map(m => m.id)) : new Set(), cs = S.contacts.contacts.filter(u => !inG.has(u.id));
  sheet(`${head(chat ? 'Ajouter des membres' : 'Nouveau groupe')}<form data-form="${chat ? 'groupAdd' : 'group'}"><div class="sheet-body">
    ${chat ? '' : '<div class="field"><label for="gName">Nom du groupe</label><input id="gName" maxlength="50" required placeholder="Ex. : Famille Ngosso"></div>'}
    <span class="lbl">Membres</span>${cs.length ? `<div class="picks">${cs.map(u => `<label class="pick"><input type="checkbox" name="gm" value="${u.id}">${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('')}</div>` : '<p class="hint">Aucun contact à ajouter.</p>'}
    <p class="err" id="gErr" role="alert" hidden></p><div class="actions"><button class="btn" type="submit">${chat ? 'Ajouter' : 'Créer le groupe'}</button></div></div></form>`, 'Groupe', chat ? 'input' : '#gName');
}
function chatMenu() {
  const c = S.chats.get(S.chatId); if (!c) return;
  const u = c.type === 'direct' ? uOf(c.peer) : null, blocked = u && (S.me.blocked || []).some(b => b.id === u.id);
  sheet(`${head(esc(chatTitle(c)))}<div class="menu">
    ${c.type === 'group' ? `<button type="button" data-act="chatInfo">${I.info}Infos du groupe</button><button type="button" data-act="groupAddOpen">${I.userplus}Ajouter des membres</button><button type="button" class="danger" data-act="leaveAsk">${I.back}Quitter le groupe</button>`
    : `<button type="button" data-act="prof" data-id="${u.id}">${I.info}Voir le profil</button><button type="button" class="danger" data-act="${blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${I.block}${blocked ? 'Débloquer ' : 'Bloquer '}${esc(first(u.name))}</button>`}
    <button type="button" class="danger" data-act="reportAsk" data-id="${u ? u.id : ''}" data-chat="${c.id}">${I.flag}Signaler</button></div>`, 'Options');
}
function groupInfo() {
  const c = S.chats.get(S.chatId); if (!c) return;
  sheet(`${head(esc(c.name))}<div class="sheet-body"><div class="prof">${grpAv(c, 'lg')}<b>${esc(c.name)}</b><span>Groupe · ${c.members.length} membres</span></div></div>
    <div class="sheet-scroll">${c.members.map(m => { const u = m.id === S.me.id ? S.me : uOf(m.id); return `<button class="row" type="button" data-act="${m.id === S.me.id ? 'close' : 'prof'}" data-id="${m.id}">${avOn(u)}<span class="row-name">${esc(m.id === S.me.id ? 'Vous' : u.name)}</span><span class="row-prev"><span>${m.admin ? 'Créateur du groupe' : '@' + esc(u.handle || '')}</span></span></button>`; }).join('')}</div>`, 'Infos du groupe');
}
function reportSheet(userId, chatId) {
  const reasons = ['Arnaque ou spam', 'Harcèlement ou menaces', 'Propos haineux ou racistes', 'Contenu choquant ou sexuel', 'Usurpation d’identité', 'Atteinte à un mineur', 'Autre motif'];
  S.rep = {userId: userId || null, chatId: chatId || null};
  sheet(`${head('Signaler')}<form data-form="report"><div class="sheet-body"><p>Votre signalement est confidentiel : la personne ne saura pas qu’il vient de vous. Le responsable de tam-tam l’examinera.</p>
    ${reasons.map((r, i) => `<label class="pick chk"><input type="radio" name="rr" value="${esc(r)}"${i ? '' : ''}><span>${esc(r)}</span></label>`).join('')}
    <div class="field"><label for="rrTxt">Précisions (facultatif)</label><textarea id="rrTxt" rows="3" maxlength="500"></textarea></div>
    ${S.chatId ? '<label class="pick chk"><input type="checkbox" id="rrAttach" checked><span>Joindre les 10 derniers messages de la discussion. Ils sont chiffrés : sans cela, le responsable ne peut pas les lire.</span></label>' : ''}
    ${userId ? '<label class="pick chk"><input type="checkbox" id="rrBlock" checked><span>Bloquer aussi cette personne</span></label>' : ''}
    <p class="err" id="rrErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn danger" type="submit">Signaler</button></div></div></form>`, 'Signaler');
}
function msgMenu(id) {
  const list = S.msgs.get(S.chatId) || [], m = list.find(x => x.id === id); if (!m || m.deleted) return;
  sheet(`<div class="menu" style="padding-top:12px"><button type="button" data-act="reply" data-id="${id}">${I.reply}Répondre</button>${m.text ? `<button type="button" data-act="copy" data-id="${id}">${I.copy}Copier le texte</button>` : ''}
    ${m.from === S.me.id ? `<button type="button" class="danger" data-act="delAsk" data-id="${id}">${I.trash}Supprimer pour tout le monde</button>` : ''}</div>`, 'Message');
}

/* ---------- statuts : création et lecture ---------- */
const BGS = [170, 200, 260, 300, 340, 20, 45, 130];
function stComposer() {
  S.sc = S.sc || {aud: 'public', bg: 170, text: '', blob: null, url: null};
  const s = S.sc, closeN = (S.me.close || []).length;
  layer.innerHTML = `<div class="st-comp" role="dialog" aria-modal="true" aria-label="Nouveau statut"><div class="chat-head"><button class="ib" type="button" data-act="stCancel" aria-label="Annuler">${I.close}</button><b style="flex:1">Nouveau statut</b><button class="btn sm" type="button" data-act="stPublish">Publier</button></div>
    <div class="stage"><div class="st-box" style="--h:${s.bg}">${s.url ? `<img src="${s.url}" alt="Aperçu">` : `<textarea id="stText" maxlength="700" placeholder="Écrivez votre statut…">${esc(s.text)}</textarea>`}</div></div>
    <div class="st-tools">
      <div class="seg" role="group" aria-label="Visibilité"><button type="button" data-act="stAud" data-a="public" aria-pressed="${s.aud === 'public'}">${I.globe}Public</button><button type="button" data-act="stAud" data-a="private" aria-pressed="${s.aud === 'private'}">${I.lock}Privé</button></div>
      <p class="hint">${s.aud === 'private' ? `Visible seulement par votre groupe privé (${closeN} personne${closeN > 1 ? 's' : ''}). <button class="linkb" type="button" data-act="closeEdit">Choisir les personnes</button>` : 'Visible par tous vos contacts pendant 24 heures.'}</p>
      ${s.url ? `<div class="field"><label for="stCap">Légende</label><input id="stCap" maxlength="700" value="${esc(s.text)}"></div><div><button class="btn sm ghost" type="button" data-act="stNoPhoto">Retirer la photo</button></div>`
      : `<div class="bgs">${BGS.map(h => `<button class="sw" type="button" style="--c:hsl(${h} 55% 35%)" data-act="stBg" data-h="${h}" aria-pressed="${s.bg === h}" aria-label="Couleur de fond"></button>`).join('')}</div><div><button class="btn sm ghost" type="button" data-act="stPhoto">${I.image}Ajouter une photo</button><input type="file" id="stIn" accept="image/*" hidden></div>`}
    </div></div>`;
  const t = $('#stText'); if (t) t.focus();
}
async function stPublish() {
  const s = S.sc; const t = ($('#stText') || $('#stCap') || {}).value; if (t != null) s.text = t;
  if (!s.blob && !s.text.trim()) return toast('Écrivez un texte ou ajoutez une photo.');
  if (s.aud === 'private' && !(S.me.close || []).length) return toast('Choisissez d’abord les personnes de votre groupe privé.');
  try { let media = null; if (s.blob) media = (await upload(s.blob)).id; await api('/api/statuses', {text: s.text, bg: s.bg, media, aud: s.aud}); S.sc = null; closeLayer(); await loadStatuses(); renderStories(); toast('Statut publié pour 24 heures'); }
  catch (e) { toast(e.message); }
}
let svT;
function stOpen(uid) {
  const g = uid === S.me.id ? {user: S.me, items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === uid);
  if (!g || !g.items.length) return; const i = Math.max(0, g.items.findIndex(x => !x.seen)); S.sv = {uid, i: uid === S.me.id ? 0 : i}; renderSV();
}
function renderSV() {
  const v = S.sv; if (!v) return;
  const mine = v.uid === S.me.id, g = mine ? {user: S.me, items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === v.uid);
  const it = g && g.items[v.i]; if (!it) return svNextUser();
  if (!mine && !it.seen) { it.seen = true; api(`/api/statuses/${it.id}/view`, {}).catch(() => {}); }
  const dur = 6000;
  layer.innerHTML = `<div class="sv" style="--h:${it.bg || 170}" role="dialog" aria-modal="true" aria-label="Statut"><div class="sv-bars">${g.items.map((_, k) => `<i class="${k < v.i ? 'done' : k === v.i ? 'run' : ''}"><b${k === v.i ? ` style="animation-duration:${dur / 1000}s"` : ''}></b></i>`).join('')}</div>
    <div class="sv-head">${avatar(g.user, 'sm')}<div class="grow"><b>${esc(mine ? 'Mon statut' : g.user.name)}</b><small>${dayLabel(it.at)}, ${hm(it.at)} · ${it.aud === 'private' ? 'Privé' : 'Public'}</small></div><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>
    <div class="sv-stage"><div class="sv-box">${it.media ? `<img src="${esc(it.media)}" alt="">` : `<div class="sv-text">${esc(it.text)}</div>`}${it.media && it.text ? `<div class="sv-cap">${esc(it.text)}</div>` : ''}
      <button class="sv-nav prev" type="button" data-act="svPrev" aria-label="Précédent"></button><button class="sv-nav next" type="button" data-act="svNext" aria-label="Suivant"></button></div></div>
    ${mine ? `<div class="sv-foot"><button class="btn sm ghost" type="button" data-act="svViews">${I.eye}${(it.views || []).length} vue${(it.views || []).length > 1 ? 's' : ''}</button><button class="btn sm ghost" type="button" data-act="stNew">${I.plus}Ajouter</button><button class="btn sm ghost" type="button" data-act="stDelAsk" data-id="${it.id}">${I.trash}Supprimer</button></div>` : ''}</div>`;
  clearTimeout(svT); svT = setTimeout(() => svStep(1), dur);
}
function svStep(d) {
  const v = S.sv; if (!v) return; const mine = v.uid === S.me.id, g = mine ? {items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === v.uid);
  const n = v.i + d; if (n < 0) { v.i = 0; return renderSV(); } if (!g || n >= g.items.length) return svNextUser(); v.i = n; renderSV();
}
function svNextUser() {
  const v = S.sv; if (!v || v.uid === S.me.id) { closeLayer(); renderStories(); return; }
  const k = S.statuses.others.findIndex(x => x.user.id === v.uid), nx = S.statuses.others[k + 1];
  for (const g of S.statuses.others) g.allSeen = g.items.every(i => i.seen);
  if (nx) { S.sv = {uid: nx.user.id, i: 0}; renderSV(); } else { closeLayer(); renderStories(); }
}

/* ---------- réglages ---------- */
function mailBox() {
  const m = S.mail;
  if (!m) return `<div class="set-block" id="mailBox"><h2>E-mails « mot de passe oublié »</h2><p class="hint">Réglez l’adresse qui envoie les codes de réinitialisation.</p><div><button class="btn sm" type="button" data-act="mailLoad">Afficher le réglage</button></div></div>`;
  return `<form class="set-block" id="mailBox" data-form="mail" autocomplete="off"><h2>E-mails « mot de passe oublié »</h2>
    <p class="hint">Créez d’abord l’adresse dans votre espace LWS (par exemple ne-pas-repondre@alveris-consulting.com), puis entrez ici ses informations d’envoi. Le mot de passe de cette adresse n’est jamais affiché.</p>
    <div class="field"><label for="mlHost">Serveur d’envoi (SMTP)</label><input id="mlHost" value="${esc(m.host || 'mail.alveris-consulting.com')}"></div>
    <div class="field"><label for="mlPort">Port</label><input id="mlPort" inputmode="numeric" value="${esc(m.port || 465)}"></div>
    <div class="field"><label for="mlUser">Identifiant (l’adresse e-mail)</label><input id="mlUser" type="email" value="${esc(m.user || '')}" placeholder="ne-pas-repondre@alveris-consulting.com"></div>
    <div class="field"><label for="mlPass">Mot de passe de cette adresse${m.hasPass ? ' (laisser vide pour garder l’actuel)' : ''}</label><input id="mlPass" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="mlFrom">Nom et adresse d’expéditeur</label><input id="mlFrom" value="${esc(m.from || 'tam-tam <ne-pas-repondre@alveris-consulting.com>')}"></div>
    <p class="err" id="mlErr" role="alert" hidden></p><p class="hint" id="mlOk" role="status" hidden></p>
    <div><button class="btn sm" type="submit">Enregistrer et envoyer un test</button></div></form>`;
}
function googleBox() {
  const g = S.gset;
  if (!g) return `<div class="set-block" id="gBox"><h2>${gIcon()} Connexion avec Google</h2><p class="hint">Permet aux membres de se connecter avec leur compte Google, sans mot de passe.</p><div><button class="btn sm" type="button" data-act="gLoad">Afficher le réglage</button></div></div>`;
  return `<form class="set-block" id="gBox" data-form="gset" autocomplete="off"><h2>${gIcon()} Connexion avec Google</h2>
    <p class="hint">${g.id && g.hasSecret ? '<b>Activée.</b> Le bouton « Continuer avec Google » apparaît sur la page de connexion.' : 'Collez ici les deux codes affichés par Google Cloud quand vous avez créé le client « tam-tam ».'} Le code secret n’est jamais réaffiché.</p>
    <div class="field"><label for="gId">ID client</label><input id="gId" value="${esc(g.id)}" placeholder="…apps.googleusercontent.com" spellcheck="false"></div>
    <div class="field"><label for="gSecret">Code secret du client${g.hasSecret ? ' (laisser vide pour garder l’actuel)' : ''}</label><input id="gSecret" type="password" autocomplete="off" spellcheck="false"></div>
    <p class="hint">Adresse de retour à déclarer chez Google : <b>${esc(g.redirect)}</b></p>
    <p class="err" id="gErr" role="alert" hidden></p><p class="hint" id="gOk" role="status" hidden></p>
    <div class="actions" style="justify-content:flex-start"><button class="btn sm" type="submit">Enregistrer</button>${g.id ? '<button class="btn sm ghost" type="button" data-act="gOff">Désactiver</button>' : ''}</div></form>`;
}
function settingsBody() {
  const me = S.me, p = me.pub || {}, pv = me.priv || {};
  const f = (set, k, l, ph = '', type = 'text', max = 80) => `<div class="field"><label for="p-${k}">${l}</label>${k === 'bio' ? `<textarea id="p-${k}" data-set="${set}" data-k="${k}" rows="2" maxlength="200" placeholder="${ph}">${esc((set === 'pub' ? p : pv)[k] || '')}</textarea>` : `<input id="p-${k}" data-set="${set}" data-k="${k}" type="${type}" maxlength="${max}" placeholder="${ph}" value="${esc((set === 'pub' ? p : pv)[k] || '')}">`}</div>`;
  const cs = S.contacts.contacts, close = new Set(me.close || []);
  return `<div class="set">
    <div class="set-top">${avatar(me, 'lg')}<div><b>${esc(me.name)}</b><span>@${esc(me.handle)} · ${esc(me.email)}</span></div></div>
    <div class="set-block"><h2>Photo ou avatar</h2>${avGallery(me.avatar, 'me')}
      <div class="actions" style="justify-content:flex-start"><button class="btn sm ghost" type="button" data-act="mePhoto">${I.camera}${me.photo ? 'Changer la photo' : 'Mettre une photo'}</button>${me.photo ? '<button class="btn sm ghost" type="button" data-act="meNoPhoto">Utiliser l’avatar</button>' : ''}<input type="file" id="meIn" accept="image/*" hidden></div></div>
    <div class="set-block"><h2>${I.globe} Profil public</h2><p class="hint">Visible par les membres de tam-tam, notamment quand quelqu’un veut vous ajouter.</p>
      <div class="field"><label for="p-name">Nom</label><input id="p-name" data-set="name" maxlength="40" value="${esc(me.name)}"></div>
      <div class="field"><label for="p-handle">Pseudo</label><input id="p-handle" data-set="handle" maxlength="24" value="${esc(me.handle)}"></div>
      ${f('pub', 'bio', 'Qui suis-je', 'Quelques mots sur vous')}${f('pub', 'metier', 'Métier ou études')}${f('pub', 'ville', 'Ville', 'Ex. : Dakar, Sénégal')}${f('pub', 'langues', 'Langues parlées', 'Ex. : Français, Wolof')}${f('pub', 'interets', 'Centres d’intérêt')}
      <div class="field"><span class="lbl">Jour et mois de naissance</span><div class="bd-row"><select id="p-bd" data-set="pub" data-k="bd" aria-label="Jour"><option value="">Jour</option>${Array.from({length: 31}, (_, i) => `<option value="${i + 1}"${+p.bd === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select><select id="p-bm" data-set="pub" data-k="bm" aria-label="Mois"><option value="">Mois</option>${MOIS.map((m, i) => `<option value="${i + 1}"${+p.bm === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></div></div>
      <div><button class="btn sm ghost" type="button" data-act="prof" data-id="${me.id}">${I.eye}Voir mon profil comme les autres</button></div></div>
    <div class="set-block"><h2>${I.lock} Profil privé</h2>
      <span class="lbl">Qui peut le voir</span><div class="chips">${[['me', 'Moi uniquement'], ['contacts', 'Tous mes contacts'], ['grp', 'Mon groupe privé']].map(([v, l]) => `<button class="chip" type="button" data-act="privTo" data-v="${v}" aria-pressed="${me.privTo === v}">${l}</button>`).join('')}</div>
      ${f('priv', 'tel', 'Téléphone', '+221 …', 'tel')}${f('priv', 'annee', 'Année de naissance', 'Ex. : 1985', 'number')}${f('priv', 'mail', 'E-mail de contact', '', 'email')}${f('priv', 'adresse', 'Quartier ou adresse')}${f('priv', 'travail', 'Lieu de travail')}${f('priv', 'famille', 'Famille')}</div>
    <div class="set-block"><h2>Groupe privé</h2><p class="hint">Ces contacts voient vos statuts privés${me.privTo === 'grp' ? ' et votre profil privé' : ''}.</p>
      ${cs.length ? `<div class="picks">${cs.map(u => `<label class="pick"><input type="checkbox" name="close" value="${u.id}"${close.has(u.id) ? ' checked' : ''}>${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('')}</div>` : '<p class="hint">Ajoutez d’abord des contacts.</p>'}</div>
    <div class="set-block"><h2>${I.shield} Chiffrement de bout en bout</h2><p class="hint">Vos messages et vos photos sont chiffrés sur votre appareil : seules les personnes de la discussion peuvent les lire, pas même le serveur.</p>
      <p>Votre code de sécurité : <b class="fp" id="myFp">…</b></p><p class="hint">Comparez-le avec celui qu’un proche voit sur votre profil pour vérifier que personne ne s’est glissé entre vous.</p>
      <div><button class="btn sm ghost" type="button" data-act="keyCode">${I.key}Changer le code de sauvegarde</button></div></div>
    ${lockSettingsHtml()}
    <div class="set-block"><h2>Notifications</h2><p class="hint">Recevez une alerte quand un message arrive alors que tam-tam est ouvert en arrière-plan.</p><div><button class="btn sm ghost" type="button" data-act="notif">${'Notification' in window && Notification.permission === 'granted' ? 'Notifications activées' : 'Activer les notifications'}</button></div></div>
    <div class="set-block"><h2>Personnes bloquées</h2>${(me.blocked || []).length ? me.blocked.map(u => `<div class="adm-row">${avatar(u, 'xs')}<span>${esc(u.name)}</span><button class="btn sm ghost" type="button" data-act="unblock" data-id="${u.id}">Débloquer</button></div>`).join('') : '<p class="hint">Personne n’est bloqué.</p>'}</div>
    <div class="set-block"><h2>Compte</h2><div class="actions" style="justify-content:flex-start"><button class="btn sm ghost" type="button" data-act="pwSheet">${I.key}Changer le mot de passe</button><a class="btn sm ghost" href="/conditions" target="_blank" rel="noopener">Conditions et confidentialité</a><a class="btn sm ghost" href="/demo/" target="_blank" rel="noopener">Voir la maquette</a></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn sm ghost" type="button" data-act="logout">Se déconnecter</button><button class="btn sm danger" type="button" data-act="delSheet">Supprimer mon compte</button></div></div>
    ${me.admin ? mailBox() : ''}
    ${me.admin ? googleBox() : ''}
    ${me.admin ? `<div class="set-block" id="adm"><h2>${I.shield} Administration</h2><div><button class="btn sm" type="button" data-act="admLoad">Afficher les membres et les signalements</button></div></div>` : ''}
    <p class="hint" style="text-align:center">tam-tam · version 1 de test</p></div>`;
}
let saveT, pending = {};
function queueSave(patch) {
  for (const k of Object.keys(patch)) { if (typeof patch[k] === 'object' && patch[k] && !Array.isArray(patch[k])) pending[k] = Object.assign(pending[k] || {}, patch[k]); else pending[k] = patch[k]; }
  clearTimeout(saveT); saveT = setTimeout(async () => { const body = pending; pending = {}; try { const r = await api('/api/me', body); S.me = r.me; keepUsers([r.me]); } catch (e) { toast(e.message); } }, 700);
}
async function saveNow(body, msg) { try { const r = await api('/api/me', body); S.me = r.me; keepUsers([r.me]); renderBody(); renderHead(); if (msg) toast(msg); } catch (e) { toast(e.message); } }
async function adminLoad() {
  try {
    const r = await api('/api/admin'), el = $('#adm');
    el.innerHTML = `<h2>${I.shield} Administration</h2><p class="hint">${r.counts.users} membres · ${r.counts.chats} discussions · ${r.counts.messages} messages</p>
      <span class="lbl">Signalements à traiter</span>${r.reports.length ? r.reports.map(x => `<div class="adm-row"><span><b>${esc(x.reason)}</b><small>par ${esc(x.by)}${x.target ? ' · contre ' + esc(x.target) : ''}${x.chat ? ' · discussion ' + esc(x.chat.name || 'à deux') : ''} · ${listTime(x.created_at)}${x.note ? ' · « ' + esc(x.note) + ' »' : ''}</small></span><button class="btn sm ghost" type="button" data-act="admDone" data-id="${x.id}">Traité</button></div>`).join('') : '<p class="hint">Aucun signalement.</p>'}
      <span class="lbl">Membres</span>${r.users.map(u => `<div class="adm-row"><span><b>${esc(u.name)}</b>${u.online ? ' · en ligne' : ''}<small>@${esc(u.handle)} · ${esc(u.email)} · inscrit le ${new Date(u.created_at).toLocaleDateString('fr-FR')}</small></span>${u.id !== S.me.id ? `<button class="btn sm ghost" type="button" data-act="admReset" data-id="${u.id}">Lien mot de passe</button>` : ''}</div>`).join('')}`;
  } catch (e) { toast(e.message); }
}

/* ---------- actions ---------- */
const ACT = {
  ksLost() { S.ks.mode = 'lost'; renderKeySetup(); },
  ksBack() { S.ks.mode = 'restore'; renderKeySetup(); },
  async ksNew() { await E2E.forget(S.me.id); S.ks = {mode: 'new', fresh: true}; renderKeySetup(); },
  async lockBio() { try { if (await Lock.bioVerify(S.lock.bio)) unlock(); } catch { const e = $('#lkErr'); if (e) { e.textContent = 'Empreinte non reconnue. Utilisez votre schéma.'; e.hidden = false; } } },
  lockForgot() { confirmSheet('Se reconnecter ?', 'Vous allez être déconnecté. Reconnectez-vous avec votre e-mail et votre mot de passe, puis choisissez un nouveau schéma. Vos messages restent protégés par votre code de sauvegarde.', 'Me reconnecter', 'lockReset'); },
  async lockReset() { await Lock.set(S.me.id, {type: 'off', delay: 60}); ACT.logout(); },
  lockSetup() { lockSetupSheet(1); },
  async lockDelay(d) { S.lock.delay = +d.v; await Lock.set(S.me.id, S.lock); renderBody(); },
  async lockOff() { S.lock = {type: 'off', delay: 60}; await Lock.set(S.me.id, S.lock); renderBody(); toast('Verrouillage désactivé'); },
  async bioOn() { if (!await Lock.bioCheck()) return toast('Cet appareil ou ce navigateur ne propose pas l’empreinte ou le visage.'); try { S.lock.bio = await Lock.bioRegister(S.me); await Lock.set(S.me.id, S.lock); renderBody(); toast('Empreinte ou visage activé'); } catch { toast('L’enregistrement de l’empreinte a été annulé.'); } },
  async bioOff() { delete S.lock.bio; await Lock.set(S.me.id, S.lock); renderBody(); },
  async invShare() { try { await navigator.share({title: 'tam-tam', text: inviteText(), url: S.lastInvite.url}); } catch {} },
  async invContacts() {
    try { const c = await navigator.contacts.select(['name', 'tel'], {multiple: false}); const tel = c && c[0] && c[0].tel && c[0].tel[0]; if (!tel) return;
      location.href = `sms:${tel.replace(/\s+/g, '')}?body=${encodeURIComponent(inviteText())}`; } catch { toast('Le choix dans les contacts n’est pas disponible ici. Utilisez « Partager ».'); }
  },
  keyCode() { sheet(`${head('Changer le code de sauvegarde')}<form data-form="rekey"><div class="sheet-body"><p class="hint">Le nouveau code remplace l’ancien pour retrouver vos messages sur un autre appareil.</p><div class="field"><label for="rk1">Nouveau code (6 chiffres minimum)</label><input id="rk1" type="password" inputmode="numeric" autocomplete="new-password"></div><div class="field"><label for="rk2">Confirmez</label><input id="rk2" type="password" inputmode="numeric" autocomplete="new-password"></div><p class="err" id="rkErr" role="alert" hidden></p><div class="actions"><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Code', '#rk1'); },
  forgot() { A.mode = 'forgot'; A.step = 1; renderAuth(); },
  async gLoad() { try { S.gset = await api('/api/admin/google'); const el = $('#gBox'); if (el) el.outerHTML = googleBox(); } catch (e) { toast(e.message); } },
  async gOff() { try { await api('/api/admin/google', {off: true}); S.gset = await api('/api/admin/google'); $('#gBox').outerHTML = googleBox(); toast('Connexion Google désactivée'); } catch (e) { toast(e.message); } },
  async mailLoad() { try { const m = await api('/api/admin/mail'); S.mail = m; const el = $('#mailBox'); if (el) el.outerHTML = mailBox(); } catch (e) { toast(e.message); } },
  authMode(d) { A.mode = d.m; renderAuth(); },
  pwShow(d, el) { const i = el.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Voir' : 'Masquer'; },
  avSet(d) {
    const base = avNorm(d.who === 'auth' ? A.avatar : S.me.avatar), a = Object.assign({}, base);
    if (d.v === 't') a[d.k] = !a[d.k]; else a[d.k] = d.v;
    if (d.k === 'st' && FEM.includes(d.v) && !base.f) a.f = true;
    if (d.who === 'auth') { A.avatar = a; $('#avg-auth').outerHTML = avGallery(a, 'auth'); }
    else { S.me.avatar = a; const g = $('#avg-me'); if (g) g.outerHTML = avGallery(a, 'me'); clearTimeout(S.avT); S.avT = setTimeout(() => saveNow({avatar: a, photo: S.me.photo ? null : undefined}, 'Avatar enregistré'), 600); }
  },
  tab(d) { S.tab = d.t; closeLayer(); renderAll(); $('#body').scrollTop = 0; if (matchMedia('(max-width:820px)').matches) $('.app').dataset.view = 'list'; },
  fab() { newChatSheet(); },
  open(d) { openChat(+d.id); },
  back() { S.chatId = null; $('.app').dataset.view = 'list'; renderMain(); renderBody(); },
  async write(d) { closeLayer(); try { const r = await api('/api/chats/direct', {userId: +d.id}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat); S.tab = 'chats'; renderAll(); openChat(r.chat.id); } catch (e) { toast(e.message); } },
  close() { closeLayer(); },
  scrim(d, el, e) { if (e.target === el) closeLayer(); },
  invNew: async () => { try { S.lastInvite = await api('/api/invites', {}); renderBody(); } catch (e) { toast(e.message); } },
  invCopy() { const t = S.lastInvite.url; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Lien copié : collez-le dans un message à vos proches.'), () => toast('Sélectionnez le lien et copiez-le.')); },
  cRequest: d => contactAct('request', +d.id), cAccept: d => contactAct('accept', +d.id), cDecline: d => contactAct('decline', +d.id), cRemove: d => contactAct('remove', +d.id),
  cRemoveAsk(d) { confirmSheet('Retirer ce contact ?', 'Vous ne pourrez plus vous écrire tant que l’un de vous n’aura pas renvoyé de demande.', 'Retirer', 'cRemoveYes', d.id); },
  cRemoveYes(d) { closeLayer(); contactAct('remove', +d.id); },
  prof(d) { profSheet(+d.id); },
  blockAsk(d) { confirmSheet('Bloquer cette personne ?', 'Elle ne pourra plus vous écrire, vous ajouter ni voir vos statuts. Elle n’est pas prévenue.', 'Bloquer', 'blockYes', d.id); },
  async blockYes(d) { closeLayer(); try { const r = await api('/api/block', {id: +d.id, on: true}); S.me = r.me; await Promise.all([loadChats(), loadContacts(), loadStatuses()]); renderAll(); if (S.chatId) renderMain(); toast('Personne bloquée'); } catch (e) { toast(e.message); } },
  async unblock(d) { closeLayer(); try { const r = await api('/api/block', {id: +d.id, on: false}); S.me = r.me; await Promise.all([loadChats(), loadContacts()]); renderAll(); if (S.chatId) renderMain(); toast('Personne débloquée'); } catch (e) { toast(e.message); } },
  reportAsk(d) { reportSheet(d.id ? +d.id : null, d.chat ? +d.chat : null); },
  chatMenu() { chatMenu(); },
  chatInfo() { const c = S.chats.get(S.chatId); if (!c) return; if (c.type === 'group') groupInfo(); else profSheet(c.peer); },
  groupNew() { groupSheet(); },
  groupAddOpen() { groupSheet(S.chats.get(S.chatId)); },
  leaveAsk() { confirmSheet('Quitter le groupe ?', 'Vous ne recevrez plus les messages de ce groupe.', 'Quitter', 'leaveYes'); },
  async leaveYes() { closeLayer(); try { await api(`/api/chats/${S.chatId}/leave`, {}); S.chats.delete(S.chatId); S.chatId = null; $('.app').dataset.view = 'list'; renderMain(); renderAll(); } catch (e) { toast(e.message); } },
  attach() { $('#fileIn').click(); },
  camera() { $('#camIn').click(); },
  phCancel() { closeLayer(); },
  zoom(d, el) { layer.innerHTML = `<div class="zoom" data-act="close"><img src="${esc(el.src)}" alt="Photo"><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>`; },
  older() { loadOlder(); },
  msgMenu(d) { msgMenu(+d.id); },
  reply(d) { S.replyTo = +d.id; closeLayer(); renderReplyBar(); const i = $('#msgIn'); if (i) i.focus(); },
  replyCancel() { S.replyTo = null; renderReplyBar(); },
  jump(d) { const el = document.querySelector(`.msg[data-mid="${d.id}"]`); if (el) el.scrollIntoView({block: 'center', behavior: 'smooth'}); },
  copy(d) { const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); closeLayer(); if (m && navigator.clipboard) navigator.clipboard.writeText(m.text || '').then(() => toast('Texte copié')); },
  delAsk(d) { confirmSheet('Supprimer pour tout le monde ?', 'Le message sera remplacé par « Ce message a été supprimé » chez tous les membres.', 'Supprimer', 'delYes', d.id); },
  async delYes(d) { closeLayer(); try { await api(`/api/messages/${d.id}/delete`, {}); } catch (e) { toast(e.message); } },
  stNew(d, el, e) { e.stopPropagation(); stComposer(); },
  stOpen(d) { stOpen(+d.u); },
  stCancel() { if (S.sc && S.sc.url) URL.revokeObjectURL(S.sc.url); S.sc = null; closeLayer(); },
  stAud(d) { keepSt(); S.sc.aud = d.a; stComposer(); },
  stBg(d) { keepSt(); S.sc.bg = +d.h; stComposer(); },
  stPhoto() { keepSt(); $('#stIn').click(); },
  stNoPhoto() { keepSt(); URL.revokeObjectURL(S.sc.url); S.sc.blob = S.sc.url = null; stComposer(); },
  stPublish() { stPublish(); },
  closeEdit() { keepSt(); S.sc = S.sc; closeLayer(); S.tab = 'settings'; renderAll(); setTimeout(() => { const el = document.querySelector('input[name="close"]'); if (el) el.scrollIntoView({block: 'center'}); }, 50); toast('Cochez les personnes de votre groupe privé, puis revenez publier votre statut.'); },
  svNext() { svStep(1); }, svPrev() { svStep(-1); },
  svViews() {
    const it = S.statuses.mine.items[S.sv.i]; clearTimeout(svT);
    sheet(`${head('Vu par')}<div class="sheet-scroll">${(it.views || []).length ? it.views.map(v => `<div class="row">${avatar(v.user)}<span class="row-name">${esc(v.user.name)}</span><span class="row-prev"><span>${dayLabel(v.at)}, ${hm(v.at)}</span></span></div>`).join('') : '<p class="empty">Personne pour l’instant.</p>'}</div>`, 'Vu par');
  },
  stDelAsk(d) { clearTimeout(svT); confirmSheet('Supprimer ce statut ?', 'Il disparaîtra pour tous vos contacts.', 'Supprimer', 'stDelYes', d.id); },
  async stDelYes(d) { closeLayer(); try { await api(`/api/statuses/${d.id}/delete`, {}); await loadStatuses(); renderStories(); toast('Statut supprimé'); } catch (e) { toast(e.message); } },
  privTo(d) { saveNow({privTo: d.v}); },
  mePhoto() { $('#meIn').click(); },
  meNoPhoto() { saveNow({photo: null}, 'Avatar rétabli'); },
  notif() { if (!('Notification' in window)) return toast('Votre navigateur ne permet pas les notifications.'); Notification.requestPermission().then(p => { renderBody(); toast(p === 'granted' ? 'Notifications activées' : 'Notifications refusées dans le navigateur'); }); },
  pwSheet() { sheet(`${head('Changer le mot de passe')}<form data-form="pw"><div class="sheet-body"><div class="field"><label for="pwOld">Mot de passe actuel</label><input id="pwOld" type="password" autocomplete="current-password"></div><div class="field"><label for="pwNew">Nouveau mot de passe (8 caractères minimum)</label><input id="pwNew" type="password" autocomplete="new-password"></div><p class="err" id="pwErr" role="alert" hidden></p><div class="actions"><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Mot de passe', '#pwOld'); },
  delSheet() { sheet(`${head('Supprimer mon compte')}<form data-form="del"><div class="sheet-body"><p>Votre compte, votre profil, vos photos et vos statuts seront effacés. Vos messages seront remplacés par « Ce message a été supprimé ». C’est définitif.</p><div class="field"><label for="delPw">Votre mot de passe pour confirmer</label><input id="delPw" type="password" autocomplete="current-password"></div><p class="err" id="delErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn danger" type="submit">Supprimer définitivement</button></div></div></form>`, 'Supprimer', '#delPw'); },
  async logout() { await api('/api/logout', {}).catch(() => {}); if (es) es.close(); S.me = null; location.href = '/'; },
  admLoad() { adminLoad(); },
  async admDone(d) { await api('/api/admin/report-done', {id: +d.id}).catch(e => toast(e.message)); adminLoad(); },
  async admReset(d) { try { const r = await api('/api/admin/reset', {userId: +d.id}); sheet(`${head('Lien de réinitialisation')}<div class="sheet-body"><p>Envoyez ce lien à la personne (valable 2 jours). Il lui permet de choisir un nouveau mot de passe.</p><div class="invite-url">${esc(r.url)}</div><div class="actions"><button class="btn" type="button" data-act="copyTxt" data-t="${esc(r.url)}">${I.copy}Copier</button></div></div>`, 'Lien'); } catch (e) { toast(e.message); } },
  copyTxt(d) { navigator.clipboard && navigator.clipboard.writeText(d.t).then(() => toast('Copié')); },
};
function keepSt() { const t = ($('#stText') || $('#stCap') || {}).value; if (t != null && S.sc) S.sc.text = t; }

const FORMS = {
  auth: submitAuth,
  keys: submitKeys,
  async rekey() { const a = $('#rk1').value, b = $('#rk2').value, er = $('#rkErr'); if (!/^\d{6,}$/.test(a)) { er.textContent = 'Le code doit contenir au moins 6 chiffres.'; er.hidden = false; return; } if (a !== b) { er.textContent = 'Les deux codes ne sont pas identiques.'; er.hidden = false; return; }
    try { await api('/api/keys', {pubkey: E2E.pubJwk, backup: await E2E.backup(a)}); closeLayer(); toast('Code de sauvegarde changé'); } catch (e) { er.textContent = e.message; er.hidden = false; } },
  async mail(f) { const v = id => $('#' + id).value.trim(), er = $('#mlErr'), ok = $('#mlOk'); er.hidden = true; ok.hidden = true;
    try { await api('/api/admin/mail', {host: v('mlHost'), port: +v('mlPort'), user: v('mlUser'), pass: $('#mlPass').value, from: v('mlFrom'), test: true}); ok.textContent = `Réglage enregistré. Un e-mail de test a été envoyé à ${S.me.email}.`; ok.hidden = false; $('#mlPass').value = ''; }
    catch (e) { er.textContent = e.message; er.hidden = false; } },
  async gset() { const er = $('#gErr'), ok = $('#gOk'); er.hidden = true; ok.hidden = true;
    try { await api('/api/admin/google', {id: $('#gId').value.trim(), secret: $('#gSecret').value}); S.gset = await api('/api/admin/google'); $('#gBox').outerHTML = googleBox(); const o = $('#gOk'); o.textContent = 'Enregistré. Déconnectez-vous pour voir le bouton « Continuer avec Google ».'; o.hidden = false; }
    catch (e) { er.textContent = e.message; er.hidden = false; } },
  send: sendText,
  photo: sendPhoto,
  async group(f) {
    const ids = [...f.querySelectorAll('input[name="gm"]:checked')].map(i => +i.value), name = $('#gName').value.trim(), err = $('#gErr');
    if (!name) { err.textContent = 'Donnez un nom au groupe.'; err.hidden = false; return; }
    if (!ids.length) { err.textContent = 'Choisissez au moins un membre.'; err.hidden = false; return; }
    try { const r = await api('/api/chats/group', {name, members: ids}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat); closeLayer(); S.tab = 'chats'; renderAll(); openChat(r.chat.id); } catch (e) { err.textContent = e.message; err.hidden = false; }
  },
  async groupAdd(f) {
    const ids = [...f.querySelectorAll('input[name="gm"]:checked')].map(i => +i.value); if (!ids.length) return closeLayer();
    try { const r = await api(`/api/chats/${S.chatId}/members`, {add: ids}); S.chats.set(r.chat.id, r.chat); keepUsers(Object.values(r.chat.users)); closeLayer(); renderChatHead(); } catch (e) { toast(e.message); }
  },
  async report(f) {
    const r = f.querySelector('input[name="rr"]:checked'), err = $('#rrErr'); if (!r) { err.textContent = 'Choisissez un motif.'; err.hidden = false; return; }
    try {
      let note = $('#rrTxt').value; const at = $('#rrAttach');
      if (at && at.checked) note += '\n\nDerniers messages joints par la personne qui signale :\n' + (S.msgs.get(S.chatId) || []).filter(m => m.kind !== 'sys').slice(-10).map(m => `[${new Date(m.at).toLocaleString('fr-FR')}] ${m.from === S.me.id ? S.me.name : uOf(m.from).name} : ${m.deleted ? '(supprimé)' : (m.media ? '[photo] ' : '') + (m.text || '')}`).join('\n');
      await api('/api/report', {userId: S.rep.userId, chatId: S.rep.chatId || S.chatId, reason: r.value, note});
      const bl = $('#rrBlock'); if (bl && bl.checked) { const x = await api('/api/block', {id: S.rep.userId, on: true}); S.me = x.me; await Promise.all([loadChats(), loadContacts(), loadStatuses()]); renderAll(); if (S.chatId) renderMain(); }
      closeLayer(); toast('Signalement envoyé. Merci.');
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  },
  async pw() { try { await api('/api/me/password', {old: $('#pwOld').value, pass: $('#pwNew').value}); closeLayer(); toast('Mot de passe changé'); } catch (e) { const er = $('#pwErr'); er.textContent = e.message; er.hidden = false; } },
  async del() { try { await api('/api/me/delete', {pass: $('#delPw').value}); location.href = '/'; } catch (e) { const er = $('#delErr'); er.textContent = e.message; er.hidden = false; } },
};

/* ---------- événements ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.dataset.act !== 'scrim') e.preventDefault();
  if (el.dataset.act === 'scrim' && e.target !== el) return;
  fn(el.dataset, el, e);
});
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); const fn = FORMS[f.dataset.form]; if (fn) fn(f); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; renderBody(); }
  else if (t.id === 'fq') searchPeople(t.value);
  else if (t.id === 'msgIn') { autoGrow(t); const n = Date.now(); if (n - typT > 2500 && t.value.trim()) { typT = n; api(`/api/chats/${S.chatId}/typing`, {}).catch(() => {}); } }
  else if (t.dataset && (t.dataset.set === 'pub' || t.dataset.set === 'priv') && t.tagName !== 'SELECT') queueSave({[t.dataset.set]: {[t.dataset.k]: t.value}});
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'fileIn' || t.id === 'camIn') { const f = t.files[0]; t.value = ''; if (f) photoPreview(f); }
  else if (t.id === 'stIn') { const f = t.files[0]; t.value = ''; if (!f) return; try { const b = await shrink(f); S.sc.blob = b; S.sc.url = URL.createObjectURL(b); stComposer(); } catch (er) { toast(er.message); } }
  else if (t.id === 'meIn') { const f = t.files[0]; t.value = ''; if (!f) return; try { const b = await shrink(f, 800); const up = await upload(b); saveNow({photo: up.id}, 'Photo de profil enregistrée'); } catch (er) { toast(er.message); } }
  else if (t.name === 'close') { const ids = [...document.querySelectorAll('input[name="close"]:checked')].map(i => +i.value); saveNow({close: ids}); }
  else if (t.dataset.set === 'name' || t.dataset.set === 'handle') saveNow({[t.dataset.set]: t.value}, 'Enregistré');
  else if (t.tagName === 'SELECT' && t.dataset.set) queueSave({[t.dataset.set]: {[t.dataset.k]: t.value}});
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && layer.firstChild) closeLayer();
  else if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'msgIn' && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); sendText(); }
  else if (S.sv && e.key === 'ArrowRight') svStep(1); else if (S.sv && e.key === 'ArrowLeft') svStep(-1);
});
document.addEventListener('contextmenu', e => { const m = e.target.closest('.msg[data-mid] .bubble'); if (!m || !S.me) return; e.preventDefault(); msgMenu(+m.parentNode.dataset.mid); });
let pressT, pressXY = [0, 0];
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return; const b = e.target.closest('.msg[data-mid] .bubble'); if (!b || e.target.closest('button,img')) return;
  pressXY = [e.clientX, e.clientY]; clearTimeout(pressT); pressT = setTimeout(() => msgMenu(+b.parentNode.dataset.mid), 520);
});
document.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) clearTimeout(pressT); }, true);
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => clearTimeout(pressT), true));
setInterval(() => { if (S.me && S.tab === 'chats') renderBody(); }, 60_000);

/* ---------- clés de chiffrement : création ou récupération ---------- */
async function keySetup(reupload) {
  let bk = null; try { bk = (await api('/api/keys/backup')).backup; } catch {}
  const mode = reupload ? 'new' : bk ? 'restore' : 'new';
  S.ks = {mode, bk};
  renderKeySetup();
}
function renderKeySetup(msg) {
  const k = S.ks, top = `<div class="auth-top">${LOGO}<h1 class="brand">${WORD}</h1></div>`;
  const h = k.mode === 'restore'
    ? `<h2>${I.lock} Retrouver vos messages</h2><p class="hint">Vos messages sont chiffrés de bout en bout. Sur ce nouvel appareil ou ce navigateur, entrez votre code de sauvegarde pour les relire.</p>
      <div class="field"><label for="kCode">Code de sauvegarde</label><input id="kCode" type="password" inputmode="numeric" autocomplete="off"></div>
      <p class="err" id="kErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Retrouver mes messages</button>
      <button class="linkb" type="button" data-act="ksLost">J’ai oublié mon code</button>`
    : k.mode === 'lost'
    ? `<h2>Code oublié</h2><p>Sans le code, les anciens messages chiffrés ne peuvent plus être relus sur cet appareil. Personne ne peut les récupérer, pas même le responsable de tam-tam.</p><p class="hint">Vous pouvez repartir avec une nouvelle clé : vos contacts verront que votre code de sécurité a changé, et les nouveaux messages seront lisibles.</p>
      <div class="actions"><button class="btn ghost" type="button" data-act="ksBack">Réessayer mon code</button><button class="btn danger" type="button" data-act="ksNew">Repartir avec une nouvelle clé</button></div>`
    : `<h2>${I.lock} Protéger vos messages</h2><p class="hint">tam-tam chiffre vos messages et vos photos de bout en bout : seuls les appareils des personnes qui discutent peuvent les lire, pas même le serveur.</p>
      <p class="hint">Choisissez un <b>code de sauvegarde</b> (au moins 6 chiffres). Il vous servira à retrouver vos messages si vous changez de téléphone. Notez-le en lieu sûr : personne ne pourra le retrouver pour vous.</p>
      <div class="field"><label for="kCode">Code de sauvegarde</label><input id="kCode" type="password" inputmode="numeric" autocomplete="new-password"></div>
      <div class="field"><label for="kCode2">Confirmez le code</label><input id="kCode2" type="password" inputmode="numeric" autocomplete="new-password"></div>
      <p class="err" id="kErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Activer le chiffrement</button>`;
  root.innerHTML = `<div class="auth"><form class="auth-card" data-form="keys" novalidate>${top}${h}</form></div>`;
  const f = root.querySelector('input'); if (f) f.focus();
}
async function submitKeys() {
  const k = S.ks, code = ($('#kCode') || {}).value || '', btn = root.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    if (k.mode === 'restore') {
      if (!await E2E.restore(S.me.id, code, k.bk)) { if (btn) btn.disabled = false; return renderKeySetup('Code incorrect. Vérifiez et réessayez.'); }
    } else {
      if (!/^\d{6,}$/.test(code)) { if (btn) btn.disabled = false; return renderKeySetup('Le code doit contenir au moins 6 chiffres.'); }
      if (code !== $('#kCode2').value) { if (btn) btn.disabled = false; return renderKeySetup('Les deux codes ne sont pas identiques.'); }
      if (!E2E.ready() || S.ks.fresh) await E2E.create(S.me.id);
      await api('/api/keys', {pubkey: E2E.pubJwk, backup: await E2E.backup(code)});
      S.me.pubkey = E2E.pubJwk;
    }
    const r = await api('/api/me'); S.me = r.me; keepUsers([r.me]); start();
  } catch (e) { if (btn) btn.disabled = false; renderKeySetup(e.message); }
}
async function myFingerprint() { return E2E.fingerprint(E2E.pubJwk); }

/* ---------- verrouillage par schéma ou empreinte ---------- */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!S.me || !S.lock || S.lock.type === 'off') return;
  if (document.hidden) hiddenAt = Date.now();
  else if (!S.locked && Date.now() - hiddenAt >= (S.lock.delay || 0) * 1000) { S.locked = true; showLock(); }
});
function patternPad(id) { return `<div class="pad" id="${id}" role="group" aria-label="Schéma de déverrouillage">${Array.from({length: 9}, (_, i) => `<span class="pd" data-i="${i}"></span>`).join('')}<svg class="pad-line" viewBox="0 0 300 300" aria-hidden="true"><polyline points=""/></svg></div>`; }
function bindPad(id, done) {
  const pad = $('#' + id); if (!pad) return; let seq = [], on = false;
  const dots = [...pad.querySelectorAll('.pd')], line = pad.querySelector('polyline');
  const center = i => { const r = pad.getBoundingClientRect(), d = dots[i].getBoundingClientRect(); return [(d.left + d.width / 2 - r.left) / r.width * 300, (d.top + d.height / 2 - r.top) / r.height * 300]; };
  const hit = (x, y) => dots.findIndex(d => { const b = d.getBoundingClientRect(); return x > b.left - 14 && x < b.right + 14 && y > b.top - 14 && y < b.bottom + 14; });
  const draw = () => { line.setAttribute('points', seq.map(i => center(i).join(',')).join(' ')); dots.forEach((d, i) => d.classList.toggle('on', seq.includes(i))); };
  const add = e => { const i = hit(e.clientX, e.clientY); if (i >= 0 && !seq.includes(i)) { seq.push(i); draw(); if (navigator.vibrate) navigator.vibrate(8); } };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); on = true; seq = []; pad.setPointerCapture(e.pointerId); add(e); });
  pad.addEventListener('pointermove', e => { if (on) add(e); });
  const end = () => { if (!on) return; on = false; const s2 = seq.slice(); setTimeout(() => { seq = []; draw(); }, 350); if (s2.length) done(s2); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
function showLock(msg) {
  const L = S.lock; S.lockTries = S.lockTries || 0;
  let el = $('#lockScreen'); if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; el.className = 'lock-screen'; document.body.appendChild(el); }
  const wait = Math.ceil(((S.lockUntil || 0) - Date.now()) / 1000);
  el.innerHTML = `<div class="lock-card" role="dialog" aria-modal="true" aria-label="tam-tam est verrouillé"><div class="auth-top">${LOGO}<h1 class="brand">${WORD}</h1></div>
    ${avatar(S.me, 'lg')}<b>${esc(S.me.name)}</b><p class="hint">${wait > 0 ? `Trop d’essais. Réessayez dans ${wait} s.` : 'Dessinez votre schéma pour ouvrir tam-tam.'}</p>
    ${patternPad('lockPad')}<p class="err" id="lkErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p>
    ${L.bio ? `<button class="btn" type="button" data-act="lockBio">${I.key}Utiliser l’empreinte ou le visage</button>` : ''}
    <button class="linkb" type="button" data-act="lockForgot">Schéma oublié ? Me reconnecter avec mon mot de passe</button></div>`;
  bindPad('lockPad', async seq => {
    if ((S.lockUntil || 0) > Date.now()) return showLock();
    if (await Lock.hashPattern(seq, L.salt) === L.hash) return unlock();
    S.lockTries++; if (S.lockTries >= 5) { S.lockTries = 0; S.lockUntil = Date.now() + 30000; setTimeout(() => showLock(), 30500); return showLock(); }
    showLock(`Schéma incorrect. ${5 - S.lockTries} essai${5 - S.lockTries > 1 ? 's' : ''} restant${5 - S.lockTries > 1 ? 's' : ''}.`);
  });
  if (L.bio && !msg && !S.bioTried) { S.bioTried = true; setTimeout(() => ACT.lockBio(), 300); }
}
function unlock() { S.locked = false; S.lockTries = 0; S.bioTried = false; const el = $('#lockScreen'); if (el) el.remove(); if (S.chatId) markRead(); }
function lockSettingsHtml() {
  const L = S.lock || {type: 'off', delay: 60};
  return `<div class="set-block"><h2>${I.lock} Verrouillage de l’application</h2><p class="hint">Vous restez connecté, mais tam-tam demande votre schéma${L.bio ? ' ou votre empreinte' : ''} à chaque ouverture. Personne ne peut lire vos messages si on prend votre téléphone.</p>
    ${L.type === 'off' ? `<div><button class="btn sm" type="button" data-act="lockSetup">Choisir un schéma de déverrouillage</button></div>` : `
    <p>${I.check || ''} Verrouillage actif${L.bio ? ' · schéma + empreinte ou visage' : ' · schéma'}</p>
    <span class="lbl">Verrouiller après</span><div class="chips">${[[0, 'Tout de suite'], [60, '1 minute'], [300, '5 minutes'], [1800, '30 minutes']].map(([v, l]) => `<button class="chip" type="button" data-act="lockDelay" data-v="${v}" aria-pressed="${(L.delay || 0) === v}">${l}</button>`).join('')}</div>
    <div class="actions" style="justify-content:flex-start">${L.bio ? '<button class="btn sm ghost" type="button" data-act="bioOff">Retirer l’empreinte</button>' : `<button class="btn sm ghost" type="button" data-act="bioOn" id="bioBtn">${I.key}Ajouter l’empreinte ou le visage</button>`}<button class="btn sm ghost" type="button" data-act="lockSetup">Changer le schéma</button><button class="btn sm ghost" type="button" data-act="lockOff">Désactiver</button></div>`}</div>`;
}
function lockSetupSheet(step, first, msg) {
  sheet(`${head('Schéma de déverrouillage')}<div class="sheet-body" style="align-items:center"><p class="hint" style="text-align:center">${step === 2 ? 'Dessinez le même schéma pour confirmer.' : 'Reliez au moins 4 points sans lever le doigt.'}</p>${patternPad('setPad')}<p class="err" id="spErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p></div>`, 'Schéma');
  bindPad('setPad', async seq => {
    if (seq.length < 4) return lockSetupSheet(step, first, 'Reliez au moins 4 points.');
    if (step !== 2) return lockSetupSheet(2, seq);
    if (seq.join() !== first.join()) return lockSetupSheet(1, null, 'Les deux schémas sont différents. Recommencez.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    S.lock = Object.assign({delay: 60}, S.lock || {}, {type: 'pattern', salt, hash: await Lock.hashPattern(seq, salt)});
    await Lock.set(S.me.id, S.lock); closeLayer(); renderBody(); toast('Schéma enregistré : tam-tam se verrouillera automatiquement');
  });
}

/* ---------- inviter depuis le téléphone ---------- */
const inviteText = () => `Rejoins-moi sur tam-tam, la messagerie qui fait vivre nos langues : ${S.lastInvite.url}`;

boot();
