/* tam-tam — Souvenirs : les photos et vidéos qu'on garde dans le temps.
   Public : visible par tous sur votre profil. Privé : vous seul, chiffré pour vous seul et ouvert avec votre code à 4 chiffres.
   Mon Tam-Tam : envoyé aux amis choisis (chiffré pour eux seulement), privé ou non, à vue unique ou non. */
// date du jour à l'heure de l'appareil (et non à l'heure de Greenwich)
const dayISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MEM_AUD = {public: ['Public', I.globe], private: ['Privé', I.lock], friends: ['Mon Tam-Tam', I.users]};
const Mem = {
  items: null, recv: null, unseen: 0, filt: 'all', unlocked: false, thumbs: new Map(), others: new Map(),
  /* ---- code à 4 chiffres ---- */
  unlockThen(fn) {
    if (this.unlocked) return fn();
    this.after = fn; this.codeSheet(S.me.hasMemCode ? 'ask' : 'new');
  },
  codeSheet(mode, msg) {
    this.cmode = mode; const t = {ask: 'Souvenirs privés', new: 'Créez votre code', again: 'Confirmez votre code', forgot: 'Nouveau code'}[mode];
    const sub = {ask: 'Tapez votre code à 4 chiffres pour ouvrir vos souvenirs privés.', new: 'Choisissez un code à 4 chiffres. Il protège vos souvenirs privés et ceux que vos amis vous envoient en privé.', again: 'Tapez le même code une seconde fois.', forgot: 'Pour votre sécurité, confirmez d’abord que c’est bien vous avec le mot de passe de votre compte, puis choisissez votre nouveau code.'}[mode];
    sheet(`${head(t)}<form data-form="memCode"><div class="sheet-body mc-body"><div class="mc-logo">${BRAND()}<span>${I.lock}Privé</span></div><p class="hint" style="text-align:center">${sub}</p>
      ${mode === 'forgot' ? '<div class="field"><label for="mcPass">1. Mot de passe de votre compte</label><input id="mcPass" type="password" autocomplete="current-password" placeholder="Celui que vous utilisez pour vous connecter" required></div><label class="mc-lab" for="mcIn">2. Nouveau code à 4 chiffres</label>' : ''}
      <input id="mcIn" class="mc-in" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="Code à 4 chiffres" required>
      <div class="mc-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <p class="err" id="mcErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p>
      ${mode === 'ask' ? '<button class="linkless" type="button" data-act="memForgot">Code oublié ?</button>' : ''}
      <div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="submit">${mode === 'ask' ? 'Ouvrir' : 'Valider'}</button></div></div></form>`, t, '#mcIn');
    const i = $('#mcIn'); if (i) i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 4); document.querySelectorAll('.mc-dots i').forEach((d, k) => d.classList.toggle('on', k < i.value.length)); if (i.value.length === 4 && mode !== 'forgot') this.codeSubmit(); });
  },
  async codeSubmit() {
    const v = ($('#mcIn') || {}).value || '', m = this.cmode; if (!/^\d{4}$/.test(v)) return this.codeSheet(m, 'Le code doit faire 4 chiffres.');
    try {
      if (m === 'new') { this.newCode = v; return this.codeSheet('again'); }
      if (m === 'again') { if (v !== this.newCode) return this.codeSheet('new', 'Les deux codes ne sont pas identiques. Recommencez.'); await api('/api/mem/code', {set: v}); S.me.hasMemCode = true; toast('Code des souvenirs enregistré'); }
      else if (m === 'forgot') { await api('/api/mem/code', {set: v, pass: $('#mcPass').value}); S.me.hasMemCode = true; toast('Nouveau code enregistré'); }
      else await api('/api/mem/code', {code: v});
      this.unlocked = true; closeLayer(); const f = this.after; this.after = null; if (f) f(); if (this.filt !== 'private') { this.unlocked = false; }
    } catch (e) { this.codeSheet(m === 'again' ? 'new' : m, e.message); }
  },
  /* ---- chiffrement ---- */
  async sealPublic(payload, bytes, bytes2) {
    const raw = crypto.getRandomValues(new Uint8Array(32)), k = await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    const e1 = await E2E.encBytes(k, bytes); payload.miv = e1.iv; let blob2 = null;
    if (bytes2) { const e2 = await E2E.encBytes(k, bytes2); payload.mmiv = e2.iv; blob2 = new Blob([e2.data], {type: 'application/octet-stream'}); }
    const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await subtle.encrypt({name: 'AES-GCM', iv}, k, te.encode(JSON.stringify(payload)));
    return {env: {k: b64(raw), iv: b64(iv), ct: b64(ct)}, blob: new Blob([e1.data], {type: 'application/octet-stream'}), blob2};
  },
  async open(it) {
    try {
      let payload, key;
      if (it.env && it.env.k) { key = await subtle.importKey('raw', unb64(it.env.k), 'AES-GCM', false, ['decrypt']); payload = JSON.parse(td.decode(await subtle.decrypt({name: 'AES-GCM', iv: unb64(it.env.iv)}, key, unb64(it.env.ct)))); }
      else { const o = E2E.ready() ? await E2E.open(it.env, S.me.id) : {err: 1}; if (o.err) throw 0; payload = o.payload; key = o.key; }
      Object.assign(it, {cap: payload.t || '', _key: key, miv: payload.miv, tiv: payload.mmiv || null, vmime: payload.mime || null, dur: payload.dur || 0, fname: payload.name || '', fsize: payload.size || 0});
    } catch { it.locked = true; }
    return it;
  },
  async thumb(it) {
    if (this.thumbs.has(it.id)) return this.thumbs.get(it.id);
    if (it.locked || it.kind === 'doc') return null;
    const useThumb = it.thumb && it.tiv, url = useThumb ? it.thumb : it.media, iv = useThumb ? it.tiv : it.miv;
    const p = fetch(url, {credentials: 'same-origin'}).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => E2E.decBytes(it._key, iv, b))
      .then(b => URL.createObjectURL(new Blob([b], {type: useThumb || it.kind !== 'video' ? 'image/jpeg' : (it.vmime || 'video/mp4')}))).catch(() => null);
    this.thumbs.set(it.id, p); return p;
  },
  async full(it) {
    const r = await fetch(it.media, {credentials: 'same-origin'}); if (!r.ok) throw new Error('Souvenir indisponible.');
    return new Blob([await E2E.decBytes(it._key, it.miv, await r.arrayBuffer())], {type: it.kind === 'video' ? (it.vmime || 'video/mp4') : it.kind === 'doc' ? (it.vmime || 'application/octet-stream') : 'image/jpeg'});
  },
  async load() {
    try { const r = await api('/api/memories'); this.items = await Promise.all(r.items.map(x => this.open(x))); }
    catch (e) { this.items = this.items || []; toast(e.message); }
    if (S.tab === 'souvenirs') renderBody();
  },
  async loadRecv(quiet) {
    try { const r = await api('/api/memories/received'); keepUsers(r.items.map(x => x.fromUser).filter(Boolean)); this.recv = await Promise.all(r.items.map(x => this.open(x))); this.unseen = r.unseen; }
    catch (e) { this.recv = this.recv || []; if (!quiet) toast(e.message); }
    renderTabs(); if (S.tab === 'souvenirs') { renderBody(); if (this.filt === 'friends' && this.unseen) this.markSeen(); }
  },
  markSeen() { if (!this.unseen) return; this.unseen = 0; (this.recv || []).forEach(x => { x.seen = true; }); api('/api/memories/received/seen', {}).catch(() => {}); renderTabs(); },
  async loadFor(uid) {
    const r = await api('/api/memories?user=' + uid); const list = await Promise.all(r.items.map(x => this.open(x))); this.others.set(uid, list); return list;
  },
  /* ---- « Il y a 1 an aujourd'hui » et anniversaires d'amis ---- */
  today() {
    const d = new Date(), md = (d.getMonth() + 1) * 100 + d.getDate(), y = d.getFullYear();
    const past = (this.items || []).filter(it => { const t = new Date(it.takenAt); return t.getFullYear() < y && (t.getMonth() + 1) * 100 + t.getDate() === md && !it.locked; });
    const bdays = (S.contacts.contacts || []).filter(u => u.pub && +u.pub.bd === d.getDate() && +u.pub.bm === d.getMonth() + 1);
    return {past, bdays};
  },
  laterKey: () => 'tt-mem-later-' + dayISO(new Date()),
  body() {
    if (!this.items) { this.load(); return '<p class="empty">Chargement…</p>'; }
    if (!this.recv) this.loadRecv(true);
    const f = this.filt, t = this.today(), recv = this.recv || [];
    const mineAll = this.items, priv = mineAll.filter(it => it.aud === 'private'), pub = mineAll.filter(it => it.aud === 'public'), sent = mineAll.filter(it => it.aud === 'friends');
    let later = false; try { later = !!localStorage.getItem(this.laterKey()); } catch {}
    const first = t.past[0], n = first ? new Date().getFullYear() - new Date(first.takenAt).getFullYear() : 0;
    const card = f === 'all' && !later && (t.past.length || t.bdays.length) ? `<div class="mem-today">${first ? `<div class="mem-today-img" data-memth="${first.id}"></div>` : '<div class="mem-today-img party">🎉</div>'}
      <div class="mem-today-t"><b>${first ? `Il y a ${n} an${n > 1 ? 's' : ''} aujourd’hui` : 'Aujourd’hui'}</b>
      <span>${[t.bdays.length ? `Anniversaire de ${t.bdays.map(u => esc(first ? u.name.split(' ')[0] : u.name)).join(', ')}` : '', t.past.length > 1 ? `${t.past.length} souvenirs` : t.past.length ? '1 souvenir' : ''].filter(Boolean).join(' · ')}</span>
      <div class="mem-today-a">${first ? `<button class="btn sm" type="button" data-act="memRepost" data-id="${first.id}">Reposter en statut</button>` : ''}${t.bdays.length ? `<button class="btn sm${first ? ' ghost' : ''}" type="button" data-act="write" data-id="${t.bdays[0].id}">Lui souhaiter</button>` : ''}<button class="btn sm ghost" type="button" data-act="memLater">Plus tard</button></div></div></div>` : '';
    const byYear = list => { const yrs = new Map(); for (const it of list) { const y = new Date(it.takenAt).getFullYear(); if (!yrs.has(y)) yrs.set(y, []); yrs.get(y).push(it); } return [...yrs.entries()].map(([y, its]) => `<div class="sec">${y}</div><div class="mem-grid">${its.map(it => this.tile(it)).join('')}</div>`).join(''); };
    // le dossier privé : turquoise, logo Tam-Tam en noir, « Privé » et un cadenas
    const vault = `<button class="mem-vault" type="button" data-act="memVault"><span class="mv-logo">${BRAND()}</span><span class="mv-lbl">${I.lock}Privé</span><small>${priv.length} souvenir${priv.length > 1 ? 's' : ''}</small><span class="mem-more dotb" role="button" tabindex="0" data-act="memVaultMenu" aria-label="Options du dossier Privé" title="Options"><i></i></span></button>`;
    const isDoc = it => it.kind === 'doc', docsOf = list => list.filter(isDoc), noDoc = list => list.filter(x => !isDoc(x));
    const docFolder = list => { const n = docsOf(list).length; return `<button class="mem-vault mem-docs" type="button" data-act="memDocs"><span class="mv-ic">${I.clip}</span><span class="mv-lbl">Documents</span><small>${n} document${n > 1 ? 's' : ''}</small><span class="mem-more dotb" role="button" tabindex="0" data-act="memDocsMenu" aria-label="Options du dossier Documents" title="Options"><i></i></span></button>`; };
    const empty = (title, txt) => `<div class="empty"><p><b>${title}</b></p>${txt ? `<p>${txt}</p>` : ''}<button class="btn" type="button" data-act="memAdd">${I.plus}Ajouter des souvenirs</button></div>`;
    let main;
    if (f === 'docs') { const all = docsOf([...pub, ...sent, ...recv]).sort((a, b) => b.at - a.at);
      main = `<div class="arch-head"><button class="ib" type="button" data-act="memFilt" data-f="${this.docFrom || 'all'}" aria-label="Retour">${I.back}</button><b>${I.clip}Documents</b></div>` + (all.length ? `<div class="mem-grid">${all.map(it => this.tile(it)).join('')}</div>` : '<p class="empty">Aucun document. Touchez Ajouter, puis Fichiers.</p>'); }
    else if (f === 'private') main = this.unlocked ? (priv.length ? `<div class="mem-unl">${I.lock}Souvenirs privés ouverts · <button class="linkless" type="button" data-act="memRelock">Refermer</button></div>` + byYear(priv) : empty('Aucun souvenir privé', 'Choisissez « Privé » en ajoutant un souvenir : il sera chiffré pour vous seul et protégé par votre code.'))
      : `<div class="mem-grid">${vault}</div><p class="hint" style="padding:0 16px">Touchez le dossier et tapez votre code à 4 chiffres.</p>`;
    else if (f === 'public') main = pub.length ? (docsOf(pub).length ? `<div class="mem-grid">${docFolder(pub)}</div>` : '') + byYear(noDoc(pub)) : empty('Aucun souvenir public', 'Un souvenir public est visible par tous les membres sur votre profil.');
    else if (f === 'friends') main = (recv.length ? `<div class="sec">Reçus de mes amis</div><div class="mem-grid">${recv.map(it => this.tile(it)).join('')}</div>` : '<p class="hint" style="padding:0 16px">Les souvenirs que vos amis vous envoient arriveront ici.</p>')
      + (sent.length ? `<div class="sec">Envoyés à mes amis</div><div class="mem-grid">${sent.map(it => this.tile(it)).join('')}</div>` : '')
      + `<div style="padding:8px 16px"><button class="btn" type="button" data-act="memAdd">${I.plus}Envoyer un souvenir</button></div>`;
    else { const all0 = [...pub, ...sent, ...recv.filter(x => !x.once || !x.opened)], all = noDoc(all0).sort((a, b) => b.takenAt - a.takenAt);
      main = `<div class="mem-grid">${vault}${docsOf(all0).length ? docFolder(all0) : ''}</div>` + (all.length ? byYear(all) : priv.length ? '' : empty('Gardez vos plus beaux moments', 'Ajoutez des photos et des vidéos : chaque année, Tam-Tam vous les rappellera le jour même.')); }
    const un = this.unseen, nSel = this.sel ? this.sel.size : 0;
    const selBar = this.sel ? `<div class="selbar mem-selbar"><button class="ib" type="button" data-act="memSelOff" aria-label="Annuler la sélection">${I.close}</button><b>${nSel} sélectionné${nSel > 1 ? 's' : ''}</b><span class="grow"></span><button class="btn sm ghost" type="button" data-act="memSelAll">Tout</button><button class="ib sel-del" type="button" data-act="memSelDel" aria-label="Supprimer la sélection" title="Supprimer"${nSel ? '' : ' disabled'}>${I.trash}</button></div>` : '';
    return `<div class="mem">${selBar}
      <div class="mem-top"><div class="chips mem-filts">${[['all', 'Tous'], ['public', 'Publics'], ['friends', 'Mon Tam-Tam'], ['private', 'Privés']].map(([k, l]) => `<button class="chip" type="button" data-act="memFilt" data-f="${k}" aria-pressed="${f === k}">${k === 'private' ? I.lock : ''}${l}${k === 'friends' && un ? ` <span class="cnt">${un}</span>` : ''}</button>`).join('')}</div></div>
      ${card}${main}
    </div>`;
  },
  tile(it, other) {
    const [l, ic] = MEM_AUD[it.aud] || MEM_AUD.private, recv = !this.mine(it) && !other, fu = recv ? uOf(it.from) : null;
    const sel = this.sel ? this.sel.has(it.id) : false;
    const veil = it.locked ? '🔒' : this.hidden(it) ? `<span class="mem-veil vlt"><span class="mv-logo">${BRAND()}</span><b>${I.lock}Privé</b>${it.once ? '<small>① Vue unique</small>' : ''}</span>` : it.once && recv ? `<span class="mem-veil once">${it.opened ? 'Ouvert' : '① Vue unique'}</span>` : '';
    const noTh = !!veil || it.kind === 'doc';
    const docv = !veil && it.kind === 'doc' ? `<span class="mem-doc"><b>${esc(((it.fname || '').split('.').pop() || 'DOC').slice(0, 4).toUpperCase())}</b><small>${esc(it.fname || 'Document')}</small></span>` : '';
    const badge = recv ? `<span class="mem-b from">${!it.seen ? '<i class="new-dot"></i>' : ''}${esc(first(fu.name))}</span>` : other ? '' : `<span class="mem-b">${ic}${it.aud === 'friends' ? `${(it.to || []).length || ''}` : l}${it.lock ? ' · ' + I.lock : ''}${it.once ? ' · ①' : ''}</span>`;
    return `<button class="mem-tile${noTh ? ' veiled' : ''}" type="button" data-act="memView" data-id="${it.id}"${other ? ` data-u="${other}"` : ''} aria-label="${it.kind === 'video' ? 'Vidéo' : 'Photo'} ${recv ? 'reçue de ' + esc(fu.name) : l.toLowerCase()} du ${new Date(it.takenAt).toLocaleDateString('fr-FR')}"><span class="mem-th"${noTh ? '' : ` data-memth="${it.id}"`}${other ? ` data-u="${other}"` : ''}>${veil}${docv}</span>${it.kind === 'video' && !noTh ? `<span class="mem-play">▶</span>` : ''}${badge}${!this.sel && !other ? `<span class="mem-more dotb" role="button" tabindex="0" data-act="memMenu" data-id="${it.id}" aria-label="Options : supprimer, sélectionner" title="Options"><i></i></span>` : ''}${this.sel && !other ? `<span class="mem-chk${sel ? ' on' : ''}" aria-hidden="true">${sel ? '✓' : ''}</span>` : ''}</button>`;
  },
  // Remplit les vignettes déchiffrées après l'affichage.
  async hydrate(root = document) {
    for (const el of root.querySelectorAll('[data-memth]:not(.ok)')) {
      el.classList.add('ok'); const uid = +el.dataset.u, it = this.find(+el.dataset.memth, uid); if (!it) continue;
      const u = await this.thumb(it); if (!u) continue;
      if (it.kind === 'video' && !it.thumb) el.innerHTML = `<video src="${u}" muted playsinline preload="metadata"></video>`; else el.style.backgroundImage = `url("${u}")`;
    }
  },
  find(id, uid) { return uid ? (this.others.get(uid) || []).find(x => x.id === id) : (this.items || []).find(x => x.id === id) || (this.recv || []).find(x => x.id === id); },
  mine(it) { return !it.from || it.from === S.me.id; },
  // un souvenir protégé (privé, ou envoyé en privé) ne montre rien tant que le code n'est pas tapé
  hidden(it) { return it.aud === 'private' ? !this.unlocked : !!it.lock && this.pass !== it.id; },
  /* ---- ajouter ---- */
  opts() { return {target: r => this.compose(r), title: 'Nouveau souvenir', gallery: () => $('#memIn') && $('#memIn').click(), native: () => $('#memCamIn') && $('#memCamIn').click()}; },
  addSheet() {
    sheet(`${head('Ajouter un souvenir')}<div class="sheet-body"><p class="hint">Des photos ou des vidéos de votre téléphone, prises maintenant, ou des documents (PDF, Word, Excel…).</p>
      <div class="mem-add">${[['memPick', I.image, 'Galerie'], ['memCam', CI.photo, 'Photo'], ['memVid', CI.video, 'Vidéo'], ['memDoc', I.clip, 'Fichiers']].map(([a, ic, l]) => `<button type="button" data-act="${a}">${ic}<span>${l}</span></button>`).join('')}</div></div>`, 'Ajouter un souvenir');
  },
  // Plusieurs photos et vidéos choisies d'un coup dans la galerie : un seul réglage pour toutes.
  composeMany(files, docs) {
    const ok = [], big = [];
    for (const f of files) { const media = !docs && /^(image|video)\//.test(f.type); if (!docs && !media) continue; if (f.size > 40_000_000) { big.push(f.name); continue; }
      ok.push({kind: media ? (/^video/.test(f.type) ? 'video' : 'photo') : 'doc', blob: f, mime: f.type || 'application/octet-stream', name: f.name, size: f.size, dur: 0, url: media ? URL.createObjectURL(f) : null, date: dayISO(new Date(f.lastModified || Date.now()))}); }
    if (big.length) toast(`${big.length} fichier${big.length > 1 ? 's' : ''} de plus de 40 Mo ignoré${big.length > 1 ? 's' : ''}.`);
    if (!ok.length) return;
    if (ok.length === 1 && ok[0].kind !== 'doc') { const r = ok[0]; URL.revokeObjectURL(r.url); return r.kind === 'video' ? Edit.videoFile(r.blob, this.opts()) : Edit.photoFile(r.blob, this.opts()); }
    this.pend = {many: ok.slice(0, 30), aud: this.preAud(), to: [], cap: '', lock: false, once: false};
    if (ok.length > 30) toast('30 souvenirs au maximum à la fois : les 30 premiers sont gardés.');
    this.composeRender();
  },
  preAud() { const f = this.filt === 'docs' ? this.docFrom : this.filt; return ['public', 'private', 'friends'].includes(f) ? f : null; },
  compose(r) {
    this.pend = {...r, url: URL.createObjectURL(r.blob), aud: this.preAud(), to: [], lock: false, once: false, date: dayISO(new Date())};
    this.composeRender();
  },
  composeRender() {
    const p = this.pend; if (p.fixed == null) p.fixed = !!p.aud;
    const cs = S.contacts.contacts || [];
    const many = p.many, n = many ? many.length : 1, docs = many && many.every(x => x.kind === 'doc');
    sheet(`${head(docs ? (n > 1 ? `${n} documents` : '1 document') : many ? `${n} nouveaux souvenirs` : 'Nouveau souvenir')}<form data-form="memSave"><div class="sheet-body">
      ${many ? `<div class="mem-strip">${many.map(x => x.kind === 'doc' ? `<span class="mem-sdoc"><b>${esc(((x.name || '').split('.').pop() || 'DOC').slice(0, 4).toUpperCase())}</b><small>${esc(x.name)}</small></span>` : x.kind === 'video' ? `<video src="${x.url}" muted playsinline preload="metadata"></video>` : `<img src="${x.url}" alt="">`).join('')}</div><p class="hint">${docs ? 'Les documents seront rangés dans le dossier « Documents » de vos souvenirs.' : 'Chaque souvenir garde la date de sa photo ou de sa vidéo.'}</p>`
        : `<div class="mem-prev">${p.kind === 'video' ? `<video src="${p.url}" class="${p.mirror ? 'mirror' : ''}" autoplay loop muted playsinline></video>` : `<img src="${p.url}" alt="Aperçu">`}</div>`}
      <div class="field"><label for="memCap">Légende</label><div class="mem-capw">${Emoji.btn('#memCap')}<input id="memCap" maxlength="500" value="${esc(p.cap || '')}" placeholder="Ce moment en quelques mots…" autocomplete="off"></div></div>
      ${many ? '' : `<div class="field"><label for="memDate">Date du souvenir</label><input id="memDate" type="date" value="${p.date}" max="${dayISO(new Date())}"><small class="hint">Pour une ancienne photo, mettez sa vraie date : Tam-Tam vous la rappellera chaque année ce jour-là.</small></div>`}
      ${p.fixed ? `<div class="mem-fixed"><span>${MEM_AUD[p.aud][1]}<b>${MEM_AUD[p.aud][0]}</b></span><button class="linkless" type="button" data-act="memAudChange">Changer</button></div>` : `<span class="lbl">Qui peut ${many ? 'les' : 'le'} voir ? <small>(à choisir)</small></span>
      <div class="seg mem-aud">${Object.entries(MEM_AUD).map(([k, [l, ic]]) => `<button type="button" data-act="memAud" data-a="${k}" aria-pressed="${p.aud === k}">${ic}${l}</button>`).join('')}</div>`}
      <p class="hint">${{public: 'Visible par tous les membres sur votre profil.', private: 'Vous seul. Chiffré pour vous seul, et rangé dans le dossier Privé ouvert avec votre code à 4 chiffres.', friends: 'Envoyé aux amis cochés, chiffré pour eux seulement. Ils sont prévenus.'}[p.aud] || 'Touchez Public, Privé ou Mon Tam-Tam.'}</p>
      ${p.aud === 'friends' ? `<div class="mem-opts"><label class="pick chk"><input type="checkbox" id="memLock"${p.lock ? ' checked' : ''}><span><b>${I.lock} Privé</b> · chaque ami l’ouvre avec son propre code à 4 chiffres</span></label><label class="pick chk"><input type="checkbox" id="memOnce"${p.once ? ' checked' : ''}><span><b>① Vue unique</b> · il ne pourra l’ouvrir qu’une seule fois</span></label></div>` : ''}
      ${p.aud === 'friends' ? `<div class="grp-box"><div class="cg-tools"><label class="pick cg-all"><input type="checkbox" id="memAll"${cs.length && p.to.length === cs.length ? ' checked' : ''}><span><b>Tout cocher</b></span></label><span class="hint">${p.to.length} sur ${cs.length}</span></div>
        <div class="picks">${cs.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(u => `<label class="pick"><input type="checkbox" name="memTo" value="${u.id}"${p.to.includes(u.id) ? ' checked' : ''}>${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('') || '<p class="hint">Ajoutez d’abord des amis.</p>'}</div></div>` : ''}
      <p class="err" id="memErr" role="alert" hidden></p>
      <div class="actions"><button class="btn ghost" type="button" data-act="memCancel">Annuler</button><button class="btn" type="submit" id="memSaveBtn"${p.aud ? '' : ' disabled'}>${p.aud === 'friends' ? 'Envoyer' : 'Enregistrer'}${n > 1 ? ` (${n})` : ''}</button></div>
    </div></form>`, 'Nouveau souvenir');
  },
  keepForm() { const p = this.pend; if (!p) return; const c = $('#memCap'), d = $('#memDate'), l = $('#memLock'), o = $('#memOnce'); if (c) p.cap = c.value; if (d && d.value) p.date = d.value; if (l) p.lock = l.checked; if (o) p.once = o.checked; if ($('.grp-box')) p.to = [...document.querySelectorAll('input[name="memTo"]:checked')].map(i => +i.value); },
  async thumbOf(r) {
    // petite image (≈ 480 px) pour la grille : vite chargée, même pour une vidéo
    const src = await new Promise((ok, ko) => {
      if (r.kind === 'video') { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); }; v.onseeked = () => ok(v); v.onerror = ko; v.src = URL.createObjectURL(r.blob); setTimeout(() => ko(new Error('lent')), 8000); }
      else { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(r.blob); }
    });
    const w = src.videoWidth || src.naturalWidth, h = src.videoHeight || src.naturalHeight, k = Math.min(1, 480 / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    const g = cv.getContext('2d'); if (r.mirror) { g.translate(cv.width, 0); g.scale(-1, 1); } g.drawImage(src, 0, 0, cv.width, cv.height);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', .8));
  },
  async saveOne(r, p, cap, date) {
    let thumb = null; if (r.kind !== 'doc') try { thumb = await this.thumbOf(r); } catch {}
    const payload = {t: (cap || '').trim()}; if (r.kind === 'video') Object.assign(payload, {mime: r.mime, dur: r.dur || 0}); if (r.kind === 'doc') Object.assign(payload, {name: (r.name || 'document').slice(0, 120), size: r.size || 0, mime: r.mime});
    const bytes = await r.blob.arrayBuffer(), tb = thumb ? await thumb.arrayBuffer() : undefined;
    let sealed;
    if (p.aud === 'public') sealed = await this.sealPublic(payload, bytes, tb);
    else { const rc = [[S.me.id, E2E.pubJwk]]; if (p.aud === 'friends') for (const u of S.contacts.contacts) if (p.to.includes(u.id) && u.pubkey) rc.push([u.id, u.pubkey]); sealed = await E2E.seal(payload, rc, bytes, tb); }
    const media = (await upMedia(sealed.blob)).id;
    const th = sealed.blob2 ? (await upMedia(sealed.blob2)).id : null;
    const res = await api('/api/memories', {media, thumb: th, env: sealed.env, aud: p.aud, kind: r.kind === 'video' ? 'video' : r.kind === 'doc' ? 'doc' : 'image', taken: new Date(date + 'T12:00:00').getTime(), to: p.to, lock: p.lock, once: p.once});
    const it = await this.open(res.item); it.to = p.aud === 'friends' ? p.to.slice() : undefined; if (thumb) this.thumbs.set(it.id, Promise.resolve(URL.createObjectURL(thumb)));
    (this.items = this.items || []).push(it);
  },
  async save() {
    this.keepForm(); const p = this.pend, er = $('#memErr'), btn = $('#memSaveBtn');
    if (!p.aud) { er.textContent = 'Choisissez qui peut voir : Public, Privé ou Mon Tam-Tam.'; er.hidden = false; return; }
    if (p.aud === 'friends' && !p.to.length) { er.textContent = 'Cochez au moins un ami.'; er.hidden = false; return; }
    const list = p.many || [p]; btn.disabled = true;
    try {
      for (let i = 0; i < list.length; i++) { btn.textContent = list.length > 1 ? `Envoi ${i + 1} / ${list.length}…` : 'Enregistrement…'; await this.saveOne(list[i], p, p.cap, list[i].date || p.date); }
      this.items.sort((a, b) => b.takenAt - a.takenAt);
      list.forEach(x => x.url && URL.revokeObjectURL(x.url)); this.pend = null; closeLayer();
      this.filt = p.aud === 'friends' ? 'friends' : p.aud === 'private' ? 'private' : ['public', 'docs'].includes(this.filt) ? this.filt : 'all'; if (p.aud === 'private') this.unlocked = true;
      if (S.tab !== 'souvenirs') { S.tab = 'souvenirs'; renderAll(); } else renderBody();
      toast(p.aud === 'friends' ? (list.length > 1 ? `${list.length} souvenirs envoyés` : 'Souvenir envoyé') : list.length > 1 ? `${list.length} souvenirs enregistrés` : 'Souvenir enregistré');
    } catch (e) { btn.disabled = false; btn.textContent = 'Réessayer'; er.textContent = e.message; er.hidden = false; renderBody(); }
  },
  // Envoyer à mon Tam-Tam un souvenir déjà gardé : il est rechiffré pour eux.
  shareSheet(id, ids) {
    const it = this.find(id); if (!it) return; this.shareIds = ids && ids.length > 1 ? ids : null; const cs = (S.contacts.contacts || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    this.shareId = id;
    sheet(`${head(this.shareIds ? `Envoyer ${this.shareIds.length} documents` : 'Envoyer')}<form data-form="memShare"><div class="sheet-body">${this.shareIds ? `<p class="hint">${this.shareIds.map(i => esc((this.find(i) || {}).fname || 'Document')).join(' · ')}</p>` : ''}
      <div class="mem-opts"><label class="pick chk"><input type="checkbox" id="shLock"${it.aud === 'private' ? ' checked' : ''}><span><b>${I.lock} Privé</b> · chaque ami l’ouvre avec son propre code à 4 chiffres</span></label><label class="pick chk"><input type="checkbox" id="shOnce"><span><b>① Vue unique</b> · une seule ouverture</span></label></div>
      <div class="grp-box"><div class="picks">${cs.map(u => `<label class="pick"><input type="checkbox" name="shTo" value="${u.id}">${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('') || '<p class="hint">Ajoutez d’abord des amis.</p>'}</div></div>
      <p class="err" id="shErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="submit" id="shBtn">Envoyer</button></div></div></form>`, 'Envoyer');
  },
  async share() {
    const it = this.find(this.shareId), to = [...document.querySelectorAll('input[name="shTo"]:checked')].map(i => +i.value), er = $('#shErr'), btn = $('#shBtn');
    if (!to.length) { er.textContent = 'Cochez au moins un ami.'; er.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Envoi…';
    try { const lock = $('#shLock').checked, once = $('#shOnce').checked;
      for (const one of (this.shareIds || [this.shareId]).map(i => this.find(i)).filter(Boolean)) { const b = await this.full(one); await this.saveOne({kind: one.kind === 'video' ? 'video' : one.kind === 'doc' ? 'doc' : 'photo', blob: b, mime: one.vmime || (one.kind === 'video' ? 'video/mp4' : 'application/octet-stream'), name: one.fname, size: one.fsize, dur: one.dur || 0}, {aud: 'friends', to, lock, once}, one.cap, dayISO(new Date(one.takenAt))); }
      this.items.sort((a, b) => b.takenAt - a.takenAt); closeLayer(); renderBody(); toast(to.length > 1 ? `Envoyé à ${to.length} amis` : 'Souvenir envoyé'); }
    catch (e) { btn.disabled = false; btn.textContent = 'Envoyer'; er.textContent = e.message; er.hidden = false; }
  },
  /* ---- appui long : supprimer, envoyer, sélectionner ---- */
  menu(id) {
    const it = this.find(id); if (!it) return; const mine = this.mine(it), canSend = mine ? !it.once : !it.lock && !it.once;
    sheet(`${head(mine ? 'Souvenir' : `Souvenir de ${esc(first(uOf(it.from).name))}`)}<div class="menu">
      <button type="button" data-act="memView" data-id="${id}">${I.eye}Ouvrir</button>
      ${canSend ? `<button type="button" data-act="memShare" data-id="${id}">${I.users}Envoyer</button>` : ''}
      <button type="button" data-act="memSelStart" data-id="${id}">${I.check}Sélectionner plusieurs</button>
      <button type="button" class="danger" data-act="memDelAsk" data-id="${id}">${I.trash}${mine ? 'Supprimer' : 'Retirer de mes souvenirs'}</button></div>`, 'Souvenir');
  },
  vaultMenu() {
    const n = (this.items || []).filter(x => x.aud === 'private').length;
    sheet(`${head('Dossier Privé')}<div class="menu"><button type="button" data-act="memVault">${I.lock}Ouvrir avec mon code</button>${n ? `<button type="button" class="danger" data-act="memVaultDel">${I.trash}Supprimer les ${n} souvenir${n > 1 ? 's' : ''} privé${n > 1 ? 's' : ''}</button>` : ''}</div>`, 'Dossier Privé');
  },
  async del(ids) {
    let n = 0;
    for (const id of ids) { const it = this.find(id); if (!it) continue;
      try { await api(`/api/memories/${id}/${this.mine(it) ? 'delete' : 'remove'}`, {}); n++; this.items = (this.items || []).filter(x => x.id !== id); this.recv = (this.recv || []).filter(x => x.id !== id); } catch (e) { toast(e.message); } }
    this.sel = null; renderBody(); if (n) toast(n > 1 ? `${n} souvenirs supprimés` : 'Souvenir supprimé');
  },
  /* ---- regarder ---- */
  async view(id, uid) {
    const it = this.find(id, uid); if (!it) return; if (it.locked) return toast('Ce souvenir ne peut pas être ouvert sur cet appareil.');
    if (it.aud !== 'private' && it.lock && this.pass !== it.id) { this.after = () => { this.unlocked = this.filt === 'private' && this.unlocked; this.pass = it.id; this.view(id, uid); this.pass = null; }; return this.codeSheet(S.me.hasMemCode ? 'ask' : 'new'); }
    if (this.hidden(it)) return this.unlockThen(() => { renderBody(); this.view(id, uid); });
    const recv = !uid && !this.mine(it);
    if (recv && it.once && it.opened) return toast('Souvenir à vue unique déjà ouvert.');
    if (recv && !it.seen) { it.seen = true; this.unseen = Math.max(0, this.unseen - 1); renderTabs(); api('/api/memories/received/seen', {}).catch(() => {}); }
    const mine = !uid && !recv, [l, ic] = MEM_AUD[it.aud] || MEM_AUD.private, prot = it.aud !== 'public';
    layer.innerHTML = `<div class="mem-view${prot ? ' nocopy' : ''}" role="dialog" aria-modal="true" aria-label="Souvenir"><div class="mv-top"><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button>
      <div class="grow"><b>${new Date(it.takenAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})}</b><small>${recv ? `Envoyé par ${esc(uOf(it.from).name)}` : `${ic}${l}`}${it.lock ? ' · privé' : ''}${it.once ? ' · vue unique' : ''}</small></div></div>
      <div class="mv-stage"><div class="lk-spin"></div></div>${it.cap ? `<p class="mv-cap">${esc(it.cap)}</p>` : ''}
      ${recv ? `<div class="mv-foot">${!it.lock && !it.once ? `<button class="btn sm" type="button" data-act="memShare" data-id="${it.id}">${I.users}Envoyer</button>` : ''}<button class="btn sm ghost danger" type="button" data-act="memDelAsk" data-id="${it.id}">${I.trash}Supprimer</button></div>` : ''}${mine ? `<div class="mv-foot"><button class="btn sm" type="button" data-act="memShare" data-id="${it.id}">${I.users}Envoyer</button>${it.aud === 'public' ? `<button class="btn sm ghost" type="button" data-act="memRepost" data-id="${it.id}">Reposter en statut</button>` : ''}<button class="btn sm ghost danger" type="button" data-act="memDelAsk" data-id="${it.id}">${I.trash}Supprimer</button></div>` : ''}${prot && !mine ? watermark() : ''}</div>`;
    try {
      const b = await this.full(it), u = URL.createObjectURL(b), st = layer.querySelector('.mv-stage'); if (!st) return URL.revokeObjectURL(u);
      if (it.kind === 'doc') { st.innerHTML = `<div class="mv-docbox"><span class="mem-doc big"><b>${esc(((it.fname || '').split('.').pop() || 'DOC').slice(0, 4).toUpperCase())}</b><small>${esc(it.fname || 'Document')}</small></span><button class="btn" type="button" id="mvDocOpen">Ouvrir le document</button></div>`; $('#mvDocOpen').onclick = () => { const a = document.createElement('a'); a.href = u; a.download = it.fname || 'document'; if (/pdf|image|text/.test(b.type)) a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); }; return; }
      st.innerHTML = it.kind === 'video' ? `<video src="${u}" playsinline autoplay controls controlslist="nodownload" disablepictureinpicture></video>` : `<img src="${u}" alt="" draggable="false">`;
      if (recv && it.once) { it.opened = true; }
    } catch (e) { toast(recv && it.once ? 'Souvenir à vue unique déjà ouvert.' : e.message); }
  },
  async repost(id) {
    const it = this.find(id); if (!it) return;
    try {
      const b = await this.full(it); closeLayer();
      S.sc = {aud: 'public', bg: 170, text: it.cap || '', font: 0, kind: it.kind === 'video' ? 'video' : 'photo', blob: b, url: URL.createObjectURL(b), mime: it.vmime || 'video/mp4', dur: it.dur || 0, music: null, tab: null, grp: false};
      stComposer();
    } catch (e) { toast(e.message); }
  },
  // Dans le profil d'un ami : ses souvenirs visibles par moi.
  async profBlock(uid) {
    const box = document.getElementById('profMem'); if (!box) return;
    try {
      const list = await this.loadFor(uid); if (!document.getElementById('profMem')) return;
      box.innerHTML = list.length ? `<span class="lbl">Souvenirs</span><div class="mem-grid small">${list.slice(0, 12).map(it => this.tile(it, uid)).join('')}</div>` : '';
      this.hydrate(box);
    } catch { box.innerHTML = ''; }
  },
};
Object.assign(ACT, {
  memFilt(d) { if (d.f !== 'private') Mem.unlocked = false; if (d.f === 'private' && !Mem.unlocked) { Mem.filt = 'private'; renderBody(); return Mem.unlockThen(() => renderBody()); } Mem.filt = d.f; renderBody(); if (d.f === 'friends') Mem.markSeen(); },
  memDocsMenu() {
    const docs = [...(Mem.items || []), ...(Mem.recv || [])].filter(x => x.kind === 'doc' && x.aud !== 'private');
    const sendable = docs.filter(x => !x.lock && !x.once);
    sheet(`${head('Dossier Documents')}<div class="menu"><button type="button" data-act="memDocs">${I.eye}Ouvrir le dossier</button>${sendable.length ? `<button type="button" data-act="memDocsSend">${I.users}Envoyer les documents</button>` : ''}${docs.length ? `<button type="button" class="danger" data-act="memDocsDel">${I.trash}Supprimer les ${docs.length} document${docs.length > 1 ? 's' : ''}</button>` : ''}</div>`, 'Dossier Documents');
  },
  memDocsSend() { const ids = [...(Mem.items || []), ...(Mem.recv || [])].filter(x => x.kind === 'doc' && x.aud !== 'private' && !x.lock && !x.once).map(x => x.id); Mem.shareSheet(ids[0], ids); },
  memDocsDel() { confirmSheet('Supprimer tous les documents ?', 'Vos documents sont effacés définitivement. Ceux reçus d’amis sont seulement retirés de votre liste.', 'Tout supprimer', 'memDocsDelYes', ''); },
  async memDocsDelYes() { closeLayer(); await Mem.del([...(Mem.items || []), ...(Mem.recv || [])].filter(x => x.kind === 'doc' && x.aud !== 'private').map(x => x.id)); },
  memDocs() { closeLayer(); Mem.docFrom = Mem.filt === 'docs' ? 'all' : Mem.filt; Mem.filt = 'docs'; renderBody(); },
  memVault() { Mem.unlockThen(() => { Mem.filt = 'private'; renderBody(); }); },
  memRelock() { Mem.unlocked = false; Mem.filt = 'all'; renderBody(); },
  memForgot() { Mem.codeSheet('forgot'); },
  memShare(d) { Mem.shareSheet(+d.id); },
  memLater() { try { localStorage.setItem(Mem.laterKey(), '1'); } catch {} renderBody(); },
  memAdd() { if (Mem.filt === 'docs') return $('#memDocIn').click(); Mem.addSheet(); },
  memPick() { $('#memIn').click(); },
  memDoc() { $('#memDocIn').click(); },
  memCam() { closeLayer(); Cam.open({...Mem.opts(), mode: 'photo'}); },
  memVid() { closeLayer(); Cam.open({...Mem.opts(), mode: 'video'}); },
  memAud(d) { Mem.keepForm(); Mem.pend.aud = d.a; Mem.composeRender(); },
  memAudChange() { Mem.keepForm(); Mem.pend.fixed = false; Mem.composeRender(); },
  memCancel() { const p = Mem.pend; if (p) (p.many || [p]).forEach(x => x.url && URL.revokeObjectURL(x.url)); Mem.pend = null; closeLayer(); },
  memView(d) { if (Mem.sel && !d.u) { const id = +d.id; Mem.sel.has(id) ? Mem.sel.delete(id) : Mem.sel.add(id); return renderBody(); } closeLayer(); Mem.view(+d.id, d.u ? +d.u : 0); },
  memRepost(d) { Mem.repost(+d.id); },
  memDelAsk(d) { const it = Mem.find(+d.id), mine = it && Mem.mine(it); confirmSheet(mine ? 'Supprimer ce souvenir ?' : 'Retirer ce souvenir ?', mine ? 'La photo ou la vidéo sera effacée définitivement de Tam-Tam, y compris chez les amis à qui vous l’avez envoyée.' : 'Il disparaîtra de vos souvenirs. Votre ami le garde de son côté.', mine ? 'Supprimer' : 'Retirer', 'memDelYes', d.id); },
  async memDelYes(d) { closeLayer(); await Mem.del([+d.id]); },
  memMenu(d) { Mem.menu(+d.id); },
  memVaultMenu() { Mem.vaultMenu(); },
  memSelOn() { Mem.sel = new Set(); renderBody(); },
  memSelStart(d) { closeLayer(); Mem.sel = new Set([+d.id]); renderBody(); },
  memSelOff() { Mem.sel = null; renderBody(); },
  memSelAll() { document.querySelectorAll('.mem-tile[data-id]').forEach(t => { if (!t.dataset.u) Mem.sel.add(+t.dataset.id); }); renderBody(); },
  memSelDel() { const n = Mem.sel ? Mem.sel.size : 0; if (!n) return; confirmSheet(`Supprimer ${n > 1 ? `ces ${n} souvenirs` : 'ce souvenir'} ?`, 'Vos souvenirs sont effacés définitivement. Ceux reçus d’amis sont seulement retirés de votre liste.', 'Supprimer', 'memSelDelYes', ''); },
  async memSelDelYes() { closeLayer(); await Mem.del([...(Mem.sel || [])]); },
  memVaultDel() { Mem.unlockThen(() => confirmSheet('Supprimer tous vos souvenirs privés ?', 'Ils seront effacés définitivement de Tam-Tam.', 'Tout supprimer', 'memVaultDelYes', '')); },
  async memVaultDelYes() { closeLayer(); await Mem.del((Mem.items || []).filter(x => x.aud === 'private').map(x => x.id)); Mem.unlocked = false; },
});
FORMS.memSave = () => Mem.save();
FORMS.memCode = () => Mem.codeSubmit();
FORMS.memShare = () => Mem.share();
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'memDocIn') { const fs = [...t.files]; t.value = ''; if (!fs.length) return; closeLayer(); Mem.composeMany(fs, true); }
  else if (t.id === 'memIn') { const fs = [...t.files]; t.value = ''; if (!fs.length) return; closeLayer(); Mem.composeMany(fs); }
  else if (t.id === 'memCamIn') { const f = t.files[0]; t.value = ''; if (!f) return; closeLayer(); Edit.photoFile(f, Mem.opts()); }
  else if (t.id === 'memAll') { document.querySelectorAll('input[name="memTo"]').forEach(i => { i.checked = t.checked; }); Mem.keepForm(); const h = t.closest('.grp-box').querySelector('.hint'); if (h) h.textContent = `${Mem.pend.to.length} sur ${(S.contacts.contacts || []).length}`; }
  else if (t.name === 'memTo') { Mem.keepForm(); const box = t.closest('.grp-box'), all = box.querySelector('#memAll'), h = box.querySelector('.cg-tools .hint'), n = (S.contacts.contacts || []).length; if (all) all.checked = Mem.pend.to.length === n; if (h) h.textContent = `${Mem.pend.to.length} sur ${n}`; }
});

// Champs de fichiers des souvenirs, toujours présents dans la page.
document.body.insertAdjacentHTML('beforeend', '<input type="file" id="memIn" accept="image/*,video/*" multiple hidden><input type="file" id="memDocIn" multiple hidden><input type="file" id="memCamIn" accept="image/*" capture="environment" hidden>');

// Appui long (téléphone) ou clic droit (ordinateur) sur un souvenir ou sur le dossier Privé.
(() => {
  let t = 0, xy = [0, 0];
  const target = e => e.target.closest && e.target.closest('#body .mem-tile[data-id]:not([data-u]), #body .mem-vault');
  const open = el => { if (el.classList.contains('mem-vault')) Mem.vaultMenu(); else Mem.menu(+el.dataset.id); };
  document.addEventListener('contextmenu', e => { const el = target(e); if (!el || Mem.sel) return; e.preventDefault(); open(el); });
  document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; const el = target(e); if (!el || Mem.sel) return; xy = [e.clientX, e.clientY]; clearTimeout(t); t = setTimeout(() => { Mem.pressAt = Date.now(); if (navigator.vibrate) navigator.vibrate(15); open(el); }, 520); });
  document.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - xy[0], e.clientY - xy[1]) > 10) clearTimeout(t); }, true);
  ['pointerup', 'pointercancel'].forEach(k => document.addEventListener(k, () => clearTimeout(t), true));
  document.addEventListener('click', e => { if (Date.now() - (Mem.pressAt || 0) < 600) { e.preventDefault(); e.stopPropagation(); } }, true);
})();
