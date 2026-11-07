/* tam-tam — Souvenirs : les photos et vidéos qu'on garde dans le temps.
   Public : visible par tous sur votre profil. Privé : vous seul (chiffré pour vous seul).
   Restreint : les amis de votre choix (chiffré pour eux seulement). */
const MEM_AUD = {public: ['Public', I.globe], private: ['Privé', I.lock], restricted: ['Restreint', I.users]};
const Mem = {
  items: null, filt: 'all', thumbs: new Map(), others: new Map(),
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
      Object.assign(it, {cap: payload.t || '', _key: key, miv: payload.miv, tiv: payload.mmiv || null, vmime: payload.mime || null, dur: payload.dur || 0});
    } catch { it.locked = true; }
    return it;
  },
  async thumb(it) {
    if (this.thumbs.has(it.id)) return this.thumbs.get(it.id);
    if (it.locked) return null;
    const useThumb = it.thumb && it.tiv, url = useThumb ? it.thumb : it.media, iv = useThumb ? it.tiv : it.miv;
    const p = fetch(url, {credentials: 'same-origin'}).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }).then(b => E2E.decBytes(it._key, iv, b))
      .then(b => URL.createObjectURL(new Blob([b], {type: useThumb || it.kind !== 'video' ? 'image/jpeg' : (it.vmime || 'video/mp4')}))).catch(() => null);
    this.thumbs.set(it.id, p); return p;
  },
  async full(it) {
    const r = await fetch(it.media, {credentials: 'same-origin'}); if (!r.ok) throw new Error('Souvenir indisponible.');
    return new Blob([await E2E.decBytes(it._key, it.miv, await r.arrayBuffer())], {type: it.kind === 'video' ? (it.vmime || 'video/mp4') : 'image/jpeg'});
  },
  async load() {
    try { const r = await api('/api/memories'); this.items = await Promise.all(r.items.map(x => this.open(x))); }
    catch (e) { this.items = this.items || []; toast(e.message); }
    if (S.tab === 'souvenirs') renderBody();
  },
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
  laterKey: () => 'tt-mem-later-' + new Date().toISOString().slice(0, 10),
  body() {
    if (!this.items) { this.load(); return '<p class="empty">Chargement…</p>'; }
    const f = this.filt, list = this.items.filter(it => f === 'all' || it.aud === f), t = this.today();
    let later = false; try { later = !!localStorage.getItem(this.laterKey()); } catch {}
    const yrs = new Map(); for (const it of list) { const y = new Date(it.takenAt).getFullYear(); if (!yrs.has(y)) yrs.set(y, []); yrs.get(y).push(it); }
    const first = t.past[0], n = first ? new Date().getFullYear() - new Date(first.takenAt).getFullYear() : 0;
    const card = !later && (t.past.length || t.bdays.length) ? `<div class="mem-today">${first ? `<div class="mem-today-img" data-memth="${first.id}"></div>` : '<div class="mem-today-img party">🎉</div>'}
      <div class="mem-today-t"><b>${first ? `Il y a ${n} an${n > 1 ? 's' : ''} aujourd’hui` : 'Aujourd’hui'}</b>
      <span>${[t.bdays.length ? `Anniversaire de ${t.bdays.map(u => esc(first ? u.name.split(' ')[0] : u.name)).join(', ')}` : '', t.past.length > 1 ? `${t.past.length} souvenirs` : t.past.length ? '1 souvenir' : ''].filter(Boolean).join(' · ')}</span>
      <div class="mem-today-a">${first ? `<button class="btn sm" type="button" data-act="memRepost" data-id="${first.id}">Reposter en statut</button>` : ''}${t.bdays.length ? `<button class="btn sm${first ? ' ghost' : ''}" type="button" data-act="write" data-id="${t.bdays[0].id}">Lui souhaiter</button>` : ''}<button class="btn sm ghost" type="button" data-act="memLater">Plus tard</button></div></div></div>` : '';
    return `<div class="mem">
      <div class="chips mem-filts">${[['all', 'Tous'], ['public', 'Publics'], ['private', 'Privés'], ['restricted', 'Restreints']].map(([k, l]) => `<button class="chip" type="button" data-act="memFilt" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</div>
      ${card}
      <p class="hint mem-legend">Public : visible par tous sur votre profil. Privé : vous seul. Restreint : les personnes de votre choix.</p>
      ${list.length ? [...yrs.entries()].map(([y, its]) => `<div class="sec">${y}</div><div class="mem-grid">${its.map(it => this.tile(it)).join('')}</div>`).join('')
        : `<div class="empty"><p><b>${f === 'all' ? 'Gardez vos plus beaux moments' : 'Rien dans ce filtre'}</b></p>${f === 'all' ? '<p>Ajoutez des photos et des vidéos : chaque année, Tam-Tam vous les rappellera le jour même.</p>' : ''}<button class="btn" type="button" data-act="memAdd">${I.plus}Ajouter un souvenir</button></div>`}
    </div>`;
  },
  tile(it, other) {
    const [l, ic] = MEM_AUD[it.aud] || MEM_AUD.private;
    return `<button class="mem-tile" type="button" data-act="memView" data-id="${it.id}"${other ? ` data-u="${other}"` : ''} aria-label="${it.kind === 'video' ? 'Vidéo' : 'Photo'} ${l.toLowerCase()} du ${new Date(it.takenAt).toLocaleDateString('fr-FR')}"><span class="mem-th" data-memth="${it.id}"${other ? ` data-u="${other}"` : ''}>${it.locked ? '🔒' : ''}</span>${it.kind === 'video' ? `<span class="mem-play">▶</span>` : ''}${other ? '' : `<span class="mem-b">${ic}${l}</span>`}</button>`;
  },
  // Remplit les vignettes déchiffrées après l'affichage.
  async hydrate(root = document) {
    for (const el of root.querySelectorAll('[data-memth]:not(.ok)')) {
      el.classList.add('ok'); const uid = +el.dataset.u, it = this.find(+el.dataset.memth, uid); if (!it) continue;
      const u = await this.thumb(it); if (!u) continue;
      if (it.kind === 'video' && !it.thumb) el.innerHTML = `<video src="${u}" muted playsinline preload="metadata"></video>`; else el.style.backgroundImage = `url("${u}")`;
    }
  },
  find(id, uid) { return (uid ? this.others.get(uid) : this.items || []).find(x => x.id === id); },
  /* ---- ajouter ---- */
  opts() { return {target: r => this.compose(r), title: 'Nouveau souvenir', gallery: () => $('#memIn') && $('#memIn').click(), native: () => $('#memCamIn') && $('#memCamIn').click()}; },
  addSheet() {
    sheet(`${head('Ajouter un souvenir')}<div class="sheet-body"><p class="hint">Une photo ou une vidéo de votre téléphone, ou prise maintenant.</p>
      <div class="mem-add">${[['memPick', I.image, 'Galerie'], ['memCam', CI.photo, 'Photo'], ['memVid', CI.video, 'Vidéo']].map(([a, ic, l]) => `<button type="button" data-act="${a}">${ic}<span>${l}</span></button>`).join('')}</div></div>`, 'Ajouter un souvenir');
  },
  compose(r) {
    this.pend = {...r, url: URL.createObjectURL(r.blob), aud: 'private', to: [], date: new Date().toISOString().slice(0, 10)};
    this.composeRender();
  },
  composeRender() {
    const p = this.pend, cs = S.contacts.contacts || [];
    sheet(`${head('Nouveau souvenir')}<form data-form="memSave"><div class="sheet-body">
      <div class="mem-prev">${p.kind === 'video' ? `<video src="${p.url}" class="${p.mirror ? 'mirror' : ''}" autoplay loop muted playsinline></video>` : `<img src="${p.url}" alt="Aperçu">`}</div>
      <div class="field"><label for="memCap">Légende</label><div class="mem-capw">${Emoji.btn('#memCap')}<input id="memCap" maxlength="500" value="${esc(p.cap || '')}" placeholder="Ce moment en quelques mots…" autocomplete="off"></div></div>
      <div class="field"><label for="memDate">Date du souvenir</label><input id="memDate" type="date" value="${p.date}" max="${new Date().toISOString().slice(0, 10)}"><small class="hint">Pour une ancienne photo, mettez sa vraie date : Tam-Tam vous la rappellera chaque année ce jour-là.</small></div>
      <span class="lbl">Qui peut le voir ?</span>
      <div class="seg mem-aud">${Object.entries(MEM_AUD).map(([k, [l, ic]]) => `<button type="button" data-act="memAud" data-a="${k}" aria-pressed="${p.aud === k}">${ic}${l}</button>`).join('')}</div>
      <p class="hint">${{public: 'Visible par tous les membres sur votre profil.', private: 'Vous seul pouvez le voir. Il est chiffré pour vous seul.', restricted: 'Seules les personnes cochées pourront le voir. Il est chiffré pour elles seulement.'}[p.aud]}</p>
      ${p.aud === 'restricted' ? `<div class="grp-box"><div class="cg-tools"><label class="pick cg-all"><input type="checkbox" id="memAll"${cs.length && p.to.length === cs.length ? ' checked' : ''}><span><b>Tout cocher</b></span></label><span class="hint">${p.to.length} sur ${cs.length}</span></div>
        <div class="picks">${cs.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(u => `<label class="pick"><input type="checkbox" name="memTo" value="${u.id}"${p.to.includes(u.id) ? ' checked' : ''}>${avatar(u, 'sm')}<span>${esc(u.name)}</span></label>`).join('') || '<p class="hint">Ajoutez d’abord des amis.</p>'}</div></div>` : ''}
      <p class="err" id="memErr" role="alert" hidden></p>
      <div class="actions"><button class="btn ghost" type="button" data-act="memCancel">Annuler</button><button class="btn" type="submit" id="memSaveBtn">Enregistrer</button></div>
    </div></form>`, 'Nouveau souvenir');
  },
  keepForm() { const p = this.pend; if (!p) return; const c = $('#memCap'), d = $('#memDate'); if (c) p.cap = c.value; if (d && d.value) p.date = d.value; p.to = [...document.querySelectorAll('input[name="memTo"]:checked')].map(i => +i.value); },
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
  async save() {
    this.keepForm(); const p = this.pend, er = $('#memErr'), btn = $('#memSaveBtn');
    if (p.aud === 'restricted' && !p.to.length) { er.textContent = 'Cochez au moins une personne, ou choisissez Privé.'; er.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      let thumb = null; try { thumb = await this.thumbOf(p); } catch {}
      const payload = {t: (p.cap || '').trim()}; if (p.kind === 'video') Object.assign(payload, {mime: p.mime, dur: p.dur});
      const bytes = await p.blob.arrayBuffer(), tb = thumb ? await thumb.arrayBuffer() : undefined;
      let sealed;
      if (p.aud === 'public') sealed = await this.sealPublic(payload, bytes, tb);
      else { const rc = [[S.me.id, E2E.pubJwk]]; if (p.aud === 'restricted') for (const u of S.contacts.contacts) if (p.to.includes(u.id) && u.pubkey) rc.push([u.id, u.pubkey]); sealed = await E2E.seal(payload, rc, bytes, tb); }
      const media = (await api('/api/media', sealed.blob, {raw: true, type: 'application/octet-stream'})).id;
      const th = sealed.blob2 ? (await api('/api/media', sealed.blob2, {raw: true, type: 'application/octet-stream'})).id : null;
      const taken = new Date(p.date + 'T12:00:00').getTime();
      const r = await api('/api/memories', {media, thumb: th, env: sealed.env, aud: p.aud, kind: p.kind === 'video' ? 'video' : 'image', taken, to: p.to});
      const it = await this.open(r.item); if (thumb) this.thumbs.set(it.id, Promise.resolve(URL.createObjectURL(thumb)));
      (this.items = this.items || []).push(it); this.items.sort((a, b) => b.takenAt - a.takenAt);
      URL.revokeObjectURL(p.url); this.pend = null; closeLayer(); if (S.tab !== 'souvenirs') { S.tab = 'souvenirs'; renderAll(); } else renderBody(); toast('Souvenir enregistré');
    } catch (e) { btn.disabled = false; btn.textContent = 'Enregistrer'; er.textContent = e.message; er.hidden = false; }
  },
  /* ---- regarder ---- */
  async view(id, uid) {
    const it = this.find(id, uid); if (!it) return; if (it.locked) return toast('Ce souvenir ne peut pas être ouvert sur cet appareil.');
    const mine = !uid, [l, ic] = MEM_AUD[it.aud] || MEM_AUD.private, prot = it.aud !== 'public';
    layer.innerHTML = `<div class="mem-view${prot ? ' nocopy' : ''}" role="dialog" aria-modal="true" aria-label="Souvenir"><div class="mv-top"><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button>
      <div class="grow"><b>${new Date(it.takenAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric'})}</b><small>${ic}${l}</small></div></div>
      <div class="mv-stage"><div class="lk-spin"></div></div>${it.cap ? `<p class="mv-cap">${esc(it.cap)}</p>` : ''}
      ${mine ? `<div class="mv-foot"><button class="btn sm" type="button" data-act="memRepost" data-id="${it.id}">Reposter en statut</button><button class="btn sm ghost danger" type="button" data-act="memDelAsk" data-id="${it.id}">${I.trash}Supprimer</button></div>` : ''}${prot && !mine ? watermark() : ''}</div>`;
    try {
      const b = await this.full(it), u = URL.createObjectURL(b), st = layer.querySelector('.mv-stage'); if (!st) return URL.revokeObjectURL(u);
      st.innerHTML = it.kind === 'video' ? `<video src="${u}" playsinline autoplay controls controlslist="nodownload" disablepictureinpicture></video>` : `<img src="${u}" alt="" draggable="false">`;
    } catch (e) { toast(e.message); }
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
  memFilt(d) { Mem.filt = d.f; renderBody(); },
  memLater() { try { localStorage.setItem(Mem.laterKey(), '1'); } catch {} renderBody(); },
  memAdd() { Mem.addSheet(); },
  memPick() { $('#memIn').click(); },
  memCam() { closeLayer(); Cam.open({...Mem.opts(), mode: 'photo'}); },
  memVid() { closeLayer(); Cam.open({...Mem.opts(), mode: 'video'}); },
  memAud(d) { Mem.keepForm(); Mem.pend.aud = d.a; Mem.composeRender(); },
  memCancel() { if (Mem.pend) URL.revokeObjectURL(Mem.pend.url); Mem.pend = null; closeLayer(); },
  memView(d) { Mem.view(+d.id, d.u ? +d.u : 0); },
  memRepost(d) { Mem.repost(+d.id); },
  memDelAsk(d) { confirmSheet('Supprimer ce souvenir ?', 'La photo ou la vidéo sera effacée définitivement de Tam-Tam.', 'Supprimer', 'memDelYes', d.id); },
  async memDelYes(d) { closeLayer(); try { await api(`/api/memories/${d.id}/delete`, {}); Mem.items = (Mem.items || []).filter(x => x.id !== +d.id); renderBody(); toast('Souvenir supprimé'); } catch (e) { toast(e.message); } },
});
FORMS.memSave = () => Mem.save();
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'memIn' || t.id === 'memCamIn') { const f = t.files[0]; t.value = ''; if (!f) return; closeLayer(); if (/^video\//.test(f.type)) Edit.videoFile(f, Mem.opts()); else Edit.photoFile(f, Mem.opts()); }
  else if (t.id === 'memAll') { document.querySelectorAll('input[name="memTo"]').forEach(i => { i.checked = t.checked; }); Mem.keepForm(); const h = t.closest('.grp-box').querySelector('.hint'); if (h) h.textContent = `${Mem.pend.to.length} sur ${(S.contacts.contacts || []).length}`; }
  else if (t.name === 'memTo') { Mem.keepForm(); const box = t.closest('.grp-box'), all = box.querySelector('#memAll'), h = box.querySelector('.cg-tools .hint'), n = (S.contacts.contacts || []).length; if (all) all.checked = Mem.pend.to.length === n; if (h) h.textContent = `${Mem.pend.to.length} sur ${n}`; }
});

// Champs de fichiers des souvenirs, toujours présents dans la page.
document.body.insertAdjacentHTML('beforeend', '<input type="file" id="memIn" accept="image/*,video/*" hidden><input type="file" id="memCamIn" accept="image/*" capture="environment" hidden>');
