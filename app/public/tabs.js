/* tam-tam — onglet « Appels » (historique + clavier) et discussions privées révélées par un code. */
'use strict';

/* ---------- onglet Appels ---------- */
const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];
const Calls = {
  log: null, num: '', loading: false,
  async load() {
    if (this.loading) return; this.loading = true;
    try { const r = await api('/api/calls'); keepUsers(Object.values(r.users)); this.log = r.calls; } catch (e) { toast(e.message); this.log = this.log || []; }
    this.loading = false; if (S.tab === 'calls') renderBody();
  },
  when(t) { const d = new Date(t), now = new Date(); const hm = d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
    if (d.toDateString() === now.toDateString()) return hm;
    const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Hier ' + hm;
    return d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'}) + ' ' + hm; },
  dur(s) { return !s ? '' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`; },
  row(c) {
    const chat = S.chats.get(c.chatId), grp = c.kind === 'group', u = grp ? null : uOf(c.peer);
    if (!grp && !u.name) return '';
    const miss = c.status === 'missed', lab = miss ? (c.dir === 'in' ? 'Manqué' : 'Sans réponse') : c.status === 'declined' ? 'Refusé' : c.status === 'busy' ? 'Occupé' : c.dir === 'in' ? 'Entrant' : 'Sortant';
    return `<div class="cl${miss ? ' miss' : ''}">${grp ? (chat ? grpAv(chat, 'sm') : '') : avatar(u, 'sm')}
      <div class="cl-t"><b>${esc(grp ? (chat ? chat.name : 'Groupe') : u.name)}</b>
      <span>${c.dir === 'in' ? I.arrowIn : I.arrowOut}${lab}${grp ? ' · groupe' : ''} · ${this.when(c.at)}${c.dur ? ' · ' + this.dur(c.dur) : ''}</span></div>
      <button class="ib" type="button" data-act="clCall" data-chat="${c.chatId}" data-video="${c.video ? 1 : ''}" data-grp="${grp ? 1 : ''}" aria-label="Rappeler en ${c.video ? 'vidéo' : 'vocal'}">${c.video ? I.video : I.phone}</button></div>`;
  },
  suggest() {
    const n = this.num.replace(/\D/g, ''); if (n.length < 2) return '';
    const hits = S.contacts.contacts.filter(u => { const t = ((u.priv || {}).tel || '').replace(/\D/g, ''); return t && t.includes(n); }).slice(0, 4);
    return hits.map(u => `<button class="cl sug" type="button" data-act="clContact" data-id="${u.id}">${avatar(u, 'sm')}<div class="cl-t"><b>${esc(u.name)}</b><span>${esc(u.priv.tel)}</span></div>${I.phone}</button>`).join('');
  },
  body() {
    if (!this.log) { this.load(); }
    const list = (this.log || []).map(c => this.row(c)).join('');
    return `<div class="calls">
      <div class="cl-list">${this.log ? (list || '<p class="empty">Aucun appel pour l’instant. Vos appels vocaux et vidéo apparaîtront ici.</p>') : '<p class="empty">Chargement…</p>'}</div>
      <div class="dial" aria-label="Clavier">
        <div class="dial-sug" id="dialSug">${this.suggest()}</div>
        <div class="dial-top"><input id="dialIn" type="tel" inputmode="none" autocomplete="off" placeholder="Composez ou collez un numéro" value="${esc(this.num)}" aria-label="Numéro">
          <button class="ib" type="button" data-act="dialBack" aria-label="Effacer">${I.backspace}</button></div>
        <div class="dial-keys">${KEYS.map(([k, l]) => `<button class="dk" type="button" data-act="dialKey" data-k="${k}"><b>${k}</b><small>${l}</small></button>`).join('')}</div>
        <div class="dial-go"><button class="dgo vid" type="button" data-act="dialCall" data-video="1" aria-label="Appel vidéo">${I.video}</button>
          <button class="dgo" type="button" data-act="dialCall" aria-label="Appel vocal">${I.phone}</button>
          <button class="dgo paste" type="button" data-act="dialPaste" aria-label="Coller un numéro">Coller</button></div>
      </div></div>`;
  },
  after() {},
  setNum(v) { this.num = String(v).replace(/[^\d+*#]/g, '').slice(0, 20); const i = $('#dialIn'); if (i) i.value = this.num; const s = $('#dialSug'); if (s) s.innerHTML = this.suggest(); },
  async openDirect(userId) {
    const r = await api('/api/chats/direct', {userId}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat);
    S.tab = 'chats'; renderAll(); await openChat(r.chat.id); return r.chat;
  },
  async dial(video) {
    const n = this.num.replace(/\D/g, '');
    if (n.length < 6) return toast('Tapez ou collez un numéro complet.');
    let r; try { r = await api('/api/calls/lookup?num=' + encodeURIComponent(this.num)); } catch (e) { return toast(e.message); }
    if (r.user) { try { await this.openDirect(r.user.id); Call.start(!!video); } catch (e) { toast(e.message); } return; }
    const tel = this.num.replace(/[^\d+]/g, '');
    sheet(`${head('Ce numéro n’a pas tam-tam')}<div class="sheet-body"><p class="hint">Aucun de vos contacts tam-tam n’a ce numéro (<b>${esc(this.num)}</b>). Les appels tam-tam se font entre membres de tam-tam.</p>
      <div class="actions" style="flex-direction:column;align-items:stretch"><a class="btn" href="tel:${esc(tel)}">${I.phone}Appeler avec mon téléphone</a>
      <button class="btn ghost" type="button" data-act="dialInvite" data-tel="${esc(tel)}">${I.userplus}L’inviter sur tam-tam par SMS</button></div></div>`, 'Numéro inconnu');
  },
};
document.addEventListener('input', e => { if (e.target.id === 'dialIn') Calls.setNum(e.target.value); });
Object.assign(ACT, {
  dialKey(d) { Calls.setNum(Calls.num + d.k); if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) try { navigator.vibrate(10); } catch {} },
  dialBack() { Calls.setNum(Calls.num.slice(0, -1)); },
  async dialPaste() { try { Calls.setNum(await navigator.clipboard.readText()); } catch { const i = $('#dialIn'); if (i) { i.setAttribute('inputmode', 'tel'); i.focus(); toast('Appuyez longuement dans la case, puis « Coller ».'); } } },
  dialCall(d) { Calls.dial(!!d.video); },
  async dialInvite(d) {
    try { if (!S.lastInvite) S.lastInvite = await api('/api/invites', {}); closeLayer(); location.href = `sms:${d.tel}?body=${encodeURIComponent(inviteText())}`; } catch (e) { toast(e.message); }
  },
  async clContact(d) { try { await Calls.openDirect(+d.id); Call.start(false); } catch (e) { toast(e.message); } },
  async clCall(d) {
    const id = +d.chat; if (!S.chats.has(id)) return toast('Cette discussion n’existe plus.');
    S.tab = 'chats'; renderAll(); await openChat(id);
    if (d.grp) GCall.start(!!d.video); else Call.start(!!d.video);
  },
});

/* ---------- discussions privées ---------- */
const Priv = {
  t: 0, last: '',
  isCode: q => /^\d{4,8}$/.test(q),
  watch(q) {
    if (S.showHidden || !S.me || !S.me.hasHideCode || !this.isCode(q) || q === this.last) return;
    clearTimeout(this.t);
    this.t = setTimeout(async () => {
      this.last = q;
      try { const r = await api('/api/private/unlock', {code: q}); if (r.ok) { S.showHidden = true; S.q = ''; const i = $('#q'); if (i) i.value = ''; this.last = ''; renderTabs(); renderBody(); toast('Discussions privées affichées'); } } catch {}
    }, 450);
  },
  hide() { S.showHidden = false; const c = S.chatId && S.chats.get(S.chatId); if (c && c.hidden) ACT.back(); renderTabs(); renderBody(); },
  async toggle() {
    const c = S.chats.get(S.chatId); if (!c) return;
    if (c.hidden) return this.set(c, false);
    if (!S.me.hasHideCode) return this.codeSheet(c);
    this.set(c, true);
  },
  async set(c, on, code) {
    try {
      const r = await api(`/api/chats/${c.id}/hide`, {on, code}); S.chats.set(c.id, Object.assign(c, {hidden: r.chat.hidden}));
      if (on) { S.me.hasHideCode = true; S.showHidden = false; closeLayer(); ACT.back(); renderTabs(); toast('Discussion rendue privée. Pour la retrouver, tapez votre code dans la recherche.'); }
      else { closeLayer(); renderBody(); toast('La discussion est de nouveau visible.'); }
    } catch (e) { const er = $('#pcErr'); if (er) { er.textContent = e.message; er.hidden = false; } else toast(e.message); }
  },
  codeSheet(c, change) {
    sheet(`${head(change ? 'Changer le code des discussions privées' : 'Code des discussions privées')}<form class="sheet-body" data-form="privCode" data-chat="${c ? c.id : ''}">
      <p class="hint">${change ? 'Tapez l’ancien code, puis le nouveau.' : 'Choisissez un code de 4 à 8 chiffres. Les discussions privées disparaissent de la liste : pour les retrouver, tapez ce code dans la barre de recherche.'}</p>
      ${change ? '<div class="field"><label for="pcOld">Ancien code</label><input id="pcOld" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></div>' : ''}
      <div class="field"><label for="pc1">${change ? 'Nouveau code' : 'Code'} <span class="req">· 4 à 8 chiffres</span></label><input id="pc1" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></div>
      <div class="field"><label for="pc2">Confirmez le code</label><input id="pc2" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></div>
      <p class="hint">Évitez une date de naissance ou votre code de téléphone.</p>
      <p class="err" id="pcErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="submit">${change ? 'Changer le code' : 'Rendre privée'}</button></div></form>`, 'Code des discussions privées');
  },
  settingsHtml() {
    return `<div class="set-block"><h2>${I.lock} Discussions privées</h2><p class="hint">Dans une discussion, touchez ⋮ puis « Rendre la discussion privée » : elle disparaît de la liste. Pour l’afficher, tapez votre code dans la recherche.</p>
      ${S.me.hasHideCode ? '<div><button class="btn sm ghost" type="button" data-act="privCodeChange">Changer le code</button></div>' : ''}</div>`;
  },
};
FORMS.privCode = async f => {
  const a = $('#pc1').value, b = $('#pc2').value, er = $('#pcErr'), bad = t => { er.textContent = t; er.hidden = false; };
  if (!/^\d{4,8}$/.test(a)) return bad('Le code doit contenir de 4 à 8 chiffres.');
  if (a !== b) return bad('Les deux codes ne sont pas identiques.');
  const old = $('#pcOld');
  if (old) { try { await api('/api/private/code', {old: old.value, code: a}); closeLayer(); toast('Code changé.'); } catch (e) { bad(e.message); } return; }
  const c = S.chats.get(+f.dataset.chat); if (c) Priv.set(c, true, a);
};
document.addEventListener('visibilitychange', () => { if (document.hidden && S.showHidden) Priv.hide(); });
Object.assign(ACT, {
  privToggle() { Priv.toggle(); },
  privHide() { Priv.hide(); },
  privCodeChange() { Priv.codeSheet(null, true); },
});
