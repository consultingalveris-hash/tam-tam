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
const URL_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[a-z]{2,}[^\s<>"']*)/gi;
const escL = t => esc(t).replace(URL_RE, u => { const href = /^https?:/i.test(u) ? u : 'https://' + u; return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener nofollow">${u}</a>`; });
const hasStatus = uid => !!(S.statuses && S.statuses.others && S.statuses.others.some(g => g.user.id === uid && g.items.length));
const stRing = (u, html) => u && hasStatus(u.id) ? `<span class="st-ring${S.statuses.others.find(g => g.user.id === u.id).allSeen ? ' seen' : ''}" role="button" tabindex="0" data-act="stOpenU" data-u="${u.id}" aria-label="Voir le statut de ${esc(u.name)}">${html}</span>` : html;
const subH = u => u && u.name && !String(u.name).startsWith('@') ? '@' + u.handle : '';
const uOf = id => S.users.get(id) || {id, name: 'Membre', handle: '', avatar: {d: 'm2', c: 'turq'}};
function keepUsers(list) { for (const u of list || []) if (u) { S.users.set(u.id, Object.assign(S.users.get(u.id) || {}, u)); KeyPin.check(u); } }

const PC_IC = '<svg class="pc-ic" viewBox="0 0 24 24" width="13" height="13" aria-label="Envoyé depuis un ordinateur" role="img"><title>Envoyé depuis un ordinateur : les captures d’écran n’y sont pas signalées</title><rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
/* ---------- appels au serveur ---------- */
async function api(path, body, opts = {}) {
  const init = {method: body !== undefined ? 'POST' : 'GET', headers: {}, credentials: 'same-origin'};
  if (body !== undefined) { if (opts.raw) { init.body = body; init.headers['Content-Type'] = opts.type; } else { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; } }
  let r;
  try { r = await fetch(path, init); } catch { if (typeof Secours !== 'undefined') Secours.fail(); throw new Error('Pas de connexion internet. Réessayez.'); }
  if (typeof Secours !== 'undefined') { if (r.status >= 520 || r.status === 502 || r.status === 504) Secours.fail(); else Secours.ok(); }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && S.me) { S.me = null; boot(); }
  if (!r.ok) throw Object.assign(new Error(data.error || (r.status === 413 ? 'Fichier trop lourd pour être envoyé (40 Mo au maximum).' : r.status >= 502 ? 'Le serveur met trop de temps à répondre. Vérifiez votre connexion et réessayez.' : 'Erreur. Réessayez.')), {status: r.status});
  if (data && data.me && S.me && data.me.id === S.me.id && typeof PP !== 'undefined' && PP.data) PP.attach(data.me);
  return data;
}
let toastT;
/* ---------- avatars ---------- */
function avatar(u, cls = '') {
  if (!u) return `<span class="av ${cls}"></span>`;
  if (u.photo) return `<span class="av ${cls}"><img src="${esc(u.photo)}" alt=""></span>`;
  return `<span class="av ${cls}" aria-hidden="true">${avFace(avOf(u))}</span>`;
}
// Seuls les portraits illustrés existent : un ancien avatar dessiné est remplacé par un portrait fixe.
const avOf = u => isPortrait(u && u.avatar) ? u.avatar : {v: 3, p: PORTRAITS[((u && u.id) || 0) % 12]};
const avOn = (u, cls) => `<span class="avw">${avatar(u, cls)}${u && u.busy ? '<span class="dot-on busy" aria-label="occupé"></span>' : u && u.online ? '<span class="dot-on" aria-label="en ligne"></span>' : ''}</span>`;
const presLabel = u => u.busy ? 'occupé' : u.online ? 'en ligne' : seenLabel(u.lastSeen);
const grpAv = (c, cls = '') => c.photo ? `<span class="av grp ph ${cls}" aria-hidden="true"><img src="${esc(c.photo)}" alt=""></span>` : `<span class="av grp ${cls}" style="--h:${(c.id * 47) % 360}" aria-hidden="true">${I.users}</span>`;
function avGallery(sel, who) {
  const btn = p => `<button class="avb-pt" type="button" data-act="avPick" data-who="${who}" data-p="${p}" aria-pressed="${!!(sel && sel.v === 3 && sel.p === p)}" aria-label="Portrait ${+p.slice(1)}"><span class="av"><img src="/avatars/${p}.jpg" alt="" loading="lazy"></span></button>`;
  return `<div class="avb" id="avg-${who}"><span class="lbl">Portraits d’Afrique</span><div class="avb-pts">${PORTRAITS.slice(0, 12).map(btn).join('')}</div><span class="lbl">Portraits du monde</span><div class="avb-pts">${PORTRAITS.slice(12).map(btn).join('')}</div><p class="hint" style="margin:0">Touchez un portrait, puis « Valider ».</p></div>`;
}

/* ---------- connexion et inscription ---------- */
const A = {mode: 'login', avatar: null};
async function boot() {
  S.pendingChat = +((/[?&]chat=(\d+)/.exec(location.search) || [])[1] || 0);
  const gj = (/[?&]g=([A-Za-z0-9_-]{6,40})/.exec(location.search) || [])[1]; if (gj) S.pendingJoin = gj;
  if (/[?&]tab=souvenirs/.test(location.search)) S.pendingTab = 'souvenirs';
  const p = location.pathname, inv = (p.match(/^\/invite\/([A-Za-z0-9_-]+)$/) || [])[1], rst = (p.match(/^\/reset\/([A-Za-z0-9_-]+)$/) || [])[1];
  if (inv) S.invite = inv;
  const qr = (p.match(/^\/add\/([A-Za-z0-9_-]+)$/) || [])[1]; if (qr) { S.qrAdd = qr; S.invite = qr; }
  if (rst) { A.mode = 'reset'; A.token = rst; return renderAuth(); }
  const qs = new URLSearchParams(location.search), gtok = qs.get('g'), gerr = qs.get('g_err');
  if (gtok || gerr) history.replaceState(null, '', location.pathname);
  try { const r = await api('/api/me'); S.me = r.me; keepUsers([r.me]); history.replaceState(null, '', '/'); return start(); }
  catch (e) {
    // Sans réseau : Tam-Tam s'ouvre quand même avec ce qui est gardé sur l'appareil (messages lisibles, envois mis en attente).
    let uid = 0; try { uid = +localStorage.getItem('tt-last-uid') || 0; } catch {}
    if (!e.status && uid) { S.me = {id: uid}; const me = await Local.get('me'); if (me && me.id === uid) { S.me = me; S.offline = true; keepUsers([me]); return start(); } S.me = null; Local.db = null; }
  }
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
    <p class="hint">${A.g && !m.ownerSetup ? (A.g.by ? `${esc(A.g.by)} vous invite sur tam-tam.` : 'Bienvenue sur tam-tam.') : m.ownerSetup ? `Premier compte de tam-tam${m.ownerEmail ? ` : utilisez l’adresse ${esc(m.ownerEmail)}` : ''}.` : m.invite ? `${esc(m.invite.by)} vous invite sur tam-tam.` : 'Pour créer un compte, il faut un lien d’invitation envoyé par un membre de Tam-Tam : demandez-le à un proche qui utilise déjà l’application, puis ouvrez ce lien. Vous pourrez aussi utiliser « Continuer avec Google » depuis ce lien.'}</p>
    ${m.ownerSetup || m.invite || A.g ? `${A.g ? `<p class="g-ok">${gIcon()}<span>Compte Google confirmé : <b>${esc(A.g.email)}</b>. Il reste à choisir votre pseudo et à accepter les conditions.</span></p>` : gBtn()}
    <div class="field"><label for="aHandle">Pseudo</label><div class="at-in"><span>@</span><input id="aHandle" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" required placeholder="ex. lion.du.sahel" pattern="[A-Za-z0-9._]{3,20}"></div><small class="hint">C’est le seul nom que voient les membres qui ne sont pas vos contacts. 3 à 20 caractères : lettres, chiffres, point ou tiret bas.</small></div>
    <div class="field-row"><div class="field"><label for="aName">Prénom</label><input id="aName" autocomplete="given-name" maxlength="30" value="${esc(A.g ? (A.g.name || '').split(' ')[0] : '')}"></div>
    <div class="field"><label for="aLast">Nom</label><input id="aLast" autocomplete="family-name" maxlength="30" value="${esc(A.g ? (A.g.name || '').split(' ').slice(1).join(' ') : '')}"></div></div>
    <p class="hint">Votre prénom et votre nom, si vous les indiquez, ne sont visibles que par vos contacts.</p>
    ${A.g ? '' : `<div class="field"><label for="aMail">Adresse e-mail</label><input id="aMail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Mot de passe (8 caractères minimum)</label><div class="pw"><input id="aPass" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-act="pwShow">Voir</button></div></div>`}
    <p class="hint">Vous pourrez choisir votre avatar, votre photo et ses couleurs ensuite, dans <b>Réglages</b>.</p>
    <label class="pick chk"><input type="checkbox" id="aAge"><span>J’ai 16 ans ou plus.</span></label>
    <label class="pick chk"><input type="checkbox" id="aCgu"><span>J’ai lu et j’accepte les <a href="/conditions" target="_blank" rel="noopener">Conditions générales et la Politique de confidentialité</a>.</span></label>

    <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Créer mon compte</button>` : ''}
    <button class="linkb" type="button" data-act="authMode" data-m="login">J’ai déjà un compte : me connecter</button>`;
  else h = `<h2>Bienvenue</h2><p class="hint">La messagerie qui fait vivre nos langues. Connectez-vous pour retrouver vos proches.</p>
    ${gBtn()}
    <div class="field"><label for="aMail">Adresse e-mail</label><input id="aMail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Mot de passe</label><div class="pw"><input id="aPass" type="password" autocomplete="current-password" required><button type="button" data-act="pwShow">Voir</button></div></div>
    <p class="err" id="aErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Me connecter</button>
    <button class="linkb" type="button" data-act="forgot">Mot de passe oublié ?</button>
    <div class="auth-new"><span>Pas encore de compte ?</span><button class="linkb strong" type="button" data-act="authMode" data-m="register">Créer un compte</button></div>`;
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
    else if (A.mode === 'register') r = await api('/api/register', {first: v('aName'), last: v('aLast'), handle: v('aHandle'), email: v('aMail'), pass: v('aPass'), gtok: A.g ? A.g.tok : undefined, avatar: A.avatar, age: $('#aAge').checked, cgu: $('#aCgu').checked,  invite: S.invite});
    else r = await api('/api/login', {email: v('aMail'), pass: v('aPass')});
    S.me = r.me; keepUsers([r.me]); history.replaceState(null, '', '/'); start();
  } catch (e) { err(e.message); if (btn) btn.disabled = false; }
}

/* ---------- démarrage ---------- */
let es = null;
async function start() {
  if (!S.offline && S.me && S.me.email) { try { localStorage.setItem('tt-last-uid', String(S.me.id)); } catch {} Local.put('me', S.me); }
  if (!(await E2E.load(S.me.id))) return keySetup();
  const srv = S.me.pubkey;
  if (!srv || srv.x !== E2E.pubJwk.x) { /* clé locale sans sauvegarde côté serveur : on redemande un code */ return keySetup(true); }
  const L = await Lock.get(S.me.id); S.lock = L; S.locked = L.type !== 'off';
  startApp();
}
async function startApp() {
  await KeyPin.load(S.me.id).catch(() => {});
  KeyPin.onChange = u => { toast(`Le code de sécurité de ${first(u.name || 'ce contact')} a changé`); if (S.chatId) renderMessages(true); };
  root.innerHTML = `<div class="app" data-view="list"><aside class="side" id="side"><div class="head" id="head"></div><div class="body" id="body"></div><nav class="tabs" id="tabs" aria-label="Rubriques"></nav><button class="fab" id="fab" type="button" data-act="fab" aria-label="Nouvelle discussion">${I.newchat}</button></aside><main class="main" id="main"></main></div>`;
  renderMain();
  // Ouverture instantanée : les discussions gardées sur l'appareil s'affichent tout de suite, le réseau complète ensuite.
  let fast = false;
  try { const [c0, k0, s0] = await Promise.all([Local.get('chats'), Local.get('contacts'), Local.get('statuses')]);
    if (c0) { await loadChats(c0); if (k0) await loadContacts(k0); if (s0) await loadStatuses(s0); renderAll(); fast = true; Perf.add('open', performance.now()); } } catch {}
  await Promise.all([loadChats(), loadContacts(), loadStatuses()]).catch(e => { if (!fast) toast(e.message); });
  await PP.init().catch(() => {});
  try { Object.keys(localStorage).filter(k => k.startsWith('tt-trlearn:')).forEach(k => localStorage.removeItem(k)); } catch {}
  Tr.loadSt();
  renderAll(); if (!fast) Perf.add('open', performance.now()); connect();  if (typeof Secours !== "undefined") Secours.load(); Outbox.flush(); Prefetch.run(); if (S.locked) showLock(); if (!S.me.handleSet) HPick.open();
  GCall.loadActive(); Call.checkPending(); Device.badge(); LocShare.sync();
  if (S.lock.type === 'off') return requireLock();
  if (S.pendingChat && S.chats.has(S.pendingChat)) openChat(S.pendingChat); S.pendingChat = 0;
  if (S.pendingTab) { S.tab = S.pendingTab; S.pendingTab = null; history.replaceState(null, '', '/'); renderAll(); }
  if (typeof Mem !== 'undefined') Mem.loadRecv(true);
  loadAct();
  if (S.pendingJoin) { const g = S.pendingJoin; S.pendingJoin = null; history.replaceState(null, '', '/'); joinPreview(g); }
  if (S.qrAdd) { const t = S.qrAdd; S.qrAdd = null; Qr.connect(t); }
}
/* Comptes créés avant le pseudo obligatoire : on demande d'en choisir un (une seule fois). */
const HPick = {
  async open() {
    if ($('#hpick')) return; let ideas = [];
    try { ideas = (await api('/api/handle/ideas')).ideas; } catch {}
    const el = document.createElement('div'); el.id = 'hpick'; el.className = 'hpick';
    el.innerHTML = `<form class="hp-card" role="dialog" aria-modal="true" aria-labelledby="hpT"><img src="/logo-tamtam.svg" alt="" class="hp-logo"><h2 id="hpT">Choisissez votre pseudo</h2>
      <p>Pour protéger vos données, les membres qui ne sont pas vos contacts ne voient plus que votre pseudo. Votre prénom et votre nom restent visibles par vos contacts.</p>
      ${ideas.length ? `<span class="lbl">Propositions (touchez pour choisir)</span><div class="hp-ideas">${ideas.map(h => `<button type="button" data-h="${esc(h)}">@${esc(h)}</button>`).join('')}</div>` : ''}
      <div class="field"><label for="hpIn">Ou tapez le vôtre</label><div class="at-in"><span>@</span><input id="hpIn" maxlength="20" autocapitalize="none" spellcheck="false" autocomplete="off" required value="${esc(ideas[0] || S.me.handle || '')}"></div></div>
      <small class="hint" id="hpMsg">3 à 20 caractères : lettres, chiffres, point ou tiret bas.</small>
      <button class="btn" type="submit">Valider mon pseudo</button></form>`;
    document.body.appendChild(el);
    const inp = el.querySelector('#hpIn'), msg = el.querySelector('#hpMsg'); let t;
    el.addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) { inp.value = b.dataset.h; inp.dispatchEvent(new Event('input')); } });
    inp.addEventListener('input', () => { clearTimeout(t); const v = inp.value.trim(); if (v.length < 3) return; t = setTimeout(async () => { try { const r = await api('/api/handle/free?h=' + encodeURIComponent(v)); msg.textContent = r.ok ? '✓ Ce pseudo est libre.' : r.why; msg.classList.toggle('bad', !r.ok); } catch {} }, 350); });
    el.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); const b = el.querySelector('[type=submit]'); b.disabled = true;
      try { const r = await api('/api/me', {handle: inp.value}); S.me = r.me; keepUsers([r.me]); el.remove(); renderAll(); toast(`Votre pseudo : @${r.me.handle}`); }
      catch (er) { msg.textContent = er.message; msg.classList.add('bad'); b.disabled = false; } });
  },
};
// Sur ordinateur, un clic à côté de la fenêtre photo ou vidéo la ferme.
document.addEventListener('click', e => { if (e.target === layer && layer.querySelector(':scope > .zoom, :scope > .mem-view')) { const z = layer.querySelector(':scope > .zoom[data-act="mgBack"]'); if (z) ACT.mgBack(); else closeLayer(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && typeof Mem !== 'undefined') Mem.unlocked = false; });
function connect() {
  if (es) es.close();
  es = new EventSource('/api/stream');
  es.onmessage = e => { let ev; try { ev = JSON.parse(e.data); } catch { return; } onEvent(ev); };
  es.onerror = () => { /* le navigateur se reconnecte tout seul */ if (typeof Secours !== 'undefined') Secours.fail(); };
}
let resync = null;
function onEvent(ev) {
  if (ev.t === 'hello' && ev.v) { if (!S.ver) S.ver = ev.v; else if (S.ver !== ev.v) S.newVer = true; }
  if (S.newVer && !(typeof Call !== 'undefined' && Call.c) && !(typeof GCall !== 'undefined' && GCall.c) && !document.querySelector('#compose textarea:focus, .sheet')) { location.reload(); return; }
  if (ev.t === 'hello') { if (resync) { loadChats().then(renderAll); loadAct(); if (S.chatId) loadMessages(S.chatId, true); } resync = true; }
  else if (ev.t === 'msg') onMsg(ev.msg, ev.update);
  else if (ev.t === 'hide') msgHide(ev.chatId, ev.id);
  else if (ev.t === 'read') { if (ev.user === S.me.id) Device.badge(); const c = S.chats.get(ev.chatId); if (c) { const m = c.members.find(x => x.id === ev.user); if (m) m.lastRead = Math.max(m.lastRead, ev.upTo); if (S.chatId === ev.chatId) renderMessages(true); if (S.tab === 'chats') renderBody(); } }
  else if (ev.t === 'typing') { const k = ev.chatId; if (Date.now() - (S.lastFrom.get(k + ':' + ev.user) || 0) < 2500) return; S.typing.set(k, {user: ev.user, until: Date.now() + 4000}); refreshTyping(k); setTimeout(() => refreshTyping(k), 4100); }
  else if (ev.t === 'contacts') { loadContacts().then(() => { renderTabs(); if (S.tab !== 'chats') renderBody(); if (document.getElementById('addSheet') && typeof Add !== 'undefined') Add.loadPeople(); }); loadChats().then(() => { if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); }); }
  else if (ev.t === 'act') { loadAct().then(() => { if (S.tab === 'calls') { Calls.log = null; renderBody(); actSeen('calls'); } }); }
  else if (ev.t === 'mem') { Sound.notif(); if (typeof Mem !== 'undefined') Mem.loadRecv(true); }
  else if (ev.t === 'trlang') loadChats().then(() => { const c = S.chats.get(ev.chatId); if (!c) return; const nm = first(chatTitle(c)), L = l => (LANG_FR[l] || l || '').replace(/ \(essai\)$/, '');
    toast(ev.who === 'you' ? (ev.lang ? `${nm} a choisi : propose que vous receviez ses messages en ${L(ev.lang)}. Acceptez ou refusez en bas de la discussion.` : `${nm} a retiré la traduction de vos messages reçus.`) : (ev.lang ? `${nm} recevra vos messages en ${L(ev.lang)}.` : `${nm} recevra vos messages sans traduction.`));
    if (S.chatId === ev.chatId) { renderComposer(); renderMessages(true); if (layer.querySelector('.tr-body')) trSheet(); } });
  else if (ev.t === 'chats') loadChats().then(() => { if (S.tab === 'chats') renderBody(); if (S.chatId) { renderPin(); renderMessages(true); } });
  else if (ev.t === 'statuses') loadStatuses().then(() => { renderStories(); if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); });
  else if (ev.t === 'presence') { const u = S.users.get(ev.id); if (u) { u.online = ev.online; u.busy = ev.busy; u.lastSeen = ev.lastSeen; } if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); }
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
  else { m.text = r.payload.t || ''; m.miv = r.payload.miv || null; m._key = r.key; if (r.payload.w > 0 && r.payload.h > 0) { m.w = +r.payload.w; m.h = +r.payload.h; } if (Thumb.ok(r.payload.th)) m.th = r.payload.th; if (r.payload.o != null) { m.orig = r.payload.o; m.olang = r.payload.ol || ''; m.tlang = r.payload.tl || ''; m.fx = !!r.payload.fx; } if (r.payload.mime) m.amime = r.payload.mime; if (r.payload.dur) m.dur = r.payload.dur; if (r.payload.loc) m.loc = r.payload.loc; if (r.payload.sr) m.sr = r.payload.sr; if (r.payload.pc) m.pc = true; if (r.payload.fl) m.fl = true; if (r.payload.name) { m.fname = r.payload.name; m.fsize = r.payload.size || 0; m.fmime = r.payload.mime || 'application/octet-stream'; } }
  return m;
}
async function loadChats(pre) { const r = pre || await api('/api/chats'); if (!pre) Local.put('chats', r); const map = new Map(); for (const c of r.chats) { keepUsers(Object.values(c.users)); await reveal(c.last); if (c.pinMsg) await reveal(c.pinMsg); map.set(c.id, c); } S.chats = map; }
async function loadContacts(pre) {
  const r = pre || await api('/api/contacts'); if (!pre) Local.put('contacts', r); S.contacts = r;
  await Promise.all(r.contacts.filter(u => u.telEnv || u.privEnv).map(u => PP.reveal(u).catch(() => {})));
  keepUsers([...r.contacts, ...r.incoming, ...r.outgoing, ...r.suggestions]);
  if (PP.data) PP.check();
}
async function loadStatuses(pre) {
  const r = pre || await api('/api/statuses'); if (!pre) Local.put('statuses', r);
  for (const it of [...r.mine.items, ...r.others.flatMap(g => g.items)]) if (it.enc) {
    const o = E2E.ready() ? await E2E.open(it.enc, S.me.id) : {err: 1};
    if (o.err) { it.text = '🔒 Statut chiffré'; it.locked = true; } else { it.text = o.payload.t || ''; it.miv = o.payload.miv || null; it._key = o.key; it.font = o.payload.f || 0; it.vmime = o.payload.mime || null; it.dur = o.payload.dur || 0; it.mir = !!o.payload.mir; it.mmiv = o.payload.mmiv || null; it.mname = o.payload.mname || ''; }
  }
  S.statuses = r; keepUsers([r.mine.user, ...r.others.map(g => g.user)]);
}

function renderAll() { renderTabs(); renderHead(); renderBody(); }

/* ---------- liste ---------- */
const actDot = (cls, label) => `<span class="act-dot ${cls}" aria-hidden="true"></span>${label ? `<span class="sr">, ${label}</span>` : ''}`;
async function loadAct() { try { S.act = await api('/api/me/act'); } catch {} if (S.me) renderTabs(); }
function actSeen(k) { if (!S.act || !S.act[k]) return; S.act[k] = 0; renderTabs(); api('/api/me/act/seen', {k}).then(r => { S.act = r; }).catch(() => {}); }
const TABS = [['chats', 'Discussions', I.chats], ['contacts', 'Contacts', I.users], ['souvenirs', 'Souvenirs', I.image], ['calls', 'Appels', I.dialpad]];
function renderTabs() {
  const unread = [...S.chats.values()].filter(c => (c.unread > 0 || c.marked) && !c.archived && (!c.hidden || S.showHidden)).length, inc = S.contacts.incoming.length;
  const act = S.act || {}, memN = typeof Mem !== 'undefined' ? Mem.unseen : 0;
  const dotOf = id => id === 'chats' && unread ? actDot('', `${unread} discussion${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}`) : id === 'contacts' && inc ? actDot('', `${inc} demande${inc > 1 ? 's' : ''} d’ami`) : id === 'souvenirs' && memN ? actDot('', 'nouveau souvenir reçu') : id === 'calls' && act.calls ? actDot('', 'appel manqué') : '';
  $('#tabs').innerHTML = TABS.map(([id, l, ic]) => `<button class="tab" type="button" data-act="tab" data-t="${id}"${S.tab === id ? ' aria-current="page"' : ''}><span class="pill">${ic}</span>${l}${dotOf(id)}</button>`).join('');
  $('#fab').hidden = S.tab !== 'chats'; Device.badge(); const fc = $('#filts'); if (fc) fc.innerHTML = filtChips(); const ac = $('.arch-chip'); if (ac) ac.outerHTML = archChip();
  const n = [...S.chats.values()].reduce((a, c) => a + (c.unread || 0), 0); document.title = n ? `(${n}) tam-tam` : 'tam-tam';
}
const ARCH_IC = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>';
function archChip() {
  const na = [...S.chats.values()].filter(c => c.archived && (!c.hidden || S.showHidden)), nu = na.filter(c => c.unread > 0 || c.marked).length;
  return `<button class="chip arch-chip" type="button" data-act="filt" data-f="arch" aria-pressed="${S.filt === 'arch'}" title="Discussions archivées">${ARCH_IC}Archives${nu ? ` <span class="cnt dk">${nu}</span>` : na.length ? ` <small>${na.length}</small>` : ''}</button>`;
}
function filtChips() {
  const n = [...S.chats.values()].filter(c => c.type !== 'group' && (c.unread > 0 || c.marked) && !c.archived && (!c.hidden || S.showHidden)).length;
  const g = [...S.chats.values()].filter(c => c.type === 'group' && (c.unread > 0 || c.marked) && !c.archived && (!c.hidden || S.showHidden)).length, pr = (S.act && S.act.prof) || 0;
  const cnt = (v, l) => v ? ` <span class="cnt dk" aria-label="${v} ${l}">${v}</span>` : '';
  const dot = k => k === 'unread' ? cnt(n, n > 1 ? 'discussions non lues' : 'discussion non lue') : k === 'group' ? cnt(g, g > 1 ? 'groupes avec des messages' : 'groupe avec des messages') : k === 'me' ? cnt(pr, pr > 1 ? 'personnes vous ont envoyé une flamme' : 'personne vous a envoyé une flamme') : '';
  return [['all', 'Toutes'], ['unread', 'Non lues'], ['group', 'Groupes'], ['me', 'Mon profil']].map(([k, l]) => `<button class="chip" type="button" data-act="filt" data-f="${k}" aria-pressed="${(S.filt || 'all') === k || (k === 'all' && S.filt === 'arch')}">${l}${dot(k)}</button>`).join('');
}
function renderHead() {
  const h = $('#head');
  if (S.tab === 'chats') {
    h.innerHTML = `<div class="title">${archChip()}<h1 class="brand-h">${BRAND()}</h1><span class="grow"></span><button class="ib dotted" type="button" data-act="addOpen" aria-label="Ajouter des amis${S.contacts.incoming.length ? ` (${S.contacts.incoming.length} demande${S.contacts.incoming.length > 1 ? 's' : ''})` : ''}" title="Ajouter des amis">${I.userplus}${S.contacts.incoming.length ? actDot() : ''}</button><button class="ib" type="button" data-act="tab" data-t="settings" aria-label="Réglages et profil" title="Réglages et profil">${I.settings}</button></div>
      <div class="stories" id="stories" aria-label="Statuts"></div>
      <label class="search">${I.search}<span class="sr">Rechercher</span><input id="q" type="search" placeholder="Rechercher une discussion" value="${esc(S.q)}" autocomplete="off"></label>
      <div class="chips filt" id="filts" role="group" aria-label="Filtrer les discussions">${filtChips()}</div>`;
    renderStories();
  } else h.innerHTML = `<div class="title"><h1>${{contacts: 'Contacts', calls: 'Appels', settings: 'Réglages', souvenirs: 'Souvenirs'}[S.tab]}</h1><span class="grow"></span>${S.tab === 'settings' ? availPicker() : ''}${S.tab === 'souvenirs' ? `<button class="ib dotb mem-topdot" type="button" data-act="memTop" aria-label="Souvenirs : ajouter, envoyer, sélectionner…" title="Ajouter, envoyer, sélectionner…">${DOT(true)}</button>` : ''}${S.tab !== 'settings' ? `<button class="ib" type="button" data-act="tab" data-t="settings" aria-label="Réglages et profil" title="Réglages et profil">${I.settings}</button>` : ''}</div>`;
}
function renderBody() {
  const b = $('#body'); if (!b) return;
  if (S.tab === 'chats') b.innerHTML = Device.banner() + gcallBanner() + chatRows();
  else if (S.tab === 'contacts') { b.innerHTML = Book.body(); Book.after(); }
  else if (S.tab === 'calls') { b.innerHTML = Calls.body(); Calls.after(); }
  else if (S.tab === 'souvenirs') { b.innerHTML = Mem.body(); Mem.hydrate(b); }
  else { b.innerHTML = settingsBody(); fillFp(); }
  if (S.modal) pmRefresh();
}
/* Sur ordinateur, « Réglages » et « Mon profil » s'ouvrent dans une fenêtre, comme « Ajouter des amis ». */
const isDesk = () => matchMedia('(min-width:821px)').matches;
function pmOpen(kind) { S.modal = kind; renderModal(true); if (kind === 'me') { actSeen('prof'); Prof.load(true); } }
function pmRefresh() { const a = document.activeElement, body = $('#pmBody'); if (body && a && body.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return; renderModal(); }
function renderModal(first) {
  let el = $('#pmodal'); if (!S.modal) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'pmodal'; document.body.appendChild(el); }
  const y = first ? 0 : (($('#pmBody') || {}).scrollTop || 0), set = S.modal === 'settings';
  el.innerHTML = `<div class="pm-scrim" data-act="pmScrim"><div class="pm-card" role="dialog" aria-modal="true" aria-label="${set ? 'Réglages' : 'Mon profil'}">
    <div class="pm-head"><h2>${set ? 'Réglages' : 'Mon profil'}</h2><span class="grow"></span>${set ? availPicker() : ''}<button class="ib" type="button" data-act="pmClose" aria-label="Fermer">${I.close}</button></div>
    <div class="pm-body" id="pmBody">${set ? settingsBody() : profileEditor()}</div></div></div>`;
  if (set) fillFp();
  const b = $('#pmBody'); if (b) b.scrollTop = y;
}
// Les chiffres d'un nom (ex. « Test 2222 ») sont légèrement réduits pour ne pas paraître plus gros que les lettres.
const numSm = t => String(t || '').split(/(\d+)/).map((p, i) => i % 2 ? `<span class="num">${p}</span>` : esc(p)).join('');
const chatTitle = c => c.type === 'group' ? c.name : uOf(c.peer).name;
function snippet(m) {
  if (!m) return 'Aucun message';
  if (m.deleted) return 'Message supprimé'; if (m.kind === 'sys') return m.text; if (m.once) return m.kind === 'audio' ? '① Vocal à vue unique' : m.kind === 'video' ? '① Vidéo à vue unique' : m.media ? '① Photo à vue unique' : '① Message à vue unique'; if (m.kind === 'audio') return '🎤 Message vocal'; if (m.fl) return '🔥 Flamme sur un statut'; if (m.kind === 'loc') return '📍 Position'; if (m.kind === 'doc') return '📄 ' + (m.fname || 'Document'); if (m.kind === 'video') return '🎥 Vidéo' + (m.text ? ' · ' + m.text : ''); if (m.locked) return m.text;
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
  list = list.filter(c => fl === 'arch' ? c.archived : !c.archived);
  if (fl === 'unread') list = list.filter(c => c.type !== 'group' && (c.unread > 0 || c.marked)); else if (fl === 'group') list = list.filter(c => c.type === 'group');
  const hitMsg = {};
  if (q && !(S.showHidden && Priv.isCode(q))) {
    Find.preload(q);
    list = list.filter(c => { if (chatTitle(c).toLowerCase().includes(q)) return true;
      const m = (S.msgs.get(c.id) || []).slice().reverse().find(m => !m.deleted && !m.once && m.kind !== 'sys' && typeof m.text === 'string' && m.text.toLowerCase().includes(q));
      if (m) { hitMsg[c.id] = m; return true; } return false; });
  }
  if (S.showHidden) list.sort((a, b) => (b.hidden ? 1 : 0) - (a.hidden ? 1 : 0));
  list.sort((a, b) => (b.last?.at || b.createdAt) - (a.last?.at || a.createdAt));
  list.sort((a, b) => (b.pinned || 0) - (a.pinned || 0));
  const selBar = S.sel ? `<div class="selbar"><button class="ib" type="button" data-act="selOff" aria-label="Annuler la sélection">${I.close}</button><b>${S.sel.size} sélectionnée${S.sel.size > 1 ? 's' : ''}</b><span class="grow"></span><button class="ib dotb" type="button" data-act="selMenu" aria-label="Actions" title="Actions">${DOT(S.showHidden)}</button></div>` : '';
  const privBar = S.showHidden ? `<div class="privbar">${I.lock}<span>Discussions privées affichées</span><button class="btn sm ghost" type="button" data-act="privHide">Masquer</button></div>` : '';
  const archHead = fl === 'arch' ? `<div class="arch-head"><button class="ib" type="button" data-act="filt" data-f="all" aria-label="Retour aux discussions">${I.back}</button><b>${ARCH_IC}Discussions archivées</b></div><p class="hint arch-note">Elles restent ici même si un nouveau message arrive. Appui long sur une discussion, puis « Désarchiver », pour la remettre dans la liste.</p>` : '';
  if (!list.length && fl === 'arch') return archHead + '<p class="empty">Aucune discussion archivée. Pour en ranger une, appuyez longtemps dessus dans la liste, puis touchez « Archiver ».</p>';
  if (!list.length && fl !== 'all' && !q) return privBar + `<p class="empty">${{unread: 'Aucune discussion non lue.', group: 'Aucun groupe. Créez-en un avec le bouton turquoise.'}[fl]}</p>`;
  if (!list.length) return privBar + (q ? `<p class="empty">Aucune discussion ne correspond.</p>`
    : `<div class="empty"><p>Aucune discussion pour l’instant.</p><p>Invitez vos proches depuis l’onglet <b>Contacts</b>, puis appuyez sur le bouton turquoise pour leur écrire.</p><button class="btn" type="button" data-act="tab" data-t="contacts">${I.userplus}Inviter mes proches</button></div>`);
  return privBar + archHead + selBar + list.map(c => {
    const m = c.last, tu = typingIn(c.id), u = c.type === 'direct' ? uOf(c.peer) : null;
    let prev = esc(snippet(m));
    if (hitMsg[c.id]) prev = Find.mark(hitMsg[c.id].text, q);
    if (tu) prev = `<span class="typing-t">${c.type === 'group' ? esc(first(uOf(tu).name)) + ' écrit…' : 'écrit…'}</span>`;
    else if (m && c.type === 'group' && m.from && m.kind !== 'sys') prev = esc(m.from === S.me.id ? 'Vous' : first(uOf(m.from).name)) + ' : ' + prev;
    const mine = m && m.from === S.me.id && !m.deleted && m.kind !== 'sys';
    const sel = S.sel && S.sel.has(c.id);
    return `<button class="row chat-row${c.id === S.chatId && !S.sel ? ' active' : ''}${sel ? ' sel' : ''}" type="button" data-act="open" data-id="${c.id}"${S.sel ? ` aria-pressed="${!!sel}"` : ''}>
      ${S.sel ? `<span class="selmark" aria-hidden="true">${sel ? '✓' : ''}</span>` : ''}<span class="avm">${c.type === 'group' ? grpAv(c) : stRing(u, avOn(u))}${c.muted ? `<span class="mute-b" title="Son coupé" aria-label="Son coupé">${BELL_OFF}</span>` : ''}</span>
      <span class="row-name">${numSm(chatTitle(c))}</span><span class="row-time${c.unread || c.marked ? ' new' : ''}">${m ? listTime(m.at) : ''}</span>
      <span class="row-prev">${mine && !tu ? tick(readState(c, m)) : ''}<span>${prev}</span><span class="row-flags">${c.pinned ? '<span class="pin-f" title="Épinglée">📌</span>' : ''}${c.unread ? `<span class="badge">${c.unread}</span>` : c.marked ? '<span class="badge dot" title="Marquée comme non lue"></span>' : ''}</span></span>
      ${S.sel ? '' : `<span class="row-more" role="button" tabindex="-1" data-act="chatRowMenu" data-id="${c.id}" aria-label="Options de la discussion" title="Options">${I.chev}</span>`}</button>`;
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
  try { const r = await api('/api/users/' + id); u = r.user; if (u.id !== S.me.id) await PP.reveal(u); else PP.data && PP.attach(u); keepUsers([u]); Prof.remember(u.vids); Prof.remember(u.privVids); await Prof.loadFor(u.id); } catch (e) { return toast(e.message); }
  const p = u.pub || {}, bd = p.bd && p.bm ? `${p.bd} ${MOIS[p.bm - 1]}` : '';
  sheet(`${back ? `<div class="sheet-head"><button class="ib back-b" type="button" data-act="profBack" aria-label="Retour à la liste">${I.back}</button><h2 style="flex:1">Profil</h2><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>` : head('Profil')}<div class="sheet-body"><div class="prof">${avatar(u, 'xl')}<b>${esc(u.name)}</b>${u.amb ? `<span class="amb-b" title="Ambassadeur des langues Tam-Tam">🌍 Ambassadeur · ${esc(u.amb)}</span>` : ''}${subH(u) ? `<span>${esc(subH(u))}</span>` : ''}${u.rel === 'contact' ? `<small>${presLabel(u).replace(/^./, x => x.toUpperCase())}</small>` : ''}${u.mutual ? `<small>${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun</small>` : ''}</div>
    ${dl(PUB_L.map(([k, l]) => [l, p[k]]).concat([['Anniversaire', bd]])) || '<p class="hint" style="text-align:center">Profil public encore vide.</p>'}
    ${u.rel === 'contact' && u.pubkey ? `<details class="fp-box"><summary>${I.shield}Chiffrement de bout en bout · vérifier le code de sécurité</summary><p class="hint">Ce code n’est pas un secret : il sert seulement à vérifier, en le comparant de vive voix avec ${esc(first(u.name))}, que personne ne s’est glissé entre vous. S’il est identique sur vos deux téléphones, vos échanges sont bien protégés.</p><b class="fp" id="peerFp">…</b></details>` : ''}
    ${u.limTheirs ? `<p class="hint">${I.lock} Ajouté par code QR : vous voyez seulement son profil public.</p>` : ''}
    ${u.limMine ? `<div class="qrnote"><span>${I.lock} Contact ajouté avec votre code QR : ${esc(first(u.name))} ne voit pas votre profil privé (téléphone, adresse…).</span><button class="btn sm ghost" type="button" data-act="sharePriv" data-id="${u.id}">Lui montrer mon profil privé</button></div>` : ''}
    ${profMedia(u, 'pub')}
    ${u.rel !== 'me' ? '<div id="profMem"></div>' : ''}
    ${u.priv ? `<div class="nocopy"><span class="lbl">${I.lock} Profil privé</span>${dl(PRIV_L.map(([k, l]) => [l, u.priv[k]])) || '<p class="hint">Rien de renseigné.</p>'}${profMedia(u, 'priv')}${u.id !== S.me.id ? watermark() : ''}</div>` : ''}
    ${u.rel === 'contact' ? `<div class="qrnote"><span>${I.phone || ''} ${u.telMine ? `${esc(first(u.name))} voit votre numéro de téléphone.` : `${esc(first(u.name))} ne voit pas votre numéro de téléphone.`}</span><button class="btn sm ghost" type="button" data-act="shareTel" data-id="${u.id}" data-on="${u.telMine ? '' : '1'}">${u.telMine ? 'Ne plus montrer mon numéro' : 'Lui montrer mon numéro'}</button></div>` : ''}
    ${u.rel === 'sent' ? '<p class="hint">Demande envoyée : vous pourrez échanger quand elle sera acceptée.</p>' : u.rel === 'none' ? '<p class="hint">Après votre demande, cette personne doit l’accepter pour que vous puissiez échanger.</p>' : ''}
    ${u.rel === 'me' ? '<p class="hint" style="text-align:center">C’est ainsi que les autres voient votre profil : la partie publique est visible par tous les membres, la partie « Profil privé » seulement par les amis que vous avez autorisés.</p>' : `<div class="actions">${u.rel === 'received' ? `<button class="btn ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button>` : ''}${u.blocked ? '' : relBtn(u).replace(/btn sm/g, 'btn')}</div>
    <div class="actions" style="justify-content:flex-start">${u.rel === 'contact' ? `<button class="btn sm ghost" type="button" data-act="cRemoveAsk" data-id="${u.id}">Retirer des contacts</button>` : ''}<button class="btn sm ghost" type="button" data-act="${u.blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${u.blocked ? 'Débloquer' : 'Bloquer'}</button><button class="btn sm ghost" type="button" data-act="reportAsk" data-id="${u.id}">Signaler</button></div>`}</div>`, 'Profil');
  if (u.rel !== 'me' && typeof Mem !== 'undefined') Mem.profBlock(u.id);
  const pf = $('#peerFp'); if (pf) pf.textContent = await E2E.fingerprint(u.pubkey);
}

/* ---------- discussion ---------- */
async function openChat(id) {
  S.msel = null;
  S.chatId = id; S.replyTo = null;
  $('.app').dataset.view = 'chat'; renderMain(); if (S.tab === 'chats') renderBody(); focusComposer();
  await loadMessages(id); if (S.chatId === id) focusComposer();
}
// À l'ouverture d'une discussion (liste, statut, groupe…), le curseur se place tout seul dans la zone d'écriture.
// Sur ordinateur : une discussion ouverte, on tape ou on colle n'importe où, et le texte va dans la zone d'écriture.
const typingSpot = () => { const t = document.activeElement; return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); };
const composerFree = () => { const app = $('.app'), i = $('#msgIn'); return !!(S.chatId && i && !i.disabled && !S.locked && !document.getElementById('lockScreen') && !(layer && layer.innerHTML.trim()) && !document.getElementById('pmodal') && app && (matchMedia('(min-width:821px)').matches || app.dataset.view === 'chat')); };
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.isComposing || typingSpot() || !composerFree()) return;
  const paste = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'v', printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (paste || printable) focusComposer();
}, true);
document.addEventListener('paste', e => {
  if (typingSpot() || !composerFree()) return; const t = e.clipboardData && e.clipboardData.getData('text'); if (!t) return;
  const i = $('#msgIn'); e.preventDefault(); focusComposer(); i.setRangeText(t, i.selectionStart, i.selectionEnd, 'end'); i.dispatchEvent(new Event('input', {bubbles: true}));
});
// Clavier du téléphone : on remonte les fenêtres et le champ en cours pour qu'il reste toujours visible.
if (window.visualViewport) { const vv = visualViewport, kb = () => { const h = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)); document.documentElement.style.setProperty('--kb', (h > 80 ? h : 0) + 'px'); }; vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb); }
document.addEventListener('focusin', e => { const t = e.target; if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.id === 'msgIn' || !matchMedia('(pointer:coarse)').matches) return; setTimeout(() => { try { t.scrollIntoView({block: 'center', behavior: 'smooth'}); } catch {} }, 350); });
function focusComposer() {
  const i = $('#msgIn'); if (!i || i.disabled || S.locked || document.getElementById('lockScreen') || (layer && layer.innerHTML.trim())) return;
  if (document.activeElement === i) return; try { i.focus({preventScroll: true}); } catch { i.focus(); }
}
async function loadMessages(id, fresh) {
  const t0 = performance.now(); let shown = false;
  // D'abord les messages gardés sur l'appareil (lecture immédiate, même sans réseau), puis les nouveaux.
  if (!S.msgs.has(id)) { const raw = await Local.get('m:' + id); if (raw && raw.length && S.chatId === id && !S.msgs.has(id)) { const list = []; for (const x of raw) { try { const m = JSON.parse(x); m._raw = x; list.push(await reveal(m)); } catch {} } S.msgs.set(id, list); S.more.set(id, true); Outbox.restore(id); renderMessages(); shown = true; Perf.add('chat', performance.now() - t0); } }
  try {
    const r = await api(`/api/chats/${id}/messages`); for (const m of r.messages) { m._raw = JSON.stringify(m); await reveal(m); } S.msgs.set(id, r.messages); S.more.set(id, r.more);
    Outbox.restore(id);
    if (S.chatId === id) { renderMessages(shown); markRead(); if (!shown) Perf.add('chat', performance.now() - t0); }
  } catch (e) { if (!shown) toast(e.message); else if (!navigator.onLine) toast('Hors connexion : vous lisez les messages gardés sur cet appareil.'); }
}
async function loadOlder() {
  const id = S.chatId, list = S.msgs.get(id) || []; if (!list.length) return;
  const box = $('#msgs'), h0 = box.scrollHeight;
  const r = await api(`/api/chats/${id}/messages?before=${list[0].id}`); for (const m of r.messages) { m._raw = JSON.stringify(m); await reveal(m); } S.msgs.set(id, r.messages.concat(list)); S.more.set(id, r.more);
  renderMessages(true); box.scrollTop = box.scrollHeight - h0;
}
function renderMain() {
  const main = $('#main'); if (!main) return;
  const c = S.chats.get(S.chatId);
  if (!c) { main.innerHTML = `<div class="chat-empty">${BRAND('empty')}<span>Choisissez une discussion, ou invitez vos proches depuis l’onglet Contacts.</span></div>`; return; }
  main.innerHTML = `<header class="chat-head" id="chatHead"></header><div id="pinBar"></div><div class="msgs${c.hidden ? ' nocopy' : ''}" id="msgs" tabindex="0" aria-label="Messages"></div><div id="replyBar"></div><div id="compose"></div>`;
  renderChatHead(); renderPin(); renderComposer(); renderMessages();
  stickBottom($('#msgs'));
  $('#msgs').addEventListener('scroll', e => { if (e.target.scrollTop < 40 && S.more.get(S.chatId) && !S.loadingOld) { S.loadingOld = true; loadOlder().finally(() => { S.loadingOld = false; }); } });
}
// Le dernier message reste toujours visible au-dessus de la zone d'écriture, même quand une traduction,
// une photo ou un aperçu s'ajoute après coup, ou quand la zone d'écriture grandit.
function stickBottom(box) {
  if (!box) return; box._stick = true; let user = 0;
  const go = () => { if (box._stick) box.scrollTop = box.scrollHeight; };
  const mark = () => { user = Date.now(); };
  ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(ev => box.addEventListener(ev, mark, {passive: true}));
  // Seul un geste de la personne (molette, doigt, clavier, barre de défilement) décroche le bas de la discussion.
  // Une photo ou une vidéo plus haut qui grandit en se chargeant ne doit jamais faire descendre le dernier message.
  box.addEventListener('scroll', () => { const d = box.scrollHeight - box.scrollTop - box.clientHeight;
    if (d < 150) box._stick = true; else if (Date.now() - user < 800) box._stick = false; else if (box._stick) go(); }, {passive: true});
  const ro = window.ResizeObserver ? new ResizeObserver(() => go()) : null;
  const watch = root => { if (!ro) return; for (const el of root.children || []) ro.observe(el); };
  new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(n => { if (n.nodeType === 1 && ro && n.parentNode === box) ro.observe(n); }); requestAnimationFrame(go); }).observe(box, {childList: true, subtree: true, characterData: true});
  ['load', 'loadedmetadata', 'loadeddata'].forEach(ev => box.addEventListener(ev, () => requestAnimationFrame(go), true));
  watch(box); if (ro) ro.observe(box);
}
function renderPin() {
  const c = S.chats.get(S.chatId), el = $('#pinBar'); if (!c || !el) return; const m = c.pinMsg;
  el.innerHTML = m ? `<div class="pinbar"><button type="button" class="pin-go" data-act="pinJump" data-id="${m.id}">📌<span><b>Message épinglé</b><small>${esc(snippet(m))}</small></span></button><button class="ib" type="button" data-act="pinMsgOff" aria-label="Retirer le message épinglé">${I.close}</button></div>` : '';
}
function renderChatHead() {
  const c = S.chats.get(S.chatId), h = $('#chatHead'); if (!c || !h) return;
  if (S.msel && S.msel.size) { h.innerHTML = `<button class="ib back" type="button" data-act="mselOff" aria-label="Annuler la sélection">${I.close}</button><b class="msel-n">${S.msel.size} sélectionné${S.msel.size > 1 ? 's' : ''}</b><span class="grow"></span><button class="ib dotb" type="button" data-act="mselMenu" aria-label="Actions" title="Actions">${DOT((S.chats.get(S.chatId) || {}).hidden)}</button>`; h.classList.add('msel-head'); return; }
  h.classList.remove('msel-head');
  const tu = typingIn(c.id); let sub;
  if (c.type === 'group') sub = tu ? `<small class="on">${esc(first(uOf(tu).name))} écrit…</small>` : `<small>${c.members.map(m => m.id === S.me.id ? 'Vous' : esc(first(uOf(m.id).name))).join(', ')}</small>`;
  else { const u = uOf(c.peer); sub = tu ? '<small class="on">écrit…</small>' : `<small class="${u.busy ? 'busy' : u.online ? 'on' : ''}">${presLabel(u)}</small>`; }
  h.innerHTML = `<button class="ib back" type="button" data-act="back" aria-label="Retour">${I.back}</button>
    <button class="chat-id" type="button" data-act="chatInfo">${c.type === 'group' ? grpAv(c, 'sm') : stRing(uOf(c.peer), avatar(uOf(c.peer), 'sm'))}<span style="min-width:0"><b>${numSm(chatTitle(c))}</b>${sub}</span></button>
    ${c.type === 'direct' && !c.blocked ? `<button class="ib" type="button" data-act="callVideo" aria-label="Appel vidéo">${I.video}</button><button class="ib" type="button" data-act="callAudio" aria-label="Appel vocal">${I.phone}</button>` : ''}
    ${c.type === 'group' ? (GCall.active(c.id) && !(GCall.c && GCall.c.chatId === c.id) ? `<button class="btn sm gjoin" type="button" data-act="gcallJoin" data-id="${GCall.active(c.id).callId}">${I.phone}Rejoindre</button>` : `<button class="ib" type="button" data-act="gcallVideo" aria-label="Appel vidéo de groupe">${I.video}</button><button class="ib" type="button" data-act="gcallAudio" aria-label="Appel vocal de groupe">${I.phone}</button>`) : ''}
    <button class="ib dotb" type="button" data-act="chatMenu" aria-label="Options de la discussion" title="Options">${DOT(c.hidden)}</button>`;
}
function renderComposer() {
  const c = S.chats.get(S.chatId), el = $('#compose'); if (!c || !el) return;
  if (c.type === 'direct' && c.blocked) {
    const u = uOf(c.peer), mine = (S.me.blocked || []).some(b => b.id === c.peer);
    el.innerHTML = `<div class="blocked-bar">${I.block}<span>${mine ? `Vous avez bloqué ${esc(first(u.name))}.` : 'Vous ne pouvez plus écrire à cette personne.'}</span>${mine ? `<button class="btn sm ghost" type="button" data-act="unblock" data-id="${u.id}">Débloquer</button>` : ''}</div>`; return;
  }
  const trOn = !!(Tr.inL(c.id) || Tr.outL(c.id));
  el.innerHTML = Tr.imposed(c) + `<form class="composer" data-form="send" autocomplete="off"><div class="inwrap">${Tr.st && Tr.st.on ? `<button class="ib tr-tog" type="button" data-act="trAuto" aria-pressed="${trOn}" aria-label="Langues de cette discussion" title="Langues de traduction de cette discussion">${I.translate}${Tr.label(c.id)}</button>` : ''}${Emoji.btn('#msgIn')}<textarea id="msgIn" rows="1" placeholder="${S.once ? 'Message à vue unique' : 'Message'}" aria-label="Écrire un message" maxlength="4000"></textarea>
    <button class="ib" type="button" data-act="attach" aria-label="Joindre une photo, une vidéo ou ma position">${I.clip}</button><button class="ib" type="button" data-act="camera" aria-label="Prendre une photo ou une vidéo">${I.camera}</button><button class="ib once-tog" type="button" data-act="onceTog" aria-pressed="${!!S.once}" aria-label="Vue unique" title="Vue unique : le message ne peut être ouvert qu’une fois"><span class="one" aria-hidden="true">1</span></button></div>
    <input type="file" id="fileIn" accept="image/*,video/*" multiple hidden><input type="file" id="camIn" accept="image/*" capture="environment" hidden>
    <button class="send" id="sendBtn" type="button" data-act="recStart" aria-label="Enregistrer un message vocal">${I.mic}</button></form>`;
}
// Le bouton rond est un micro tant que rien n'est écrit ; il devient « Envoyer » dès qu'on écrit.
function syncSend() {
  const b = $('#sendBtn'), i = $('#msgIn'); if (!b || !i) return; const has = !!i.value.trim();
  if (has && b.type !== 'submit') { b.type = 'submit'; delete b.dataset.act; b.setAttribute('aria-label', 'Envoyer'); b.innerHTML = I.send; }
  else if (!has && b.type === 'submit') { b.type = 'button'; b.dataset.act = 'recStart'; b.setAttribute('aria-label', 'Enregistrer un message vocal'); b.innerHTML = I.mic; }
}
/* ---------- recadrer la photo de profil ---------- */
function cropPhoto(file, target) {
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    S.crop = {im, url, z: 1, x: 0, y: 0, rot: 0, target: target || 'me'};
    sheet(`${head('Ajuster la photo')}<div class="sheet-body crop-body"><p class="hint">${target === 'grp' ? 'Faites glisser la photo avec le doigt et zoomez pour bien cadrer la photo du groupe.' : 'Faites glisser la photo avec le doigt et zoomez pour bien cadrer votre visage.'}</p>
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
  if (c.muted) return;   // son coupé pour cette discussion
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
  if (S.editId) {
    const id = S.editId; S.editId = null; i.value = ''; autoGrow(i); syncSend(); renderReplyBar();
    try { const sealed = await E2E.seal({t}, recipients(c)); await api(`/api/messages/${id}/edit`, {enc: sealed.env}); } catch (e) { toast(e.message); }
    return;
  }
  i.value = ''; autoGrow(i); syncSend(); const reply = S.replyTo; S.replyTo = null; renderReplyBar();
  if (S.once) { try { onMsg(await sendCore(c, t, reply, true)); } catch (e) { toast(e.message); i.value = t; syncSend(); } return; }
  // Le message s'affiche tout de suite avec une horloge, puis part ; sans réseau, il attend et repart tout seul.
  Outbox.add(c.id, t, reply); Outbox.flush();
}
async function sendCore(c, t, reply, once, cid) {
  const t0 = performance.now();
  {
    let payload = {t}; const out = Tr.outL(c.id);
    if (out && !Tr.st) { try { await Tr.loadSt(); } catch {} }
    if (out && Tr.st && Tr.st.on && S.me.trConsent && !once) {
      try {
        const ctx = (S.msgs.get(c.id) || []).filter(x => x.kind === 'text' && x.text && !x.once).slice(-4).map(x => x.text);
        const r = await Tr.fetch(t, out, ctx);
        if (r && r.text && r.text.trim() !== t) { payload = {t: r.text, o: t, ol: r.from || '', tl: out}; if (r.fresh) Tr.give(t, r.from, r.text, out, 'mt', S.me.id); }
      }
      catch (e) { toast('Message envoyé sans traduction : ' + e.message); }
    }
    const {env} = await E2E.seal(payload, recipients(c));
    const body = {enc: env}; if (reply) body.replyTo = reply; if (cid) body.cid = String(cid); if (once) { body.once = true; S.once = false; renderComposer(); }
    const r = await api(`/api/chats/${c.id}/messages`, body); Perf.add('send', performance.now() - t0); return r.msg;
  }
}
/* ---------- photos ---------- */
function shrink(file, max = 1600) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('Choisissez une photo.'));
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); encImg(cv, .82).then(res, rej); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Cette photo n’a pas pu être lue.')); };
    im.src = url;
  });
}
// Envoi d'un fichier chiffré : d'un coup s'il est petit, sinon par morceaux d'1 Mo.
// Si le réseau coupe, on attend qu'il revienne et on reprend là où on s'était arrêté (rien n'est renvoyé deux fois).
async function upMedia(blob, prog) {
  if (!blob) return null;
  if (blob.size <= 3_000_000) { const r = await api('/api/media', blob, {raw: true, type: 'application/octet-stream'}); if (prog) prog(1); return r; }
  const CH = 1_000_000; let {id, have} = await api('/api/media/up', {size: blob.size}), fails = 0;
  while (have < blob.size) {
    try {
      const r = await api(`/api/media/up/${id}/chunk?off=${have}`, blob.slice(have, Math.min(blob.size, have + CH)), {raw: true, type: 'application/octet-stream'});
      have = r.have; fails = 0; if (prog) prog(have / blob.size);
    } catch (e) {
      if ((e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) || ++fails > 40) throw e;
      if (!navigator.onLine) await new Promise(r => window.addEventListener('online', r, {once: true}));
      await new Promise(r => setTimeout(r, Math.min(15000, 800 * 2 ** Math.min(fails, 5))));
      try { have = (await api(`/api/media/up/${id}`)).have; } catch (e2) { if (e2.status === 404) throw e2; }
    }
  }
  return api(`/api/media/up/${id}/done`, {});
}
async function upload(blob) { return api('/api/media', blob, {raw: true, type: 'image/jpeg'}); }
async function sendPhoto() {
  const p = S.pend; if (!p) return; const cap = $('#phCap').value.trim(), btn = layer.querySelector('.send'); btn.disabled = true;
  try {
    const c = S.chats.get(S.chatId), sealed = await E2E.seal({t: cap}, recipients(c), await p.blob.arrayBuffer());
    const up = await upMedia(sealed.blob);
    const once = !!S.once; S.once = false;
    const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env, once}); if (once) URL.revokeObjectURL(p.url); else E2E.imgs.set(r.msg.id, p.url); S.pend = null; closeLayer(); renderComposer(); onMsg(r.msg);
  }
  catch (e) { toast(e.message); btn.disabled = false; }
}

/* ---------- événements ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if ((el.dataset.act === 'stGrpBg' || el.dataset.act === 'pmScrim') && e.target !== el) return;
  if (el.dataset.act !== 'scrim') e.preventDefault();
  if (el.dataset.act === 'scrim' && e.target !== el) return;
  if (el.classList.contains('dotb')) { popFrom = el; popAt = Date.now(); popRect = el.getBoundingClientRect(); }
  const pop = el.closest('#pop');
  fn(el.dataset, el, e);
  if (pop && S.msel && el.dataset.act !== 'mselStart') ACT.mselOff();   // une action choisie : la sélection est terminée
  if (pop && document.getElementById('pop') === pop) popClose();
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
  if (t.id === 'fileIn' && t.files.length > 1) { const fs = [...t.files]; t.value = ''; return Multi.ask(fs); }
  if (t.id === 'fileIn' || t.id === 'camIn') { const f = t.files[0]; t.value = ''; if (f) { if (/^video\//.test(f.type)) Edit.videoFile(f); else Edit.photoFile(f); } }
  else if (t.id === 'stIn' || t.id === 'stCamIn') { const f = t.files[0]; t.value = ''; if (!f) return; keepSt(); if (/^video\//.test(f.type)) Edit.videoFile(f, stOpts()); else Edit.photoFile(f, stOpts()); }
  else if (t.id === 'stMusIn') { const f = t.files[0]; t.value = ''; if (!f) return; if (!/^audio\//.test(f.type)) return toast('Choisissez un fichier son.'); if (f.size > ST_MUS_MAX) return toast('Musique trop lourde (8 Mo au maximum).'); keepSt(); S.sc.music = {blob: f, name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60), url: URL.createObjectURL(f)}; stComposer(); toast('Musique ajoutée : elle sera jouée avec votre statut.'); }
  else if (t.id === 'trLang') { Tr.setLang(t.value); Tr.shown.clear(); toast('Les prochaines traductions seront en ' + (LANG_FR[t.value] || t.value)); }
  else if (t.id === 'picIn') { const f = t.files[0]; t.value = ''; const sl = S.picSlot; if (!f || !sl) return;
    (async () => { try { toast('Envoi de la photo…'); const b = await shrink(f, 1280);
      if (sl.set === 'priv' && PP.data) { await PP.setPic(sl.i, await b.arrayBuffer()); renderBody(); return toast('Photo privée ajoutée, chiffrée pour les seules personnes autorisées'); }
      const up = await upload(b); const r = await api('/api/me/pics', {set: sl.set, slot: sl.i, media: up.id}); S.me = r.me; renderBody(); toast('Photo ajoutée à votre profil'); } catch (e) { toast(e.message); } })(); }
  else if (t.id === 'vidIn') { const f = t.files[0]; t.value = ''; const sl = S.vidSlot; if (!f || !sl) return;
    if (!/^video\//.test(f.type)) return toast('Choisissez une vidéo.'); if (f.size > 40_000_000) return toast('Vidéo trop lourde : 40 Mo au maximum (environ une minute).');
    (async () => { try { toast('Envoi de la vidéo…'); const bytes = await f.arrayBuffer();
      if (sl.set === 'priv') { if (!PP.data) return toast('Profil privé indisponible sur cet appareil.'); await PP.setVid(sl.i, bytes, f.type); toast('Vidéo privée ajoutée, chiffrée pour les seules personnes autorisées'); }
      else { const e = await PP.encVid(bytes, f.type); const r = await api('/api/me/pics', {set: 'pub', slot: 3 + sl.i, media: e.id, k: e.k, iv: e.iv, t: e.t}); S.me = r.me; if (PP.data) PP.attach(S.me); else Prof.remember(S.me.vids); toast('Vidéo ajoutée à votre profil'); }
      pmRefresh(); renderBody(); } catch (e) { toast(e.message); } })(); }
  else if (t.id === 'meIn') { const f = t.files[0]; t.value = ''; if (!f) return; cropPhoto(f); }
  else if (t.id === 'cropZoom') { S.crop.z = +t.value; drawCrop(); }
  else if (t.name === 'closeAll') { const box = t.closest('.grp-box') || document; box.querySelectorAll('input[name="close"]').forEach(i => { i.checked = t.checked; }); const ids = [...box.querySelectorAll('input[name="close"]:checked')].map(i => +i.value); const c = box.querySelector('#cgCount'); if (c) c.textContent = `${ids.length} sur ${box.querySelectorAll('input[name="close"]').length}`; saveNow({close: ids}, t.checked ? 'Tous vos amis sont dans le groupe privé' : 'Groupe privé vidé').then(() => PP.check()); }
  else if (t.name === 'close') { { const box = t.closest('.grp-box') || document, all = box.querySelectorAll('input[name="close"]'), on = box.querySelectorAll('input[name="close"]:checked').length, a = box.querySelector('input[name="closeAll"]'), c = box.querySelector('#cgCount'); if (a) a.checked = on === all.length; if (c) c.textContent = `${on} sur ${all.length}`; } const ids = [...(t.closest('.grp-box') || document).querySelectorAll('input[name="close"]:checked')].map(i => +i.value); saveNow({close: ids}, 'Groupe privé mis à jour').then(() => PP.check()); }
  else if (t.dataset.set === 'name' || t.dataset.set === 'handle') saveNow({[t.dataset.set]: t.value}, 'Enregistré');
  else if (t.tagName === 'SELECT' && t.dataset.set) queueSave({[t.dataset.set]: {[t.dataset.k]: t.value}});
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('pop')) popClose(); else if (e.key === 'Escape' && layer.firstChild) closeLayer();
  else if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'msgIn' && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); sendText(); }
  else if (S.sv && e.key === 'ArrowRight') svStep(1); else if (S.sv && e.key === 'ArrowLeft') svStep(-1);
});
document.addEventListener('contextmenu', e => {
  if (!S.me) return; const m = e.target.closest('#msgs .msg[data-mid]:not(.typing-b)'), r = e.target.closest('#body .chat-row');
  // au doigt, l'appui long sélectionne : le menu du navigateur ne doit pas s'ouvrir par-dessus
  if ((m || r) && Date.now() - lastTouch < 2000) { e.preventDefault(); return; }
  if (m) { e.preventDefault(); return msgMenu(+m.dataset.mid); }
  if (r && !S.sel) { e.preventDefault(); chatListMenu(+r.dataset.id); }
});
let pressT, pressXY = [0, 0], pressFired = 0, pressDone = true, swipe = null, lastTouch = 0;
// Sélection de messages : appui long sur un message, puis toucher les autres pour les ajouter ; le point en haut à droite donne les actions.
// Appui long sur un message : une barre verticale d'émojis à droite, pour réagir tout de suite (sans passer par le point en haut).
function reactRail() {
  let el = document.getElementById('rrail'); const one = S.msel && S.msel.size === 1 ? [...S.msel][0] : null;
  const m = one && (S.msgs.get(S.chatId) || []).find(x => x.id === one);
  if (!m || m.deleted || m.pending || m.kind === 'sys') { if (el) el.remove(); return; }
  const list = [...new Set(QUICK.concat(typeof EMO !== 'undefined' ? EMO[1][2].slice(0, 30) : []))];
  if (!el) { el = document.createElement('div'); el.id = 'rrail'; el.className = 'rrail'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Réagir'); document.body.appendChild(el); }
  el.innerHTML = list.map(e => `<button type="button" data-act="railReact" data-id="${m.id}" data-e="${e}">${e}</button>`).join('');
}
function mselToggle(id) {
  const m = (S.msgs.get(S.chatId) || []).find(x => x.id === id); if (!m || m.kind === 'sys') return;
  S.msel = S.msel || new Set(); S.msel.has(id) ? S.msel.delete(id) : S.msel.add(id); if (!S.msel.size) S.msel = null;
  document.querySelectorAll('#msgs .msg[data-mid]').forEach(el => el.classList.toggle('msel', !!S.msel && S.msel.has(+el.dataset.mid)));
  renderChatHead(); reactRail();
}
// À la souris, cliquer dans la zone vide à côté d'un message ouvre son menu, comme le petit crochet.
document.addEventListener('click', e => {
  if (S.msel || e.pointerType === 'touch' || !matchMedia('(pointer:fine)').matches) return; const row = e.target.closest('#msgs .msg[data-mid]:not(.typing-b)'); if (!row || e.target !== row) return;
  const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +row.dataset.mid); if (!m || m.deleted || m.pending || m.kind === 'sys') return; msgMenu(m.id);
});
document.addEventListener('click', e => {
  if (!S.msel) return; const el = e.target.closest('#msgs .msg[data-mid]'); if (!el) return;
  e.preventDefault(); e.stopPropagation(); mselToggle(+el.dataset.mid);
}, true);
document.addEventListener('pointermove', e => {
  if (!swipe) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.on) { if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; } if (dx > 14 && dx > Math.abs(dy) * 1.5) swipe.on = true; else return; }
  clearTimeout(pressT); swipe.dx = Math.max(0, Math.min(90, dx)); swipe.el.style.transform = `translateX(${swipe.dx}px)`; swipe.el.classList.add('swiping');
  if (swipe.dx >= 64 && !swipe.buzz) { swipe.buzz = true; if (navigator.vibrate) navigator.vibrate(10); }
}, {passive: true});
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => {
  if (!swipe) return; const s = swipe; swipe = null; if (!s.on) return;
  s.el.style.transition = 'transform .18s'; s.el.style.transform = ''; setTimeout(() => { s.el.style.transition = ''; s.el.classList.remove('swiping'); }, 200);
  if (s.dx >= 64) { pressFired = Date.now(); const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +s.el.dataset.mid); if (m && !m.once && !m.deleted && m.kind !== 'sys') ACT.reply({id: m.id}); }
}, true));
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return; lastTouch = Date.now();
  // appui long sur toute la ligne du message (pas seulement la bulle, même pour un message court)
  const b = e.target.closest('#msgs .msg[data-mid]:not(.typing-b)'), r = !b && e.target.closest('#body .chat-row');
  if (b && !e.target.closest('button:not(.vid-play),a,audio,input,.reacts')) { pressXY = [e.clientX, e.clientY]; clearTimeout(pressT); pressT = setTimeout(() => { pressFired = Date.now(); pressDone = false; if (navigator.vibrate) navigator.vibrate(15); mselToggle(+b.dataset.mid); }, 480); }
  else if (r && !S.sel && !e.target.closest('.row-more')) { pressXY = [e.clientX, e.clientY]; clearTimeout(pressT); pressT = setTimeout(() => { pressFired = Date.now(); pressDone = false; if (navigator.vibrate) navigator.vibrate(15); ACT.selStart({id: r.dataset.id}); }, 480); }
  // glisser un message vers la droite = y répondre (comme WhatsApp)
  const sm = e.target.closest('#msgs .msg[data-mid]'); swipe = sm && !S.msel && !e.target.closest('button:not(.vid-play),a,input,audio') ? {el: sm, x: e.clientX, y: e.clientY, dx: 0, on: false} : null;
});
// Après un appui long, le doigt relâché ne doit pas ouvrir la discussion ni la photo.
document.addEventListener('click', e => { if (Date.now() - pressFired < 600) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) clearTimeout(pressT); }, true);
// Doigt relevé après un appui long (même tenu longtemps) : le « clic » qui suit ne doit pas annuler la sélection.
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { clearTimeout(pressT); if (pressFired && Date.now() - pressFired < 8000 && !pressDone) { pressFired = Date.now(); pressDone = true; } }, true));
setInterval(() => { if (S.me && S.tab === 'chats') renderBody(); }, 60_000);

/* ---------- inviter depuis le téléphone ---------- */
const inviteText = () => `Rejoins-moi sur tam-tam, la messagerie qui fait vivre nos langues : ${S.lastInvite.url}`;

document.addEventListener('contextmenu', e => { if (e.target.closest('.once-view')) e.preventDefault(); });

// Zones privées : pas de copie, pas d'enregistrement d'image, pas de glisser-déposer.
['copy', 'cut'].forEach(t => document.addEventListener(t, e => { const sel = document.getSelection(), n = sel && sel.anchorNode; const el = n && (n.nodeType === 1 ? n : n.parentElement); if ((el && el.closest('.nocopy,.once-view')) || (e.target.closest && e.target.closest('.nocopy,.once-view'))) { e.preventDefault(); toast('Copie désactivée pour les contenus privés.'); } }));
document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.nocopy img,.once-view,.sv-box img,.ph3-img img,.pic-big')) e.preventDefault(); }, true);
document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.nocopy,.once-view,.sv-box,.pic-big')) e.preventDefault(); }, true);
