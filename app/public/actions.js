/* tam-tam — Actions de l'interface (ACT, appelées par data-act) et formulaires (FORMS, par data-form).
   Extrait de app.js (nov. 2026) : chargé après app.js, partage ses variables globales. */
'use strict';
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
  avPick(d) {
    const a = {v: 3, p: d.p};
    if (d.who === 'auth') { A.avatar = a; $('#avg-auth').outerHTML = avGallery(a, 'auth'); }
    else { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'av', av: a}; renderBody(); }
  },
  avSet(d) {
    const base = avNorm(d.who === 'auth' ? A.avatar : S.me.avatar), a = Object.assign({}, base);
    if (d.v === 't') a[d.k] = !a[d.k]; else a[d.k] = d.v;
    if (d.k === 'st' && FEM.includes(d.v) && !base.f) a.f = true;
    if (d.who === 'auth') { A.avatar = a; $('#avg-auth').outerHTML = avGallery(a, 'auth'); }
    else { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'av', av: a}; renderBody(); }
  },
  tab(d) { if (d.t === 'settings' && isDesk()) { closeLayer(); return pmOpen('settings'); } if (d.t === 'chats' && S.filt === 'arch') S.filt = 'all'; if (d.t !== 'souvenirs' && typeof Mem !== 'undefined') Mem.unlocked = false; if (d.t === 'calls') { Calls.log = null; Calls.open = false; } S.tab = d.t; closeLayer(); renderAll(); if (d.t === 'calls') actSeen('calls'); $('#body').scrollTop = 0; if (matchMedia('(max-width:820px)').matches) $('.app').dataset.view = 'list'; },
  fab() { newChatSheet(); },
  open(d) { if (S.sel) { const id = +d.id; S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); if (!S.sel.size) S.sel = null; return renderBody(); } openChat(+d.id); },
  chatRowMenu(d) { chatListMenu(+d.id); },
  async chatPin(d) { closeLayer(); const c = S.chats.get(+d.id); try { await chatMine(+d.id, {pin: !c.pinned}); toast(c.pinned ? 'Discussion épinglée en haut' : 'Discussion désépinglée'); } catch (e) { toast(e.message); } },
  async chatRead(d) { closeLayer(); try { await chatMine(+d.id, {unread: !!d.v}); } catch (e) { toast(e.message); } },
  async chatArch(d) { closeLayer(); const c = S.chats.get(+d.id), on = !c.archived; try { await chatMine(+d.id, {archive: on}); renderHead(); toast(on ? 'Discussion rangée dans Archives' : 'Discussion remise dans la liste'); } catch (e) { toast(e.message); } },
  chatPriv(d) { closeLayer(); Priv.toggle(+d.id); },
  chatClearAsk(d) { confirmSheet('Supprimer la discussion ?', 'Tous les messages disparaîtront de votre côté seulement. Les autres membres les garderont. Si quelqu’un vous écrit à nouveau, la discussion réapparaîtra.', 'Supprimer', 'chatClearYes', d.id); },
  async chatClearYes(d) { closeLayer(); const id = +d.id; try { await chatMine(id, {clear: true}, true); S.msgs.delete(id); if (S.chatId === id) ACT.back(); renderTabs(); renderBody(); toast('Discussion supprimée de votre côté'); } catch (e) { toast(e.message); } },
  selStart(d) { closeLayer(); S.sel = new Set([+d.id]); renderBody(); },
  selOff() { S.sel = null; renderBody(); },
  selMenu() {
    const ids = [...(S.sel || [])]; if (!ids.length) return; const allPinned = ids.every(i => S.chats.get(i)?.pinned), arch = S.filt === 'arch', n = ids.length;
    sheet(`<div class="menu" style="padding-top:12px">
      <button type="button" data-act="selDo" data-k="read">${I.check || '✓'}Marquer comme lu</button>
      <button type="button" data-act="selDo" data-k="unread"><span class="pin-ic" aria-hidden="true">●</span>Marquer comme non lu</button>
      <button type="button" data-act="selDo" data-k="pin"><span class="pin-ic" aria-hidden="true">📌</span>${allPinned ? 'Retirer l’épingle' : 'Épingler en haut'}</button>
      <button type="button" data-act="selDo" data-k="arch">${ARCH_IC}${arch ? 'Désarchiver' : 'Archiver'}</button>
      <button type="button" data-act="selDo" data-k="mute"><span class="pin-ic" aria-hidden="true">${ids.every(i => S.chats.get(i)?.muted) ? '🔔' : '🔕'}</span>${ids.every(i => S.chats.get(i)?.muted) ? 'Réactiver le son' : 'Couper le son'}</button>
      ${ids.some(i => S.chats.get(i)?.type === 'group') ? `<button type="button" class="danger" data-act="selLeaveAsk">${I.back}Quitter ${ids.filter(i => S.chats.get(i)?.type === 'group').length > 1 ? 'les groupes' : 'le groupe'}</button>` : ''}
      <button type="button" class="danger" data-act="selDo" data-k="clear">${I.trash}Supprimer ${n > 1 ? `les ${n} discussions` : 'la discussion'}</button></div>`, 'Actions');
  },
  async selDo(d) {
    const ids = [...(S.sel || [])]; if (!ids.length) return; if (d.k !== 'clear') closeLayer();
    if (d.k === 'clear') return confirmSheet(`Supprimer ${ids.length > 1 ? `ces ${ids.length} discussions` : 'cette discussion'} ?`, 'Les messages disparaîtront de votre côté seulement.', 'Supprimer', 'selClearYes', '');
    const allPinned = ids.every(i => S.chats.get(i)?.pinned);
    const allMuted = ids.every(i => S.chats.get(i)?.muted);
    try { for (const i of ids) await chatMine(i, d.k === 'pin' ? {pin: !allPinned} : d.k === 'arch' ? {archive: S.filt !== 'arch'} : d.k === 'mute' ? {mute: !allMuted} : {unread: d.k === 'unread'}, true); if (d.k === 'mute') toast(allMuted ? 'Son réactivé' : 'Son coupé : plus de sonnerie ni de notification pour ces discussions'); if (d.k === 'arch') toast(S.filt === 'arch' ? 'Remises dans la liste' : `${ids.length > 1 ? 'Discussions rangées' : 'Discussion rangée'} dans Archives`); } catch (e) { toast(e.message); }
    S.sel = null; renderTabs(); renderBody();
  },
  selLeaveAsk() { confirmSheet('Quitter ?', 'Vous ne recevrez plus les messages de ces groupes.', 'Quitter', 'selLeaveYes', ''); },
  async selLeaveYes() { closeLayer(); const ids = [...(S.sel || [])].filter(i => S.chats.get(i)?.type === 'group'); try { for (const i of ids) { await api(`/api/chats/${i}/leave`, {}); S.chats.delete(i); if (S.chatId === i) ACT.back(); } toast(ids.length > 1 ? 'Groupes quittés' : 'Groupe quitté'); } catch (e) { toast(e.message); } S.sel = null; renderTabs(); renderBody(); },
  async selClearYes() { closeLayer(); const ids = [...(S.sel || [])]; try { for (const i of ids) { await chatMine(i, {clear: true}, true); S.msgs.delete(i); if (S.chatId === i) ACT.back(); } toast('Discussions supprimées de votre côté'); } catch (e) { toast(e.message); } S.sel = null; renderTabs(); renderBody(); },
  async react(d) { closeLayer(); try { await api(`/api/messages/${d.id}/react`, {emo: d.e}); } catch (e) { toast(e.message); } },
  reactMore(d) { moreEmoji(+d.id); },
  reactWho(d) {
    const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); if (!m || !m.reacts) return;
    sheet(`${head('Réactions')}<div class="sheet-scroll">${m.reacts.map(r => { const u = r.u === S.me.id ? S.me : uOf(r.u); return `<div class="row">${avOn(u)}<span class="row-name">${esc(r.u === S.me.id ? 'Vous' : u.name)}</span><span class="row-end react-e">${esc(r.e)}</span>${r.u === S.me.id ? `<span class="row-prev"><button class="linkless" type="button" data-act="react" data-id="${m.id}" data-e="${esc(r.e)}">Touchez pour retirer</button></span>` : ''}</div>`; }).join('')}</div>`, 'Réactions');
  },
  fwd(d) { fwdSheet(+d.id); },
  fwdGo() {
    const f = S.fwd; if (!f || !f.sel.size) return; const to = [...f.sel], ms = f.ms || [f.m]; S.fwd = null; closeLayer();
    if (to.length === 1) { const id = to[0]; openChat(id).then(() => fwdRun(ms, to)); }
    else { toast(`Envoi à ${to.length} discussions…`); fwdRun(ms, to).then(n => toast(n ? `Transféré à ${to.length} discussions` : 'Le transfert a échoué. Réessayez.')); }
  },
  async pinMsg(d) { closeLayer(); try { await api(`/api/chats/${S.chatId}/pinmsg`, {msgId: +d.id}); } catch (e) { toast(e.message); } },
  async pinMsgOff() { closeLayer(); try { await api(`/api/chats/${S.chatId}/pinmsg`, {msgId: null}); } catch (e) { toast(e.message); } },
  pinJump(d) { const el = document.querySelector(`.msg[data-mid="${d.id}"]`); if (el) { el.scrollIntoView({block: 'center', behavior: 'smooth'}); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); } else toast('Ce message est plus ancien : faites défiler la discussion vers le haut.'); },
  attachMenu() { sheet(`<div class="menu" style="padding-top:12px"><button type="button" data-act="attachPick">${I.image || I.clip}Photo ou vidéo</button><button type="button" data-act="docPick"><span class="pin-ic" aria-hidden="true">📄</span>Documents (PDF, Word, Excel, ZIP…)</button>${'webkitdirectory' in document.createElement('input') && isDesk() ? '<button type="button" data-act="dirPick"><span class="pin-ic" aria-hidden="true">🗂️</span>Un dossier entier (envoyé en .zip)</button>' : ''}<button type="button" data-act="locSend"><span class="pin-ic" aria-hidden="true">📍</span>Ma position actuelle</button></div>`, 'Joindre'); },
  docPick() { closeLayer(); let i = $('#docIn'); if (!i) { i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.id = 'docIn'; i.hidden = true; document.body.appendChild(i); i.addEventListener('change', async () => { const fs = [...i.files].slice(0, 20); i.value = ''; for (const f of fs) await sendDoc(f); }); } i.click(); },
  dirPick() { closeLayer(); let i = $('#dirIn'); if (!i) { i = document.createElement('input'); i.type = 'file'; i.webkitdirectory = true; i.multiple = true; i.id = 'dirIn'; i.hidden = true; document.body.appendChild(i); i.addEventListener('change', async () => { const fs = [...i.files]; i.value = ''; if (!fs.length) return;
    const total = fs.reduce((a, f) => a + f.size, 0); if (total > 40_000_000) return toast(`Dossier trop lourd (${fsz(total)}). Maximum : 40 Mo.`);
    toast(`Préparation du dossier (${fs.length} fichier${fs.length > 1 ? 's' : ''})…`); const name = (fs[0].webkitRelativePath || 'dossier').split('/')[0] || 'dossier';
    try { const zip = await makeZip(fs); await sendDoc(new File([zip], name + '.zip', {type: 'application/zip'})); } catch (e) { toast(e.message || 'Dossier impossible à préparer.'); } }); } i.click(); },
  docOpen(d) { const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); if (m) docOpen(m); },
  mediaOpen() { S.mg = null; mediaGallery(); },
  mgTab(d) { mediaGallery(d.t); },
  mgBack() { if (S.mg && S.mg.render) S.mg.render(); },
  mgZoom(d) { const u = E2E.imgs.get(+d.id); if (!u) return; layer.innerHTML = `<div class="zoom${(S.chats.get(S.chatId) || {}).hidden ? ' nocopy' : ''}" data-act="mgBack"><img src="${u}" alt="Photo"><button class="ib" type="button" data-act="mgBack" aria-label="Retour à la galerie">${I.close}</button></div>`; },
  async mgPlay(d) {
    const m = S.mg && S.mg.map.get(+d.id); if (!m) return;
    try { const u = URL.createObjectURL(new Blob([await msgBytes(m)], {type: m.kind === 'video' ? (m.amime || 'video/mp4') : (m.amime || 'audio/webm')}));
      layer.innerHTML = `<div class="zoom mg-play"><${m.kind === 'video' ? 'video' : 'audio'} src="${u}" controls autoplay playsinline controlslist="nodownload"></${m.kind === 'video' ? 'video' : 'audio'}><button class="ib" type="button" data-act="mgBack" aria-label="Retour à la galerie">${I.close}</button></div>`;
    } catch (e) { toast(e.message); }
  },
  mgDoc(d) { const m = S.mg && S.mg.map.get(+d.id); if (m) docOpen(m); },
  async joinGo() { try { const r = await api('/api/groups/join', {code: S.joinCode}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat); closeLayer(); S.tab = 'chats'; renderAll(); openChat(r.chat.id); toast('Bienvenue dans le groupe'); } catch (e) { toast(e.message); } },
  grpPhoto() { let i = $('#grpIn'); if (!i) { i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.id = 'grpIn'; i.hidden = true; document.body.appendChild(i); i.addEventListener('change', () => { const f = i.files[0]; i.value = ''; if (f) cropPhoto(f, 'grp'); }); } i.click(); },
  grpRename() { const c = S.chats.get(S.chatId); sheet(`${head('Renommer le groupe')}<form data-form="grpName"><div class="sheet-body"><div class="field"><label for="grpN">Nom du groupe</label><input id="grpN" maxlength="50" required value="${esc(c.name)}"></div><div class="actions"><button class="btn ghost" type="button" data-act="chatInfo">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Renommer', '#grpN'); },
  async grpSet(d) { try { await grpUpd({gset: {[d.k]: d.v}}, true); groupInfo(); const det = $('.grp-set'); if (det) det.open = true; } catch (e) { toast(e.message); } },
  async grpLink(d) {
    try { const r = await api(`/api/chats/${S.chatId}/link`, {reset: !!(d && d.reset)}); S.grpLink = r.url;
      sheet(`${head('Lien d’invitation du groupe')}<div class="sheet-body"><p class="hint">Toute personne inscrite sur Tam-Tam qui ouvre ce lien peut rejoindre le groupe. Partagez-le seulement avec des personnes de confiance.</p><div class="invite-url">${esc(r.url)}</div>
        <div class="actions" style="justify-content:flex-start"><button class="btn sm" type="button" data-act="grpLinkCopy">${I.copy}Copier le lien</button><a class="btn sm ghost" href="https://wa.me/?text=${encodeURIComponent('Rejoignez mon groupe sur Tam-Tam : ' + r.url)}" target="_blank" rel="noopener">WhatsApp</a>${navigator.share ? '<button class="btn sm ghost" type="button" data-act="grpLinkShare">Partager…</button>' : ''}</div>
        ${(S.chats.get(S.chatId) || {}).admin ? '<button class="linkless" type="button" data-act="grpLinkReset">Créer un nouveau lien (l’ancien ne marchera plus)</button>' : ''}<div class="actions"><button class="btn ghost" type="button" data-act="chatInfo">Retour</button></div></div>`, 'Lien du groupe');
    } catch (e) { toast(e.message); }
  },
  async grpLinkCopy() { try { await navigator.clipboard.writeText(S.grpLink); toast('Lien copié'); } catch { toast(S.grpLink); } },
  grpLinkShare() { navigator.share({title: 'Groupe Tam-Tam', text: 'Rejoignez mon groupe sur Tam-Tam', url: S.grpLink}).catch(() => {}); },
  grpLinkReset() { ACT.grpLink({reset: 1}); },
  grpMember(d) {
    const c = S.chats.get(S.chatId), id = +d.id; if (id === S.me.id) return;
    const m = c.members.find(x => x.id === id), u = uOf(id), own = id === c.createdBy;
    if (!c.admin || own) return profSheet(id);
    sheet(`${head(esc(u.name))}<div class="menu"><button type="button" data-act="prof" data-id="${id}">${I.info}Voir le profil</button>
      <button type="button" data-act="grpRole" data-id="${id}" data-v="${m.admin ? '' : '1'}">${I.shield}${m.admin ? 'Retirer le rôle d’administrateur' : 'Nommer administrateur'}</button>
      <button type="button" class="danger" data-act="grpKickAsk" data-id="${id}">${I.trash}Retirer du groupe</button></div>`, 'Membre');
  },
  async grpRole(d) { try { const r = await api(`/api/chats/${S.chatId}/role`, {userId: +d.id, admin: !!d.v}); S.chats.set(r.chat.id, Object.assign(S.chats.get(r.chat.id), r.chat)); groupInfo(); toast(d.v ? 'Nommé administrateur' : 'Rôle d’administrateur retiré'); } catch (e) { toast(e.message); } },
  grpKickAsk(d) { confirmSheet('Retirer cette personne du groupe ?', 'Elle ne recevra plus les messages du groupe. Un message l’indiquera aux membres.', 'Retirer', 'grpKickYes', d.id); },
  async grpKickYes(d) { try { const r = await api(`/api/chats/${S.chatId}/role`, {userId: +d.id, kick: true}); S.chats.set(r.chat.id, Object.assign(S.chats.get(r.chat.id), r.chat)); groupInfo(); toast('Retiré du groupe'); } catch (e) { toast(e.message); } },
  attachPick() { closeLayer(); $('#fileIn').click(); },
  locSend() { sendLoc(); },
  async locGo(d) {
    closeLayer(); const c = S.chats.get(+d.id), l = S.locNow; if (!c || !l) return;
    locBusy('Envoi de votre position');
    try { const sealed = await E2E.seal({t: '', loc: l}, recipients(c)); const r = await api(`/api/chats/${c.id}/messages`, {enc: sealed.env, kind: 'loc'}); locBusy(null); onMsg(r.msg); } catch (e) { locBusy(null); toast(e.message); }
  },
  back() { S.msel = null; S.chatId = null; $('.app').dataset.view = 'list'; renderMain(); renderBody(); },
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
  async chatMute() { const c = S.chats.get(S.chatId); if (!c) return; closeLayer(); try { await chatMine(c.id, {mute: !c.muted}, true); toast(c.muted ? 'Son coupé pour cette discussion' : 'Son réactivé'); } catch (e) { toast(e.message); } },
  exportAsk() { sheet(`${head('Exporter la discussion')}<div class="sheet-body"><p class="hint">Tam-Tam prépare la discussion puis ouvre votre messagerie : un brouillon d’e-mail se crée avec la discussion en pièce jointe, vous n’avez plus qu’à choisir le destinataire. Rien n’est enregistré sur le téléphone. Les messages à vue unique ne sont jamais exportés.</p>
    <div class="menu"><button type="button" data-act="exportGo" data-m="">${I.clip}Sans les pièces jointes (texte seulement)</button><button type="button" data-act="exportGo" data-m="1">${I.image || I.clip}Avec les pièces jointes (photos, vidéos, documents)</button></div></div>`, 'Exporter'); },
  exportSend() { const x = S.exp; if (!x) return; navigator.share({files: x.files, title: x.title, text: x.text}).then(() => { closeLayer(); S.exp = null; }).catch(e => { if (e && e.name !== 'AbortError') toast('Envoi impossible depuis cet appareil.'); }); },
  exportZip() { const x = S.exp; if (!x) return; const u = URL.createObjectURL(x.zip), lk = document.createElement('a'); lk.href = u; lk.download = x.zipName; document.body.appendChild(lk); lk.click(); lk.remove(); setTimeout(() => URL.revokeObjectURL(u), 60_000); closeLayer(); S.exp = null; },
  exportGo(d) { closeLayer(); exportChat(S.chatId, !!d.m); },
  locFollow(d) { locFollow(+d.id); },
  chatInfo() { const c = S.chats.get(S.chatId); if (!c) return; if (c.type === 'group') groupInfo(); else profSheet(c.peer); },
  groupNew() { groupSheet(); },
  groupAddOpen() { groupSheet(S.chats.get(S.chatId)); },
  leaveAsk() { confirmSheet('Quitter le groupe ?', 'Vous ne recevrez plus les messages de ce groupe.', 'Quitter', 'leaveYes'); },
  async leaveYes() { closeLayer(); try { await api(`/api/chats/${S.chatId}/leave`, {}); S.chats.delete(S.chatId); S.chatId = null; $('.app').dataset.view = 'list'; renderMain(); renderAll(); } catch (e) { toast(e.message); } },
  attach() { ACT.attachMenu(); },
  camera() { Cam.open(); },
  phCancel() { S.once = false; closeLayer(); renderComposer(); },
  trProv(d) { S.trProv = d.v; const el = $('#trBox'); if (el) el.outerHTML = trBox(); },
  trMsg(d) { closeLayer(); Tr.off.delete(+d.id); Tr.run(+d.id); },
  trOrigOnce(d) { const id = +d.id; closeLayer(); Tr.once.has(id) ? Tr.once.delete(id) : Tr.once.add(id); renderMessages(true); },
  trOrigAll(d) { closeLayer(); Tr.setOrigAll(S.chatId, !!d.v); Tr.once.clear(); renderMessages(true); toast(d.v ? 'Les messages d’origine s’affichent sous chaque message traduit' : 'Messages d’origine masqués'); },
  trOrig(d) { Tr.shown.delete(+d.id); Tr.off.add(+d.id); renderMessages(true); },
  trAuto() { if (!S.me.trConsent) return trConsentAsk(true); S.trSide = S.trSide || 'in'; trSheet(); },
  trSide(d) { S.trSide = d.v; trSheet(); },
  trKeep() { const c = S.chats.get(S.chatId); if (!c) return; Tr.setIn(c.id, Tr.inL(c.id)); toast('Choix gardé'); trSheet(); },
  trPick(d) {
    const c = S.chats.get(S.chatId); if (!c) return;
    if (S.trSide === 'out') { if (!Tr.setOut(c.id, d.v)) return; } else { Tr.setIn(c.id, d.v); Tr.shown.clear(); Tr.off.clear(); }
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
  trImpKeep() { const c = S.chats.get(S.chatId), l = c && Tr.pend(c.id); if (!l) return; Tr.setIn(c.id, l); renderComposer(); renderMessages(true); Tr.autoRun(c); },
  trImpOff() { const c = S.chats.get(S.chatId); if (!c) return; Tr.setIn(c.id, ''); renderComposer(); renderMessages(true); },
  trConsentTog() { saveNow({trConsent: !S.me.trConsent}); },
  trContribTog() { Tr.ls('tt-trcontrib', Tr.contrib() ? '0' : '1'); toast(Tr.contrib() ? 'Le message d’origine et « Votre correction » s’affichent sous les traductions' : 'Vous recevez seulement le message dans votre langue'); if (S.chatId) renderMessages(true); },
  trNone(d) { const c = S.chats.get(S.chatId); if (!c) return; if (d.side === 'out') { if (!Tr.setOut(c.id, '')) return; } else { Tr.setIn(c.id, ''); } S.trSide = d.side; renderComposer(); renderMessages(true); trSheet(); },
  trFlip(d) { const id = +d.id; Tr.flip.has(id) ? Tr.flip.delete(id) : Tr.flip.add(id); renderMessages(true); },
  async perfLoad() { try { S.perf = await api('/api/admin/perf'); const el = $('#perfBox'); if (el) el.outerHTML = perfBox(); } catch (e) { toast(e.message); } },
  async trLoad() { try { S.trset = await api('/api/admin/translate'); const el = $('#trBox'); if (el) el.outerHTML = trBox(); } catch (e) { toast(e.message); } },
  async trOff(d) { try { await api('/api/admin/translate', {off: (d && d.v) || true}); S.trset = await api('/api/admin/translate'); Tr.st = await api('/api/translate/status'); renderBody(); toast('Traduction désactivée'); } catch (e) { toast(e.message); } },
  recStart() { Rec.start(); }, recCancel() { Rec.cancel(); }, recSend() { Rec.send(); },
  availSet(d) { if (S.me.avail === d.v) return; saveNow({avail: d.v}, {on: 'Vous apparaissez en ligne', busy: 'Vous apparaissez occupé', off: 'Vous apparaissez hors ligne'}[d.v]).then(() => { renderHead(); if (S.modal) renderModal(); }); },
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
  zoom(d, el) { const msg = el.closest && el.closest('.msg[data-mid]'); zoomOpen('img', el.src, msg ? +msg.dataset.mid : 0); },
  older() { loadOlder(); },
  msgMenu(d) { msgMenu(+d.id); },
  editMsg(d) {
    const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); closeLayer(); if (!m) return;
    if (Date.now() - m.at >= EDIT_MAX) return toast('Un message ne peut plus être modifié 2 minutes après son envoi.');
    S.editId = m.id; S.replyTo = null; renderReplyBar(); const i = $('#msgIn'); if (i) { i.value = m.orig != null ? m.orig : m.text; autoGrow(i); syncSend(); i.focus(); }
    setTimeout(() => { if (S.editId === m.id) { S.editId = null; renderReplyBar();  } }, Math.max(0, EDIT_MAX - (Date.now() - m.at)));
  },
  editCancel() { S.editId = null; renderReplyBar(); const i = $('#msgIn'); if (i) { i.value = ''; autoGrow(i); syncSend(); } },
  mselStart(d) { closeLayer(); mselToggle(+d.id); },
  mselOff() { S.msel = null; document.querySelectorAll('.msg.msel').forEach(e => e.classList.remove('msel')); renderChatHead(); reactRail(); },
  railReact(d) { ACT.mselOff(); ACT.react(d); },
  mselMenu() {
    const ids = [...(S.msel || [])]; if (!ids.length) return;
    if (ids.length === 1) return msgMenu(ids[0]);   // un seul message : le menu complet (réactions, répondre, transférer…), il reste sélectionné
    const list = S.msgs.get(S.chatId) || [], ms = ids.map(id => list.find(x => x.id === id)).filter(Boolean), c = S.chats.get(S.chatId) || {};
    const modo = c.type === 'group' && c.admin && (c.gset || {}).del === 'admins';
    const canAll = ms.every(m => !m.deleted && ((m.from === S.me.id && Date.now() - m.at < DEL_ALL_MAX) || (modo && m.from !== S.me.id)));
    const canFwd = ms.every(m => !m.once && !m.locked && !m.deleted && m.kind !== 'sys') && !c.hidden, txt = ms.some(m => m.text && !m.deleted && !m.locked);
    sheet(`<div class="menu" style="padding-top:12px">
      ${txt ? `<button type="button" data-act="mselCopy">${I.copy || ''}Copier les textes</button>` : ''}
      ${canFwd ? `<button type="button" data-act="mselFwd">${FWD_IC}Transférer (${ms.length})</button>` : ''}
      <button type="button" class="danger" data-act="mselHideAsk">${I.trash}Supprimer pour moi (${ms.length})</button>
      ${canAll ? `<button type="button" class="danger" data-act="mselDelAsk">${I.trash}Supprimer pour tout le monde (${ms.length})</button>` : ''}</div>`, 'Messages');
  },
  mselCopy() { const list = S.msgs.get(S.chatId) || [], t = [...(S.msel || [])].map(id => list.find(x => x.id === id)).filter(m => m && m.text && !m.deleted).sort((x, y) => x.at - y.at).map(m => m.text).join('\n'); closeLayer(); ACT.mselOff(); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Textes copiés'), () => toast('Copie impossible')); },
  mselFwd() { const ids = [...(S.msel || [])]; closeLayer(); ACT.mselOff(); fwdSheet(ids); },
  mselHideAsk() { confirmSheet('Supprimer pour moi ?', 'Ces messages disparaîtront seulement de votre côté.', 'Supprimer', 'mselHideYes', ''); },
  async mselHideYes() { const ids = [...(S.msel || [])]; closeLayer(); ACT.mselOff(); try { for (const id of ids) { await api(`/api/messages/${id}/hide`, {}); msgHide(S.chatId, id); } toast(ids.length > 1 ? 'Messages supprimés pour vous' : 'Message supprimé pour vous'); } catch (e) { toast(e.message); } },
  mselDelAsk() { confirmSheet('Supprimer pour tout le monde ?', 'Les messages seront remplacés par « Ce message a été supprimé » chez tous les membres.', 'Supprimer', 'mselDelYes', ''); },
  async mselDelYes() { const ids = [...(S.msel || [])]; closeLayer(); ACT.mselOff(); try { for (const id of ids) await api(`/api/messages/${id}/delete`, {}); } catch (e) { toast(e.message); } },
  zoomMenu(d) { msgMenu(+d.id); },
  async toStatus(d) {
    const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); if (!m) return;
    try {
      const bytes = await msgBytes(m), vid = m.kind === 'video', type = vid ? (m.amime || 'video/mp4') : 'image/jpeg', blob = new Blob([bytes], {type});
      closeLayer(); if (S.sc && S.sc.url) URL.revokeObjectURL(S.sc.url);
      S.sc = {aud: 'public', bg: 362, text: '', font: 0, kind: vid ? 'video' : 'photo', blob, url: URL.createObjectURL(blob), mime: type, dur: m.dur || 0, music: null, tab: null, grp: false};
      stComposer();
    } catch (e) { toast(e.message || 'Impossible de préparer ce fichier.'); }
  },
  zoomVid(d) { const u = E2E.vids.get(+d.id); if (!u) return toast('Vidéo en cours de chargement…'); zoomOpen('video', u, +d.id); },
  reply(d) { S.replyTo = +d.id; closeLayer(); renderReplyBar(); const i = $('#msgIn'); if (i) i.focus(); },
  replyCancel() { S.replyTo = null; renderReplyBar(); },
  jump(d) { const el = document.querySelector(`.msg[data-mid="${d.id}"]`); if (el) el.scrollIntoView({block: 'center', behavior: 'smooth'}); },
  copy(d) { const m = (S.msgs.get(S.chatId) || []).find(x => x.id === +d.id); closeLayer(); if (m && navigator.clipboard) navigator.clipboard.writeText(m.text || '').then(() => toast('Texte copié')); },
  hideAsk(d) { confirmSheet('Supprimer pour moi ?', 'Le message disparaîtra seulement de votre côté. Les autres membres le verront toujours.', 'Supprimer', 'hideYes', d.id); },
  async hideYes(d) { closeLayer(); try { await api(`/api/messages/${d.id}/hide`, {}); msgHide(S.chatId, +d.id); toast('Message supprimé pour vous'); } catch (e) { toast(e.message); } },
  delAsk(d) { confirmSheet('Supprimer pour tout le monde ?', 'Le message sera remplacé par « Ce message a été supprimé » chez tous les membres.', 'Supprimer', 'delYes', d.id); },
  async delYes(d) { closeLayer(); try { await api(`/api/messages/${d.id}/delete`, {}); } catch (e) { toast(e.message); } },
  stNew(d, el, e) { e.stopPropagation(); stComposer(); },
  stOpen(d) { stOpen(+d.u); },
  stCancel() { if (S.sc && S.sc.url) URL.revokeObjectURL(S.sc.url); if (S.sc && S.sc.music) URL.revokeObjectURL(S.sc.music.url); S.sc = null; Emoji.close(); closeLayer(); },
  stAud(d) { keepSt(); S.sc.aud = d.a; S.sc.grp = false; stComposer(); }, // le groupe privé s'ouvre seulement quand on touche « Mon groupe privé »
  // Changer la couleur ne fait pas apparaître le clavier : on change seulement le fond.
  stBg(d) { S.sc.bg = +d.h; const b = document.querySelector('.st-box'); if (b) { b.style.setProperty('--h', d.h); if (stBgc(d.h)) b.style.setProperty('--bgc', stBgc(d.h)); else b.style.removeProperty('--bgc'); if (+d.h === 362) { b.style.setProperty('--stc', '#14181b'); b.style.setProperty('--stph', 'rgb(20 24 27/.45)'); } else { b.style.removeProperty('--stc'); b.style.removeProperty('--stph'); } } document.querySelectorAll('.st-bgs .sw').forEach(x => x.setAttribute('aria-pressed', x.dataset.h === d.h)); if (matchMedia('(min-width:821px) and (pointer:fine)').matches) { const t = $('#stText'); if (t) t.focus(); } },
  stPhoto() { keepSt(); $('#stIn').click(); },
  stCam() { keepSt(); Cam.open({...stOpts(), mode: 'photo'}); },
  stVid() { keepSt(); Cam.open({...stOpts(), mode: 'video'}); },
  stText() { keepSt(); if (S.sc.kind !== 'text') { if (S.sc.url) URL.revokeObjectURL(S.sc.url); Object.assign(S.sc, {kind: 'text', blob: null, url: null}); } S.sc.tab = null; stComposer(); },
  stFontTab() { keepSt(); S.sc.tab = S.sc.tab === 'font' ? null : 'font'; stComposer(); },
  stFont(d) { S.sc.font = +d.i; const b = document.querySelector('.st-box'); if (b) b.style.setProperty('--stf', stFont(S.sc.font)); document.querySelectorAll('.st-fonts button').forEach(x => x.setAttribute('aria-pressed', x.dataset.i === d.i)); },
  stMus() { keepSt(); $('#stMusIn').click(); },
  stMusOff() { keepSt(); if (S.sc.music) URL.revokeObjectURL(S.sc.music.url); S.sc.music = null; stComposer(); },
  stGrp() { keepSt(); S.sc.grp = true; stComposer(); },
  stGrpOk() { keepSt(); S.sc.grp = false; stComposer(); },
  cgOpen() { S.cgOpen = true; if (S.modal) renderModal(); else renderBody(); },
  cgClose() { S.cgOpen = false; if (S.modal) renderModal(); else renderBody(); toast('Groupe privé enregistré'); }, stGrpBg() { ACT.stGrpOk(); },
  stNoPhoto() { keepSt(); if (S.sc.url) URL.revokeObjectURL(S.sc.url); Object.assign(S.sc, {kind: 'text', blob: null, url: null}); stComposer(); },
  stPublish() { stPublish(); },
  closeEdit() { keepSt(); closeLayer(); if (isDesk()) pmOpen('settings'); else { S.tab = 'settings'; renderAll(); } setTimeout(() => { const el = document.querySelector('input[name="close"]'); if (el) el.scrollIntoView({block: 'center'}); }, 50); toast('Cochez les personnes de votre groupe privé, puis revenez publier votre statut.'); },
  async stQuoteOpen(d) {
    await loadStatuses().catch(() => {}); const uid = +d.u, id = +d.id;
    const g = uid === S.me.id ? {items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === uid), i = g ? g.items.findIndex(x => x.id === id) : -1;
    if (i < 0) return toast('Ce statut n’est plus disponible : un statut disparaît au bout de 24 heures.');
    S.sv = {uid, i}; renderSV();
  },
  stOpenU(d) { stOpen(+d.u); },
  svNext() { svStep(1); }, svPrev() { svStep(-1); }, svPause() { svPause(); },
  async svCall(d) { const cur = svCur(); if (!cur) return; try { const c = await directWith(cur.g.user.id); closeLayer(); S.tab = 'chats'; renderAll(); await openChat(c.id); Call.start(!!d.v); } catch (e) { toast(e.message); } },
  async svFlame(d, el) {
    const cur = svCur(); if (!cur) return; const on = !cur.it.flamed; cur.it.flamed = on;
    if (el) { el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); if (on) { el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 700); flameBurst(el); } }
    try { await api(`/api/statuses/${cur.it.id}/flame`, {on}); } catch (e) { cur.it.flamed = !on; if (el) el.classList.toggle('on', !on); toast(e.message); }
  },
  svrCancel() { svRecStop(false); svPause(false); },
  async svrMic() {
    if (S.svRec) return svRecStop(true);
    svPause(true);
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Ce navigateur ne permet pas d’enregistrer la voix.');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); } catch (e) { return micErr(e); }
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? {mimeType: mime, audioBitsPerSecond: 32000} : undefined), chunks = [];
    mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; mr.start(500);
    S.svRec = {mr, stream, chunks, t0: Date.now(), mime: mr.mimeType || mime || 'audio/webm'}; svPause(true);
    const rf = layer.querySelector('.sv-reply'); if (!rf) return;
    rf.classList.add('rec'); rf.insertAdjacentHTML('beforeend', `<div class="recbar sv-recbar" role="group" aria-label="Enregistrement d’un message vocal"><button class="ib" type="button" data-act="svrCancel" aria-label="Annuler l’enregistrement">${I.trash}</button><span class="rec-dot" aria-hidden="true"></span><span class="rec-t" id="svRecT">0:00</span><span class="grow hint">Enregistrement…</span><button class="send" type="button" data-act="svrMic" aria-label="Envoyer le message vocal">${I.send}</button></div>`);
    S.svRec.tick = setInterval(() => { const c = S.svRec; if (!c) return; const s = Math.floor((Date.now() - c.t0) / 1000), t = $('#svRecT'); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 300) svRecStop(true); }, 250);
  },
  svViews() {
    const it = S.statuses.mine.items[S.sv.i]; clearTimeout(svT);
    sheet(`${head('Vu par')}<div class="sheet-scroll">${(it.views || []).length ? it.views.map(v => `<div class="row">${avatar(v.user)}<span class="row-name">${esc(v.user.name)}</span>${v.flame ? '<span class="row-end" title="A envoyé une flamme">🔥</span>' : ''}<span class="row-prev"><span>${dayLabel(v.at)}, ${hm(v.at)}</span></span></div>`).join('') : '<p class="empty">Personne pour l’instant.</p>'}</div>`, 'Vu par');
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
      const tg = S.crop.target; URL.revokeObjectURL(S.crop.url); S.crop = null; closeLayer();
      if (tg === 'grp') { toast('Envoi de la photo…'); const up = await upload(b); await grpUpd({photo: up.id}); return toast('Photo du groupe changée'); }
      if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'photo', blob: b, url: URL.createObjectURL(b)}; S.showAv = false; renderBody();
      setTimeout(() => { const el = $('#phBlock'); if (el) el.scrollIntoView({block: 'center'}); }, 50); toast('Vérifiez l’aperçu, puis touchez « Valider ».'); }
    catch (e) { el.disabled = false; toast(e.message); }
  },
  soundToggle() { Sound.set(!Sound.on()); renderBody(); if (Sound.on()) Sound.msg(true); },
  meNoPhoto() { saveNow({photo: null}, 'Avatar rétabli'); },
  avShow() { S.showAv = !S.showAv; if (S.showAv && !(S.pp && S.pp.kind === 'av')) { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = {kind: 'av', av: avOf(S.me)}; } renderBody(); },
  pendCancel() { if (S.pp && S.pp.url) URL.revokeObjectURL(S.pp.url); S.pp = null; S.showAv = false; renderBody(); },
  async pendOk(d, el) {
    const P = S.pp; if (!P) return; el.disabled = true;
    try {
      if (P.kind === 'photo') { const up = await upload(P.blob); URL.revokeObjectURL(P.url); S.pp = null; S.showAv = false; await saveNow({photo: up.id}, 'Photo de profil changée'); }
      else { S.pp = null; S.showAv = false; await saveNow({avatar: P.av, photo: null}, 'Avatar choisi comme photo de profil'); }
    } catch (e) { el.disabled = false; toast(e.message); }
  },
  picAdd(d) { S.picSlot = {set: d.set, i: +d.i}; $('#picIn').click(); },
  vidAdd(d) { S.vidSlot = {set: d.set, i: +d.i}; $('#vidIn').click(); },
  async vidDel(d) {
    try { if (d.set === 'priv') { if (!PP.data) return; await PP.setVid(+d.i, null); } else { const r = await api('/api/me/pics', {set: 'pub', slot: 3 + +d.i, media: null}); S.me = r.me; if (PP.data) PP.attach(S.me); }
      Prof.load(); pmRefresh(); renderBody(); toast('Vidéo retirée'); } catch (e) { toast(e.message); }
  },
  async vidView(d) {
    const v = Prof.reg.get(d.vid), priv = !!(v && v.blob); const u = await Prof.src(d.vid).catch(() => null); if (!u) return toast('Vidéo indisponible.');
    sheet(`${head('Vidéo')}<div class="sheet-body${priv ? ' nocopy' : ''}" style="align-items:center;position:relative"><video class="vid-big" src="${esc(u)}" controls autoplay playsinline controlslist="nodownload noremoteplayback" disablepictureinpicture></video>${priv ? watermark() : ''}</div>`, 'Vidéo');
  },
  async pfFlame(d, el) {
    const uid = +d.u, map = Prof.fl.get(uid) || {}, it = map[d.m] || {n: 0, mine: false}, on = !it.mine; el.disabled = true;
    try { const r = await api(`/api/users/${uid}/flame`, {media: d.m, on}); map[d.m] = {n: r.n, mine: on}; Prof.fl.set(uid, map); if (on) toast('🔥 Flamme envoyée');
      document.querySelectorAll(`.pf-bar[data-pf="${CSS.escape(d.m)}"]`).forEach(b => { b.outerHTML = Prof.bar(uid, d.m); }); } catch (e) { toast(e.message); el.disabled = false; }
  },
  pfWho(d) {
    const it = (Prof.fl.get(S.me.id) || {})[d.m]; const who = (it && it.who) || [];
    sheet(`${head('Ils ont aimé 🔥')}<div class="sheet-scroll">${who.length ? who.map(w => `<button class="row" type="button" data-act="prof" data-id="${w.user.id}">${avatar(w.user, 'sm')}<span class="row-name">${esc(w.user.name)}</span><span class="row-time">${listTime(w.at)}</span></button>`).join('') : '<p class="empty">Personne pour l’instant.</p>'}</div>`, 'Flammes');
  },
  async picDel(d) { if (d.set === 'priv' && PP.data) { try { await PP.setPic(+d.i, null); renderBody(); toast('Photo retirée'); } catch (e) { toast(e.message); } return; } try { const r = await api('/api/me/pics', {set: d.set, slot: +d.i, media: null}); S.me = r.me; renderBody(); toast('Photo retirée'); } catch (e) { toast(e.message); } },
  picView(d) { const priv = /^blob:/.test(d.src); sheet(`${head('Photo')}<div class="sheet-body${priv ? ' nocopy' : ''}" style="align-items:center;position:relative"><img class="pic-big" src="${esc(d.src)}" alt="Photo du profil" draggable="false">${priv ? watermark() : ''}</div>`, 'Photo'); },
  avHide() { S.showAv = false; renderBody(); },
  profTab(d) { S.profTab = d.t; renderBody(); },
  goProfile() { if (isDesk()) return pmOpen('me'); S.tab = 'chats'; S.filt = 'me'; renderAll(); actSeen('prof'); Prof.load(true); },
  pmClose() { S.modal = null; renderModal(); }, pmScrim() { S.modal = null; renderModal(); },
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
  hdSet(d) { try { localStorage.setItem('tt:hd', d.v ? '1' : '0'); } catch {} renderBody(); toast(d.v ? 'Photos et vidéos envoyées en HD' : 'Photos et vidéos allégées avant l’envoi'); },
  stoOpen() { Stock.sheet(); },
  async stoClear(d) { await Stock.clearChat(+d.c); toast('Place libérée'); Stock.sheet(); },
  async stoDrop(d) { await Stock.drop(d.p); Stock.sheet(); },
  async stoAll() { await Stock.all(); toast('Tout est vidé sur cet appareil'); Stock.sheet(); },
  saverTog() { const on = !dataSaver(); try { localStorage.setItem('tt:saver', on ? '1' : '0'); } catch {} toast(on ? 'Économie de données activée sur cet appareil' : 'Économie de données désactivée'); },
  listedTog() { saveNow({listed: !S.me.listed}, S.me.listed ? 'Vous n’apparaissez plus dans la liste des membres' : 'Vous apparaissez dans la liste des membres'); },
  pwSheet() { sheet(`${head('Changer le mot de passe')}<form data-form="pw"><div class="sheet-body"><div class="field"><label for="pwOld">Mot de passe actuel</label><input id="pwOld" type="password" autocomplete="current-password"></div><div class="field"><label for="pwNew">Nouveau mot de passe (8 caractères minimum)</label><input id="pwNew" type="password" autocomplete="new-password"></div><p class="err" id="pwErr" role="alert" hidden></p><div class="actions"><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Mot de passe', '#pwOld'); },
  delSheet() { sheet(`${head('Supprimer mon compte')}<form data-form="del"><div class="sheet-body"><p>Votre compte, votre profil, vos photos et vos statuts seront effacés. Vos messages seront remplacés par « Ce message a été supprimé ». C’est définitif.</p><div class="field"><label for="delPw">Votre mot de passe pour confirmer</label><input id="delPw" type="password" autocomplete="current-password"></div><p class="err" id="delErr" role="alert" hidden></p><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn danger" type="submit">Supprimer définitivement</button></div></div></form>`, 'Supprimer', '#delPw'); },
  async logout() { try { localStorage.removeItem('tt-last-uid'); } catch {} await Stock.wipe(); await Device.disableHere(); await api('/api/logout', {}).catch(() => {}); if (es) es.close(); S.me = null; location.href = '/'; },
  admLoad() { adminLoad(); },
  async admDone(d) { await api('/api/admin/report-done', {id: +d.id}).catch(e => toast(e.message)); adminLoad(); },
  async ambList() { try { const r = await api('/api/ambassadors'); const g = {}; r.list.forEach(a => (g[a.lang] = g[a.lang] || []).push(a)); sheet(`${head('Ambassadeurs des langues')}<div class="sheet-body">${r.list.length ? Object.keys(g).sort().map(l => `<p class="lbl">${esc(l)}</p><p>${g[l].map(a => '@' + esc(a.handle)).join(' · ')}</p>`).join('') : '<p class="hint">Les premiers ambassadeurs arrivent bientôt. Vous parlez bien votre langue maternelle ? Rejoignez-nous !</p>'}<div class="actions"><a class="btn sm ghost" href="/ambassadeurs" target="_blank" rel="noopener">Devenir ambassadeur</a><button class="btn" type="button" data-act="close">Fermer</button></div></div>`, 'Ambassadeurs'); } catch (e) { toast(e.message); } },
  admAmb(d) { sheet(`${head('Ambassadeur des langues')}<form data-form="amb" data-id="${d.id}"><div class="sheet-body"><p class="hint">Indiquez la langue que cette personne représente (ex. : wolof, lingala, yoruba). Laissez vide pour retirer le badge.</p><div class="field"><label for="ambL">Langue</label><input id="ambL" maxlength="40" value="${esc(d.l || '')}"></div><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="submit">Enregistrer</button></div></div></form>`, 'Ambassadeur', '#ambL'); },
  async admReset(d) { try { const r = await api('/api/admin/reset', {userId: +d.id}); sheet(`${head('Lien de réinitialisation')}<div class="sheet-body"><p>Envoyez ce lien à la personne (valable 2 jours). Il lui permet de choisir un nouveau mot de passe.</p><div class="invite-url">${esc(r.url)}</div><div class="actions"><button class="btn" type="button" data-act="copyTxt" data-t="${esc(r.url)}">${I.copy}Copier</button></div></div>`, 'Lien'); } catch (e) { toast(e.message); } },
  copyTxt(d) { navigator.clipboard && navigator.clipboard.writeText(d.t).then(() => toast('Copié')); },
};
function keepSt() { const t = ($('#stText') || $('#stCap') || {}).value; if (t != null && S.sc) S.sc.text = t; }

const FORMS = {
  async amb(f) { const l = ($('#ambL').value || '').trim(); try { await api('/api/admin/amb', {userId: +f.dataset.id, lang: l}); closeLayer(); toast(l ? `Badge « Ambassadeur · ${l} » attribué` : 'Badge retiré'); adminLoad(); } catch (e) { toast(e.message); } },
  async svReply() { const i = $('#svrIn'), t = (i && i.value || '').trim(); if (!t) return; i.value = ''; const rf = i.closest('.sv-reply'); if (rf) rf.classList.remove('typed'); i.blur(); try { await svSend({t}); toast('Réponse envoyée'); } catch (e) { toast(e.message); } },
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
  async trset() { const er = $('#trErr'); er.hidden = true; const gkey = $('#trG').value.trim(), ckey = $('#trC').value.trim(), bi = $('#trBudget'), budget = bi ? +bi.value : undefined; if (!gkey && !ckey && !(S.trset && S.trset.has)) return;
    try { await api('/api/admin/translate', {gkey, ckey, budget}); S.trset = await api('/api/admin/translate'); Tr.st = await api('/api/translate/status'); renderBody(); toast('Traduction activée'); }
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
  async grpName() { try { await grpUpd({name: $('#grpN').value}); toast('Groupe renommé'); } catch (e) { toast(e.message); } },
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

Object.assign(ACT, { keyAck(d) { KeyPin.ack(+d.id); renderMessages(true); } });
