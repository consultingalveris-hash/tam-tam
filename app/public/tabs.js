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
      <span>${c.dir === 'in' ? I.arrowIn : I.arrowOut}${lab}${grp ? ' · groupe' : ''}${c.num ? ' · par numéro' : ''} · ${this.when(c.at)}${c.dur ? ' · ' + this.dur(c.dur) : ''}</span></div>
      <button class="ib" type="button" data-act="clCall" data-chat="${c.chatId}" data-num="${c.num ? 1 : ''}" data-video="${c.video ? 1 : ''}" data-grp="${grp ? 1 : ''}" aria-label="Rappeler en ${c.video ? 'vidéo' : 'vocal'}">${c.video ? I.video : I.phone}</button></div>`;
  },
  suggest() {
    const n = this.num.replace(/\D/g, ''); if (n.length < 2) return '';
    const hits = S.contacts.contacts.filter(u => { const t = ((u.priv || {}).tel || '').replace(/\D/g, ''); return t && t.includes(n); }).slice(0, 4);
    return hits.map(u => `<button class="cl sug" type="button" data-act="clContact" data-id="${u.id}">${avatar(u, 'sm')}<div class="cl-t"><b>${esc(u.name)}</b><span>${esc(u.priv.tel)}</span></div>${I.phone}</button>`).join('');
  },
  q: '',
  found() {
    const q = this.q.trim().toLowerCase().replace(/^@/, ''); if (!q) return null;
    return S.contacts.contacts.filter(u => u.name.toLowerCase().includes(q) || (u.handle || '').toLowerCase().includes(q)).slice(0, 30)
      .map(u => `<div class="cl">${avatar(u, 'sm')}<div class="cl-t"><b>${esc(u.name)}</b><span>@${esc(u.handle)}</span></div>
        <button class="ib" type="button" data-act="clContact" data-id="${u.id}" data-video="1" aria-label="Appel vidéo">${I.video}</button><button class="ib" type="button" data-act="clContact" data-id="${u.id}" aria-label="Appel vocal">${I.phone}</button></div>`).join('') || '<p class="empty">Aucun contact ne correspond.</p>';
  },
  body() {
    if (!this.log) { this.load(); }
    const f = this.found(), list = (this.log || []).map(c => this.row(c)).join('');
    return `<div class="calls">
      <div style="padding:6px 16px 4px"><label class="search">${I.search}<span class="sr">Chercher quelqu’un à appeler</span><input id="cq" type="search" placeholder="Appeler quelqu’un : nom ou @pseudo" autocomplete="off" value="${esc(this.q)}"></label></div>
      <div class="cl-list" id="clList">${f != null ? f : this.log ? (list || '<p class="empty">Aucun appel pour l’instant. Vos appels vocaux et vidéo apparaîtront ici.</p>') : '<p class="empty">Chargement…</p>'}</div>
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
  // Appel par numéro sans être amis : on appelle sans ouvrir de discussion (pas de messages possibles).
  callLine(chat, video) {
    keepUsers(Object.values(chat.users)); S.chats.set(chat.id, chat);
    const prev = S.chatId; S.chatId = chat.id; Call.start(!!video); S.chatId = prev;
    S.chats.delete(chat.id); this.log = null;
  },
  async openDirect(userId) {
    const r = await api('/api/chats/direct', {userId}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat);
    S.tab = 'chats'; renderAll(); await openChat(r.chat.id); return r.chat;
  },
  async dial(video) {
    const n = this.num.replace(/\D/g, '');
    if (n.length < 6) return toast('Tapez ou collez un numéro complet.');
    let r; try { r = await api('/api/calls/bynum', {num: this.num}); } catch (e) { return toast(e.message); }
    if (r.user && r.contact) { try { await this.openDirect(r.user.id); Call.start(!!video); } catch (e) { toast(e.message); } return; }
    if (r.user && r.chat) return this.callLine(r.chat, video);
    const tel = this.num.replace(/[^\d+]/g, '');
    sheet(`${head('Ce numéro n’a pas tam-tam')}<div class="sheet-body"><p class="hint">Aucun membre de Tam-Tam n’a ce numéro (<b>${esc(this.num)}</b>). Les appels tam-tam se font entre membres de tam-tam.</p>
      <div class="actions" style="flex-direction:column;align-items:stretch"><a class="btn" href="tel:${esc(tel)}">${I.phone}Appeler avec mon téléphone</a>
      <button class="btn ghost" type="button" data-act="dialInvite" data-tel="${esc(tel)}">${I.userplus}L’inviter sur tam-tam par SMS</button></div></div>`, 'Numéro inconnu');
  },
};
document.addEventListener('input', e => {
  if (e.target.id === 'dialIn') Calls.setNum(e.target.value);
  if (e.target.id === 'cq') { Calls.q = e.target.value; const f = Calls.found(); $('#clList').innerHTML = f != null ? f : (Calls.log || []).map(c => Calls.row(c)).join('') || '<p class="empty">Aucun appel pour l’instant.</p>'; }
});
Object.assign(ACT, {
  dialKey(d) { Calls.setNum(Calls.num + d.k); if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) try { navigator.vibrate(10); } catch {} },
  dialBack() { Calls.setNum(Calls.num.slice(0, -1)); },
  async dialPaste() { try { Calls.setNum(await navigator.clipboard.readText()); } catch { const i = $('#dialIn'); if (i) { i.setAttribute('inputmode', 'tel'); i.focus(); toast('Appuyez longuement dans la case, puis « Coller ».'); } } },
  dialCall(d) { Calls.dial(!!d.video); },
  async dialInvite(d) {
    try { if (!S.lastInvite) S.lastInvite = await api('/api/invites', {}); closeLayer(); location.href = `sms:${d.tel}?body=${encodeURIComponent(inviteText())}`; } catch (e) { toast(e.message); }
  },
  async clContact(d) { try { Calls.q = ''; await Calls.openDirect(+d.id); Call.start(!!d.video); } catch (e) { toast(e.message); } },
  async clCall(d) {
    if (d.num) { try { const r = await api('/api/calls/again', {chatId: +d.chat}); Calls.callLine(r.chat, !!d.video); } catch (e) { toast(e.message); } return; }
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

/* ---------- recherche d'un mot dans les conversations ---------- */
const Find = {
  done: new Set(), busy: false,
  // les messages sont chiffrés : la recherche se fait sur l'appareil, après les avoir déchiffrés
  async preload(q) {
    if (this.busy || q.length < 2) return; this.busy = true;
    let changed = false;
    for (const c of S.chats.values()) { if (S.msgs.has(c.id) || this.done.has(c.id)) continue; this.done.add(c.id); await loadMessages(c.id); changed = true; }
    this.busy = false; if (changed && S.tab === 'chats' && S.q.trim()) renderBody();
  },
  mark(text, q) {
    const t = String(text), i = t.toLowerCase().indexOf(q), from = Math.max(0, i - 24), part = t.slice(from, i + q.length + 50);
    const j = i - from; return (from ? '…' : '') + esc(part.slice(0, j)) + '<mark>' + esc(part.slice(j, j + q.length)) + '</mark>' + esc(part.slice(j + q.length));
  },
};

/* ---------- code QR personnel ---------- */
const Qr = {
  async show(reset) {
    let r; try { r = await api(reset ? '/api/qr/reset' : '/api/qr', reset ? {} : undefined); } catch (e) { return toast(e.message); }
    sheet(`${head('Mon code QR')}<div class="sheet-body" style="align-items:center;text-align:center">
      <div class="qrbox">${r.svg}</div>
      <p class="hint">Faites scanner ce code avec l’appareil photo d’un téléphone : la personne devient votre contact sur Tam-Tam. Elle peut vous écrire et vous appeler, mais <b>ne voit que votre profil public</b> : ni votre téléphone, ni votre adresse.</p>
      <div class="actions" style="justify-content:center;flex-wrap:wrap"><button class="btn" type="button" data-act="qrScan">${I.camera}Scanner un code</button><button class="btn ghost" type="button" data-act="qrCopy" data-url="${esc(r.url)}">${I.copy}Copier le lien</button><button class="btn ghost" type="button" data-act="qrReset">Changer mon code</button></div>
      </div>`, 'Mon code QR');
  },
  jsqr() { return window.jsQR ? Promise.resolve(window.jsQR) : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/jsqr.js'; sc.onload = () => res(window.jsQR); sc.onerror = () => rej(new Error('Lecteur de code indisponible.')); document.head.appendChild(sc); }); },
  found(txt) { const m = /\/add\/([A-Za-z0-9_-]+)/.exec(txt || ''); if (!m) return false; closeLayer(); this.connect(m[1]); return true; },
  async scan() {
    sheet(`${head('Scanner un code QR')}<div class="sheet-body" style="align-items:center"><video id="qrVid" class="qrvid" autoplay playsinline muted></video><p class="hint" id="qrHint" style="text-align:center">Visez le code QR de votre ami.</p>
      <div class="actions" style="justify-content:center"><button class="btn sm ghost" type="button" data-act="qrFile">${I.image}Choisir une photo du code</button><input type="file" id="qrIn" accept="image/*" hidden></div></div>`, 'Scanner');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}}); }
    catch { const h = $('#qrHint'), v0 = $('#qrVid'); if (v0) v0.hidden = true; if (h) h.textContent = 'L’appareil photo n’est pas disponible ici. Prenez le code en photo (ou une capture d’écran), puis choisissez cette photo.'; return; }
    const v = $('#qrVid'); if (!v) return stream.getTracks().forEach(t => t.stop()); v.srcObject = stream;
    const stop = () => stream.getTracks().forEach(t => t.stop());
    let det = null, jq = null; if ('BarcodeDetector' in window) { try { det = new BarcodeDetector({formats: ['qr_code']}); } catch {} }
    if (!det) { try { jq = await this.jsqr(); } catch (e) { toast(e.message); } }
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', {willReadFrequently: true});
    const loop = async () => {
      if (!document.body.contains(v)) return stop();
      try {
        let txt = '';
        if (det) txt = ((await det.detect(v)).map(c => c.rawValue).find(x => /\/add\//.test(x))) || '';
        else if (jq && v.videoWidth) { const k = Math.min(1, 640 / v.videoWidth); cv.width = v.videoWidth * k; cv.height = v.videoHeight * k; ctx.drawImage(v, 0, 0, cv.width, cv.height); const r = jq(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height); txt = r ? r.data : ''; }
        if (txt && this.found(txt)) return stop();
      } catch {}
      setTimeout(loop, 300);
    };
    v.onloadeddata = loop;
  },
  async fromFile(f) {
    try {
      const jq = await this.jsqr(), url = URL.createObjectURL(f), im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('Photo illisible.')); im.src = url; });
      const k = Math.min(1, 1200 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = im.width * k; cv.height = im.height * k;
      const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      const r = jq(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
      if (!r || !this.found(r.data)) toast('Aucun code Tam-Tam trouvé sur cette photo. Cadrez bien le code et réessayez.');
    } catch (e) { toast(e.message); }
  },
  async connect(token) {
    history.replaceState(null, '', '/');
    try {
      const r = await api('/api/qr/connect', {token}); keepUsers([r.user]); await loadContacts();
      toast(r.already ? `${r.user.name} est déjà votre contact.` : `Vous êtes maintenant en contact avec ${r.user.name}.`);
      ACT.write({id: r.user.id});
    } catch (e) { toast(e.message); }
  },
};
Object.assign(ACT, {
  qrShow() { Qr.show(); }, qrReset() { Qr.show(true); }, qrScan() { Qr.scan(); }, qrFile() { $('#qrIn').click(); },
  qrCopy(d) { (navigator.clipboard ? navigator.clipboard.writeText(d.url) : Promise.reject()).then(() => toast('Lien copié.'), () => toast(d.url)); },
  async sharePriv(d) { try { await api('/api/contacts/share-priv', {id: +d.id}); toast('Votre profil privé est maintenant visible pour ce contact.'); profSheet(+d.id); } catch (e) { toast(e.message); } },
});

/* ---------- onglet Contacts : le répertoire du téléphone ---------- */
const Book = {
  list: null, match: {}, q: '', loaded: false,
  canPick: () => 'contacts' in navigator && navigator.contacts && typeof navigator.contacts.select === 'function',
  key: () => 'book:' + S.me.id,
  norm: t => String(t || '').replace(/\D/g, '').slice(-9),
  async hash(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); },
  async load() {
    if (this.loaded) return; this.loaded = true;
    const saved = await Store.get(this.key()); this.list = (saved && saved.list) || []; this.match = (saved && saved.match) || {};
    if (S.tab === 'contacts') renderBody();
    if (this.list.length) this.refresh();
  },
  async save() { await Store.set(this.key(), {list: this.list, match: this.match}); },
  // envoie seulement des empreintes des numéros : le serveur ne reçoit jamais votre répertoire en clair
  async refresh() {
    const hs = {}; for (const c of this.list) { const n = this.norm(c.tel); if (n.length >= 6) hs[await this.hash(n)] = n; }
    try { const r = await api('/api/contacts/match', {hashes: Object.keys(hs)}); this.match = {}; for (const [h, u] of Object.entries(r.matches)) this.match[hs[h]] = u; keepUsers(Object.values(r.matches)); await this.save(); }
    catch (e) { toast(e.message); }
    if (S.tab === 'contacts') renderBody();
  },
  async addMany(items) {
    const seen = new Set(this.list.map(c => this.norm(c.tel))); let n = 0;
    for (const it of items) { const k = this.norm(it.tel); if (k.length < 6 || seen.has(k)) continue; seen.add(k); this.list.push({name: it.name || it.tel, tel: it.tel}); n++; }
    this.list.sort((a, b) => a.name.localeCompare(b.name, 'fr')); await this.save();
    toast(n ? `${n} contact${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.` : 'Aucun nouveau numéro trouvé.'); this.refresh();
  },
  async pick() {
    if (!this.canPick()) return this.choices();
    try {
      const props = navigator.contacts.getProperties ? await navigator.contacts.getProperties() : ['name', 'tel'];
      if (!props.includes('tel')) return this.choices('Ce navigateur ne donne pas accès aux numéros du répertoire.');
      const got = await navigator.contacts.select(props.includes('name') ? ['name', 'tel'] : ['tel'], {multiple: true}); if (!got || !got.length) return;
      const items = []; for (const c of got) for (const tel of (c.tel || []).slice(0, 2)) items.push({name: (c.name && c.name[0]) || '', tel});
      this.addMany(items);
    } catch (e) { this.choices(/brave/i.test(navigator.userAgent) || navigator.brave ? 'Le navigateur Brave bloque l’accès au répertoire.' : 'Le navigateur n’a pas ouvert le répertoire.'); }
  },
  // autres façons d'ajouter ses contacts quand le navigateur bloque le répertoire
  choices(why) {
    sheet(`${head('Ajouter vos contacts')}<div class="sheet-body">${why ? `<p class="note">${I.info}${esc(why)}</p>` : ''}
      <div class="opt"><b>1. Ouvrir Tam-Tam dans Google Chrome</b><span>Sur Android, Chrome sait ouvrir le répertoire. Ouvrez <b>${esc(location.host)}</b> dans Chrome, puis revenez ici.</span></div>
      <div class="opt"><b>2. Importer le fichier de vos contacts</b><span>Dans l’application <b>Contacts</b> du téléphone : menu ⋮ → <b>Exporter</b> (ou Gérer les contacts → Exporter) → fichier « .vcf ». Puis choisissez ce fichier ici.</span>
        <div><button class="btn sm" type="button" data-act="bookVcf">${I.users}Choisir le fichier .vcf</button><input type="file" id="vcfIn" accept=".vcf,text/vcard,text/x-vcard" hidden></div></div>
      <div class="opt"><b>3. Ajouter un contact à la main</b><span>Son nom et son numéro.</span><div><button class="btn sm ghost" type="button" data-act="bookManual">Saisir un numéro</button></div></div></div>`, 'Ajouter vos contacts');
  },
  parseVcf(text) {
    const out = []; const blocks = String(text).replace(/\r?\n[ \t]/g, '').split(/BEGIN:VCARD/i).slice(1);
    for (const b of blocks) {
      const lines = b.split(/\r?\n/); let name = '';
      const fn = lines.find(l => /^FN[:;]/i.test(l)); if (fn) name = fn.slice(fn.indexOf(':') + 1).trim();
      if (!name) { const n = lines.find(l => /^N[:;]/i.test(l)); if (n) name = n.slice(n.indexOf(':') + 1).split(';').filter(Boolean).reverse().join(' ').trim(); }
      for (const l of lines.filter(l => /^(item\d+\.)?TEL[:;]/i.test(l)).slice(0, 2)) out.push({name: name.replace(/\\,/g, ','), tel: l.slice(l.indexOf(':') + 1).replace(/^tel:/i, '').trim()});
    }
    return out;
  },
  manual() {
    sheet(`${head('Ajouter un contact du téléphone')}<form class="sheet-body" data-form="bookAdd">
      ${this.canPick() ? '' : '<p class="hint">Sur cet appareil, Tam-Tam ne peut pas ouvrir le répertoire. Ajoutez vos proches un par un.</p>'}
      <div class="field"><label for="bkName">Nom</label><input id="bkName" maxlength="60" autocomplete="off" required></div>
      <div class="field"><label for="bkTel">Numéro de téléphone</label><input id="bkTel" type="tel" inputmode="tel" maxlength="20" placeholder="+221 …" required></div>
      <p class="err" id="bkErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="submit">Ajouter</button></div></form>`, 'Ajouter un contact');
  },
  relUpdate(u) { for (const v of Object.values(this.match)) if (v.id === u.id) v.rel = u.rel; },
  initial: n => esc((n || '?').trim().charAt(0).toUpperCase()),
  row(c) {
    const n = this.norm(c.tel), u = this.match[n];
    const av = u ? avatar(uOf(u.id).name ? uOf(u.id) : u, 'sm') : `<span class="av sm letter" aria-hidden="true">${this.initial(c.name)}</span>`;
    return `<div class="bk">${av}<div class="cl-t"><b>${esc(c.name)}</b><span>${esc(c.tel)}${u ? ' · sur Tam-Tam' : ''}</span></div>
      ${u ? `<button class="btn sm" type="button" data-act="bookChat" data-id="${u.id}">Discuter</button>` : `<button class="btn sm ghost" type="button" data-act="bookInvite" data-tel="${esc(c.tel)}">Inviter</button>`}</div>`;
  },
  // Amis Tam-Tam (acceptés), demandes reçues et envoyées : toujours en haut de l'onglet Contacts.
  friends() {
    const C = S.contacts, q = this.q.trim().toLowerCase(), f = u => !q || u.name.toLowerCase().includes(q);
    const inc = C.incoming.filter(f), fr = C.contacts.filter(f), out = C.outgoing.filter(f);
    const row = u => `<div class="row">${avOn(u)}<button class="row-name linkless" type="button" data-act="prof" data-id="${u.id}" style="border:0;background:none;padding:0;text-align:left;min-width:0;flex:1"><b>${esc(u.name)}</b></button><span class="row-end" style="display:flex;gap:4px;align-items:center">
      <button class="ib" type="button" data-act="clContact" data-id="${u.id}" aria-label="Appel vocal avec ${esc(u.name)}" title="Appel vocal">${I.phone}</button><button class="ib" type="button" data-act="clContact" data-id="${u.id}" data-video="1" aria-label="Appel vidéo avec ${esc(u.name)}" title="Appel vidéo">${I.video}</button><button class="btn sm" type="button" data-act="write" data-id="${u.id}">Discuter</button></span></div>`;
    return `${inc.length ? `<div class="sec">Demandes reçues · ${inc.length}</div>${inc.map(u => userRow(u, `<button class="btn sm ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button><button class="btn sm" type="button" data-act="cAccept" data-id="${u.id}">Accepter</button>`)).join('')}` : ''}
      ${fr.length ? `<div class="sec">Mes amis sur Tam-Tam · ${fr.length}</div><div id="frList">${fr.map(row).join('')}</div>` : ''}
      ${out.length ? `<div class="sec">Demandes envoyées · en attente</div>${out.map(u => userRow(u, '<span class="hint">En attente</span>')).join('')}` : ''}
      ${!C.contacts.length && !inc.length && !out.length ? `<p class="hint" style="padding:8px 16px">Vos amis Tam-Tam apparaîtront ici dès qu’ils auront accepté votre demande. Pour en ajouter, touchez <b>+</b> en haut.</p>` : ''}
      <div class="sec">Répertoire du téléphone</div>`;
  },
  body() { return this.friends() + this.book(); },
  book() {
    if (!this.loaded) { this.load(); return '<p class="empty">Chargement…</p>'; }
    const q = this.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    let list = this.list.filter(c => !q || c.name.toLowerCase().includes(q) || (qd && c.tel.replace(/\D/g, '').includes(qd)));
    list = list.slice().sort((a, b) => (this.match[this.norm(b.tel)] ? 1 : 0) - (this.match[this.norm(a.tel)] ? 1 : 0));
    const on = list.filter(c => this.match[this.norm(c.tel)]).length;
    const noTel = !((S.me.priv || {}).tel);
    return `${noTel ? `<div class="qrnote" style="margin:8px 12px"><span>📱 Ajoutez votre numéro pour que vos proches vous retrouvent sur Tam-Tam.</span><button class="btn sm" type="button" data-act="goPhone">Ajouter mon numéro</button></div>` : ''}
      ${this.list.length ? `<div style="padding:6px 16px 4px"><label class="search">${I.search}<span class="sr">Chercher</span><input id="bq" type="search" placeholder="Chercher un nom ou un numéro" autocomplete="off" value="${esc(this.q)}"></label></div>
      <div class="sec">${on ? `${on} sur Tam-Tam · ` : ''}${this.list.length} contact${this.list.length > 1 ? 's' : ''}</div>
      <div id="bkList">${list.map(c => this.row(c)).join('') || '<p class="empty">Aucun contact ne correspond.</p>'}</div>
      <div class="actions" style="justify-content:center;padding:12px 16px 24px"><button class="btn sm ghost" type="button" data-act="bookPick">${I.userplus}Ajouter depuis mon répertoire</button><button class="btn sm ghost" type="button" data-act="bookMore">Autres façons</button></div>`
      : `<div class="empty"><p><b>Retrouvez vos proches</b></p><p>Choisissez les contacts de votre téléphone : ceux qui ont déjà Tam-Tam s’affichent avec <b>Discuter</b>, les autres avec <b>Inviter</b>.</p>
        <button class="btn" type="button" data-act="bookPick">${I.users}Choisir dans mon répertoire</button><button class="linkb" type="button" data-act="bookMore">Autres façons d’ajouter mes contacts</button>
        <p class="hint">Vos contacts restent sur ce téléphone. Tam-Tam reçoit seulement une empreinte des numéros, jamais votre répertoire en clair.</p></div>`}`;
  },
  after() {},
};
FORMS.bookAdd = async () => {
  const name = $('#bkName').value.trim(), tel = $('#bkTel').value.trim(), er = $('#bkErr');
  if (!name || Book.norm(tel).length < 6) { er.textContent = 'Indiquez un nom et un numéro complet.'; er.hidden = false; return; }
  if (!Book.list.some(c => Book.norm(c.tel) === Book.norm(tel))) { Book.list.push({name, tel}); Book.list.sort((a, b) => a.name.localeCompare(b.name, 'fr')); await Book.save(); }
  closeLayer(); Book.refresh();
};
document.addEventListener('input', e => { if (e.target.id === 'bq') { Book.q = e.target.value; const q = Book.q.trim().toLowerCase(), qd = q.replace(/\D/g, ''); const el = $('#bkList'); if (el) el.innerHTML = Book.list.filter(c => !q || c.name.toLowerCase().includes(q) || (qd && c.tel.replace(/\D/g, '').includes(qd))).map(c => Book.row(c)).join('') || '<p class="empty">Aucun contact ne correspond.</p>'; } });

/* ---------- « Ajouter des amis » (le + en haut) ---------- */
const Add = {
  row(u) { const ph = (u.pics || []).filter(Boolean); return `<div class="row${ph.length ? ' has-ph' : ''}">${avOn(u)}<button class="row-name linkless" type="button" data-act="prof" data-id="${u.id}" style="border:0;background:none;padding:0;text-align:left;display:flex;flex-direction:column;align-items:flex-start;min-width:0"><b>${esc(u.name)}</b><small style="color:var(--fg-2);font-weight:400">@${esc(u.handle)}${u.pub && u.pub.ville ? ' · ' + esc(u.pub.ville) : ''}${u.mutual ? ` · ${u.mutual} ami${u.mutual > 1 ? 's' : ''} en commun` : ''}</small>${ph.length ? `<span class="ph-mini">${ph.map(x => `<img src="${esc(x)}" alt="" loading="lazy">`).join('')}</span>` : ''}</button><span class="row-end">${relBtn(u)}</span></div>`; },
  html() {
    const C = S.contacts;
    return `${head('Ajouter des amis')}<div class="sheet-body" id="addSheet" style="gap:6px">
      <label class="search">${I.search}<span class="sr">Chercher un membre</span><input id="fq" type="search" placeholder="Nom ou pseudo (@…)" autocomplete="off" value="${esc(S.fq || '')}"></label>
      <div id="fres">${S.fres ? (S.fres.length ? S.fres.map(u => this.row(u)).join('') : '<p class="empty">Personne ne correspond.</p>') : ''}</div>
      ${C.incoming.length ? `<div class="sec">Demandes reçues · ${C.incoming.length}</div>${C.incoming.map(u => userRow(u, `<button class="btn sm ghost" type="button" data-act="cDecline" data-id="${u.id}">Refuser</button><button class="btn sm" type="button" data-act="cAccept" data-id="${u.id}">Accepter</button>`)).join('')}` : ''}
      <div class="sec">Membres de Tam-Tam</div>
      <p class="hint" style="margin:0 0 4px">Les personnes de Tam-Tam qui ne sont pas encore vos amis. Touchez une personne pour voir son profil public, puis demandez-la en ami. Une fois acceptée, elle passe dans l’onglet <b>Contacts</b>. Même devenu ami, personne ne voit votre numéro de téléphone sans votre accord.</p>
      <div id="peopleList">${Add.people ? (Add.people.length ? Add.people.map(u => this.row(u)).join('') : '<p class="empty">Pas encore d’autres membres.</p>') : '<p class="hint">Chargement…</p>'}</div>
      ${Add.more ? '<div><button class="btn sm ghost" type="button" data-act="peopleMore">Voir plus de membres</button></div>' : ''}
      ${C.outgoing.length ? `<div class="sec">Demandes envoyées</div>${C.outgoing.map(u => this.row(u)).join('')}` : ''}
      <div class="sec">Inviter vos proches</div>
      <div class="invite-box" style="margin:0">
        ${S.lastInvite ? `<div class="invite-url">${esc(S.lastInvite.url)}</div><div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-act="invCopy">${I.copy}Copier le lien</button><a class="btn sm ghost" href="https://wa.me/?text=${encodeURIComponent(inviteText())}" target="_blank" rel="noopener">WhatsApp</a>${navigator.share ? '<button class="btn sm ghost" type="button" data-act="invShare">Partager…</button>' : ''}</div><span class="hint">Valable 14 jours, pour 20 personnes au plus.</span>`
        : `<span class="hint">Seules les personnes qui ont un lien d’invitation ou votre code QR peuvent s’inscrire.</span><div><button class="btn sm" type="button" data-act="invNew">${I.userplus}Créer un lien d’invitation</button></div>`}
      </div>
      <div class="sec">Code QR</div>
      <div class="actions" style="justify-content:flex-start;margin-bottom:8px"><button class="btn sm ghost" type="button" data-act="qrShow">${I.qr}Mon code QR</button><button class="btn sm ghost" type="button" data-act="qrScan">${I.camera}Scanner un code</button></div></div>`;
  },
  open() { S.fq = ''; S.fres = null; Add.people = null; Add.more = false; sheet(this.html(), 'Ajouter des amis'); this.loadPeople(); },
  async loadPeople(more) {
    try { const r = await api('/api/people?off=' + (more ? (Add.people || []).length : 0)); keepUsers(r.users); Add.people = (more ? Add.people || [] : []).concat(r.users); Add.more = r.more; this.render(); }
    catch (e) { if (!more) { Add.people = []; this.render(); } toast(e.message); }
  },
  render() { const el = $('#addSheet'); if (!el) return; const box = el.closest('.sheet'); const y = el.scrollTop; box.innerHTML = this.html(); const n = $('#addSheet'); if (n) n.scrollTop = y; },
};
Object.assign(ACT, {
  addOpen() { Add.open(); }, peopleMore() { Add.loadPeople(true); },
  goPhone() { S.profTab = 'priv'; ACT.goProfile(); setTimeout(() => { const i = $('#p-tel'); if (i) { i.scrollIntoView({block: 'center'}); i.focus(); } }, 80); },
  bookPick() { Book.pick(); }, bookManual() { Book.manual(); }, bookMore() { Book.choices(); }, bookVcf() { $('#vcfIn').click(); },
  async bookChat(d) {
    const id = +d.id, u = uOf(id), rel = (Object.values(Book.match).find(x => x.id === id) || {}).rel || u.rel;
    if (rel === 'contact') return ACT.write({id});
    if (rel === 'received') { await contactAct('accept', id); return ACT.write({id}); }
    if (rel === 'sent') return toast('Demande déjà envoyée : vous pourrez discuter dès qu’elle sera acceptée.');
    await contactAct('request', id);
  },
  async bookInvite(d) { try { if (!S.lastInvite) S.lastInvite = await api('/api/invites', {}); location.href = `sms:${d.tel.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(inviteText())}`; } catch (e) { toast(e.message); } },
  filt(d) { if (d.f === 'me' && isDesk()) return pmOpen('me'); S.filt = d.f; renderHead(); renderBody(); },
  async favToggle() { const c = S.chats.get(S.chatId); if (!c) return; try { await api(`/api/chats/${c.id}/fav`, {fav: !c.fav}); c.fav = !c.fav; closeLayer(); renderBody(); toast(c.fav ? 'Ajoutée aux favoris.' : 'Retirée des favoris.'); } catch (e) { toast(e.message); } },
});

document.addEventListener('change', async e => {
  if (e.target.id !== 'vcfIn') return; const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const items = Book.parseVcf(await f.text()); closeLayer(); if (!items.length) return toast('Aucun numéro trouvé dans ce fichier.'); await Book.addMany(items); }
  catch { toast('Ce fichier n’a pas pu être lu.'); }
});

/* ---------- glisser pour changer d'onglet ---------- */
(() => {
  const ORDER = ['chats', 'contacts', 'calls']; let x0 = 0, y0 = 0, t0 = 0, ok = false;
  document.addEventListener('touchstart', e => {
    const tg = e.target, app = document.querySelector('.app');
    ok = !!(app && app.dataset.view !== 'chat' && tg.closest('#side') && !tg.closest('.chips,.stories,input,textarea,select,.dial,.sheet,.lock-screen,.pad,.call,#gcall,.avb'));
    if (!ok || e.touches.length !== 1) { ok = false; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, {passive: true});
  document.addEventListener('touchend', e => {
    if (!ok) return; ok = false;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    let i = ORDER.indexOf(S.tab); if (i < 0) i = 0;
    const next = dx < 0 ? Math.min(ORDER.length - 1, i + 1) : Math.max(0, i - 1);
    if (S.tab === 'settings' && dx > 0) return ACT.tab({t: 'chats'});
    if (ORDER[next] !== S.tab) { ACT.tab({t: ORDER[next]}); const b = $('#body'); if (b) { b.classList.remove('slide-l', 'slide-r'); void b.offsetWidth; b.classList.add(dx < 0 ? 'slide-l' : 'slide-r'); } }
  }, {passive: true});
})();
document.addEventListener('change', e => { if (e.target.id !== 'qrIn') return; const f = e.target.files[0]; e.target.value = ''; if (f) Qr.fromFile(f); });
