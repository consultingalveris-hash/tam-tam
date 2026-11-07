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
  if (data && data.me && S.me && data.me.id === S.me.id && typeof PP !== 'undefined' && PP.data) PP.attach(data.me);
  return data;
}
let toastT;
/* ---------- son des messages : un petit « tam-tam » joué par le navigateur, sans fichier ---------- */
const Sound = {
  ctx: null, last: 0,
  on() { try { return localStorage.getItem('tt:sound') !== 'off'; } catch { return true; } },
  set(v) { try { localStorage.setItem('tt:sound', v ? 'on' : 'off'); } catch {} },
  unlock() { try { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch {} },
  drum(t, f0, f1, dur, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * .8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .05);
    // la frappe de la main sur la peau
    const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * .03, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const hp = c.createBiquadFilter(), ng = c.createGain(); hp.type = 'bandpass'; hp.frequency.value = f0 * 6; ng.gain.value = vol * .35;
    n.buffer = b; n.connect(hp).connect(ng).connect(c.destination); n.start(t);
  },
  msg(force) {
    if (!force && (!this.on() || Date.now() - this.last < 1500)) return; this.last = Date.now();
    this.unlock(); const c = this.ctx; if (!c) return; const t = c.currentTime + .02;
    this.drum(t, 190, 95, .32, .55); this.drum(t + .16, 330, 170, .16, .35); this.drum(t + .30, 200, 100, .36, .5);
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate([60, 60, 60]); } catch {}
  },
};
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => Sound.unlock(), {passive: true}));
function toast(t) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3200); }

/* ---------- avatars ---------- */
function avatar(u, cls = '') {
  if (!u) return `<span class="av ${cls}"></span>`;
  if (u.photo) return `<span class="av ${cls}"><img src="${esc(u.photo)}" alt=""></span>`;
  return `<span class="av ${cls}" aria-hidden="true">${avFace(u.avatar)}</span>`;
}
const avOn = (u, cls) => `<span class="avw">${avatar(u, cls)}${u && u.busy ? '<span class="dot-on busy" aria-label="occupé"></span>' : u && u.online ? '<span class="dot-on" aria-label="en ligne"></span>' : ''}</span>`;
const presLabel = u => u.busy ? 'occupé' : u.online ? 'en ligne' : seenLabel(u.lastSeen);
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
  S.pendingChat = +((/[?&]chat=(\d+)/.exec(location.search) || [])[1] || 0);
  const p = location.pathname, inv = (p.match(/^\/invite\/([A-Za-z0-9_-]+)$/) || [])[1], rst = (p.match(/^\/reset\/([A-Za-z0-9_-]+)$/) || [])[1];
  if (inv) S.invite = inv;
  const qr = (p.match(/^\/add\/([A-Za-z0-9_-]+)$/) || [])[1]; if (qr) { S.qrAdd = qr; S.invite = qr; }
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
  const m = A.meta || {}, top = `<div class="auth-top"><h1 class="brand-h">${BRAND()}</h1></div>`;
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
    <button class="linkb" type="button" data-act="forgot">Mot de passe oublié ?</button>`;
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
    else if (A.mode === 'register') r = await api('/api/register', {name: v('aName'), email: v('aMail'), pass: v('aPass'), gtok: A.g ? A.g.tok : undefined, avatar: A.avatar, age: $('#aAge').checked, cgu: $('#aCgu').checked,  invite: S.invite});
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
  await PP.init().catch(() => {});
  api('/api/translate/status').then(r => { Tr.st = r; renderComposer(); }).catch(() => {});
  renderAll(); connect(); if (S.locked) showLock();
  GCall.loadActive(); Call.checkPending(); Device.badge();
  if (S.lock.type === 'off') return requireLock();
  if (S.pendingChat && S.chats.has(S.pendingChat)) openChat(S.pendingChat); S.pendingChat = 0;
  if (S.qrAdd) { const t = S.qrAdd; S.qrAdd = null; Qr.connect(t); }
}
function connect() {
  if (es) es.close();
  es = new EventSource('/api/stream');
  es.onmessage = e => { let ev; try { ev = JSON.parse(e.data); } catch { return; } onEvent(ev); };
  es.onerror = () => { /* le navigateur se reconnecte tout seul */ };
}
let resync = null;
function onEvent(ev) {
  if (ev.t === 'hello' && ev.v) { if (!S.ver) S.ver = ev.v; else if (S.ver !== ev.v) S.newVer = true; }
  if (S.newVer && !(typeof Call !== 'undefined' && Call.c) && !(typeof GCall !== 'undefined' && GCall.c) && !document.querySelector('#compose textarea:focus, .sheet')) { location.reload(); return; }
  if (ev.t === 'hello') { if (resync) { loadChats().then(renderAll); if (S.chatId) loadMessages(S.chatId, true); } resync = true; }
  else if (ev.t === 'msg') onMsg(ev.msg, ev.update);
  else if (ev.t === 'read') { const c = S.chats.get(ev.chatId); if (c) { const m = c.members.find(x => x.id === ev.user); if (m) m.lastRead = Math.max(m.lastRead, ev.upTo); if (S.chatId === ev.chatId) renderMessages(true); if (S.tab === 'chats') renderBody(); } }
  else if (ev.t === 'typing') { const k = ev.chatId; if (Date.now() - (S.lastFrom.get(k + ':' + ev.user) || 0) < 2500) return; S.typing.set(k, {user: ev.user, until: Date.now() + 4000}); refreshTyping(k); setTimeout(() => refreshTyping(k), 4100); }
  else if (ev.t === 'contacts') { loadContacts().then(() => { renderTabs(); if (S.tab !== 'chats') renderBody(); if (document.getElementById('addSheet') && typeof Add !== 'undefined') Add.loadPeople(); }); loadChats().then(() => { if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); }); }
  else if (ev.t === 'chats') loadChats().then(() => { if (S.tab === 'chats') renderBody(); if (S.chatId) renderMessages(true); });
  else if (ev.t === 'statuses') loadStatuses().then(renderStories);
  else if (ev.t === 'presence') { const u = S.users.get(ev.id); if (u) { u.online = ev.online; u.busy = ev.busy; u.lastSeen = ev.lastSeen; } if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); }
  else if (ev.t === 'read' && ev.user === S.me.id) Device.badge();
  else if (ev.t === 'gcall') GCall.onEvent(ev).catch(e => { console.error(e); toast('Problème pendant l’appel de groupe.'); });
  else if (ev.t === 'call') (ev.fromUser && keepUsers([ev.fromUser]), Call.onSignal(ev)).catch(e => { console.error(e); toast('Problème pendant l’appel.'); Call.hangup(); });
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
  else { m.text = r.payload.t || ''; m.miv = r.payload.miv || null; m._key = r.key; if (r.payload.o != null) { m.orig = r.payload.o; m.olang = r.payload.ol || ''; m.tlang = r.payload.tl || ''; m.fx = !!r.payload.fx; } if (r.payload.mime) m.amime = r.payload.mime; if (r.payload.dur) m.dur = r.payload.dur; }
  return m;
}
async function loadChats() { const r = await api('/api/chats'); const map = new Map(); for (const c of r.chats) { keepUsers(Object.values(c.users)); await reveal(c.last); map.set(c.id, c); } S.chats = map; }
async function loadContacts() {
  const r = await api('/api/contacts'); S.contacts = r;
  await Promise.all(r.contacts.filter(u => u.telEnv || u.privEnv).map(u => PP.reveal(u).catch(() => {})));
  keepUsers([...r.contacts, ...r.incoming, ...r.outgoing, ...r.suggestions]);
  if (PP.data) PP.check();
}
async function loadStatuses() {
  const r = await api('/api/statuses');
  for (const it of [...r.mine.items, ...r.others.flatMap(g => g.items)]) if (it.enc) {
    const o = E2E.ready() ? await E2E.open(it.enc, S.me.id) : {err: 1};
    if (o.err) { it.text = '🔒 Statut chiffré'; it.locked = true; } else { it.text = o.payload.t || ''; it.miv = o.payload.miv || null; it._key = o.key; it.font = o.payload.f || 0; it.vmime = o.payload.mime || null; it.dur = o.payload.dur || 0; it.mir = !!o.payload.mir; it.mmiv = o.payload.mmiv || null; it.mname = o.payload.mname || ''; }
  }
  S.statuses = r; keepUsers([r.mine.user, ...r.others.map(g => g.user)]);
}

function renderAll() { renderTabs(); renderHead(); renderBody(); }

/* ---------- liste ---------- */
const TABS = [['chats', 'Discussions', I.chats], ['contacts', 'Contacts', I.users], ['souvenirs', 'Souvenirs', I.image], ['calls', 'Appels', I.dialpad]];
function renderTabs() {
  const unread = [...S.chats.values()].filter(c => c.unread > 0 && (!c.hidden || S.showHidden)).length, inc = S.contacts.incoming.length;
  $('#tabs').innerHTML = TABS.map(([id, l, ic]) => `<button class="tab" type="button" data-act="tab" data-t="${id}"${S.tab === id ? ' aria-current="page"' : ''}><span class="pill">${ic}</span>${l}${id === 'chats' && unread ? `<span class="badge" aria-label="${unread} non lues">${unread}</span>` : ''}${id === 'contacts' && inc ? `<span class="badge" aria-label="${inc} demande${inc > 1 ? 's' : ''} d’ami">${inc}</span>` : ''}</button>`).join('');
  $('#fab').hidden = S.tab !== 'chats'; Device.badge(); const fc = $('#filts'); if (fc) fc.innerHTML = filtChips();
  const n = [...S.chats.values()].reduce((a, c) => a + (c.unread || 0), 0); document.title = n ? `(${n}) tam-tam` : 'tam-tam';
}
function filtChips() {
  const n = [...S.chats.values()].filter(c => c.unread > 0 && (!c.hidden || S.showHidden)).length;
  return [['all', 'Toutes'], ['unread', 'Non lues'], ['group', 'Groupes'], ['me', 'Mon profil']].map(([k, l]) => `<button class="chip" type="button" data-act="filt" data-f="${k}" aria-pressed="${(S.filt || 'all') === k}">${l}${k === 'unread' && n ? ` <span class="cnt">${n}</span>` : ''}</button>`).join('');
}
function renderHead() {
  const h = $('#head');
  if (S.tab === 'chats') {
    h.innerHTML = `<div class="title"><h1 class="brand-h">${BRAND()}</h1><span class="grow"></span><button class="ib dotted" type="button" data-act="addOpen" aria-label="Ajouter des amis${S.contacts.incoming.length ? ` (${S.contacts.incoming.length} demande${S.contacts.incoming.length > 1 ? 's' : ''})` : ''}" title="Ajouter des amis">${I.userplus}${S.contacts.incoming.length ? `<span class="badge">${S.contacts.incoming.length}</span>` : ''}</button><button class="ib" type="button" data-act="tab" data-t="settings" aria-label="Réglages et profil" title="Réglages et profil">${I.settings}</button></div>
      <div class="stories" id="stories" aria-label="Statuts"></div>
      <label class="search">${I.search}<span class="sr">Rechercher</span><input id="q" type="search" placeholder="Rechercher une discussion" value="${esc(S.q)}" autocomplete="off"></label>
      <div class="chips filt" id="filts" role="group" aria-label="Filtrer les discussions">${filtChips()}</div>`;
    renderStories();
  } else h.innerHTML = `<div class="title"><h1>${{contacts: 'Contacts', calls: 'Appels', settings: 'Réglages', souvenirs: 'Souvenirs'}[S.tab]}</h1><span class="grow"></span>${S.tab === 'settings' ? availPicker() : ''}${S.tab === 'souvenirs' ? `<button class="btn sm" type="button" data-act="memAdd">${I.plus}Ajouter</button>` : ''}${S.tab !== 'settings' ? `<button class="ib" type="button" data-act="tab" data-t="settings" aria-label="Réglages et profil" title="Réglages et profil">${I.settings}</button>` : ''}</div>`;
}
function renderBody() {
  const b = $('#body'); if (!b) return;
  if (S.tab === 'chats') b.innerHTML = Device.banner() + gcallBanner() + chatRows();
  else if (S.tab === 'contacts') { b.innerHTML = Book.body(); Book.after(); }
  else if (S.tab === 'calls') { b.innerHTML = Calls.body(); Calls.after(); }
  else if (S.tab === 'souvenirs') { b.innerHTML = Mem.body(); Mem.hydrate(b); }
  else { b.innerHTML = settingsBody(); fillFp(); }
}
const chatTitle = c => c.type === 'group' ? c.name : uOf(c.peer).name;
function snippet(m) {
  if (!m) return 'Aucun message';
  if (m.deleted) return 'Message supprimé'; if (m.kind === 'sys') return m.text; if (m.once) return m.kind === 'audio' ? '① Vocal à vue unique' : m.kind === 'video' ? '① Vidéo à vue unique' : m.media ? '① Photo à vue unique' : '① Message à vue unique'; if (m.kind === 'audio') return '🎤 Message vocal'; if (m.kind === 'video') return '🎥 Vidéo' + (m.text ? ' · ' + m.text : ''); if (m.locked) return m.text;
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
  let list = [...S.chats.values()].filter(c => (c.last || c.type === 'group' || c.id === S.chatId) && (!c.hidden || S.showHidden));
  Priv.watch(q);
  const fl = S.filt || 'all';
  if (fl === 'me') return profileEditor();
  if (fl === 'unread') list = list.filter(c => c.unread > 0); else if (fl === 'group') list = list.filter(c => c.type === 'group');
  const hitMsg = {};
  if (q && !(S.showHidden && Priv.isCode(q))) {
    Find.preload(q);
    list = list.filter(c => { if (chatTitle(c).toLowerCase().includes(q)) return true;
      const m = (S.msgs.get(c.id) || []).slice().reverse().find(m => !m.deleted && !m.once && m.kind !== 'sys' && typeof m.text === 'string' && m.text.toLowerCase().includes(q));
      if (m) { hitMsg[c.id] = m; return true; } return false; });
  }
  if (S.showHidden) list.sort((a, b) => (b.hidden ? 1 : 0) - (a.hidden ? 1 : 0));
  list.sort((a, b) => (b.last?.at || b.createdAt) - (a.last?.at || a.createdAt));
  const privBar = S.showHidden ? `<div class="privbar">${I.lock}<span>Discussions privées affichées</span><button class="btn sm ghost" type="button" data-act="privHide">Masquer</button></div>` : '';
  if (!list.length && fl !== 'all' && !q) return privBar + `<p class="empty">${{unread: 'Aucune discussion non lue.', group: 'Aucun groupe. Créez-en un avec le bouton turquoise.'}[fl]}</p>`;
  if (!list.length) return privBar + (q ? `<p class="empty">Aucune discussion ne correspond.</p>`
    : `<div class="empty"><p>Aucune discussion pour l’instant.</p><p>Invitez vos proches depuis l’onglet <b>Contacts</b>, puis appuyez sur le bouton turquoise pour leur écrire.</p><button class="btn" type="button" data-act="tab" data-t="contacts">${I.userplus}Inviter mes proches</button></div>`);
  return privBar + list.map(c => {
    const m = c.last, tu = typingIn(c.id), u = c.type === 'direct' ? uOf(c.peer) : null;
    let prev = esc(snippet(m));
    if (hitMsg[c.id]) prev = Find.mark(hitMsg[c.id].text, q);
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
const pseudoRow = u => `<div class="row">${avOn(u)}<button class="row-name linkless" type="button" data-act="prof" data-id="${u.id}" style="border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;align-items:flex-start;min-width:0"><b>@${esc(u.handle)}</b><small style="color:var(--fg-2);font-weight:400">${esc(u.name)}${u.mutual ? ` · ${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun` : ''}</small></button><span class="row-end">${relBtn(u)}</span></div>`;
const userRow = (u, extra) => `<div class="row">${avOn(u)}<button class="row-name linkless" type="button" data-act="prof" data-id="${u.id}" style="border:0;background:none;padding:0;text-align:left">${esc(u.name)}</button><span class="row-end">${extra || relBtn(u)}</span>
  <span class="row-prev"><span>@${esc(u.handle)}${u.pub && u.pub.ville ? ' · ' + esc(u.pub.ville) : ''}${u.mutual ? ` · ${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun` : ''}</span></span></div>`;
function contactsBody() {
  const C = S.contacts;
  return `<div class="invite-box"><div class="ib-head"><b>Invitez vos proches</b><button class="btn sm ghost" type="button" data-act="qrShow">${I.qr}Mon code QR</button></div><span class="hint">Seules les personnes qui ont un lien d’invitation peuvent s’inscrire. La personne invitée devient directement votre contact.</span>
      ${S.lastInvite ? `<div class="invite-url">${esc(S.lastInvite.url)}</div><div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-act="invCopy">${I.copy}Copier le lien</button><a class="btn sm ghost" href="https://wa.me/?text=${encodeURIComponent(inviteText())}" target="_blank" rel="noopener">WhatsApp</a>${navigator.share ? '<button class="btn sm ghost" type="button" data-act="invShare">Partager… (SMS, e-mail, autres)</button>' : ''}${'contacts' in navigator && navigator.contacts && navigator.contacts.select ? '<button class="btn sm ghost" type="button" data-act="invContacts">Choisir dans mes contacts</button>' : ''}</div><span class="hint">Valable 14 jours, pour 20 personnes au plus.</span>`
      : `<div><button class="btn" type="button" data-act="invNew">${I.userplus}Créer un lien d’invitation</button></div>`}</div>
    <div style="padding:0 16px"><label class="search">${I.search}<span class="sr">Chercher un membre</span><input id="fq" type="search" placeholder="Chercher un membre : nom, @pseudo ou e-mail" autocomplete="off" value="${esc(S.fq || '')}"></label></div>
    <div id="fres">${S.fres ? (S.fres.length ? S.fres.map(u => userRow(u)).join('') : '<p class="empty">Personne ne correspond.</p>') : ''}</div>
    ${C.incoming.length ? `<div class="sec">Demandes reçues · ${C.incoming.length}</div>${C.incoming.map(u => userRow(u, `<button class="btn sm ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button><button class="btn sm" type="button" data-act="cAccept" data-id="${u.id}">Accepter</button>`)).join('')}` : ''}
    <details class="drop" open><summary>${I.userplus}Trouver des amis${C.suggestions.length ? ` · ${C.suggestions.length}` : ''}</summary>
      ${C.suggestions.length ? C.suggestions.map(u => pseudoRow(u)).join('') : '<p class="empty">Pas de suggestion pour l’instant. Cherchez un membre par son nom ou son @pseudo ci-dessus.</p>'}</details>
    ${C.outgoing.length ? `<details class="drop"><summary>${I.clock || ''}Demandes envoyées · ${C.outgoing.length}</summary>${C.outgoing.map(u => pseudoRow(u)).join('')}</details>` : ''}
    <details class="drop"><summary>${I.users}Mes contacts · ${C.contacts.length}</summary>${C.contacts.length ? C.contacts.map(u => pseudoRow(u)).join('') : '<p class="empty">Pas encore de contact. Envoyez un lien d’invitation à vos proches.</p>'}</details>
    <p class="hint" style="padding:0 16px">Pour retrouver une discussion, tapez un nom ou un mot de la conversation dans la recherche de l’onglet <b>Discussions</b>.</p><div style="height:20px"></div>`;
}
let fqT;
async function searchPeople(q) {
  S.fq = q; clearTimeout(fqT);
  if (q.trim().length < 2) { S.fres = null; $('#fres').innerHTML = ''; return; }
  fqT = setTimeout(async () => { try { const r = await api('/api/users/search?q=' + encodeURIComponent(q.trim())); keepUsers(r.users); S.fres = r.users; const el = $('#fres'); if (el) el.innerHTML = r.users.length ? r.users.map(u => Add.row(u)).join('') : '<p class="empty">Personne ne correspond.</p>'; } catch (e) { toast(e.message); } }, 300);
}
async function contactAct(kind, id) {
  try { const r = await api('/api/contacts/' + kind, {id}); keepUsers([r.user]); await loadContacts(); if (S.fres) S.fres = S.fres.map(u => u.id === id ? r.user : u); renderTabs(); renderBody(); if ($('#addSheet')) Add.render(); Book.relUpdate(r.user);
    toast({request: 'Demande envoyée : la personne doit l’accepter.', accept: 'Vous êtes maintenant en contact.', decline: 'Demande refusée. La personne n’est pas prévenue.', remove: 'C’est fait.'}[kind]);
    if (layer.firstChild && $('.prof')) profSheet(id, !!$('.back-b'));
  } catch (e) { toast(e.message); }
}

/* ---------- profil d'une personne ---------- */
const PUB_L = [['bio', 'Qui suis-je'], ['metier', 'Métier ou études'], ['ville', 'Ville'], ['langues', 'Langues parlées'], ['interets', 'Centres d’intérêt']];
const PRIV_L = [['tel', 'Téléphone'], ['annee', 'Année de naissance'], ['mail', 'E-mail de contact'], ['adresse', 'Quartier ou adresse'], ['travail', 'Lieu de travail'], ['famille', 'Famille']];
function dl(rows) { const r = rows.filter(x => x[1]); return r.length ? `<dl class="dl">${r.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''; }
async function fillFp() { const a = $('#myFp'); if (a) a.textContent = await myFingerprint(); }
async function profSheet(id, back) {
  let u = uOf(id);
  try { const r = await api('/api/users/' + id); u = r.user; if (u.id !== S.me.id) await PP.reveal(u); else PP.data && PP.attach(u); keepUsers([u]); } catch (e) { return toast(e.message); }
  const p = u.pub || {}, bd = p.bd && p.bm ? `${p.bd} ${MOIS[p.bm - 1]}` : '';
  sheet(`${back ? `<div class="sheet-head"><button class="ib back-b" type="button" data-act="profBack" aria-label="Retour à la liste">${I.back}</button><h2 style="flex:1">Profil</h2><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>` : head('Profil')}<div class="sheet-body"><div class="prof">${avatar(u, 'xl')}<b>${esc(u.name)}</b><span>@${esc(u.handle)}</span>${u.rel === 'contact' ? `<small>${presLabel(u).replace(/^./, x => x.toUpperCase())}</small>` : ''}${u.mutual ? `<small>${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun</small>` : ''}</div>
    ${dl(PUB_L.map(([k, l]) => [l, p[k]]).concat([['Anniversaire', bd]])) || '<p class="hint" style="text-align:center">Profil public encore vide.</p>'}
    ${u.rel === 'contact' && u.pubkey ? `<p class="hint">${I.shield} Code de sécurité de ${esc(first(u.name))} : <b class="fp" id="peerFp">…</b></p>` : ''}
    ${u.limTheirs ? `<p class="hint">${I.lock} Ajouté par code QR : vous voyez seulement son profil public.</p>` : ''}
    ${u.limMine ? `<div class="qrnote"><span>${I.lock} Contact ajouté avec votre code QR : ${esc(first(u.name))} ne voit pas votre profil privé (téléphone, adresse…).</span><button class="btn sm ghost" type="button" data-act="sharePriv" data-id="${u.id}">Lui montrer mon profil privé</button></div>` : ''}
    ${picsView(u.pics, 'Photos publiques')}
    ${u.rel !== 'me' ? '<div id="profMem"></div>' : ''}
    ${u.priv ? `<div class="nocopy"><span class="lbl">${I.lock} Profil privé</span>${dl(PRIV_L.map(([k, l]) => [l, u.priv[k]])) || '<p class="hint">Rien de renseigné.</p>'}${picsView(u.privPics, 'Photos privées')}${u.id !== S.me.id ? watermark() : ''}</div>` : ''}
    ${u.rel === 'contact' ? `<div class="qrnote"><span>${I.phone || ''} ${u.telMine ? `${esc(first(u.name))} voit votre numéro de téléphone.` : `${esc(first(u.name))} ne voit pas votre numéro de téléphone.`}</span><button class="btn sm ghost" type="button" data-act="shareTel" data-id="${u.id}" data-on="${u.telMine ? '' : '1'}">${u.telMine ? 'Ne plus montrer mon numéro' : 'Lui montrer mon numéro'}</button></div>` : ''}
    ${u.rel === 'sent' ? '<p class="hint">Demande envoyée : vous pourrez échanger quand elle sera acceptée.</p>' : u.rel === 'none' ? '<p class="hint">Après votre demande, cette personne doit l’accepter pour que vous puissiez échanger.</p>' : ''}
    ${u.rel === 'me' ? '<p class="hint" style="text-align:center">C’est ainsi que les autres membres voient votre profil.</p>' : `<div class="actions">${u.rel === 'received' ? `<button class="btn ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button>` : ''}${u.blocked ? '' : relBtn(u).replace(/btn sm/g, 'btn')}</div>
    <div class="actions" style="justify-content:flex-start">${u.rel === 'contact' ? `<button class="btn sm ghost" type="button" data-act="cRemoveAsk" data-id="${u.id}">Retirer des contacts</button>` : ''}<button class="btn sm ghost" type="button" data-act="${u.blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${u.blocked ? 'Débloquer' : 'Bloquer'}</button><button class="btn sm ghost" type="button" data-act="reportAsk" data-id="${u.id}">Signaler</button></div>`}</div>`, 'Profil');
  if (u.rel !== 'me' && typeof Mem !== 'undefined') Mem.profBlock(u.id);
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
  if (!c) { main.innerHTML = `<div class="chat-empty">${BRAND('empty')}<span>Choisissez une discussion, ou invitez vos proches depuis l’onglet Contacts.</span></div>`; return; }
  main.innerHTML = `<header class="chat-head" id="chatHead"></header><div class="msgs${c.hidden ? ' nocopy' : ''}" id="msgs" tabindex="0" aria-label="Messages"></div><div id="replyBar"></div><div id="compose"></div>`;
  renderChatHead(); renderComposer(); renderMessages();
  $('#msgs').addEventListener('scroll', e => { if (e.target.scrollTop < 40 && S.more.get(S.chatId) && !S.loadingOld) { S.loadingOld = true; loadOlder().finally(() => { S.loadingOld = false; }); } });
}
function renderChatHead() {
  const c = S.chats.get(S.chatId), h = $('#chatHead'); if (!c || !h) return;
  const tu = typingIn(c.id); let sub;
  if (c.type === 'group') sub = tu ? `<small class="on">${esc(first(uOf(tu).name))} écrit…</small>` : `<small>${c.members.map(m => m.id === S.me.id ? 'Vous' : first(uOf(m.id).name)).join(', ')}</small>`;
  else { const u = uOf(c.peer); sub = tu ? '<small class="on">écrit…</small>' : `<small class="${u.busy ? 'busy' : u.online ? 'on' : ''}">${presLabel(u)}</small>`; }
  h.innerHTML = `<button class="ib back" type="button" data-act="back" aria-label="Retour">${I.back}</button>
    <button class="chat-id" type="button" data-act="chatInfo">${c.type === 'group' ? grpAv(c, 'sm') : avatar(uOf(c.peer), 'sm')}<span style="min-width:0"><b>${esc(chatTitle(c))}</b>${sub}</span></button>
    ${c.type === 'direct' && !c.blocked ? `<button class="ib" type="button" data-act="callVideo" aria-label="Appel vidéo">${I.video}</button><button class="ib" type="button" data-act="callAudio" aria-label="Appel vocal">${I.phone}</button>` : ''}
    ${c.type === 'group' ? (GCall.active(c.id) && !(GCall.c && GCall.c.chatId === c.id) ? `<button class="btn sm gjoin" type="button" data-act="gcallJoin" data-id="${GCall.active(c.id).callId}">${I.phone}Rejoindre</button>` : `<button class="ib" type="button" data-act="gcallVideo" aria-label="Appel vidéo de groupe">${I.video}</button><button class="ib" type="button" data-act="gcallAudio" aria-label="Appel vocal de groupe">${I.phone}</button>`) : ''}
    <button class="ib" type="button" data-act="chatMenu" aria-label="Options de la discussion">${I.more}</button>`;
}
function renderComposer() {
  const c = S.chats.get(S.chatId), el = $('#compose'); if (!c || !el) return;
  if (c.type === 'direct' && c.blocked) {
    const u = uOf(c.peer), mine = (S.me.blocked || []).some(b => b.id === c.peer);
    el.innerHTML = `<div class="blocked-bar">${I.block}<span>${mine ? `Vous avez bloqué ${esc(first(u.name))}.` : 'Vous ne pouvez plus écrire à cette personne.'}</span>${mine ? `<button class="btn sm ghost" type="button" data-act="unblock" data-id="${u.id}">Débloquer</button>` : ''}</div>`; return;
  }
  const trOn = !!(Tr.inL(c.id) || Tr.outL(c.id));
  el.innerHTML = `<form class="composer" data-form="send" autocomplete="off">${Tr.st && Tr.st.on ? `<button class="ib tr-tog" type="button" data-act="trAuto" aria-pressed="${trOn}" aria-label="Langues de cette discussion" title="Langues de traduction de cette discussion">${I.translate}${Tr.label(c.id)}</button>` : ''}<div class="inwrap">${Emoji.btn('#msgIn')}<textarea id="msgIn" rows="1" placeholder="${S.once ? 'Message à vue unique' : 'Message'}" aria-label="Écrire un message" maxlength="4000"></textarea>
    <button class="ib" type="button" data-act="attach" aria-label="Joindre une photo ou une vidéo">${I.clip}</button><button class="ib" type="button" data-act="camera" aria-label="Prendre une photo ou une vidéo">${I.camera}</button><button class="ib once-tog" type="button" data-act="onceTog" aria-pressed="${!!S.once}" aria-label="Vue unique" title="Vue unique : le message ne peut être ouvert qu’une fois"><span class="one" aria-hidden="true">1</span></button></div>
    <input type="file" id="fileIn" accept="image/*,video/*" hidden><input type="file" id="camIn" accept="image/*" capture="environment" hidden>
    <button class="send" id="sendBtn" type="button" data-act="recStart" aria-label="Enregistrer un message vocal">${I.mic}</button></form>`;
}
// Le bouton rond est un micro tant que rien n'est écrit ; il devient « Envoyer » dès qu'on écrit.
function syncSend() {
  const b = $('#sendBtn'), i = $('#msgIn'); if (!b || !i) return; const has = !!i.value.trim();
  if (has && b.type !== 'submit') { b.type = 'submit'; delete b.dataset.act; b.setAttribute('aria-label', 'Envoyer'); b.innerHTML = I.send; }
  else if (!has && b.type === 'submit') { b.type = 'button'; b.dataset.act = 'recStart'; b.setAttribute('aria-label', 'Enregistrer un message vocal'); b.innerHTML = I.mic; }
}
/* ---------- messages vocaux ---------- */
const Rec = {
  async start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Ce navigateur ne permet pas d’enregistrer la voix.');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); } catch { return toast('Autorisez le micro pour envoyer un message vocal.'); }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? {mimeType: mime, audioBitsPerSecond: 32000} : undefined), chunks = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    this.cur = {mr, stream, chunks, t0: Date.now(), mime: mr.mimeType || mime || 'audio/webm', chat: S.chatId};
    mr.start(500);
    const el = $('#compose'); el.innerHTML = `<div class="recbar" role="group" aria-label="Enregistrement d’un message vocal"><button class="ib" type="button" data-act="recCancel" aria-label="Annuler l’enregistrement">${I.trash}</button><span class="rec-dot" aria-hidden="true"></span><span class="rec-t" id="recT">0:00</span><span class="grow hint">${S.once ? 'Vocal à vue unique · ' : ''}Enregistrement…</span><button class="send" type="button" data-act="recSend" aria-label="Envoyer le message vocal">${I.send}</button></div>`;
    this.tick = setInterval(() => { const s = Math.floor((Date.now() - this.cur.t0) / 1000), t = $('#recT'); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 300) this.send(); }, 250);
  },
  stop() { const c = this.cur; this.cur = null; clearInterval(this.tick); if (!c) return null; return new Promise(res => { c.mr.onstop = () => { c.stream.getTracks().forEach(t => t.stop()); res(c); }; try { c.mr.stop(); } catch { res(c); } }); },
  async cancel() { await this.stop(); renderComposer(); },
  async send() {
    const c = await this.stop(); renderComposer(); if (!c) return;
    const dur = Math.round((Date.now() - c.t0) / 1000); if (dur < 1 || !c.chunks.length) return toast('Message trop court : gardez le micro un peu plus longtemps.');
    const chat = S.chats.get(c.chat); if (!chat) return;
    try {
      const blob = new Blob(c.chunks, {type: c.mime}), once = !!S.once; S.once = false;
      const sealed = await E2E.seal({t: '', mime: c.mime.split(';')[0], dur}, recipients(chat), await blob.arrayBuffer());
      const up = await api('/api/media', sealed.blob, {raw: true, type: 'application/octet-stream'});
      const r = await api(`/api/chats/${chat.id}/messages`, {media: up.id, enc: sealed.env, kind: 'audio', once});
      if (!once) E2E.auds.set(r.msg.id, URL.createObjectURL(blob)); renderComposer(); onMsg(r.msg);
    } catch (e) { toast(e.message); }
  },
};
async function hydrateAuds(chatId) {
  const list = S.msgs.get(chatId) || [];
  for (const el of document.querySelectorAll('#msgs audio[data-aud]:not([src])')) {
    const id = +el.dataset.aud; if (E2E.auds.has(id)) { el.src = E2E.auds.get(id); continue; }
    const m = list.find(x => x.id === id); if (!m || !m._key || !m.miv) continue;
    try { const r = await fetch(m.media, {credentials: 'same-origin'}); const url = URL.createObjectURL(new Blob([await E2E.decBytes(m._key, m.miv, await r.arrayBuffer())], {type: m.amime || 'audio/webm'})); E2E.auds.set(id, url); el.src = url; }
    catch { const w = el.closest('.voice'); if (w) w.insertAdjacentHTML('beforeend', '<small class="hint">Message vocal illisible sur cet appareil</small>'); }
  }
}
function quoteHtml(c, id) {
  const q = (S.msgs.get(c.id) || []).find(x => x.id === id); if (!q) return '';
  return `<span class="quote" data-act="jump" data-id="${q.id}"><b>${esc(q.from === S.me.id ? 'Vous' : uOf(q.from).name)}</b><span>${esc(snippet(q))}</span></span>`;
}
function onceBubble(m, out) {
  const what = m.kind === 'audio' ? 'Vocal' : m.kind === 'video' ? 'Vidéo' : m.media ? 'Photo' : 'Message', mine = (m.opened || []).includes(S.me.id);
  if (out) return `<span class="once-b"><span class="one" aria-hidden="true">1</span><span>${what} à vue unique<small>${(m.opened || []).length ? 'Ouvert' : 'Envoyé'}</small></span></span>`;
  if (mine) return `<span class="once-b done"><span class="one" aria-hidden="true">1</span><span>${what} à vue unique<small>Ouvert</small></span></span>`;
  return `<button class="once-b go" type="button" data-act="onceOpen" data-id="${m.id}"><span class="one" aria-hidden="true">1</span><span>${what} à vue unique<small>Touchez pour ${m.kind === 'audio' ? 'écouter' : m.kind === 'video' ? 'regarder' : m.media ? 'voir' : 'lire'} · une seule fois</small></span></button>`;
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
    else if (m.once) body = onceBubble(m, out);
    else if (m.kind === 'video') body = (m.replyTo ? quoteHtml(c, m.replyTo) : '') + `<div class="vidb"><video class="photo vid" data-vid="${m.id}" playsinline controls preload="metadata" controlslist="nodownload"${E2E.vids.has(m.id) ? ` src="${E2E.vids.get(m.id)}"` : ''}></video>${m.dur ? `<small class="vid-d">${Math.floor(m.dur / 60)}:${String(m.dur % 60).padStart(2, '0')}</small>` : ''}</div>` + (m.text ? Tr.txt(m) : '');
    else if (m.kind === 'audio') body = `<div class="voice">${I.mic}<audio controls preload="metadata" data-aud="${m.id}"></audio>${m.dur ? `<small>${Math.floor(m.dur / 60)}:${String(m.dur % 60).padStart(2, '0')}</small>` : ''}</div>`;
    else body = (m.replyTo ? quoteHtml(c, m.replyTo) : '') + (m.media ? (m.enc ? `<img class="photo" data-enc="${m.id}" alt="Photo chiffrée"${E2E.imgs.has(m.id) ? ` src="${E2E.imgs.get(m.id)}"` : ''} data-act="zoom">` : `<img class="photo" src="${esc(m.media)}" alt="Photo" loading="lazy" data-act="zoom">`) : '') + (m.text ? Tr.txt(m) : '');
    h += `<div class="msg ${out ? 'out' : 'in'}${isFirst ? ' first' : ''}" data-mid="${m.id}"><div class="bubble">
      ${!out && c.type === 'group' && isFirst ? `<span class="who" style="--h:${(m.from * 67) % 360}">${esc(u.name)}</span>` : ''}${body}<span class="meta">${hm(m.at)}${out && !m.deleted ? tick(readState(c, m)) : ''}</span>
      ${m.deleted ? '' : `<button class="msg-more" type="button" data-act="msgMenu" data-id="${m.id}" aria-label="Options du message">${I.chev}</button>`}</div></div>`;
  }
  const tu = typingIn(c.id); if (tu) h += `<div class="msg in first typing-b"><div class="bubble" aria-label="En train d’écrire"><span class="dots"><i></i><i></i><i></i></span></div></div>`;
  box.innerHTML = h;
  if (!keep || atBottom) box.scrollTop = box.scrollHeight;
  hydrateImgs(c.id); hydrateAuds(c.id); if (typeof hydrateVids === 'function') hydrateVids(c.id); Tr.autoRun(c);
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
/* ---------- recadrer la photo de profil ---------- */
function cropPhoto(file) {
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    S.crop = {im, url, z: 1, x: 0, y: 0, rot: 0};
    sheet(`${head('Ajuster la photo')}<div class="sheet-body crop-body"><p class="hint">Faites glisser la photo avec le doigt et zoomez pour bien cadrer votre visage.</p>
      <div class="crop-stage"><canvas id="cropCv" width="560" height="560" aria-label="Aperçu de la photo"></canvas></div>
      <div class="crop-tools"><span aria-hidden="true">−</span><input id="cropZoom" type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom"><span aria-hidden="true">+</span><button class="ib" type="button" data-act="cropRot" aria-label="Tourner la photo">${I.rotate || '⟳'}</button></div>
      <div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="button" data-act="cropOk">Utiliser cette photo</button></div></div>`, 'Ajuster la photo');
    const cv = $('#cropCv'); let drag = null;
    cv.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, ox: S.crop.x, oy: S.crop.y}; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const k = cv.width / cv.getBoundingClientRect().width; S.crop.x = drag.ox + (e.clientX - drag.x) * k; S.crop.y = drag.oy + (e.clientY - drag.y) * k; drawCrop(); });
    cv.addEventListener('pointerup', () => { drag = null; }); cv.addEventListener('pointercancel', () => { drag = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); S.crop.z = Math.min(4, Math.max(1, S.crop.z * (e.deltaY < 0 ? 1.08 : 0.93))); $('#cropZoom').value = S.crop.z; drawCrop(); }, {passive: false});
    drawCrop();
  };
  im.onerror = () => { URL.revokeObjectURL(url); toast('Photo illisible.'); };
  im.src = url;
}
function paintCrop(ctx, size, mask) {
  const c = S.crop, im = c.im, rot = c.rot % 2 === 1, w = rot ? im.height : im.width, h = rot ? im.width : im.height;
  const base = size / Math.min(w, h), sc = base * c.z, k = size / 560;
  // empêcher de laisser un bord vide
  const mx = Math.max(0, (w * sc - size) / 2) / k, my = Math.max(0, (h * sc - size) / 2) / k;
  c.x = Math.max(-mx, Math.min(mx, c.x)); c.y = Math.max(-my, Math.min(my, c.y));
  ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2 + c.x * k, size / 2 + c.y * k); ctx.rotate(c.rot * Math.PI / 2); ctx.scale(sc, sc);
  ctx.drawImage(im, -im.width / 2, -im.height / 2); ctx.restore();
  if (mask) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
}
function drawCrop() { const cv = $('#cropCv'); if (cv && S.crop) paintCrop(cv.getContext('2d'), cv.width, true); }
function notify(c, m) {
  Sound.msg();
  if (c.hidden) { if (!document.hidden) toast('Nouveau message'); return; }
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
  i.value = ''; autoGrow(i); syncSend(); const reply = S.replyTo; S.replyTo = null; renderReplyBar();
  try {
    let payload = {t}; const out = Tr.outL(c.id);
    if (out && Tr.st && Tr.st.on && S.me.trConsent && !S.once) {
      try {
        const ctx = (S.msgs.get(c.id) || []).filter(x => x.kind === 'text' && x.text && !x.once).slice(-4).map(x => x.text);
        const r = await Tr.fetch(t, out, ctx);
        if (r && r.text && r.text.trim() !== t) { payload = {t: r.text, o: t, ol: r.from || '', tl: out}; if (r.fresh) Tr.give(t, r.from, r.text, out, 'mt', S.me.id); }
      }
      catch (e) { toast('Message envoyé sans traduction : ' + e.message); }
    }
    const {env} = await E2E.seal(payload, recipients(c));
    const body = {enc: env}; if (reply) body.replyTo = reply; if (S.once) { body.once = true; S.once = false; renderComposer(); }
    const r = await api(`/api/chats/${c.id}/messages`, body); onMsg(r.msg);
  } catch (e) { toast(e.message); i.value = t; syncSend(); }
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
    <div class="stage"><img src="${url}" alt="Aperçu"></div><form class="send-row" data-form="photo"><button class="ib once-tog" type="button" data-act="onceTog" aria-pressed="${!!S.once}" aria-label="Vue unique" title="Vue unique"><span class="one" aria-hidden="true">1</span></button><input id="phCap" maxlength="1000" placeholder="Ajouter une légende…"><button class="send" type="submit" aria-label="Envoyer">${I.send}</button></form></div>`;
  $('#phCap').focus();
}
async function sendPhoto() {
  const p = S.pend; if (!p) return; const cap = $('#phCap').value.trim(), btn = layer.querySelector('.send'); btn.disabled = true;
  try {
    const c = S.chats.get(S.chatId), sealed = await E2E.seal({t: cap}, recipients(c), await p.blob.arrayBuffer());
    const up = await api('/api/media', sealed.blob, {raw: true, type: 'application/octet-stream'});
    const once = !!S.once; S.once = false;
    const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env, once}); if (once) URL.revokeObjectURL(p.url); else E2E.imgs.set(r.msg.id, p.url); S.pend = null; closeLayer(); renderComposer(); onMsg(r.msg);
  }
  catch (e) { toast(e.message); btn.disabled = false; }
}

/* ---------- feuilles ---------- */
const head = t => `<div class="sheet-head"><h2>${t}</h2><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>`;
function sheet(html, label, focus) {
  layer.innerHTML = `<div class="layer" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div></div>`;
  const f = layer.querySelector(focus || '.sheet button, .sheet input'); if (f) f.focus({preventScroll: true});
}
// Filigrane au nom de la personne qui regarde : une capture faite malgré tout montre qui l'a prise.
function watermark() {
  const t = `@${S.me.handle} · ${new Date().toLocaleDateString('fr-FR')} ${hm(Date.now())}`.replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150"><text x="10" y="90" transform="rotate(-24 130 75)" fill="white" fill-opacity="0.22" font-family="sans-serif" font-size="15">${t}</text></svg>`;
  return `<div class="wmark" aria-hidden="true" style="background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}')"></div>`;
}
function onceDone() {
  const id = S.onceMsg; if (!id) return; S.onceMsg = null; if (S.onceUrl) { URL.revokeObjectURL(S.onceUrl); S.onceUrl = null; }
  layer.innerHTML = '';
  for (const list of S.msgs.values()) { const m = list.find(x => x.id === id); if (m) { m.opened = (m.opened || []).concat(S.me.id); m.text = ''; m.enc = null; } }
  api(`/api/messages/${id}/opened`, {}).catch(() => {}); renderMessages(true);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && S.onceMsg) onceDone(); });
// Capture d'écran repérée au clavier (ordinateur) : l'autre personne est prévenue.
/* Application Android : blocage des captures dans les zones privées, signalement ailleurs. */
if (window.TamTamAndroid) {
  let secOn = null;
  const secCheck = () => { const on = !!document.querySelector('.nocopy, .once-view');
    if (on !== secOn) { secOn = on; try { window.TamTamAndroid.setSecure(on); } catch {} } };
  let secT = 0; new MutationObserver(() => { if (!secT) secT = setTimeout(() => { secT = 0; secCheck(); }, 120); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  secCheck();
  window.addEventListener('tt-shot', () => { if (S.chatId) api(`/api/chats/${S.chatId}/shot`, {once: !!S.onceMsg}).catch(() => {}); });
}
document.addEventListener('keyup', e => { if (e.key === 'PrintScreen' && S.chatId) api(`/api/chats/${S.chatId}/shot`, {once: !!S.onceMsg}).catch(() => {}); });
document.addEventListener('keydown', e => { if (e.metaKey && e.shiftKey && ['3', '4', '5', 's', 'S'].includes(e.key) && S.chatId) api(`/api/chats/${S.chatId}/shot`, {once: !!S.onceMsg}).catch(() => {}); });
function closeLayer() { if (S.onceMsg) return onceDone(); clearTimeout(svT); layer.innerHTML = ''; S.sv = null; if (S.pend) { URL.revokeObjectURL(S.pend.url); S.pend = null; } }
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
    : `<button type="button" data-act="prof" data-id="${u.id}">${I.info}Voir le profil</button>`}
    <button type="button" data-act="privToggle">${I.lock}${c.hidden ? 'Ne plus rendre privée' : 'Rendre la discussion privée'}</button>
    <button type="button" class="danger" data-act="reportAsk" data-id="${u ? u.id : ''}" data-chat="${c.id}">${I.flag}Signaler</button>
    ${u ? `<button type="button" class="danger" data-act="${blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${I.block}${blocked ? 'Débloquer ' : 'Bloquer '}${esc(first(u.name))}</button>` : ''}</div>`, 'Options');
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
  sheet(`<div class="menu" style="padding-top:12px">${m.once ? '' : `<button type="button" data-act="reply" data-id="${id}">${I.reply}Répondre</button>`}${m.text && !m.once && !m.locked && m.from !== S.me.id && Tr.st && Tr.st.on && S.me.trConsent ? `<button type="button" data-act="trMsg" data-id="${id}">${I.translate}${Tr.shown.has(id) ? 'Voir la traduction' : 'Traduire'}</button>` : ''}${m.text && !m.once && !(S.chats.get(S.chatId) || {}).hidden ? `<button type="button" data-act="copy" data-id="${id}">${I.copy}Copier le texte</button>` : ''}
    ${m.from === S.me.id ? `<button type="button" class="danger" data-act="delAsk" data-id="${id}">${I.trash}Supprimer pour tout le monde</button>` : ''}</div>`, 'Message');
}

/* ---------- statuts : création et lecture ---------- */
const BGS = [170, 200, 260, 300, 340, 20, 45, 130];
// Polices des statuts (chargées à la demande depuis Google Fonts).
const ST_FONTS = [['Classique', 'inherit', ''], ['Élégante', "'Playfair Display', Georgia, serif", 'Playfair+Display:wght@700'], ['Manuscrite', "Pacifico, 'Brush Script MT', cursive", 'Pacifico'],
  ['Écriture', "Caveat, 'Segoe Print', cursive", 'Caveat:wght@700'], ['Affiche', "'Bebas Neue', Impact, sans-serif", 'Bebas+Neue'], ['Machine', "'Courier Prime', 'Courier New', monospace", 'Courier+Prime:wght@700']];
function stFontsLoad() {
  if (document.getElementById('stFonts')) return;
  const l = document.createElement('link'); l.id = 'stFonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' + ST_FONTS.filter(f => f[2]).map(f => 'family=' + f[2]).join('&') + '&display=swap'; document.head.appendChild(l);
}
const stFont = i => (ST_FONTS[i] || ST_FONTS[0])[1];
const ST_MUS_MAX = 8_000_000;
function stOpts() {
  return {target: stMedia, title: 'Pour mon statut', gallery: () => $('#stIn') && $('#stIn').click(), native: () => $('#stCamIn') && $('#stCamIn').click()};
}
function stMedia(r) {
  const s = S.sc; if (!s) return; if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(s, {kind: r.kind, blob: r.blob, url: URL.createObjectURL(r.blob), mime: r.mime, dur: r.dur || 0, mirror: !!r.mirror});
  if (r.cap) s.text = r.cap; s.tab = null; stComposer();
}
function stComposer() {
  S.sc = S.sc || {aud: 'public', bg: 170, text: '', font: 0, kind: 'text', blob: null, url: null, music: null, tab: null, grp: false};
  if (!S.sc.kind) S.sc.kind = S.sc.blob ? 'photo' : 'text'; if (S.sc.font == null) S.sc.font = 0;
  const s = S.sc, closeN = (S.me.close || []).length, media = s.kind !== 'text', capSel = media ? '#stCap' : '#stText'; stFontsLoad();
  const tool = (act, ic, label, on) => `<button class="st-tool${on ? ' on' : ''}" type="button" data-act="${act}">${ic}<span>${label}</span></button>`;
  layer.innerHTML = `<div class="st-comp" role="dialog" aria-modal="true" aria-label="Nouveau statut">
    <div class="st-head"><button class="ib" type="button" data-act="stCancel" aria-label="Annuler">${I.close}</button>
      <div class="seg st-aud" role="group" aria-label="Qui voit ce statut"><button type="button" data-act="stAud" data-a="public" aria-pressed="${s.aud === 'public'}">${I.globe}Public</button><button type="button" data-act="stAud" data-a="private" aria-pressed="${s.aud === 'private'}">${I.lock}Privé</button></div>
      <button class="btn sm" type="button" data-act="stPublish" id="stPub">Publier</button></div>
    ${s.aud === 'private' ? `<button class="st-grp-row" type="button" data-act="stGrp">${I.users}<span><b>Mon groupe privé</b><small>${closeN ? `${closeN} personne${closeN > 1 ? 's' : ''} verront ce statut` : 'Touchez ici pour choisir qui verra ce statut'}</small></span>${I.chev || '›'}</button>`
      : '<p class="st-note">Visible par tous vos contacts pendant 24 heures.</p>'}
    <div class="stage"><div class="st-box${media ? ' media' : ''}" style="--h:${s.bg};--stf:${stFont(s.font)}">
      ${s.kind === 'photo' ? `<img src="${s.url}" alt="Aperçu">` : s.kind === 'video' ? `<video src="${s.url}" class="${s.mirror ? 'mirror' : ''}" autoplay loop muted playsinline></video>` : `<textarea id="stText" maxlength="700" placeholder="Touchez pour écrire…">${esc(s.text)}</textarea>`}
      ${media ? `<button class="st-rm" type="button" data-act="stNoPhoto" aria-label="Retirer ${s.kind === 'video' ? 'la vidéo' : 'la photo'}">${I.close}</button><input id="stCap" class="st-cap" maxlength="700" placeholder="Ajouter une légende…" value="${esc(s.text)}" autocomplete="off">` : ''}
      ${s.music ? `<div class="st-mus">🎵 <span>${esc(s.music.name)}</span><button type="button" data-act="stMusOff" aria-label="Retirer la musique">${I.close}</button></div><audio src="${s.music.url}" id="stMusPrev"></audio>` : ''}
    </div></div>
    ${s.tab === 'font' ? `<div class="st-fonts">${ST_FONTS.map(([n, f], i) => `<button type="button" data-act="stFont" data-i="${i}" aria-pressed="${s.font === i}" style="font-family:${f}">Aa<small>${n}</small></button>`).join('')}</div>` : ''}
    ${!media ? `<div class="bgs st-bgs">${BGS.map(h => `<button class="sw" type="button" style="--c:hsl(${h} 55% 35%)" data-act="stBg" data-h="${h}" aria-pressed="${s.bg === h}" aria-label="Couleur de fond"></button>`).join('')}</div>` : ''}
    <div class="st-tools">${tool('stText', '<b class="aa">Aa</b>', 'Texte', !media)}${tool('stPhoto', I.image, 'Photo', s.kind === 'photo')}${tool('stCam', CI.photo, 'Caméra', false)}${tool('stVid', CI.video, 'Vidéo', s.kind === 'video')}${tool('stFontTab', '<b class="aa serif">F</b>', 'Police', s.tab === 'font')}${tool('stMus', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>', 'Musique', !!s.music)}${Emoji.btn(capSel, 'st-tool emo')}</div>
    <input type="file" id="stIn" accept="image/*,video/*" hidden><input type="file" id="stCamIn" accept="image/*" capture="environment" hidden><input type="file" id="stMusIn" accept="audio/*" hidden>
    ${s.grp ? `<div class="st-grp-panel" data-act="stGrpBg"><div class="st-grp-card">${closePicker(true)}</div></div>` : ''}
  </div>`;
}
async function stPublish() {
  const s = S.sc; keepSt();
  if (s.kind === 'text' && !s.text.trim()) return toast('Écrivez un texte, ou ajoutez une photo ou une vidéo.');
  if (s.aud === 'private' && !(S.me.close || []).length) { s.grp = true; stComposer(); return toast('Choisissez d’abord qui verra ce statut privé.'); }
  const b = $('#stPub'); if (b) { b.disabled = true; b.textContent = 'Publication…'; }
  try {
    // Statut chiffré de bout en bout pour vos contacts (ou votre seul groupe privé).
    const cs = S.contacts.contacts.filter(u => u.pubkey && !u.blocked && (s.aud !== 'private' || (S.me.close || []).includes(u.id)));
    const payload = {t: s.text, f: s.font || 0}; if (s.kind === 'video') Object.assign(payload, {mime: s.mime, dur: s.dur, mir: s.mirror ? 1 : 0}); if (s.music) payload.mname = s.music.name;
    const sealed = await E2E.seal(payload, [[S.me.id, E2E.pubJwk], ...cs.map(u => [u.id, u.pubkey])], s.blob ? await s.blob.arrayBuffer() : undefined, s.music ? await s.music.blob.arrayBuffer() : undefined);
    let media = null, music = null;
    if (sealed.blob) media = (await api('/api/media', sealed.blob, {raw: true, type: 'application/octet-stream'})).id;
    if (sealed.blob2) music = (await api('/api/media', sealed.blob2, {raw: true, type: 'application/octet-stream'})).id;
    await api('/api/statuses', {enc: sealed.env, bg: s.bg, media, music, aud: s.aud, ...(s.kind === 'video' ? {kind: 'video'} : {})});
    if (s.url) URL.revokeObjectURL(s.url); if (s.music) URL.revokeObjectURL(s.music.url);
    S.sc = null; closeLayer(); await loadStatuses(); renderStories(); toast('Statut publié pour 24 heures');
  } catch (e) { toast(e.message); if (b) { b.disabled = false; b.textContent = 'Publier'; } }
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
  const vid = it.kind === 'video', dur = vid ? (Math.min(62, Math.max(3, it.dur || 15)) + 2) * 1000 : it.music ? 15000 : 6000; stFontsLoad();
  layer.innerHTML = `<div class="sv" style="--h:${it.bg || 170}" role="dialog" aria-modal="true" aria-label="Statut"><div class="sv-bars">${g.items.map((_, k) => `<i class="${k < v.i ? 'done' : k === v.i ? 'run' : ''}"><b${k === v.i ? ` style="animation-duration:${dur / 1000}s"` : ''}></b></i>`).join('')}</div>
    <div class="sv-head">${avatar(g.user, 'sm')}<div class="grow"><b>${esc(mine ? 'Mon statut' : g.user.name)}</b><small>${dayLabel(it.at)}, ${hm(it.at)} · ${it.aud === 'private' ? 'Privé' : 'Public'}</small></div><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>
    <div class="sv-stage"><div class="sv-box${it.aud === 'private' ? ' nocopy' : ''}">${it.media ? (vid ? `<video data-stvid="${it.id}" class="${it.mir ? 'mirror' : ''}" playsinline autoplay controlslist="nodownload" disablepictureinpicture></video>` : it.enc ? `<img data-stenc="${it.id}" alt="" draggable="false">` : `<img src="${esc(it.media)}" alt="" draggable="false">`) : `<div class="sv-text" style="font-family:${stFont(it.font)}">${esc(it.text)}</div>`}${it.media && it.text ? `<div class="sv-cap" style="font-family:${stFont(it.font)}">${esc(it.text)}</div>` : ''}${it.music ? `<div class="sv-mus">🎵 ${esc(it.mname || 'Musique')}</div><audio data-stmus="${it.id}" loop></audio>` : ''}
      ${it.aud === 'private' && !mine ? watermark() : ''}<button class="sv-nav prev" type="button" data-act="svPrev" aria-label="Précédent"></button><button class="sv-nav next" type="button" data-act="svNext" aria-label="Suivant"></button></div></div>
    ${mine ? `<div class="sv-foot"><button class="btn sm ghost" type="button" data-act="svViews">${I.eye}${(it.views || []).length} vue${(it.views || []).length > 1 ? 's' : ''}</button><button class="btn sm ghost" type="button" data-act="stNew">${I.plus}Ajouter</button><button class="btn sm ghost" type="button" data-act="stDelAsk" data-id="${it.id}">${I.trash}Supprimer</button></div>` : ''}</div>`;
  clearTimeout(svT); svT = setTimeout(() => svStep(1), dur);
  const dec = (url, iv, type) => fetch(url, {credentials: 'same-origin'}).then(r => r.arrayBuffer()).then(b => E2E.decBytes(it._key, iv, b)).then(b => URL.createObjectURL(new Blob([b], {type})));
  const vv = layer.querySelector('video[data-stvid]');
  if (vv && it._key && it.miv) dec(it.media, it.miv, it.vmime || 'video/mp4').then(u => { if (!layer.contains(vv)) return; vv.src = u; vv.play().catch(() => { vv.muted = true; vv.play().catch(() => {}); }); vv.onended = () => { clearTimeout(svT); svStep(1); }; }).catch(() => {});
  const au = layer.querySelector('audio[data-stmus]');
  if (au && it._key && it.mmiv) dec(it.music, it.mmiv, 'audio/mpeg').then(u => { if (!layer.contains(au)) return; au.src = u; au.play().catch(() => {}); }).catch(() => {});
  const im = layer.querySelector('img[data-stenc]');
  if (im && it._key && it.miv) fetch(it.media, {credentials: 'same-origin'}).then(r => r.arrayBuffer()).then(b => E2E.decBytes(it._key, it.miv, b)).then(b => { im.src = URL.createObjectURL(new Blob([b], {type: 'image/jpeg'})); }).catch(() => {});
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
function picsEdit(set) {
  const list = (set === 'pub' ? S.me.pics : S.me.privPics) || [null, null, null];
  return `<span class="lbl">${set === 'pub' ? 'Mes 3 photos publiques' : 'Mes 3 photos privées'}</span>
    <p class="hint" style="margin:0">${set === 'pub' ? 'Tous les membres de Tam-Tam peuvent les voir, par exemple avant de vous demander en ami.' : 'Seules les personnes autorisées à voir votre profil privé peuvent les voir.'}</p>
    <div class="ph3">${[0, 1, 2].map(i => list[i]
      ? `<div class="ph3-it"><button class="ph3-img" type="button" data-act="picView" data-src="${esc(list[i])}" aria-label="Agrandir la photo ${i + 1}"><img src="${esc(list[i])}" alt=""></button><button class="ph3-x" type="button" data-act="picDel" data-set="${set}" data-i="${i}" aria-label="Retirer la photo ${i + 1}">${I.close}</button></div>`
      : `<button class="ph3-add" type="button" data-act="picAdd" data-set="${set}" data-i="${i}"><span aria-hidden="true">+</span>Photo ${i + 1}</button>`).join('')}</div>
    <input type="file" id="picIn" accept="image/*" hidden>`;
}
function closePicker(ok) {
  const cs = S.contacts.contacts, close = new Set(S.me.close || []);
  return `<div class="grp-box"><b>${I.users} Mon groupe privé</b><p class="hint" style="margin:0">Ces amis voient vos statuts privés${S.me.privTo === 'grp' ? ' et votre profil privé verrouillé' : ''}.</p>
    ${cs.length ? `<div class="cg-tools"><label class="pick cg-all"><input type="checkbox" name="closeAll"${cs.every(u => close.has(u.id)) ? ' checked' : ''}><span><b>Tout cocher</b></span></label><span class="hint" id="cgCount">${cs.filter(u => close.has(u.id)).length} sur ${cs.length}</span>${ok ? '<button class="btn sm" type="button" data-act="stGrpOk">Valider</button>' : ''}</div>
    ${cs.length > 8 ? `<label class="search" style="margin:0">${I.search}<span class="sr">Chercher un ami</span><input id="cgq" type="search" placeholder="Chercher un ami" autocomplete="off"></label>` : ''}
    <p class="hint" style="margin:0">Astuce : cochez tout, puis décochez seulement les personnes qui ne doivent pas voir.</p>` : ''}
    ${cs.length ? `<div class="picks">${cs.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(u => `<label class="pick"><input type="checkbox" name="close" value="${u.id}"${close.has(u.id) ? ' checked' : ''}>${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('')}</div>` : '<p class="hint" style="margin:0">Ajoutez d’abord des amis.</p>'}${ok && !cs.length ? '<div><button class="btn sm" type="button" data-act="stGrpOk">Fermer</button></div>' : ''}</div>`;
}
function profileEditor() {
  const me = S.me, p = me.pub || {}, pv = me.priv || {}, t = S.profTab || 'pub';
  const f = (set, k, l, ph = '', type = 'text', max = 80) => `<div class="field"><label for="p-${k}">${l}</label>${k === 'bio' ? `<textarea id="p-${k}" data-set="${set}" data-k="${k}" rows="2" maxlength="200" placeholder="${ph}">${esc((set === 'pub' ? p : pv)[k] || '')}</textarea>` : `<input id="p-${k}" data-set="${set}" data-k="${k}" type="${type}" maxlength="${max}" placeholder="${ph}" value="${esc((set === 'pub' ? p : pv)[k] || '')}">`}</div>`;
  const LOCKS = [['contacts', I.globe, 'Ouvert', 'Tous mes amis le voient'], ['grp', I.lock, 'Verrouillé', 'Seulement mon groupe privé'], ['me', I.lock, 'Fermé', 'Personne, sauf moi']];
  return `<div class="set myprof">
    <div class="set-top">${avatar(me, 'lg')}<div><b>${esc(me.name)}</b><span>@${esc(me.handle)}</span></div></div>
    <div class="seg" role="tablist"><button type="button" role="tab" data-act="profTab" data-t="pub" aria-selected="${t === 'pub'}">${I.globe}Profil public</button><button type="button" role="tab" data-act="profTab" data-t="priv" aria-selected="${t === 'priv'}">${I.lock}Profil privé</button></div>
    ${t === 'pub' ? `<p class="note">${I.globe}Visible par tous les membres de Tam-Tam, notamment quand quelqu’un veut vous ajouter. Il l’aide à savoir qui vous êtes.</p>
    <div class="set-block">
      <div class="field"><label for="p-name">Nom</label><input id="p-name" data-set="name" maxlength="40" value="${esc(me.name)}"></div>
      <div class="field"><label for="p-handle">Pseudo</label><input id="p-handle" data-set="handle" maxlength="24" value="${esc(me.handle)}"></div>
      ${f('pub', 'bio', 'Qui suis-je', 'Quelques mots sur vous')}${f('pub', 'metier', 'Métier ou études')}${f('pub', 'ville', 'Ville', 'Ex. : Dakar, Sénégal')}${f('pub', 'langues', 'Langues parlées', 'Ex. : Français, Wolof')}${f('pub', 'interets', 'Centres d’intérêt')}
      <div class="field"><span class="lbl">Jour et mois de naissance</span><div class="bd-row"><select id="p-bd" data-set="pub" data-k="bd" aria-label="Jour"><option value="">Jour</option>${Array.from({length: 31}, (_, i) => `<option value="${i + 1}"${+p.bd === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select><select id="p-bm" data-set="pub" data-k="bm" aria-label="Mois"><option value="">Mois</option>${MOIS.map((m, i) => `<option value="${i + 1}"${+p.bm === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select></div></div>
      ${picsEdit('pub')}
      <label class="pick chk"><input type="checkbox" data-act="listedTog"${me.listed !== false ? ' checked' : ''}><span>Apparaître dans la liste « Membres de Tam-Tam » (le + en haut). Décoché, on peut toujours vous trouver par votre nom ou votre pseudo exact.</span></label>
      <div><button class="btn sm ghost" type="button" data-act="prof" data-id="${me.id}">${I.eye}Voir mon profil public comme les autres</button></div></div>
` : `<p class="note">${I.lock}<span>Votre profil privé n’est jamais visible par des inconnus. Votre <b>numéro de téléphone</b> reste caché, même pour vos amis : vous le montrez seulement à qui vous voulez, depuis son profil (« Lui montrer mon numéro »).</span></p>
    <div class="set-block">
      <span class="lbl">Qui peut voir mon profil privé</span>
      <div class="locks">${LOCKS.map(([v, ic, l, h]) => `<button class="lockopt" type="button" data-act="privTo" data-v="${v}" aria-pressed="${me.privTo === v}">${ic}<b>${l}</b><small>${h}</small></button>`).join('')}</div>
      ${closePicker()}
    </div>
    <div class="set-block">
      ${f('priv', 'tel', 'Téléphone (caché sauf accord)', '+221 …', 'tel')}${f('priv', 'annee', 'Année de naissance', 'Ex. : 1985', 'number')}${f('priv', 'mail', 'E-mail de contact', '', 'email')}${f('priv', 'adresse', 'Quartier ou adresse')}${f('priv', 'travail', 'Lieu de travail')}${f('priv', 'famille', 'Famille')}
      ${picsEdit('priv')}</div>
`}
  </div>`;
}
function pendAvatar() {
  const P = S.pp; if (!P) return avatar(S.me, 'xl');
  return P.kind === 'photo' ? `<span class="av xl"><img src="${esc(P.url)}" alt=""></span>` : `<span class="av xl" aria-hidden="true">${avFace(P.av)}</span>`;
}
function picsView(list, title) {
  const l = (list || []).filter(Boolean); if (!l.length) return '';
  return `<span class="lbl">${title}</span><div class="ph3">${l.map((u, i) => `<button class="ph3-img" type="button" data-act="picView" data-src="${esc(u)}" aria-label="Agrandir la photo ${i + 1}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>`;
}
/* ---------- profil privé chiffré de bout en bout ----------
   Téléphone, adresse, famille, photos privées : chiffrés sur l'appareil pour les seules personnes autorisées.
   Le serveur ne garde qu'une enveloppe illisible et une empreinte du numéro (pour le répertoire). */
const PP = {
  data: null, tel: '', urls: [null, null, null],
  async open(env) { if (!env || !E2E.ready()) return null; const r = await E2E.open(env, S.me.id); return r.err ? null : r.payload; },
  aud() {
    const me = S.me, cs = (S.contacts.contacts || []).filter(u => u.pubkey && !u.blocked && !u.limMine);
    const list = me.privTo === 'me' ? [] : me.privTo === 'grp' ? cs.filter(u => (me.close || []).includes(u.id)) : cs;
    return [[me.id, E2E.pubJwk], ...list.map(u => [u.id, u.pubkey])];
  },
  telAud() { return [[S.me.id, E2E.pubJwk], ...(S.contacts.contacts || []).filter(u => u.pubkey && u.telMine).map(u => [u.id, u.pubkey])]; },
  attach(me) { me.priv = Object.assign({}, this.data.f, {tel: this.tel}); me.privPics = this.urls.slice(); },
  async init() {
    if (!E2E.ready() || !S.me) return;
    const me = S.me;
    if (me.privEnv) { const p = await this.open(me.privEnv); this.data = p ? {f: p.f || {}, pics: p.pics || [null, null, null]} : {f: {}, pics: [null, null, null]}; }
    if (me.telEnv) { const t = await this.open(me.telEnv); this.tel = (t && t.tel) || ''; }
    if (!me.privEnv || me.legacyPriv) await this.migrate();
    this.urls = await this.picUrls(this.data.pics); this.attach(S.me);
    await this.check();
  },
  // Ancien profil privé en clair : on le chiffre une fois, puis le serveur l'efface.
  async migrate() {
    const me = S.me, old = me.priv || {}, f = {};
    for (const k of ['annee', 'mail', 'adresse', 'travail', 'famille']) if (old[k]) f[k] = old[k];
    this.tel = this.tel || old.tel || '';
    const pics = [null, null, null];
    for (let i = 0; i < 3; i++) { const u = (me.privPics || [])[i]; if (!u) continue; try { const r = await fetch(u, {credentials: 'same-origin'}); if (r.ok) pics[i] = await this.encPic(await r.arrayBuffer()); } catch {} }
    this.data = {f, pics}; await this.save();
  },
  async encPic(bytes) {
    const raw = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12)), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, bytes);
    const up = await api('/api/media', new Blob([ct], {type: 'application/octet-stream'}), {raw: true, type: 'application/octet-stream'});
    return {id: up.id, k: Tr.b64(raw), iv: Tr.b64(iv)};
  },
  async decPic(p) {
    if (!p) return null; const r = await fetch('/api/media/' + p.id, {credentials: 'same-origin'}); if (!r.ok) return null;
    const key = await crypto.subtle.importKey('raw', Tr.unb64(p.k), 'AES-GCM', false, ['decrypt']);
    return URL.createObjectURL(new Blob([await crypto.subtle.decrypt({name: 'AES-GCM', iv: Tr.unb64(p.iv)}, key, await r.arrayBuffer())], {type: 'image/jpeg'}));
  },
  picUrls(pics) { return Promise.all((pics || [null, null, null]).map(p => this.decPic(p).catch(() => null))); },
  async save() {
    if (!this.data || !E2E.ready()) return;
    const privEnv = (await E2E.seal({f: this.data.f, pics: this.data.pics}, this.aud())).env;
    const telEnv = this.tel ? (await E2E.seal({tel: this.tel}, this.telAud())).env : null;
    const d = String(this.tel || '').replace(/\D/g, ''), telHash = d.length >= 6 ? await Book.hash(d.slice(-9)) : null;
    const r = await api('/api/me/privenv', {privEnv, telEnv, telHash, mediaIds: this.data.pics.filter(Boolean).map(p => p.id)});
    S.me = r.me; this.attach(S.me); keepUsers([S.me]);
  },
  // Quand les personnes autorisées changent (nouveau contact, groupe privé, numéro partagé…), on rechiffre pour elles.
  async check() {
    if (!this.data || !S.me.privEnv) return;
    const ids = a => a.map(x => String(x[0])).sort().join(','), keys = e => e ? Object.keys(e.keys || {}).sort().join(',') : '';
    if (ids(this.aud()) !== keys(S.me.privEnv) || (this.tel ? ids(this.telAud()) : '') !== keys(S.me.telEnv)) await this.save().catch(() => {});
  },
  setField(k, v) {
    if (!this.data) return; if (k === 'tel') this.tel = v; else this.data.f[k] = v; S.me.priv = Object.assign(S.me.priv || {}, {[k]: v});
    clearTimeout(this.t); this.t = setTimeout(() => this.save().catch(e => toast(e.message)), 900);
  },
  async setPic(i, bytes) { this.data.pics[i] = bytes ? await this.encPic(bytes) : null; this.urls = await this.picUrls(this.data.pics); await this.save(); },
  // Profil d'un contact : on ouvre ses enveloppes avec notre propre clé.
  async reveal(u) {
    if (!u) return u;
    if (u.privEnv) { const p = await this.open(u.privEnv); if (p) { u.priv = Object.assign({}, p.f || {}); u.privPics = await this.picUrls(p.pics); } else { u.priv = null; u.privPics = null; } }
    if (u.telEnv) { const t = await this.open(u.telEnv); if (t && t.tel) { u.priv = u.priv || {}; u.priv.tel = t.tel; } }
    return u;
  },
};

/* ---------- traduction à la demande ---------- */
const LANG_FR = {bas: 'bassa (essai)', dua: 'duala (essai)', ewo: 'ewondo (essai)', srr: 'sérère (essai)', mnk: 'mandinka (essai)', snk: 'soninké (essai)', dyo: 'diola (essai)', fan: 'fang (essai)', bum: 'boulou (essai)', mos: 'mooré (essai)', fon: 'fon (essai)', dyu: 'dioula (essai)', kab: 'kabyle (essai)', tzm: 'tamazight (essai)', ber: 'berbère (essai)', kri: 'krio (essai)', fr: 'français', en: 'anglais', wo: 'wolof', ff: 'peul (pulaar)', bm: 'bambara', ln: 'lingala', sw: 'swahili', ha: 'haoussa', yo: 'yoruba', ig: 'igbo', ee: 'ewe', ak: 'twi', rw: 'kinyarwanda', sg: 'sango', ar: 'arabe', pt: 'portugais', es: 'espagnol', de: 'allemand', it: 'italien', zh: 'chinois', ru: 'russe', tr: 'turc', nl: 'néerlandais', hi: 'hindi', am: 'amharique', so: 'somali', zu: 'zoulou', xh: 'xhosa', mg: 'malgache', rn: 'kirundi', kg: 'kikongo', ts: 'tsonga', tn: 'tswana', st: 'sotho', sn: 'shona', ny: 'chichewa', om: 'oromo', ti: 'tigrigna', lg: 'luganda', ki: 'kikuyu'};
const Tr = {
  st: null,
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { return null; } },
  // Langue par défaut pour « Traduire » sur un message (menu du message).
  lang() { return this.ls('tt-trlang') || 'fr'; },
  setLang(l) { this.ls('tt-trlang', l); },
  // Par discussion : la langue dans laquelle JE reçois, et celle dans laquelle MON CONTACT reçoit.
  inL(cid) { return this.ls('tt-trin:' + cid) || (this.ls('tt-trauto:' + cid) === '1' ? this.lang() : ''); },
  outL(cid) { return this.ls('tt-trout:' + cid) || ''; },
  setIn(cid, l) { this.ls('tt-trauto:' + cid, ''); this.ls('tt-trin:' + cid, l); },
  setOut(cid, l) { this.ls('tt-trout:' + cid, l); },
  view(cid) { return this.inL(cid) || this.lang(); },
  get(id, l) { try { return JSON.parse(this.ls(`tt-tr:${id}:${l}`) || 'null'); } catch { return null; } },
  put(id, l, v) { this.ls(`tt-tr:${id}:${l}`, JSON.stringify(v)); },
  shown: new Set(), off: new Set(), flip: new Set(), busy: false,
  // Empreinte et clé tirées du texte : seul quelqu'un qui a déjà le message peut retrouver sa traduction.
  async keys(text, lang) {
    const h = async p => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p + '|' + lang + '|' + text)));
    const id = [...await h('tt-tr-id')].map(b => b.toString(16).padStart(2, '0')).join('');
    return {id, key: await crypto.subtle.importKey('raw', await h('tt-tr-key'), 'AES-GCM', false, ['encrypt', 'decrypt'])};
  },
  // Traduit un texte, en réutilisant d'abord la traduction déjà payée par quelqu'un d'autre.
  // Même phrase, à quelques espaces, majuscules ou ponctuation près.
  norm(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*([?!.,;:])\s*/g, '$1').replace(/[.!?]+$/, '').trim(); },
  b64(u) { return btoa(String.fromCharCode(...u)); }, unb64(t) { return Uint8Array.from(atob(t), x => x.charCodeAt(0)); },
  async mineGet(text, to) {
    const k = await this.keys(this.norm(text), to + '|mine'), c = await api('/api/translate/mine/' + k.id).catch(() => null);
    if (!c || !c.hit) return null; try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: this.unb64(c.hit.iv)}, k.key, this.unb64(c.hit.ct)))); } catch { return null; }
  },
  async minePut(text, to, v) {
    const k = await this.keys(this.norm(text), to + '|mine'), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k.key, new TextEncoder().encode(JSON.stringify(v))));
    await api('/api/translate/mine', {id: k.id, iv: this.b64(iv), ct: this.b64(ct)});
  },
  async fetch(text, to, ctx) {
    const mine = await this.mineGet(text, to); if (mine && mine.text) return {text: mine.text, from: mine.from || null, mine: true};
    const k = await this.keys(text, to), c = await api('/api/translate/cache/' + k.id).catch(() => null);
    if (c && c.hit) { try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: Uint8Array.from(atob(c.hit.iv), x => x.charCodeAt(0))}, k.key, Uint8Array.from(atob(c.hit.ct), x => x.charCodeAt(0))))); } catch {} }
    const r = await api('/api/translate', {text, to, ctx: ctx || []});
    r.fresh = true; const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k.key, new TextEncoder().encode(JSON.stringify(r))));
    const b64 = u => btoa(String.fromCharCode(...u)); api('/api/translate/cache', {id: k.id, iv: b64(iv), ct: b64(ct)}).catch(() => {});
    return r;
  },
  async run(id, silent, l) {
    l = l || this.view(S.chatId);
    const m = (S.msgs.get(S.chatId) || []).find(x => x.id === id); if (!m || !m.text) return false;
    const srcText = m.orig != null ? m.orig : m.text;
    if (this.get(id, l)) { this.shown.add(id); if (!silent) renderMessages(true); return true; } // déjà traduit : rien n'est recompté
    try {
      const list = S.msgs.get(S.chatId) || [], i = list.indexOf(m), ctx = list.slice(Math.max(0, i - 4), i).filter(x => x.kind === 'text' && x.text && !x.once).map(x => x.text);
      const r = await this.fetch(srcText, l, ctx); this.put(id, l, {text: r.text, from: r.from}); this.shown.add(id);
      if (r.fresh) this.give(srcText, r.from, r.text, l, 'mt', m.from);
      if (!silent) renderMessages(true); return true;
    }
    catch (e) { toast(e.message); return false; }
  },
  async autoRun(c) {
    const l = c && this.inL(c.id); if (!l || this.busy || !this.st || !this.st.on || !S.me.trConsent || this.learn(c.id)) return;
    const todo = (S.msgs.get(c.id) || []).filter(m => m.from && m.from !== S.me.id && !m.once && !m.deleted && !m.locked && m.kind === 'text' && m.text && m.text.trim().length > 1 && m.tlang !== l && !this.shown.has(m.id) && !this.off.has(m.id)).slice(-30);
    if (!todo.length) return; this.busy = true;
    try { for (const m of todo) { if (S.chatId !== c.id || this.inL(c.id) !== l) break; if (this.get(m.id, l)) { this.shown.add(m.id); continue; } if (!await this.run(m.id, true, l)) break; } }
    finally { this.busy = false; } if (S.chatId === c.id) renderMessages(true);
  },
  // Envoie une paire « texte d'origine → traduction » à la base de Tam-Tam (le serveur vérifie les accords).
  give(src, sl, tgt, tl, kind, author) { const a = author === S.me.id ? S.me : uOf(author); if (!a || !(author === S.me.id ? S.me.trConsent : a.trc) || (kind === 'fix' && !S.me.trConsent)) return; api('/api/corpus', {src, sl: sl || '', tgt, tl, kind, author}).catch(() => {}); },
  fix(id) { try { return JSON.parse(this.ls('tt-fix:' + id) || 'null'); } catch { return null; } },
  note(txt, act, id, lbl, more) { return `<span class="trl">${I.translate}${txt} · <button class="linkb" type="button" data-act="${act}" data-id="${id}">${lbl}</button>${more || ''}</span>`; },
  fixBtn(id, lbl) { return ` · <button class="linkb" type="button" data-act="trFix" data-id="${id}">✎ ${lbl || 'Corriger'}</button>`; },
  from(l) { const n = l && LANG_FR[l]; return n ? (/^[aeiouhé]/.test(n) ? 'de l’' : 'du ') + n.replace(/ \(essai\)$/, '') : ''; },
  // Mode apprentissage : le message reste dans sa langue, la traduction est cachée jusqu'à ce qu'on la demande.
  learn(cid) { return this.ls('tt-trlearn:' + cid) === '1'; },
  setLearn(cid, on) { this.ls('tt-trlearn:' + cid, on ? '1' : ''); },
  open: new Set(),
  // Texte d'une bulle : le message, la traduction juste en dessous et « Votre correction » (modèle unique).
  txt(m) {
    const L = l => (LANG_FR[l] || l || '').replace(/ \(essai\)$/, ''), cid = m.chatId || S.chatId;
    const box = (label, text, extra) => `<span class="tr-recv"><small>${I.translate}${label}</small><span>${esc(text)}</span>${extra || ''}<button class="linkb" type="button" data-act="trFix" data-id="${m.id}">✎ Votre correction</button></span>`;
    if (m.from === S.me.id) {
      if (m.orig != null && m.tlang) {
        const c = S.chats.get(m.chatId), who = c && c.type === 'direct' ? first(chatTitle(c)) : 'Vos contacts';
        return `<span class="trl-txt">${esc(m.orig)}</span>${box(`${esc(who)} a reçu (${esc(L(m.tlang))})${m.fx ? ' · corrigé' : ''} :`, m.text)}`;
      }
      return `<span class="txt">${esc(m.text)}</span>`;
    }
    // Sans traduction (refusée ou non activée) : le message tel qu'il a été écrit.
    const plain = `<span class="txt">${esc(m.orig != null ? m.orig : m.text)}</span>`;
    if (!S.me.trConsent) return plain;
    const inL = this.inL(cid), fx = this.fix(m.id);
    if (this.learn(cid) && inL) {
      // Je m'exerce : je lis le message reçu ; la traduction dans ma langue n'apparaît que si je la demande.
      const t = m.orig != null && m.olang === inL ? {text: m.orig, from: m.olang} : this.get(m.id, inL);
      const shown = this.open.has(m.id) && t;
      return `<span class="txt">${esc(m.text)}</span>` + (shown ? box(`Traduction (${esc(L(inL))})${fx ? ' · corrigée par vous' : ''} :`, fx ? fx.text : t.text)
        : `<span class="tr-recv tr-hide"><button class="linkb" type="button" data-act="trReveal" data-id="${m.id}">${I.eye}Voir la traduction en ${esc(L(inL))}</button></span>`);
    }
    if (m.orig != null && m.tlang && (!inL || inL === m.tlang)) {
      // Traduit par l'expéditeur : l'original en haut, la traduction reçue en dessous.
      return `<span class="trl-txt">${esc(m.orig)}</span>${box(`Traduction (${esc(L(m.tlang))})${fx ? ' · corrigée par vous' : m.fx ? ' · corrigée par l’expéditeur' : ''} :`, fx ? fx.text : m.text)}`;
    }
    const src = m.orig != null ? m.orig : m.text, tl = inL || (this.shown.has(m.id) ? this.lang() : ''), t = tl && this.get(m.id, tl);
    if (!t || t.from === tl || t.text.trim() === src.trim()) return plain;
    return `<span class="trl-txt">${esc(src)}</span>${box(`Traduction (${esc(L(tl))})${fx ? ' · corrigée par vous' : ''} :`, fx ? fx.text : t.text)}`;
  },
  label(cid) { const a = this.inL(cid), b = this.outL(cid); if (!S.me.trConsent) return ''; return a || b ? `<span>${a ? a.toUpperCase() : '—'}</span><i aria-hidden="true">⇄</i><span>${b ? b.toUpperCase() : '—'}</span>` : ''; },
  settingsHtml() {
    if (!this.st || !this.st.on) return '';
    return `<div class="set-block"><h2>${I.translate} Traduction</h2><p class="hint">Dans une discussion, touchez le bouton 文A à gauche de la zone d’écriture : choisissez la langue dans laquelle <b>vous</b> recevez les messages, et celle dans laquelle <b>votre contact</b> reçoit les vôtres. Le texte traduit passe par le service de traduction : il n’est plus protégé de bout en bout.</p>
      <label class="pick chk"><input type="checkbox" data-act="trConsentTog"${S.me.trConsent ? ' checked' : ''}><span><b>Utiliser la traduction.</b> J’accepte que mes messages traduits et mes corrections servent, sans mon nom, à enrichir la base de traduction de Tam-Tam (article 13 des Conditions générales). Décoché : aucune traduction, les messages s’affichent tels qu’ils ont été écrits.</span></label>
      <div class="field"><label for="trLang">Langue pour « Traduire » sur un message</label><select id="trLang">${this.st.langs.map(l => `<option value="${l}"${l === this.lang() ? ' selected' : ''}>${LANG_FR[l] || l}</option>`).join('')}</select></div></div>`;
  },
};
function trConsentAsk(open) {
  sheet(`${head('Activer la traduction')}<div class="sheet-body"><p>La traduction de Tam-Tam s’améliore grâce à ses utilisateurs, notamment pour les <b>langues africaines</b>.</p>
    <p class="hint">En l’activant, vous acceptez que vos messages traduits et vos corrections soient gardés <b>sans votre nom ni identifiant</b> (numéros, e-mails et liens retirés) pour enrichir la base de traduction de Tam-Tam (article 13 des <a href="/conditions" target="_blank" rel="noopener">Conditions générales</a>). Vos autres messages restent chiffrés et illisibles pour Tam-Tam.</p>
    <p class="hint">Si vous refusez, vous ne recevez aucune traduction : les messages s’affichent tels qu’ils ont été écrits. Vous pouvez changer d’avis à tout moment dans Réglages → Traduction.</p>
    <div class="actions"><button class="btn ghost" type="button" data-act="trConsentNo">Non, pas de traduction</button><button class="btn" type="button" data-act="trConsentYes"${open ? ' data-open="1"' : ''}>J’accepte et j’active</button></div></div>`, 'Traduction');
}
function trSheet() {
  const c = S.chats.get(S.chatId); if (!c || !Tr.st) return;
  const side = S.trSide || 'in', cur = side === 'out' ? Tr.outL(c.id) : Tr.inL(c.id), L = l => (LANG_FR[l] || l).replace(/^./, x => x.toUpperCase());
  const top = ['fr', 'en', 'wo', 'ff', 'ar', 'pt', 'es', 'sw', 'ln', 'bm', 'ha', 'yo'].filter(l => Tr.st.langs.includes(l)), rest = Tr.st.langs.filter(l => !top.includes(l)).sort((a, b) => L(a).localeCompare(L(b), 'fr'));
  const btn = l => `<button type="button" class="lang-opt" data-act="trPick" data-v="${l}" aria-pressed="${l === cur}">${esc(L(l))}<small>${l.toUpperCase()}</small></button>`;
  const who = c.type === 'group' ? 'les membres du groupe reçoivent' : `${esc(first(chatTitle(c)))} reçoit`;
  const keep = layer.querySelector('.tr-scroll'), y = keep ? keep.scrollTop : 0;
  sheet(`${head('Langues de cette discussion')}<div class="sheet-body tr-body"><div class="tr-fixed">
    <div class="seg tr-seg" role="tablist"><button type="button" role="tab" data-act="trSide" data-v="in" aria-selected="${side === 'in'}"><small>Je reçois en</small><b>${Tr.inL(c.id) ? esc(L(Tr.inL(c.id))) : 'pas de traduction'}</b></button><button type="button" role="tab" data-act="trSide" data-v="out" aria-selected="${side === 'out'}"><small>Mon contact reçoit en</small><b>${Tr.outL(c.id) ? esc(L(Tr.outL(c.id))) : 'pas de traduction'}</b></button></div>
    <div class="tr-hint"><p class="hint">${side === 'in' ? 'Choisissez la langue dans laquelle <b>vous recevez</b> les messages de cette discussion. Ils seront traduits automatiquement.' : `Choisissez la langue dans laquelle <b>${who}</b> vos messages. Vous écrivez dans votre langue, Tam-Tam envoie la traduction.`}</p><button class="btn sm" type="button" data-act="close">Terminé</button></div>
    ${side === 'in' && cur ? `<label class="pick chk learn"><input type="checkbox" data-act="trLearn"${Tr.learn(c.id) ? ' checked' : ''}><span><b>Mode apprentissage</b> : je reçois les messages dans leur langue d’origine pour m’exercer ; la traduction en ${esc(L(cur).toLowerCase())} reste cachée sous « Voir la traduction ».</span></label>` : ''}
    <div class="tr-none"><button type="button" class="lang-opt none" data-act="trNone" data-side="in" aria-pressed="${!Tr.inL(c.id)}"><span>Pas de traduction<small>je reçois</small></span>—</button><button type="button" class="lang-opt none" data-act="trNone" data-side="out" aria-pressed="${!Tr.outL(c.id)}"><span>Pas de traduction<small>mon contact reçoit</small></span>—</button></div></div>
    <div class="tr-scroll"><span class="lbl">Langues les plus utilisées</span><div class="lang-grid">${top.map(btn).join('')}</div>
    <span class="lbl">Autres langues</span><div class="lang-grid">${rest.map(btn).join('')}</div></div></div>`, 'Langues');
  const sc = layer.querySelector('.tr-scroll'); if (sc) sc.scrollTop = y;
}
function trBox() {
  const t = S.trset;
  if (!t) return `<div class="set-block" id="trBox"><h2>${I.translate} Traduction</h2><p class="hint">Permet de traduire un message reçu. Plafond : 480 000 caractères par mois, puis la traduction s’arrête jusqu’au 1er du mois suivant.</p><div><button class="btn sm ghost" type="button" data-act="trLoad">Afficher les réglages</button></div></div>`;
  const cl = t.provider === 'claude' || (!t.has && (S.trProv || 'claude') === 'claude');
  const pct = cl ? Math.min(100, Math.round((t.spent || 0) / (t.budget || 1) * 100)) : Math.min(100, Math.round(t.used / t.cap * 100));
  const usage = cl ? `Ce mois-ci : <b>${(t.spent || 0).toLocaleString('fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} $</b> dépensés sur ${t.budget.toLocaleString('fr-FR', {minimumFractionDigits: 2})} $ (${pct} %), soit ${t.used.toLocaleString('fr-FR')} caractères traduits. Base : ${(t.corpus && t.corpus.mt) || 0} traductions, ${(t.corpus && t.corpus.fix) || 0} corrections, ${t.promoted || 0} devenues communes. Le budget atteint, la traduction s’arrête jusqu’au 1er du mois.`
    : `Ce mois-ci : ${t.used.toLocaleString('fr-FR')} caractères traduits sur ${t.cap.toLocaleString('fr-FR')} gratuits (${pct} %). Au-delà, la traduction s’arrête jusqu’au 1er du mois.`;
  const pv = S.trProv || t.provider || 'claude';
  return `<form class="set-block" id="trBox" data-form="trset" autocomplete="off"><h2>${I.translate} Traduction</h2>
    <span class="lbl">Moteur de traduction</span><div class="seg" role="radiogroup"><button type="button" role="radio" data-act="trProv" data-v="claude" aria-checked="${pv === 'claude'}" aria-selected="${pv === 'claude'}">Claude (Anthropic)</button><button type="button" role="radio" data-act="trProv" data-v="google" aria-checked="${pv === 'google'}" aria-selected="${pv === 'google'}">Google</button></div>
    <p class="hint">${t.has ? `<b>Activée avec ${t.provider === 'claude' ? 'Claude' : 'Google'}.</b> ${usage}` : pv === 'claude' ? 'Collez ici la clé créée sur console.anthropic.com (rubrique « API Keys »).' : 'Collez ici la clé d’API créée dans Google Cloud (projet « tam-tam »).'}</p>
    <div class="field"><label for="trKey">Clé ${pv === 'claude' ? 'Anthropic' : 'Google'}${t.has ? ' (pour changer de clé ou de moteur)' : ''}</label><input id="trKey" type="password" autocomplete="off" spellcheck="false" placeholder="${pv === 'claude' ? 'sk-ant-…' : 'AIza…'}"></div>
    ${cl ? `<div class="field"><label for="trBudget">Budget maximum par mois (en dollars)</label><input id="trBudget" type="number" min="0.1" max="100" step="0.05" value="${t.budget || 1.65}"></div>` : ''}
    <p class="err" id="trErr" role="alert" hidden></p><div class="actions" style="justify-content:flex-start"><button class="btn sm" type="submit">Enregistrer</button>${t.has ? '<button class="btn sm ghost" type="button" data-act="trOff">Désactiver</button>' : ''}</div></form>`;
}
function availPicker() {
  const a = (S.me && S.me.avail) || 'on';
  return `<div class="avail" role="radiogroup" aria-label="Ma disponibilité">${[['off', 'Hors ligne'], ['busy', 'Occupé'], ['on', 'En ligne']].map(([v, l]) => `<button type="button" role="radio" class="av-opt ${v}" data-act="availSet" data-v="${v}" aria-checked="${a === v}"><i aria-hidden="true"></i><span>${l}</span></button>`).join('')}</div>`;
}
function settingsBody() {
  const me = S.me, p = me.pub || {}, pv = me.priv || {};
  const f = (set, k, l, ph = '', type = 'text', max = 80) => `<div class="field"><label for="p-${k}">${l}</label>${k === 'bio' ? `<textarea id="p-${k}" data-set="${set}" data-k="${k}" rows="2" maxlength="200" placeholder="${ph}">${esc((set === 'pub' ? p : pv)[k] || '')}</textarea>` : `<input id="p-${k}" data-set="${set}" data-k="${k}" type="${type}" maxlength="${max}" placeholder="${ph}" value="${esc((set === 'pub' ? p : pv)[k] || '')}">`}</div>`;
  const cs = S.contacts.contacts, close = new Set(me.close || []);
  return `<div class="set">
    <div class="set-top">${avatar(me, 'lg')}<div><b>${esc(me.name)}</b><span>@${esc(me.handle)} · ${esc(me.email)}</span></div></div>
    <div class="set-block" id="phBlock"><h2>Photo de profil</h2>
      <div class="ph-pick"><span class="pp-prev">${pendAvatar()}</span><p class="hint" style="margin:0">${S.pp ? 'Aperçu de votre nouveau choix. Il ne remplace votre photo actuelle qu’après « Valider ».' : 'Choisissez une photo ou un avatar dessiné. Rien ne change tant que vous n’avez pas validé.'}</p></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-act="mePhoto">${I.camera}Prendre ou choisir une photo</button><button class="btn sm ghost" type="button" data-act="avShow" aria-pressed="${!!S.showAv}">Utiliser un avatar</button><input type="file" id="meIn" accept="image/*" hidden></div>
      ${S.showAv ? `${avGallery(S.pp && S.pp.kind === 'av' ? S.pp.av : me.avatar, 'me')}` : ''}
      ${S.pp ? `<div class="actions"><button class="btn ghost" type="button" data-act="pendCancel">Annuler</button><button class="btn" type="button" data-act="pendOk">Valider et changer ma photo de profil</button></div>` : ''}</div>
    <div class="set-block"><h2>${I.globe} Profil public et privé</h2><p class="hint">Ils se règlent dans <b>Discussions → Mon profil</b>.</p><div><button class="btn sm ghost" type="button" data-act="goProfile">Ouvrir mon profil</button></div></div>
    <div class="set-block"><h2>${I.shield} Chiffrement de bout en bout</h2><p class="hint">Vos messages et vos photos sont chiffrés sur votre appareil : seules les personnes de la discussion peuvent les lire, pas même le serveur.</p>
      <p>Votre code de sécurité : <b class="fp" id="myFp">…</b></p><p class="hint">Comparez-le avec celui qu’un proche voit sur votre profil pour vérifier que personne ne s’est glissé entre vous.</p>
      <div><button class="btn sm ghost" type="button" data-act="keyCode">${I.key}Changer le code de sauvegarde</button></div></div>
    ${lockSettingsHtml()}
    ${Priv.settingsHtml()}
    ${Device.settingsHtml()}
    <div class="set-block"><h2>Personnes bloquées</h2>${(me.blocked || []).length ? me.blocked.map(u => `<div class="adm-row">${avatar(u, 'xs')}<span>${esc(u.name)}</span><button class="btn sm ghost" type="button" data-act="unblock" data-id="${u.id}">Débloquer</button></div>`).join('') : '<p class="hint">Personne n’est bloqué.</p>'}</div>
    <div class="set-block"><h2>${I.shield} Appareils connectés</h2><p class="hint">Un téléphone perdu ou prêté ? Déconnectez-le à distance. Changer votre mot de passe déconnecte aussi tous les autres appareils.</p><div><button class="btn sm ghost" type="button" data-act="devList">Voir mes appareils connectés</button></div></div>
    <div class="set-block"><h2>Compte</h2><div class="actions" style="justify-content:flex-start"><button class="btn sm ghost" type="button" data-act="pwSheet">${I.key}Changer le mot de passe</button><a class="btn sm ghost" href="/conditions" target="_blank" rel="noopener">Conditions et confidentialité</a><a class="btn sm ghost" href="/demo/" target="_blank" rel="noopener">Voir la maquette</a></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn sm ghost" type="button" data-act="logout">Se déconnecter</button><button class="btn sm danger" type="button" data-act="delSheet">Supprimer mon compte</button></div></div>
    ${Tr.settingsHtml()}
    ${me.admin ? mailBox() : ''}
    ${me.admin ? trBox() : ''}
    ${me.admin ? googleBox() : ''}
    ${me.admin ? `<div class="set-block" id="adm"><h2>${I.shield} Administration</h2><div><button class="btn sm" type="button" data-act="admLoad">Afficher les membres et les signalements</button></div></div>` : ''}
    <p class="hint" style="text-align:center">Tam-Tam · version 1.35</p></div>`;
}
let saveT, pending = {};
function queueSave(patch) {
  for (const k of Object.keys(patch)) { if (typeof patch[k] === 'object' && patch[k] && !Array.isArray(patch[k])) pending[k] = Object.assign(pending[k] || {}, patch[k]); else pending[k] = patch[k]; }
  clearTimeout(saveT); saveT = setTimeout(async () => { const body = pending; pending = {}; try { const r = await api('/api/me', body); S.me = r.me; keepUsers([r.me]); } catch (e) { toast(e.message); } }, 700);
}
async function saveNow(body, msg) { try { const r = await api('/api/me', body); S.me = r.me; keepUsers([r.me]); renderBody(); renderHead(); if ('trConsent' in body && S.chatId) { renderComposer(); renderMessages(true); } if (msg) toast(msg); } catch (e) { toast(e.message); } }
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
  async lockBio() { S.bioTried = true; let ok = false; try { ok = await Lock.bioVerify(S.lock.bio); } catch {} if (ok) return unlock(); if (S.lockStep === 'bio' || !S.lockStep) S.lockStep = 'pattern'; showLock('Empreinte ou visage non reconnu : dessinez votre schéma.'); },
  lockPassStep() { S.lockStep = 'pass'; showLock(); }, lockPatStep() { S.lockStep = 'pattern'; S.lockTries = 0; showLock(); },
  lockForgot() { confirmSheet('Se reconnecter ?', 'Vous allez être déconnecté. Reconnectez-vous avec votre e-mail et votre mot de passe, puis choisissez un nouveau schéma. Vos messages restent protégés par votre code de sauvegarde.', 'Me reconnecter', 'lockReset'); },
  async lockReset() { await Lock.set(S.me.id, {type: 'off', delay: 60}); ACT.logout(); },
  lockSetup() { lockSetupSheet(1); },
  async lockDelay(d) { S.lock.delay = +d.v; await Lock.set(S.me.id, S.lock); renderBody(); },
  async lockOff() { S.lock = {type: 'off', delay: 60}; await Lock.set(S.me.id, S.lock); renderBody(); toast('Verrouillage désactivé'); },
  async bioOn() { if (!await Lock.bioCheck()) return toast('Cet appareil ou ce navigateur ne propose pas l’empreinte ou le visage.'); try { S.lock.bio = await Lock.bioRegister(S.me); await Lock.set(S.me.id, S.lock); closeLayer(); renderBody(); toast('Empreinte ou visage activé'); } catch { toast('L’enregistrement de l’empreinte a été annulé.'); } },
  async bioOff() { delete S.lock.bio; await Lock.set(S.me.id, S.lock); renderBody(); },
  async invShare() { try { await navigator.share({title: 'tam-tam', text: inviteText(), url: S.lastInvite.url}); } catch {} },
  async invContacts() {
    try { const c = await navigator.contacts.select(['name', 'tel'], {multiple: false}); const tel = c && c[0] && c[0].tel && c[0].tel[0]; if (!tel) return;
      location.href = `sms:${tel.replace(/\s+/g, '')}?body=${encodeURIComponent(inviteText())}`; } catch { toast('Le choix dans les contacts n’est pas disponible ici. Utilisez « Partager ».'); }
  },
  keyCode() { sheet(`${head('Changer le code de sauvegarde')}<form data-form="rekey"><div class="sheet-body"><p class="hint">Le nouveau code remplace l’ancien pour retrouver vos messages sur un autre appareil.</p><div class="field"><label for="rk1">Nouveau code (8 caractères minimum)</label><input id="rk1" type="password" autocomplete="new-password"></div><div class="field"><label for="rk2">Confirmez</label><input id="rk2" type="password" autocomplete="new-password"></div><p class="err" id="rkErr" role="alert" hidden></p><div class="actions"><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Code', '#rk1'); },
  forgot() { const em = ($('#aMail') || {}).value; if (em) A.fmail = em.trim(); A.mode = 'forgot'; A.step = 1; renderAuth(); },
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
    else { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'av', av: a}; renderBody(); }
  },
  tab(d) { if (d.t === 'calls') Calls.log = null; S.tab = d.t; closeLayer(); renderAll(); $('#body').scrollTop = 0; if (matchMedia('(max-width:820px)').matches) $('.app').dataset.view = 'list'; },
  fab() { newChatSheet(); },
  open(d) { openChat(+d.id); },
  back() { S.chatId = null; $('.app').dataset.view = 'list'; renderMain(); renderBody(); },
  async write(d) { closeLayer(); try { const r = await api('/api/chats/direct', {userId: +d.id}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat); S.tab = 'chats'; renderAll(); openChat(r.chat.id); } catch (e) { toast(e.message); } },
  close() { closeLayer(); },
  scrim(d, el, e) { if (e.target === el) closeLayer(); },
  invNew: async () => { try { S.lastInvite = await api('/api/invites', {}); renderBody(); if ($('#addSheet')) Add.render(); } catch (e) { toast(e.message); } },
  invCopy() { const t = S.lastInvite.url; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Lien copié : collez-le dans un message à vos proches.'), () => toast('Sélectionnez le lien et copiez-le.')); },
  cRequest: d => contactAct('request', +d.id), cAccept: d => contactAct('accept', +d.id), cDecline: d => contactAct('decline', +d.id), cRemove: d => contactAct('remove', +d.id),
  cRemoveAsk(d) { confirmSheet('Retirer ce contact ?', 'Vous ne pourrez plus vous écrire tant que l’un de vous n’aura pas renvoyé de demande.', 'Retirer', 'cRemoveYes', d.id); },
  cRemoveYes(d) { closeLayer(); contactAct('remove', +d.id); },
  prof(d) { const back = !!document.getElementById('addSheet'); if (back) S.addY = (document.getElementById('addSheet') || {}).scrollTop || 0; profSheet(+d.id, back); },
  profBack() { const y = S.addY || 0; Add.open(); setTimeout(() => { const el = document.getElementById('addSheet'); if (el) el.scrollTop = y; }, 400); },
  async shareTel(d) { try { await api('/api/contacts/share-tel', {id: +d.id, on: !!d.on}); await loadContacts(); toast(d.on ? 'Votre numéro est maintenant visible pour ce contact.' : 'Votre numéro est de nouveau caché pour ce contact.'); profSheet(+d.id); } catch (e) { toast(e.message); } },
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
  camera() { Cam.open(); },
  phCancel() { S.once = false; closeLayer(); renderComposer(); },
  trProv(d) { S.trProv = d.v; const el = $('#trBox'); if (el) el.outerHTML = trBox(); },
  trMsg(d) { closeLayer(); Tr.off.delete(+d.id); Tr.run(+d.id); },
  trOrig(d) { Tr.shown.delete(+d.id); Tr.off.add(+d.id); renderMessages(true); },
  trAuto() { if (!S.me.trConsent) return trConsentAsk(true); S.trSide = S.trSide || 'in'; trSheet(); },
  async trReveal(d) { const id = +d.id, m = (S.msgs.get(S.chatId) || []).find(x => x.id === id), inL = Tr.inL(S.chatId); if (!m) return; Tr.open.add(id); if (!(m.orig != null && m.olang === inL) && !Tr.get(id, inL)) await Tr.run(id, true, inL); renderMessages(true); },
  trLearn() { const c = S.chats.get(S.chatId); if (!c) return; Tr.setLearn(c.id, !Tr.learn(c.id)); Tr.open.clear(); renderMessages(true); trSheet(); if (!Tr.learn(c.id)) Tr.autoRun(c); },
  trSide(d) { S.trSide = d.v; trSheet(); },
  trPick(d) {
    const c = S.chats.get(S.chatId); if (!c) return;
    if (S.trSide === 'out') Tr.setOut(c.id, d.v); else { Tr.setIn(c.id, d.v); Tr.shown.clear(); Tr.off.clear(); }
    renderComposer(); renderMessages(true); trSheet(); if (S.trSide !== 'out' && d.v) Tr.autoRun(c);
  },
  trFix(d) {
    const id = +d.id, m = (S.msgs.get(S.chatId) || []).find(x => x.id === id); if (!m) return;
    const mine = m.from === S.me.id, L = l => (LANG_FR[l] || l || '').replace(/ \(essai\)$/, '');
    let src, sl, tgt, tl;
    if (m.orig != null && m.tlang) { src = m.orig; sl = m.olang; tgt = (!mine && Tr.fix(id)) ? Tr.fix(id).text : m.text; tl = m.tlang; }
    else { const v = Tr.inL(S.chatId) || Tr.view(S.chatId), t = Tr.get(id, v); if (!t) return; src = m.text; sl = t.from; tgt = Tr.fix(id) ? Tr.fix(id).text : t.text; tl = v; }
    S.fixing = {id, src, sl, tgt, tl, mine};
    sheet(`${head(mine ? 'Corriger la traduction de mon message' : 'Corriger cette traduction')}<form class="sheet-body" data-form="trFixSave">
      <div class="fix-box"><small>${mine ? 'Ce que vous avez écrit' : 'Message reçu'}${sl ? ' (' + esc(L(sl)) + ')' : ''}</small><p>${esc(src)}</p></div>
      <div class="fix-box"><small>Traduction actuelle (${esc(L(tl))})</small><p>${esc(tgt)}</p></div>
      <div class="field"><label for="fixIn">Votre correction (${esc(L(tl))})</label><textarea id="fixIn" rows="3" maxlength="2000">${esc(tgt)}</textarea></div>
      <p class="hint">${mine ? 'Votre contact verra aussitôt la version corrigée.' : 'Vous verrez désormais votre version.'} ${S.me.trConsent ? 'Merci : votre correction enrichit la base de traduction de Tam-Tam, sans votre nom.' : 'Pour que vos corrections enrichissent aussi la base de traduction de Tam-Tam, activez la contribution dans Réglages → Traduction.'}</p>
      <div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="submit">Enregistrer ma correction</button></div></form>`, 'Correction', '#fixIn');
  },
  async trConsentYes(d) { closeLayer(); await saveNow({trConsent: true}, 'Traduction activée. Merci de contribuer à la base de Tam-Tam !'); renderComposer(); if (S.chatId) { renderMessages(true); if (d.open) { S.trSide = 'in'; trSheet(); } } },
  async trConsentNo() { closeLayer(); await saveNow({trConsent: false}, 'Pas de traduction : vous recevez les messages tels qu’ils ont été écrits.'); if (S.chatId) { renderComposer(); renderMessages(true); } },
  trConsentTog() { saveNow({trConsent: !S.me.trConsent}); },
  trNone(d) { const c = S.chats.get(S.chatId); if (!c) return; if (d.side === 'out') Tr.setOut(c.id, ''); else { Tr.setIn(c.id, ''); Tr.setLearn(c.id, false); } S.trSide = d.side; renderComposer(); renderMessages(true); trSheet(); },
  trFlip(d) { const id = +d.id; Tr.flip.has(id) ? Tr.flip.delete(id) : Tr.flip.add(id); renderMessages(true); },
  async trLoad() { try { S.trset = await api('/api/admin/translate'); const el = $('#trBox'); if (el) el.outerHTML = trBox(); } catch (e) { toast(e.message); } },
  async trOff() { try { await api('/api/admin/translate', {off: true}); S.trset = await api('/api/admin/translate'); Tr.st = await api('/api/translate/status'); renderBody(); toast('Traduction désactivée'); } catch (e) { toast(e.message); } },
  recStart() { Rec.start(); }, recCancel() { Rec.cancel(); }, recSend() { Rec.send(); },
  availSet(d) { if (S.me.avail === d.v) return; saveNow({avail: d.v}, {on: 'Vous apparaissez en ligne', busy: 'Vous apparaissez occupé', off: 'Vous apparaissez hors ligne'}[d.v]).then(() => renderHead()); },
  onceTog(d, el) { S.once = !S.once; document.querySelectorAll('.once-tog').forEach(b => b.setAttribute('aria-pressed', S.once)); const i = $('#msgIn'); if (i) i.placeholder = S.once ? 'Message à vue unique' : 'Message'; toast(S.once ? 'Vue unique activée : le prochain message ne pourra être ouvert qu’une fois.' : 'Vue unique désactivée'); },
  async onceOpen(d) {
    const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); if (!m) return;
    let inner = '';
    if (m.locked) return toast('Ce message ne peut pas être lu sur cet appareil.');
    if (m.media) {
      try { const r = await fetch(m.media, {credentials: 'same-origin'}); if (!r.ok) throw 0; const aud = m.kind === 'audio', vid = m.kind === 'video'; const url = URL.createObjectURL(new Blob([await E2E.decBytes(m._key, m.miv, await r.arrayBuffer())], {type: aud ? (m.amime || 'audio/webm') : vid ? (m.amime || 'video/mp4') : 'image/jpeg'})); S.onceUrl = url;
        inner = vid ? `<video src="${url}" playsinline autoplay controls controlslist="nodownload" disablepictureinpicture></video>` : aud ? `<div class="once-aud">${I.mic}<audio src="${url}" controls autoplay controlslist="nodownload"></audio></div>` : `<img src="${url}" alt="Photo à vue unique" draggable="false">`; }
      catch { return toast('Cette photo n’est plus disponible.'); }
    }
    S.onceMsg = m.id;
    layer.innerHTML = `<div class="once-view" role="dialog" aria-modal="true" aria-label="Vue unique"><div class="bar"><button class="ib" type="button" data-act="onceClose" aria-label="Fermer">${I.close}</button><b>Vue unique</b><small>Se ferme et s’efface quand vous quittez</small></div>
      <div class="stage">${inner}${m.text ? `<p class="once-txt">${esc(m.text)}</p>` : ''}</div>${watermark()}</div>`;
  },
  onceClose() { onceDone(); },
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
  stCancel() { if (S.sc && S.sc.url) URL.revokeObjectURL(S.sc.url); if (S.sc && S.sc.music) URL.revokeObjectURL(S.sc.music.url); S.sc = null; Emoji.close(); closeLayer(); },
  stAud(d) { keepSt(); S.sc.aud = d.a; if (d.a === 'private' && !(S.me.close || []).length) S.sc.grp = true; stComposer(); },
  // Changer la couleur ne fait pas apparaître le clavier : on change seulement le fond.
  stBg(d) { S.sc.bg = +d.h; const b = document.querySelector('.st-box'); if (b) b.style.setProperty('--h', d.h); document.querySelectorAll('.st-bgs .sw').forEach(x => x.setAttribute('aria-pressed', x.dataset.h === d.h)); },
  stPhoto() { keepSt(); $('#stIn').click(); },
  stCam() { keepSt(); Cam.open({...stOpts(), mode: 'photo'}); },
  stVid() { keepSt(); Cam.open({...stOpts(), mode: 'video'}); },
  stText() { keepSt(); if (S.sc.kind !== 'text') { if (S.sc.url) URL.revokeObjectURL(S.sc.url); Object.assign(S.sc, {kind: 'text', blob: null, url: null}); } S.sc.tab = null; stComposer(); },
  stFontTab() { keepSt(); S.sc.tab = S.sc.tab === 'font' ? null : 'font'; stComposer(); },
  stFont(d) { S.sc.font = +d.i; const b = document.querySelector('.st-box'); if (b) b.style.setProperty('--stf', stFont(S.sc.font)); document.querySelectorAll('.st-fonts button').forEach(x => x.setAttribute('aria-pressed', x.dataset.i === d.i)); },
  stMus() { keepSt(); $('#stMusIn').click(); },
  stMusOff() { keepSt(); if (S.sc.music) URL.revokeObjectURL(S.sc.music.url); S.sc.music = null; stComposer(); },
  stGrp() { keepSt(); S.sc.grp = true; stComposer(); },
  stGrpOk() { keepSt(); S.sc.grp = false; stComposer(); }, stGrpBg() { ACT.stGrpOk(); },
  stNoPhoto() { keepSt(); if (S.sc.url) URL.revokeObjectURL(S.sc.url); Object.assign(S.sc, {kind: 'text', blob: null, url: null}); stComposer(); },
  stPublish() { stPublish(); },
  closeEdit() { keepSt(); S.sc = S.sc; closeLayer(); S.tab = 'settings'; renderAll(); setTimeout(() => { const el = document.querySelector('input[name="close"]'); if (el) el.scrollIntoView({block: 'center'}); }, 50); toast('Cochez les personnes de votre groupe privé, puis revenez publier votre statut.'); },
  svNext() { svStep(1); }, svPrev() { svStep(-1); },
  svViews() {
    const it = S.statuses.mine.items[S.sv.i]; clearTimeout(svT);
    sheet(`${head('Vu par')}<div class="sheet-scroll">${(it.views || []).length ? it.views.map(v => `<div class="row">${avatar(v.user)}<span class="row-name">${esc(v.user.name)}</span><span class="row-prev"><span>${dayLabel(v.at)}, ${hm(v.at)}</span></span></div>`).join('') : '<p class="empty">Personne pour l’instant.</p>'}</div>`, 'Vu par');
  },
  stDelAsk(d) { clearTimeout(svT); confirmSheet('Supprimer ce statut ?', 'Il disparaîtra pour tous vos contacts.', 'Supprimer', 'stDelYes', d.id); },
  async stDelYes(d) { closeLayer(); try { await api(`/api/statuses/${d.id}/delete`, {}); await loadStatuses(); renderStories(); toast('Statut supprimé'); } catch (e) { toast(e.message); } },
  async privTo(d) { await saveNow({privTo: d.v}); PP.save().catch(e => toast(e.message)); },
  mePhoto() { $('#meIn').click(); },
  cropRot() { if (!S.crop) return; S.crop.rot = (S.crop.rot + 1) % 4; S.crop.x = S.crop.y = 0; drawCrop(); },
  async cropOk(d, el) {
    if (!S.crop) return; el.disabled = true;
    const cv = document.createElement('canvas'); cv.width = cv.height = 640; paintCrop(cv.getContext('2d'), 640, false);
    try { const b = await new Promise((res, rej) => cv.toBlob(x => x ? res(x) : rej(new Error('Photo illisible.')), 'image/jpeg', .88));
      URL.revokeObjectURL(S.crop.url); S.crop = null; closeLayer();
      if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'photo', blob: b, url: URL.createObjectURL(b)}; S.showAv = false; renderBody();
      setTimeout(() => { const el = $('#phBlock'); if (el) el.scrollIntoView({block: 'center'}); }, 50); toast('Vérifiez l’aperçu, puis touchez « Valider ».'); }
    catch (e) { el.disabled = false; toast(e.message); }
  },
  soundToggle() { Sound.set(!Sound.on()); renderBody(); if (Sound.on()) Sound.msg(true); },
  meNoPhoto() { saveNow({photo: null}, 'Avatar rétabli'); },
  avShow() { S.showAv = !S.showAv; if (S.showAv && !(S.pp && S.pp.kind === 'av')) { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'av', av: avNorm(S.me.avatar)}; } renderBody(); },
  pendCancel() { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = null; S.showAv = false; renderBody(); },
  async pendOk(d, el) {
    const P = S.pp; if (!P) return; el.disabled = true;
    try {
      if (P.kind === 'photo') { const up = await upload(P.blob); URL.revokeObjectURL(P.url); S.pp = null; S.showAv = false; await saveNow({photo: up.id}, 'Photo de profil changée'); }
      else { S.pp = null; S.showAv = false; await saveNow({avatar: P.av, photo: null}, 'Avatar choisi comme photo de profil'); }
    } catch (e) { el.disabled = false; toast(e.message); }
  },
  picAdd(d) { S.picSlot = {set: d.set, i: +d.i}; $('#picIn').click(); },
  async picDel(d) { if (d.set === 'priv' && PP.data) { try { await PP.setPic(+d.i, null); renderBody(); toast('Photo retirée'); } catch (e) { toast(e.message); } return; } try { const r = await api('/api/me/pics', {set: d.set, slot: +d.i, media: null}); S.me = r.me; renderBody(); toast('Photo retirée'); } catch (e) { toast(e.message); } },
  picView(d) { const priv = /^blob:/.test(d.src); sheet(`${head('Photo')}<div class="sheet-body${priv ? ' nocopy' : ''}" style="align-items:center;position:relative"><img class="pic-big" src="${esc(d.src)}" alt="Photo du profil" draggable="false">${priv ? watermark() : ''}</div>`, 'Photo'); },
  avHide() { S.showAv = false; renderBody(); },
  profTab(d) { S.profTab = d.t; renderBody(); },
  goProfile() { S.tab = 'chats'; S.filt = 'me'; renderAll(); },
  notif() { if (!('Notification' in window)) return toast('Votre navigateur ne permet pas les notifications.'); Notification.requestPermission().then(p => { renderBody(); toast(p === 'granted' ? 'Notifications activées' : 'Notifications refusées dans le navigateur'); }); },
  async devList() {
    let r; try { r = await api('/api/sessions'); } catch (e) { return toast(e.message); }
    const name = ua => { ua = ua || ''; const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone / iPad' : /Windows/.test(ua) ? 'Ordinateur Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
      const br = /Brave/.test(ua) ? 'Brave' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''; return os + (br ? ' · ' + br : ''); };
    const when = t => t ? `${dayLabel(t)}, ${hm(t)}` : 'avant novembre 2026';
    sheet(`${head('Appareils connectés')}<div class="sheet-body">${r.sessions.map(x => `<div class="adm-row"><span class="grow"><b>${esc(name(x.ua))}</b>${x.current ? ' <small>(cet appareil)</small>' : ''}<br><small class="hint">Dernière utilisation : ${esc(when(x.seen))}</small></span>${x.current ? '' : `<button class="btn sm ghost" type="button" data-act="devOut" data-id="${x.id}">Déconnecter</button>`}</div>`).join('')}
      ${r.sessions.length > 1 ? '<div class="actions"><button class="btn danger" type="button" data-act="devOthers">Déconnecter tous les autres appareils</button></div>' : '<p class="hint">Aucun autre appareil n’est connecté.</p>'}</div>`, 'Appareils connectés');
  },
  async devOut(d) { try { await api('/api/sessions/revoke', {id: +d.id}); toast('Appareil déconnecté'); ACT.devList(); } catch (e) { toast(e.message); } },
  async devOthers() { try { await api('/api/sessions/revoke', {others: true}); toast('Tous les autres appareils sont déconnectés'); ACT.devList(); } catch (e) { toast(e.message); } },
  listedTog() { saveNow({listed: !S.me.listed}, S.me.listed ? 'Vous n’apparaissez plus dans la liste des membres' : 'Vous apparaissez dans la liste des membres'); },
  pwSheet() { sheet(`${head('Changer le mot de passe')}<form data-form="pw"><div class="sheet-body"><div class="field"><label for="pwOld">Mot de passe actuel</label><input id="pwOld" type="password" autocomplete="current-password"></div><div class="field"><label for="pwNew">Nouveau mot de passe (8 caractères minimum)</label><input id="pwNew" type="password" autocomplete="new-password"></div><p class="err" id="pwErr" role="alert" hidden></p><div class="actions"><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Mot de passe', '#pwOld'); },
  delSheet() { sheet(`${head('Supprimer mon compte')}<form data-form="del"><div class="sheet-body"><p>Votre compte, votre profil, vos photos et vos statuts seront effacés. Vos messages seront remplacés par « Ce message a été supprimé ». C’est définitif.</p><div class="field"><label for="delPw">Votre mot de passe pour confirmer</label><input id="delPw" type="password" autocomplete="current-password"></div><p class="err" id="delErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn danger" type="submit">Supprimer définitivement</button></div></div></form>`, 'Supprimer', '#delPw'); },
  async logout() { await Device.disableHere(); await api('/api/logout', {}).catch(() => {}); if (es) es.close(); S.me = null; location.href = '/'; },
  admLoad() { adminLoad(); },
  async admDone(d) { await api('/api/admin/report-done', {id: +d.id}).catch(e => toast(e.message)); adminLoad(); },
  async admReset(d) { try { const r = await api('/api/admin/reset', {userId: +d.id}); sheet(`${head('Lien de réinitialisation')}<div class="sheet-body"><p>Envoyez ce lien à la personne (valable 2 jours). Il lui permet de choisir un nouveau mot de passe.</p><div class="invite-url">${esc(r.url)}</div><div class="actions"><button class="btn" type="button" data-act="copyTxt" data-t="${esc(r.url)}">${I.copy}Copier</button></div></div>`, 'Lien'); } catch (e) { toast(e.message); } },
  copyTxt(d) { navigator.clipboard && navigator.clipboard.writeText(d.t).then(() => toast('Copié')); },
};
function keepSt() { const t = ($('#stText') || $('#stCap') || {}).value; if (t != null && S.sc) S.sc.text = t; }

const FORMS = {
  async lockPass(f) { const i = $('#lkPass'), b = f.querySelector('button'); if (!i.value) return; b.disabled = true; try { await api('/api/me/unlock', {pass: i.value}); unlock(); } catch (e) { b.disabled = false; i.value = ''; const er = $('#lkErr'); er.textContent = e.message; er.hidden = false; } },
  auth: submitAuth,
  keys: submitKeys,
  async rekey() { const a = $('#rk1').value, b = $('#rk2').value, er = $('#rkErr'); if (codeWeak(a)) { er.textContent = codeWeak(a); er.hidden = false; return; } if (a !== b) { er.textContent = 'Les deux codes ne sont pas identiques.'; er.hidden = false; return; }
    try { await api('/api/keys', {pubkey: E2E.pubJwk, backup: await E2E.backup(a)}); closeLayer(); toast('Code de sauvegarde changé'); } catch (e) { er.textContent = e.message; er.hidden = false; } },
  async mail(f) { const v = id => $('#' + id).value.trim(), er = $('#mlErr'), ok = $('#mlOk'); er.hidden = true; ok.hidden = true;
    try { await api('/api/admin/mail', {host: v('mlHost'), port: +v('mlPort'), user: v('mlUser'), pass: $('#mlPass').value, from: v('mlFrom'), test: true}); ok.textContent = `Réglage enregistré. Un e-mail de test a été envoyé à ${S.me.email}.`; ok.hidden = false; $('#mlPass').value = ''; }
    catch (e) { er.textContent = e.message; er.hidden = false; } },
  async gset() { const er = $('#gErr'), ok = $('#gOk'); er.hidden = true; ok.hidden = true;
    try { await api('/api/admin/google', {id: $('#gId').value.trim(), secret: $('#gSecret').value}); S.gset = await api('/api/admin/google'); $('#gBox').outerHTML = googleBox(); const o = $('#gOk'); o.textContent = 'Enregistré. Déconnectez-vous pour voir le bouton « Continuer avec Google ».'; o.hidden = false; }
    catch (e) { er.textContent = e.message; er.hidden = false; } },
  async trset() { const er = $('#trErr'); er.hidden = true; const k = $('#trKey').value.trim(), bi = $('#trBudget'), budget = bi ? +bi.value : undefined; if (!k && !(S.trset && S.trset.has)) return;
    try { await api('/api/admin/translate', {key: k, budget, provider: S.trProv || (S.trset && S.trset.provider) || 'claude'}); S.trset = await api('/api/admin/translate'); Tr.st = await api('/api/translate/status'); renderBody(); toast('Traduction activée'); }
    catch (e) { er.textContent = e.message; er.hidden = false; } },
  async trFixSave() {
    const f = S.fixing, v = ($('#fixIn').value || '').trim(); if (!f || !v) return;
    if (v === f.tgt) { closeLayer(); return; }
    try {
      if (f.mine) {
        const c = S.chats.get(S.chatId), m = (S.msgs.get(S.chatId) || []).find(x => x.id === f.id);
        const {env} = await E2E.seal({t: v, o: f.src, ol: f.sl || '', tl: f.tl, fx: 1}, recipients(c));
        await api(`/api/messages/${f.id}/reseal`, {enc: env}); if (m) { m.text = v; m.fx = true; }
      } else Tr.ls('tt-fix:' + f.id, JSON.stringify({text: v}));
      await Tr.minePut(f.src, f.tl, {text: v, from: f.sl || ''}).catch(() => {});
      // Vote : à partir de 3 personnes avec la même correction, elle devient la traduction commune.
      let promoted = false;
      if (S.me.trConsent) try {
        const k = await Tr.keys(f.src, f.tl), cid = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tt-fix|' + Tr.norm(v))))].map(b => b.toString(16).padStart(2, '0')).join('');
        const r = await api('/api/translate/vote', {id: k.id, cid});
        if (r.promote) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k.key, new TextEncoder().encode(JSON.stringify({text: v, from: f.sl || null})))); await api('/api/translate/promote', {id: k.id, cid, iv: Tr.b64(iv), ct: Tr.b64(ct)}); promoted = true; }
      } catch {}
      Tr.give(f.src, f.sl, v, f.tl, 'fix', f.mine ? S.me.id : ((S.msgs.get(S.chatId) || []).find(x => x.id === f.id) || {}).from);
      closeLayer(); renderMessages(true); toast(promoted ? 'Correction enregistrée. Plusieurs personnes ont proposé la même : elle devient la traduction pour tout le monde !' : 'Correction enregistrée : vous la retrouverez à chaque fois que cette phrase reviendra.');
    } catch (e) { toast(e.message); }
  },
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
  if (el.dataset.act === 'stGrpBg' && e.target !== el) return;
  if (el.dataset.act !== 'scrim') e.preventDefault();
  if (el.dataset.act === 'scrim' && e.target !== el) return;
  fn(el.dataset, el, e);
});
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); const fn = FORMS[f.dataset.form]; if (fn) fn(f); });
document.addEventListener('input', e => {
  if (e.target.id === 'cgq') { const q = e.target.value.trim().toLowerCase(), box = e.target.closest('.grp-box'); box && box.querySelectorAll('.picks .pick').forEach(l => { l.hidden = !!q && !l.textContent.toLowerCase().includes(q); }); }
  const t = e.target;
  if (t.id === 'q') { S.q = t.value; renderBody(); }
  else if (t.id === 'fq') searchPeople(t.value);
  else if (t.id === 'msgIn') { autoGrow(t); syncSend(); const n = Date.now(); if (n - typT > 2500 && t.value.trim()) { typT = n; api(`/api/chats/${S.chatId}/typing`, {}).catch(() => {}); } }
  else if (t.dataset && t.dataset.set === 'priv' && PP.data) PP.setField(t.dataset.k, t.value);
  else if (t.dataset && (t.dataset.set === 'pub' || t.dataset.set === 'priv') && t.tagName !== 'SELECT') queueSave({[t.dataset.set]: {[t.dataset.k]: t.value}});
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'fileIn' || t.id === 'camIn') { const f = t.files[0]; t.value = ''; if (f) { if (/^video\//.test(f.type)) Edit.videoFile(f); else Edit.photoFile(f); } }
  else if (t.id === 'stIn' || t.id === 'stCamIn') { const f = t.files[0]; t.value = ''; if (!f) return; keepSt(); if (/^video\//.test(f.type)) Edit.videoFile(f, stOpts()); else Edit.photoFile(f, stOpts()); }
  else if (t.id === 'stMusIn') { const f = t.files[0]; t.value = ''; if (!f) return; if (!/^audio\//.test(f.type)) return toast('Choisissez un fichier son.'); if (f.size > ST_MUS_MAX) return toast('Musique trop lourde (8 Mo au maximum).'); keepSt(); S.sc.music = {blob: f, name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60), url: URL.createObjectURL(f)}; stComposer(); toast('Musique ajoutée : elle sera jouée avec votre statut.'); }
  else if (t.id === 'trLang') { Tr.setLang(t.value); Tr.shown.clear(); toast('Les prochaines traductions seront en ' + (LANG_FR[t.value] || t.value)); }
  else if (t.id === 'picIn') { const f = t.files[0]; t.value = ''; const sl = S.picSlot; if (!f || !sl) return;
    (async () => { try { toast('Envoi de la photo…'); const b = await shrink(f, 1280);
      if (sl.set === 'priv' && PP.data) { await PP.setPic(sl.i, await b.arrayBuffer()); renderBody(); return toast('Photo privée ajoutée, chiffrée pour les seules personnes autorisées'); }
      const up = await upload(b); const r = await api('/api/me/pics', {set: sl.set, slot: sl.i, media: up.id}); S.me = r.me; renderBody(); toast('Photo ajoutée à votre profil'); } catch (e) { toast(e.message); } })(); }
  else if (t.id === 'meIn') { const f = t.files[0]; t.value = ''; if (!f) return; cropPhoto(f); }
  else if (t.id === 'cropZoom') { S.crop.z = +t.value; drawCrop(); }
  else if (t.name === 'closeAll') { const box = t.closest('.grp-box') || document; box.querySelectorAll('input[name="close"]').forEach(i => { i.checked = t.checked; }); const ids = [...box.querySelectorAll('input[name="close"]:checked')].map(i => +i.value); const c = box.querySelector('#cgCount'); if (c) c.textContent = `${ids.length} sur ${box.querySelectorAll('input[name="close"]').length}`; saveNow({close: ids}, t.checked ? 'Tous vos amis sont dans le groupe privé' : 'Groupe privé vidé').then(() => PP.check()); }
  else if (t.name === 'close') { { const box = t.closest('.grp-box') || document, all = box.querySelectorAll('input[name="close"]'), on = box.querySelectorAll('input[name="close"]:checked').length, a = box.querySelector('input[name="closeAll"]'), c = box.querySelector('#cgCount'); if (a) a.checked = on === all.length; if (c) c.textContent = `${on} sur ${all.length}`; } const ids = [...(t.closest('.grp-box') || document).querySelectorAll('input[name="close"]:checked')].map(i => +i.value); saveNow({close: ids}, 'Groupe privé mis à jour').then(() => PP.check()); }
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
// Code de sauvegarde : 8 caractères au moins, pas une suite évidente (les anciens codes restent valables).
function codeWeak(c) {
  c = String(c || ''); if (c.length < 8) return 'Le code doit contenir au moins 8 caractères (lettres, chiffres ou signes).';
  if (/^(.)\1+$/.test(c) || '01234567890123456789'.includes(c) || '98765432109876543210'.includes(c)) return 'Ce code est trop facile à deviner. Mélangez lettres et chiffres, par exemple « Baobab-2026 ».';
  return '';
}
async function keySetup(reupload) {
  let r = null; try { r = await api('/api/keys/backup'); } catch (e) { r = {err: e.message}; }
  if (!reupload && r && (r.stale || r.err)) { S.ks = {mode: 'stale', msg: r.err}; return renderKeySetup(); }
  const bk = r && r.backup;
  const mode = reupload ? 'new' : bk ? 'restore' : 'new';
  S.ks = {mode, bk};
  renderKeySetup();
}
function renderKeySetup(msg) {
  const k = S.ks, top = `<div class="auth-top"><h1 class="brand-h">${BRAND()}</h1></div>`;
  const h = k.mode === 'restore'
    ? `<h2>${I.lock} Retrouver vos messages</h2><p class="hint">Vos messages sont chiffrés de bout en bout. Sur ce nouvel appareil ou ce navigateur, entrez votre code de sauvegarde pour les relire.</p>
      <div class="field"><label for="kCode">Code de sauvegarde</label><input id="kCode" type="password" autocomplete="off"></div>
      <p class="err" id="kErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Retrouver mes messages</button>
      <button class="linkb" type="button" data-act="ksLost">J’ai oublié mon code</button>`
    : k.mode === 'stale'
    ? `<h2>${I.lock} Reconnexion nécessaire</h2><p class="hint">${k.msg ? esc(k.msg) : 'Pour votre sécurité, vos messages ne peuvent être récupérés que juste après une connexion avec votre mot de passe.'}</p>
      <p class="hint">Reconnectez-vous, puis entrez votre code de sauvegarde.</p><button class="btn" type="button" data-act="logout">Se reconnecter</button>`
    : k.mode === 'lost'
    ? `<h2>Code oublié</h2><p>Sans le code, les anciens messages chiffrés ne peuvent plus être relus sur cet appareil. Personne ne peut les récupérer, pas même le responsable de tam-tam.</p><p class="hint">Vous pouvez repartir avec une nouvelle clé : vos contacts verront que votre code de sécurité a changé, et les nouveaux messages seront lisibles.</p>
      <div class="actions"><button class="btn ghost" type="button" data-act="ksBack">Réessayer mon code</button><button class="btn danger" type="button" data-act="ksNew">Repartir avec une nouvelle clé</button></div>`
    : `<h2>${I.lock} Protéger vos messages</h2><p class="hint">tam-tam chiffre vos messages et vos photos de bout en bout : seuls les appareils des personnes qui discutent peuvent les lire, pas même le serveur.</p>
      <p class="hint">Choisissez un <b>code de sauvegarde</b>. Il vous servira à retrouver vos messages si vous changez de téléphone. Notez-le en lieu sûr : personne ne pourra le retrouver pour vous.</p>
      <div class="field"><label for="kCode">Code de sauvegarde <span class="req">· au moins 8 caractères</span></label><input id="kCode" type="password" autocomplete="new-password" placeholder="Ex. : Baobab-2026"></div>
      <div class="field"><label for="kCode2">Confirmez le code</label><input id="kCode2" type="password" autocomplete="new-password"></div>
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
      if (codeWeak(code)) { if (btn) btn.disabled = false; return renderKeySetup(codeWeak(code)); }
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
  // zone ronde autour de chaque point : un trait en diagonale ne touche plus les voisins par erreur
  const hit = (x, y) => { const r = pad.getBoundingClientRect(), rad = r.width / 3 * 0.3; return dots.findIndex(d => { const b = d.getBoundingClientRect(); return Math.hypot(x - (b.left + b.width / 2), y - (b.top + b.height / 2)) < rad; }); };
  const draw = (fx, fy) => { const pts = seq.map(i => center(i).join(',')); if (on && fx != null) { const r = pad.getBoundingClientRect(); pts.push(`${(fx - r.left) / r.width * 300},${(fy - r.top) / r.height * 300}`); } line.setAttribute('points', pts.join(' ')); dots.forEach((d, i) => d.classList.toggle('on', seq.includes(i))); };
  const add = e => {
    const i = hit(e.clientX, e.clientY);
    if (i >= 0) {
      if (seq.length >= 2 && i === seq[seq.length - 2]) { seq.pop(); if (navigator.vibrate) try { navigator.vibrate(6); } catch {} }   // revenir sur le point précédent l'efface
      else if (!seq.includes(i)) {
        const last = seq[seq.length - 1];
        if (last != null) { const mid = (last + i) / 2; if (Number.isInteger(mid) && (last % 3) + (i % 3) === 2 * (mid % 3) && !seq.includes(mid)) seq.push(mid); }  // point sauté au milieu
        seq.push(i); if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      }
    }
    draw(e.clientX, e.clientY);
  };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); on = true; seq = []; pad.setPointerCapture(e.pointerId); add(e); });
  pad.addEventListener('pointermove', e => { if (on) add(e); });
  const end = () => { if (!on) return; on = false; draw(); const s2 = seq.slice(); setTimeout(() => { seq = []; draw(); }, 350); if (s2.length) done(s2); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
// Écran de verrouillage : fond noir, logo turquoise, rien de personnel.
// Ordre : empreinte ou visage → si échec, schéma → après 5 schémas faux, mot de passe Tam-Tam.
function showLock(msg) {
  const L = S.lock; S.lockTries = S.lockTries || 0;
  if (!S.lockStep) S.lockStep = L.bio && !S.bioTried ? 'bio' : 'pattern';
  let el = $('#lockScreen'); if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; el.className = 'lock-screen'; document.body.appendChild(el); }
  el.classList.add('dark'); const st = S.lockStep;
  el.innerHTML = `<div class="lock-card dark" role="dialog" aria-modal="true" aria-label="Tam-Tam est verrouillé"><div class="auth-top"><h1 class="brand-h">${BRAND('lock-logo')}</h1></div>
    ${st === 'bio' ? `<p class="lk-hint">Déverrouillage par empreinte ou visage…</p><div class="lk-spin" aria-hidden="true"></div>`
    : st === 'pattern' ? `<p class="lk-hint">Dessinez votre schéma</p>${patternPad('lockPad')}`
    : `<form class="lk-pass" data-form="lockPass"><p class="lk-hint">Schéma oublié ? Entrez votre mot de passe Tam-Tam.</p><input id="lkPass" type="password" autocomplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe"><button class="btn" type="submit">Déverrouiller</button></form>`}
    <p class="err" id="lkErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p>
    <div class="lk-links">${st !== 'bio' && L.bio ? `<button class="linkb" type="button" data-act="lockBio">Utiliser l’empreinte ou le visage</button>` : ''}
    ${st === 'pattern' ? '<button class="linkb" type="button" data-act="lockPassStep">Utiliser mon mot de passe</button>' : ''}${st === 'pass' ? '<button class="linkb" type="button" data-act="lockPatStep">Revenir au schéma</button><button class="linkb" type="button" data-act="lockForgot">Mot de passe oublié ? Me reconnecter</button>' : ''}</div></div>`;
  if (st === 'pattern') bindPad('lockPad', async seq => {
    if (await Lock.hashPattern(seq, L.salt) === L.hash) return unlock();
    S.lockTries++;
    if (S.lockTries >= 5) { S.lockTries = 0; S.lockStep = 'pass'; return showLock('Schéma incorrect 5 fois : entrez votre mot de passe.'); }
    showLock(`Schéma incorrect. ${5 - S.lockTries} essai${5 - S.lockTries > 1 ? 's' : ''} restant${5 - S.lockTries > 1 ? 's' : ''}.`);
  });
  if (st === 'pass') setTimeout(() => { const i = $('#lkPass'); if (i) i.focus(); }, 50);
  if (st === 'bio' && !S.bioTried) { S.bioTried = true; setTimeout(() => ACT.lockBio(), 250); }
}
function unlock() { S.locked = false; S.lockTries = 0; S.bioTried = false; S.lockStep = null; const el = $('#lockScreen'); if (el) el.remove(); if (S.chatId) markRead(); }
function lockSettingsHtml() {
  const L = S.lock || {type: 'off', delay: 60};
  return `<div class="set-block"><h2>${I.lock} Verrouillage de l’application</h2><p class="hint">Vous restez connecté, mais tam-tam demande votre schéma${L.bio ? ' ou votre empreinte' : ''} à chaque ouverture. Personne ne peut lire vos messages si on prend votre téléphone.</p>
    ${L.type === 'off' ? `<div><button class="btn sm" type="button" data-act="lockSetup">Choisir un schéma de déverrouillage</button></div>` : `
    <p>${I.check || ''} Verrouillage actif${L.bio ? ' · schéma + empreinte ou visage' : ' · schéma'}</p>
    <span class="lbl">Verrouiller après</span><div class="chips">${[[0, 'Tout de suite'], [60, '1 minute'], [300, '5 minutes'], [1800, '30 minutes']].map(([v, l]) => `<button class="chip" type="button" data-act="lockDelay" data-v="${v}" aria-pressed="${(L.delay || 0) === v}">${l}</button>`).join('')}</div>
    <div class="actions" style="justify-content:flex-start">${L.bio ? '<button class="btn sm ghost" type="button" data-act="bioOff">Retirer l’empreinte</button>' : `<button class="btn sm ghost" type="button" data-act="bioOn" id="bioBtn">${I.key}Ajouter l’empreinte ou le visage</button>`}<button class="btn sm ghost" type="button" data-act="lockSetup">Changer le schéma</button></div>`}</div>`;
}
/* Verrouillage obligatoire : sans lui, une notification ouvrirait les messages à n'importe qui. */
function requireLock(step, first, msg) {
  let el = $('#lockScreen'); if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; el.className = 'lock-screen'; document.body.appendChild(el); }
  el.innerHTML = `<div class="lock-card" role="dialog" aria-modal="true" aria-label="Protéger tam-tam"><div class="auth-top"><h1 class="brand-h">${BRAND()}</h1></div>
    <h2 style="margin:0">${I.lock} Protégez vos messages</h2>
    <p class="hint">${step === 2 ? 'Dessinez le même schéma pour confirmer.' : 'Choisissez un schéma de déverrouillage : tam-tam le demandera à chaque ouverture, même depuis une notification. Reliez au moins 4 points sans lever le doigt.'}</p>
    ${patternPad('reqPad')}<p class="err" id="rqErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p></div>`;
  bindPad('reqPad', async seq => {
    if (seq.length < 4) return requireLock(step, first, 'Reliez au moins 4 points.');
    if (step !== 2) return requireLock(2, seq);
    if (seq.join() !== first.join()) return requireLock(1, null, 'Les deux schémas sont différents. Recommencez.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    S.lock = {type: 'pattern', delay: 0, salt, hash: await Lock.hashPattern(seq, salt)}; await Lock.set(S.me.id, S.lock);
    el.remove(); toast('Schéma enregistré : tam-tam se verrouille à chaque ouverture.');
    if (await Lock.bioCheck()) sheet(`${head('Empreinte ou visage')}<div class="sheet-body"><p class="hint">Voulez-vous aussi déverrouiller tam-tam avec votre empreinte ou votre visage ? C’est plus rapide que le schéma.</p><div class="actions"><button class="btn ghost" type="button" data-act="close">Plus tard</button><button class="btn" type="button" data-act="bioOn">Oui, utiliser mon empreinte</button></div></div>`, 'Empreinte');
  });
}
function lockSetupSheet(step, first, msg) {
  sheet(`${head('Schéma de déverrouillage')}<div class="sheet-body" style="align-items:center"><p class="hint" style="text-align:center">${step === 2 ? 'Dessinez le même schéma pour confirmer.' : 'Reliez au moins 4 points sans lever le doigt.'}</p>${patternPad('setPad')}<p class="err" id="spErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p></div>`, 'Schéma');
  bindPad('setPad', async seq => {
    if (seq.length < 4) return lockSetupSheet(step, first, 'Reliez au moins 4 points.');
    if (step !== 2) return lockSetupSheet(2, seq);
    if (seq.join() !== first.join()) return lockSetupSheet(1, null, 'Les deux schémas sont différents. Recommencez.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    S.lock = Object.assign({delay: 0}, S.lock || {}, {type: 'pattern', salt, hash: await Lock.hashPattern(seq, salt)});
    await Lock.set(S.me.id, S.lock); closeLayer(); renderBody(); toast('Schéma enregistré : tam-tam se verrouillera automatiquement');
  });
}

/* ---------- inviter depuis le téléphone ---------- */
const inviteText = () => `Rejoins-moi sur tam-tam, la messagerie qui fait vivre nos langues : ${S.lastInvite.url}`;

boot();
document.addEventListener('contextmenu', e => { if (e.target.closest('.once-view')) e.preventDefault(); });

// Zones privées : pas de copie, pas d'enregistrement d'image, pas de glisser-déposer.
['copy', 'cut'].forEach(t => document.addEventListener(t, e => { const sel = document.getSelection(), n = sel && sel.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); if ((el && el.closest('.nocopy,.once-view')) || (e.target.closest && e.target.closest('.nocopy,.once-view'))) { e.preventDefault(); toast('Copie désactivée pour les contenus privés.'); } }));
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.nocopy img,.once-view,.sv-box img,.ph3-img img,.pic-big')) e.preventDefault(); }, true);
document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.nocopy,.once-view,.sv-box,.pic-big')) e.preventDefault(); }, true);
