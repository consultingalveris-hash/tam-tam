/* tam-tam — Feuilles (fenêtres) : menus, messages à vue unique, transfert, suppression, partage de position, export.
   Extrait de app.js (nov. 2026) : chargé après app.js, partage ses variables globales. */
'use strict';
/* ---------- feuilles ---------- */
const head = t => `<div class="sheet-head"><h2>${t}</h2><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div>`;
// Le point unique de Tam-Tam (au lieu des trois points) : blanc, turquoise pour tout ce qui est privé.
const DOT = (priv, cls = '') => `<span class="dot1${priv ? ' priv' : ''}${cls ? ' ' + cls : ''}" aria-hidden="true"></span>`;
// Les menus ouverts depuis ce point s'affichent dans une petite fenêtre près du point (pas en bas de l'écran),
// et ne ferment pas ce qui est derrière (une photo ou une vidéo en grand continue de s'afficher).
let popFrom = null, popAt = 0, popRect = null;
function popClose() { const p = document.getElementById('pop'); if (p) p.remove(); document.querySelectorAll('#msgs .msg.menu-on').forEach(e => e.classList.remove('menu-on')); }
function popOpen(html, label, a) {
  popClose();
  const el = document.createElement('div'); el.id = 'pop'; el.className = 'pop-scrim';
  el.innerHTML = `<div class="pop${a.classList.contains('priv') || a.querySelector('.dot1.priv') ? ' priv' : ''}" role="dialog" aria-label="${esc(label || 'Options')}">${html.replace(/<div class="sheet-head">[\s\S]*?<\/button><\/div>/, '')}</div>`;
  document.body.appendChild(el);
  const box = el.firstChild, r = (a.isConnected ? a.getBoundingClientRect() : popRect) || a.getBoundingClientRect(), W = innerWidth, H = innerHeight, w = Math.min(isDesk() ? 340 : 300, W - 24);
  box.style.width = w + 'px'; box.style.left = Math.max(12, Math.min(W - w - 12, r.right - w)) + 'px';
  const h = Math.min(box.scrollHeight, H * .6), below = H - r.bottom - 12;
  if (below >= h || below > r.top) { box.style.top = (r.bottom + 6) + 'px'; box.style.maxHeight = Math.max(160, below - 6) + 'px'; } else { box.style.bottom = (H - r.top + 6) + 'px'; box.style.maxHeight = Math.max(160, r.top - 18) + 'px'; }
  el.addEventListener('click', e => { if (e.target === el) popClose(); });
}
const BELL_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 21a2 2 0 0 1-3.4 0M18 8a6 6 0 0 0-9.3-5M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function sheet(html, label, focus) {
  if (popFrom && Date.now() - popAt < 900 && /class="(menu|react-bar)/.test(html) && !/<(input|textarea|select|form)\b/.test(html)) { const f = popFrom; popFrom = null; return popOpen(html, label, f); }
  popClose();
  layer.innerHTML = `<div class="layer" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div></div>`;
  const f = layer.querySelector(focus || '.sheet button, .sheet input'); if (f) f.focus({preventScroll: true});
}
// Filigrane au nom de la personne qui regarde : une capture faite malgré tout montre qui l'a prise.
// Filigranes retirés à la demande du propriétaire (la protection contre les captures reste active sur Android).
function watermark() { return ''; }
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
function closeLayer() { popClose(); if (S.svRec) svRecStop(false); if (S.onceMsg) return onceDone(); clearTimeout(svT); const wasSv = !!S.sv; if (S.sv) setTimeout(svCacheClear, 500); layer.innerHTML = ''; S.sv = null; if (wasSv && S.chatId) setTimeout(focusComposer, 60); if (S.pend) { URL.revokeObjectURL(S.pend.url); S.pend = null; } }
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
    ${c.type === 'group' ? `<button type="button" data-act="chatInfo">${I.info}Infos et réglages du groupe</button>${can(c, 'add') ? `<button type="button" data-act="groupAddOpen">${I.userplus}Ajouter des membres</button>` : ''}`
    : `<button type="button" data-act="prof" data-id="${u.id}">${I.info}Voir le profil</button>`}
    <button type="button" data-act="mediaOpen">${I.image || I.clip}Médias, liens et documents</button>
    ${u && u.locMe ? `<button type="button" data-act="locFollow" data-id="${u.id}"><span class="pin-ic" aria-hidden="true">📍</span>Suivre la localisation de ${esc(first(u.name))}</button>` : ''}
    <button type="button" data-act="chatMute"><span class="pin-ic" aria-hidden="true">${c.muted ? '🔔' : '🔕'}</span>${c.muted ? 'Réactiver le son' : 'Couper le son'}</button>
    ${c.hidden ? '' : '<button type="button" data-act="exportAsk"><span class="pin-ic" aria-hidden="true">🗜</span>Exporter la discussion</button>'}
    ${c.type === 'group' ? `<button type="button" class="danger" data-act="leaveAsk">${I.back}Quitter le groupe</button>` : ''}
    <button type="button" data-act="privToggle">${I.lock}${c.hidden ? 'Ne plus rendre privée' : 'Rendre la discussion privée'}</button>
    <button type="button" class="danger" data-act="reportAsk" data-id="${u ? u.id : ''}" data-chat="${c.id}">${I.flag}Signaler</button>
    ${u ? `<button type="button" class="danger" data-act="${blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${I.block}${blocked ? 'Débloquer ' : 'Bloquer '}${esc(first(u.name))}</button>` : ''}</div>`, 'Options');
}
function chatListMenu(id) {
  const c = S.chats.get(id); if (!c) return;
  const u = c.type === 'direct' ? uOf(c.peer) : null, blocked = u && (S.me.blocked || []).some(b => b.id === u.id), unread = c.unread || c.marked;
  sheet(`${head(esc(chatTitle(c)))}<div class="menu">
    <button type="button" data-act="chatPin" data-id="${id}"><span class="pin-ic" aria-hidden="true">📌</span>${c.pinned ? 'Ne plus épingler' : 'Épingler en haut (4 au maximum)'}</button>
    <button type="button" data-act="chatRead" data-id="${id}" data-v="${unread ? '' : '1'}">${I.eye}${unread ? 'Marquer comme lue' : 'Marquer comme non lue'}</button>
    <button type="button" data-act="chatArch" data-id="${id}">${ARCH_IC}${c.archived ? 'Désarchiver' : 'Archiver'}</button>
    <button type="button" data-act="selStart" data-id="${id}">${I.check || '✓'}Sélectionner</button>
    <button type="button" data-act="chatPriv" data-id="${id}">${I.lock}${c.hidden ? 'Ne plus rendre privée' : 'Rendre la discussion privée'}</button>
    ${u ? `<button type="button" class="danger" data-act="${blocked ? 'unblock' : 'blockAsk'}" data-id="${u.id}">${I.block}${blocked ? 'Débloquer ' : 'Bloquer '}${esc(first(u.name))}</button>` : ''}
    <button type="button" class="danger" data-act="chatClearAsk" data-id="${id}">${I.trash}Supprimer la discussion</button></div>`, 'Options');
}
async function grpUpd(body, quiet) {
  const r = await api(`/api/chats/${S.chatId}/group`, body); S.chats.set(r.chat.id, Object.assign(S.chats.get(r.chat.id), r.chat)); renderChatHead(); if (!quiet) groupInfo(); if (S.tab === 'chats') renderBody();
}
async function chatMine(id, body, quiet) {
  const r = await api(`/api/chats/${id}/mine`, body); const c = S.chats.get(id); if (c) { await reveal(r.chat.last); if (r.chat.pinMsg) await reveal(r.chat.pinMsg); S.chats.set(id, Object.assign(c, r.chat)); }
  if (!quiet) { renderTabs(); if (S.tab === 'chats') renderBody(); }
}
const can = (c, what) => c.admin || ((c.gset || {})[what] === 'all');
function groupInfo() {
  const c = S.chats.get(S.chatId); if (!c) return; const g = c.gset || {}, ed = can(c, 'edit');
  const role = m => m.id === c.createdBy ? 'Créateur' : m.admin ? 'Admin' : '';
  const mem = c.members.slice().sort((a, b) => (b.id === c.createdBy) - (a.id === c.createdBy) || (b.admin - a.admin) || (a.id === S.me.id ? -1 : b.id === S.me.id ? 1 : 0));
  sheet(`${head('Infos du groupe')}<div class="sheet-scroll"><div class="sheet-body">
    <div class="prof"><span class="grp-ph">${grpAv(c, 'xl')}${ed ? `<button class="ib grp-ph-b" type="button" data-act="grpPhoto" aria-label="Changer la photo du groupe">${I.camera}</button>` : ''}</span>
      <b class="grp-title">${ed ? `<button class="grp-ren" type="button" data-act="grpRename" aria-label="Renommer le groupe" title="Renommer le groupe">${I.pencil}</button>` : ''}${numSm(c.name)}</b><span>Groupe · ${c.members.length} membre${c.members.length > 1 ? 's' : ''}</span></div>
    <div class="grp-acts">
      <button type="button" class="ga" data-act="gcallVideo">${I.video}<span>Appel vidéo</span></button><button type="button" class="ga" data-act="gcallAudio">${I.phone}<span>Appel vocal</span></button>
      ${can(c, 'add') ? `<button type="button" class="ga" data-act="grpLink">${I.copy}<span>Lien d’invitation</span></button><button type="button" class="ga" data-act="groupAddOpen">${I.userplus}<span>Ajouter</span></button>` : ''}
      <button type="button" class="ga" data-act="mediaOpen">${I.image || I.clip}<span>Médias</span></button></div>
    ${c.admin ? `<details class="grp-set"><summary>${I.settings}Réglages du groupe (administrateurs)</summary>
      ${[['add', 'Qui peut ajouter des membres et partager le lien ?', [['all', 'Tous les membres'], ['admins', 'Les administrateurs']]], ['edit', 'Qui peut changer le nom et la photo ?', [['all', 'Tous les membres'], ['admins', 'Les administrateurs']]], ['del', 'Supprimer les messages des autres membres', [['admins', 'Les administrateurs peuvent'], ['none', 'Personne']]]].map(([k, q, opts]) => `<span class="lbl">${q}</span><div class="seg">${opts.map(([v, l]) => `<button type="button" data-act="grpSet" data-k="${k}" data-v="${v}" aria-pressed="${g[k] === v}">${l}</button>`).join('')}</div>`).join('')}
      <p class="hint">4 administrateurs au maximum, créateur compris. Touchez un membre pour le nommer administrateur ou le retirer du groupe.</p></details>` : ''}
    <span class="lbl">${c.members.length} membre${c.members.length > 1 ? 's' : ''}</span></div>
    ${mem.map(m => { const u = m.id === S.me.id ? S.me : uOf(m.id), r = role(m); return `<button class="row" type="button" data-act="grpMember" data-id="${m.id}">${avOn(u)}<span class="row-name">${esc(m.id === S.me.id ? 'Vous' : u.name)}</span>${r ? `<span class="row-end"><span class="role-b${r === 'Créateur' ? ' own' : ''}">${r}</span></span>` : ''}<span class="row-prev"><span>${esc(subH(u) || '@' + u.handle)}</span></span></button>`; }).join('')}
    <div class="sheet-body"><button class="btn ghost danger" type="button" data-act="leaveAsk">${I.back}Quitter le groupe</button></div></div>`, 'Infos du groupe');
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
const micErr = e => toast(e && e.name === 'NotFoundError' ? 'Aucun micro détecté sur cet appareil. Branchez un micro ou un casque, puis réessayez.' : e && e.name === 'NotReadableError' ? 'Le micro est déjà utilisé par une autre application. Fermez-la, puis réessayez.' : 'Le micro est bloqué pour Tam-Tam. Sur ordinateur : cliquez sur le cadenas à gauche de l’adresse, puis Micro → Autoriser. Sur téléphone : autorisez le micro dans les réglages de l’application.');
const DEL_ALL_MAX = 2 * 60_000, EDIT_MAX = 2 * 60_000;
const FWD_IC = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l6 6-6 6"/><path d="M21 11H10a6 6 0 0 0-6 6v2"/></svg>';
const QUICK = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
function reactsHtml(m) {
  if (!m.reacts || !m.reacts.length) return '';
  const g = {}; for (const r of m.reacts) (g[r.e] = g[r.e] || []).push(r.u);
  const mine = m.reacts.some(r => r.u === S.me.id);
  return `<button type="button" class="reacts${mine ? ' mine' : ''}" data-act="reactWho" data-id="${m.id}" aria-label="Réactions">${Object.entries(g).map(([e, us]) => `<span>${esc(e)}${us.length > 1 ? `<small>${us.length}</small>` : ''}</span>`).join('')}</button>`;
}
const fsz = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1e3)) + ' Ko';
function docHtml(m) {
  const ext = (String(m.fname || '').split('.').pop() || '').slice(0, 4).toUpperCase();
  return `<button type="button" class="docb" data-act="docOpen" data-id="${m.id}"><span class="doc-ic" aria-hidden="true">${esc(ext || 'DOC')}</span><span class="doc-t"><b>${esc(m.fname || 'Document')}</b><small>${m.fsize ? fsz(m.fsize) + ' · ' : ''}Touchez pour ouvrir</small></span></button>`;
}
async function docOpen(m) {
  try {
    toast('Ouverture du document…'); const b = await msgBytes(m), safe = /^(application\/pdf|image\/(jpeg|png|webp|gif)|text\/plain)$/.test(m.fmime || ''), url = URL.createObjectURL(new Blob([b], {type: safe ? m.fmime : 'application/octet-stream'}));
    // Seuls les documents sans danger (PDF, photo, texte simple) s'ouvrent dans un onglet ; les autres sont téléchargés.
    const a = document.createElement('a'); a.href = url; a.download = m.fname || 'document'; a.rel = 'noopener'; if (safe) a.target = '_blank';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) { toast(e.message || 'Document illisible sur cet appareil.'); }
}
// Fabrique un fichier .zip (sans compression) à partir des fichiers d'un dossier, directement sur l'appareil.
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const f of files) {
    const name = enc.encode(f.webkitRelativePath || f.name), data = new Uint8Array(await f.arrayBuffer()), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  }
  const cs = central.reduce((a, x) => a + x.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], {type: 'application/zip'});
}
async function sendDoc(f) {
  const c = S.chats.get(S.chatId); if (!c || !f) return;
  if (f.size > 40_000_000) return toast(`Document trop lourd (${fsz(f.size)}). Maximum : 40 Mo.`);
  toast('Envoi du document…');
  try {
    const mime = f.type || 'application/octet-stream', sealed = await E2E.seal({t: '', name: f.name.slice(0, 120), size: f.size, mime}, recipients(c), await f.arrayBuffer());
    const up = await upMedia(sealed.blob);
    const r = await api(`/api/chats/${c.id}/messages`, {media: up.id, enc: sealed.env, kind: 'doc'}); onMsg(r.msg); toast('Document envoyé');
  } catch (e) { toast(e.message); }
}
/* Médias, liens et documents d'une discussion : tout est déchiffré et trié sur l'appareil. */
const MG_TABS = [['photo', 'Photos'], ['video', 'Vidéos'], ['link', 'Liens'], ['doc', 'Documents'], ['audio', 'Vocaux'], ['loc', 'Positions']];
async function mediaGallery(tab) {
  const c = S.chats.get(S.chatId); if (!c) return;
  if (!S.mg || S.mg.chat !== c.id) S.mg = {chat: c.id, tab: 'photo', items: null};
  if (tab) S.mg.tab = tab;
  const g = S.mg, render = () => {
    const it = g.items, by = k => it ? it.filter(x => x.cat === k) : [];
    const list = by(g.tab), when = m => `${dayLabel(m.at)} · ${m.from === S.me.id ? 'Vous' : esc(first(uOf(m.from).name))}`;
    let body;
    if (!it) body = '<p class="empty">Chargement et déchiffrement…</p>';
    else if (!list.length) body = `<p class="empty">Aucun élément dans « ${MG_TABS.find(t => t[0] === g.tab)[1]} ».</p>`;
    else if (g.tab === 'photo') body = `<div class="mg-grid">${list.map(m => `<button type="button" class="mg-ph" data-act="mgZoom" data-id="${m.id}"><img data-mg="${m.id}" alt="Photo du ${esc(dayLabel(m.at))}"${E2E.imgs.has(m.id) ? ` src="${E2E.imgs.get(m.id)}"` : ''}></button>`).join('')}</div>`;
    else body = `<div class="mg-list">${list.map(m => {
      if (g.tab === 'video') return `<button type="button" class="row" data-act="mgPlay" data-id="${m.id}"><span class="mg-ic">🎥</span><span class="row-name">Vidéo${m.dur ? ' · ' + Math.floor(m.dur / 60) + ':' + String(m.dur % 60).padStart(2, '0') : ''}</span><span class="row-prev"><span>${when(m)}</span></span></button>`;
      if (g.tab === 'audio') return `<div class="row"><span class="mg-ic">🎤</span><span class="row-name">Vocal${m.dur ? ' · ' + Math.floor(m.dur / 60) + ':' + String(m.dur % 60).padStart(2, '0') : ''}</span><span class="row-end"><button class="btn sm ghost" type="button" data-act="mgPlay" data-id="${m.id}">Écouter</button></span><span class="row-prev"><span>${when(m)}</span></span></div>`;
      if (g.tab === 'doc') return `<button type="button" class="row" data-act="mgDoc" data-id="${m.id}"><span class="mg-ic">📄</span><span class="row-name">${esc(m.fname || 'Document')}</span><span class="row-prev"><span>${m.fsize ? fsz(m.fsize) + ' · ' : ''}${when(m)}</span></span></button>`;
      if (g.tab === 'loc') return `<div class="mg-loc">${locHtml(m)}<small class="hint">${when(m)}</small></div>`;
      return (m.links || []).map(u => `<a class="row mg-link" href="${(/^https?:/i.test(u) ? u : 'https://' + u).replace(/"/g, '&quot;')}" target="_blank" rel="noopener nofollow"><span class="mg-ic">🔗</span><span class="row-name">${esc(u.replace(/^https?:\/\//, '').slice(0, 70))}</span><span class="row-prev"><span>${when(m)}</span></span></a>`).join('');
    }).join('')}</div>`;
    sheet(`${head('Médias, liens et documents')}<div class="chips mg-tabs" role="tablist">${MG_TABS.map(([k, l]) => `<button class="chip" type="button" role="tab" data-act="mgTab" data-t="${k}" aria-pressed="${g.tab === k}">${l}${it ? ` <small>${by(k).length}</small>` : ''}</button>`).join('')}</div><div class="sheet-scroll mg-body">${body}</div>`, 'Médias');
    if (it && g.tab === 'photo') mgThumbs(list);
  };
  render(); g.render = render;
  if (!g.items) {
    try {
      const r = await api(`/api/chats/${c.id}/media`), out = [];
      for (const m of r.messages) {
        await reveal(m); if (m.locked) continue;
        if (m.kind === 'image' && m.media) m.cat = 'photo'; else if (m.kind === 'video') m.cat = 'video'; else if (m.kind === 'audio') m.cat = 'audio'; else if (m.kind === 'doc') m.cat = 'doc'; else if (m.kind === 'loc') m.cat = 'loc';
        else if (m.text && (m.links = m.text.match(URL_RE))) m.cat = 'link'; else continue;
        out.push(m);
      }
      g.items = out; g.map = new Map(out.map(m => [m.id, m])); if (S.mg === g && $('.mg-tabs')) render();
    } catch (e) { toast(e.message); }
  }
}
async function mgThumbs(list) {
  for (const m of list.slice(0, 90)) {
    const el = document.querySelector(`img[data-mg="${m.id}"]`); if (!el || el.src) continue;
    try { const u = URL.createObjectURL(new Blob([await msgBytes(m)], {type: 'image/jpeg'})); E2E.imgs.set(m.id, u); el.src = u; } catch {}
  }
}
async function joinPreview(code) {
  try {
    const r = await api('/api/groups/join/' + encodeURIComponent(code));
    if (r.member) { await loadChats(); renderAll(); return openChat(r.id); }
    S.joinCode = code;
    sheet(`${head('Rejoindre un groupe')}<div class="sheet-body"><div class="prof"><span class="av grp xl" style="--h:${(r.id * 47) % 360}">${I.users}</span><b>${esc(r.name)}</b><span>Groupe · ${r.count} membre${r.count > 1 ? 's' : ''}</span></div>
      <p class="hint">Les membres du groupe verront votre pseudo. Vous pourrez quitter le groupe quand vous voulez.</p><div class="actions"><button class="btn ghost" type="button" data-act="close">Plus tard</button><button class="btn" type="button" data-act="joinGo">Rejoindre le groupe</button></div></div>`, 'Rejoindre');
  } catch (e) { toast(e.message); }
}
function stQuote(m, out, c) {
  const r = m.sr; if (!r) return '';
  const who = out ? `Statut de ${esc(first(chatTitle(c)))}` : 'Votre statut';
  const owner = out ? c.peer : S.me.id;
  return `<span class="quote st-q" data-act="stQuoteOpen" data-id="${esc(r.id || '')}" data-u="${owner}" role="button" tabindex="0"><b>↩ ${who}</b><span>${r.k === 'video' ? '🎥 Vidéo' : r.k === 'image' ? '📷 Photo' : ''}${r.t ? (r.k === 'text' ? '' : ' · ') + esc(r.t) : ''}</span></span>`;
}
function locHtml(m) {
  const l = m.loc || {}; if (l.la == null) return '<span class="txt gone">📍 Position illisible</span>';
  const q = `${(+l.la).toFixed(6)},${(+l.lo).toFixed(6)}`;
  return `<a class="locb" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener"><span class="loc-pin" aria-hidden="true">📍</span><span><b>Position${m.from === S.me.id ? ' envoyée' : ''}</b><small>Touchez pour ouvrir la carte</small></span></a>`;
}
async function msgBytes(m) {
  const map = m.kind === 'video' ? E2E.vids : m.kind === 'audio' ? E2E.auds : E2E.imgs;
  if (map.has(m.id)) return (await fetch(map.get(m.id))).arrayBuffer();
  if (!m._key || !m.miv) throw new Error('Ce fichier n’est pas encore chargé. Réessayez dans un instant.');
  const r = await fetch(m.media, {credentials: 'same-origin'}); return E2E.decBytes(m._key, m.miv, await r.arrayBuffer());
}
// Transférer : le message est déchiffré sur l'appareil puis rechiffré pour chaque discussion choisie.
// Envoi en arrière-plan, avec un aperçu immédiat (cercle qui tourne) dans chaque discussion déjà ouverte.
async function fwdRun(ms, ids) {
  let ok = 0;
  for (const m of ms) {
    const temps = [];
    for (const id of ids) {
      const list = S.msgs.get(id); if (!list) continue;
      const tmp = {id: -(Date.now() + Math.floor(Math.random() * 1e6)), chatId: id, from: S.me.id, at: Date.now(), kind: m.kind, media: m.media ? 'en-cours' : null, enc: !!m.media, text: m.text || '', fwd: true, pending: true, dur: m.dur, loc: m.loc, fname: m.fname};
      const map = m.kind === 'video' ? E2E.vids : m.kind === 'audio' ? E2E.auds : E2E.imgs; if (map && map.has(m.id)) map.set(tmp.id, map.get(m.id));
      list.push(tmp); temps.push(tmp);
    }
    if (temps.some(t => t.chatId === S.chatId)) renderMessages();
    try { await fwdSend(m, ids); ok++; } catch (e) { toast(e.message || 'Le transfert a échoué.'); }
    for (const t of temps) { const list = S.msgs.get(t.chatId); const k = list ? list.indexOf(t) : -1; if (k >= 0) list.splice(k, 1); }
    if (temps.some(t => t.chatId === S.chatId)) renderMessages();
  }
  return ok;
}
async function fwdSend(m, ids) {
  const payload = {t: m.text || ''}; if (m.loc) payload.loc = m.loc; if (m.amime) payload.mime = m.amime; if (m.dur) payload.dur = m.dur;
  const bytes = m.media ? await msgBytes(m) : undefined, kind = m.kind === 'video' || m.kind === 'audio' || m.kind === 'loc' ? m.kind : undefined;
  for (const id of ids) {
    const c = S.chats.get(id); if (!c) continue;
    const sealed = await E2E.seal(payload, recipients(c), bytes);
    let media = null; if (sealed.blob) media = (await upMedia(sealed.blob)).id;
    const r = await api(`/api/chats/${id}/messages`, {enc: sealed.env, media, kind, fwd: true});
    const map = m.kind === 'video' ? E2E.vids : m.kind === 'audio' ? E2E.auds : E2E.imgs; if (map && map.has(m.id)) map.set(r.msg.id, map.get(m.id));
    onMsg(r.msg);
  }
}
function fwdSheet(id) {
  const all = S.msgs.get(S.chatId) || [], ms = (Array.isArray(id) ? id : [id]).map(i => all.find(x => x.id === i)).filter(Boolean).sort((x, y) => x.at - y.at); if (!ms.length) return; const m = ms[0]; S.fwd = {m, ms, sel: new Set()};
  const list = [...S.chats.values()].filter(c => !c.blocked && !(c.type === 'direct' && !c.peer)).sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0));
  sheet(`${head('Transférer à…')}<div class="sheet-body" style="padding-bottom:0"><p class="hint">Choisissez jusqu’à 5 discussions. Le message portera la mention « Transféré ».</p></div>
    <div class="sheet-scroll">${list.map(c => `<label class="row fwd-row">${c.type === 'group' ? grpAv(c, 'sm') : avOn(uOf(c.peer))}<span class="row-name">${esc(chatTitle(c))}</span><input type="checkbox" data-fwd="${c.id}" aria-label="Choisir ${esc(chatTitle(c))}"></label>`).join('')}</div>
    <div class="sheet-body"><div class="actions"><button class="btn ghost" type="button" data-act="close">Annuler</button><button class="btn" type="button" data-act="fwdGo" id="fwdGo" disabled>Transférer</button></div></div>`, 'Transférer');
}
document.addEventListener('change', async e => {
  if (e.target.name !== 'locTo') return;
  const to = [...document.querySelectorAll('input[name="locTo"]:checked')].map(i => +i.value);
  try { const r = await api('/api/loc/settings', {to}); S.me.locTo = r.locTo; LocShare.sync(); toast(r.locTo.length ? `Position partagée avec ${r.locTo.length} personne${r.locTo.length > 1 ? 's' : ''}` : 'Partage de position désactivé'); } catch (er) { toast(er.message); }
});
/* Envoi de ma position aux personnes choisies : chiffrée pour elles seules, à chaque déplacement de plus de 25 m ou toutes les 2 minutes. */
const LocShare = {
  w: null, last: null, lastAt: 0, busy: false,
  sync() { const on = (S.me && S.me.locTo || []).length && 'geolocation' in navigator; if (on && this.w == null) this.start(); else if (!on && this.w != null) this.stop(); },
  start() { try { this.w = navigator.geolocation.watchPosition(p => this.got(p), () => {}, {enableHighAccuracy: true, maximumAge: 30000, timeout: 60000}); } catch { this.w = null; } this.tick = setInterval(() => { if (this.last && Date.now() - this.lastAt > 120000) this.send(this.last); }, 60000); },
  stop() { try { navigator.geolocation.clearWatch(this.w); } catch {} this.w = null; clearInterval(this.tick); },
  dist(a, b) { const R = 6371e3, t = x => x * Math.PI / 180, dl = t(b.lat - a.lat), dg = t(b.lng - a.lng); const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); },
  got(p) { const c = {lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0)}; const moved = !this.sent || this.dist(this.sent, c) > 25; this.last = c; if (moved || Date.now() - this.lastAt > 120000) this.send(c); },
  async send(c) {
    if (this.busy || !E2E.ready()) return; this.busy = true;
    try {
      const to = (S.me.locTo || []).map(id => S.contacts.contacts.find(u => u.id === id)).filter(u => u && u.pubkey);
      const sealed = await E2E.seal({...c, t: Date.now()}, [[S.me.id, E2E.pubJwk], ...to.map(u => [u.id, u.pubkey])]);
      await api('/api/loc', {env: sealed.env}); this.sent = c; this.lastAt = Date.now();
    } catch {} finally { this.busy = false; }
  },
};
document.addEventListener('change', e => {
  const b = e.target.closest && e.target.closest('[data-fwd]'); if (!b || !S.fwd) return;
  const id = +b.dataset.fwd; if (b.checked) { if (S.fwd.sel.size >= 5) { b.checked = false; return toast('5 discussions au maximum.'); } S.fwd.sel.add(id); } else S.fwd.sel.delete(id);
  const g = $('#fwdGo'); if (g) { g.disabled = !S.fwd.sel.size; g.textContent = S.fwd.sel.size > 1 ? `Transférer (${S.fwd.sel.size})` : 'Transférer'; }
});
function moreEmoji(id) {
  const list = (EMO[1][2].slice(0, 40)).concat(EMO[3][2].slice(0, 16), EMO[2][2].slice(0, 24));
  sheet(`${head('Réagir')}<div class="sheet-body"><div class="emo-grid react-grid">${list.map(e => `<button type="button" data-act="react" data-id="${id}" data-e="${e}">${e}</button>`).join('')}</div></div>`, 'Réagir');
}
function locBusy(txt) {
  let el = $('#locBusy'); if (!txt) { if (el) el.remove(); return; }
  const host = $('#compose'); if (!host) return;
  if (!el) { el = document.createElement('div'); el.id = 'locBusy'; el.className = 'loc-busy'; host.parentNode.insertBefore(el, host); }
  el.innerHTML = `📍 ${txt}<span class="ldots" aria-hidden="true"><i></i><i></i><i></i></span>`;
}
async function sendLoc() {
  if (!navigator.geolocation) return toast('Cet appareil ne permet pas de partager la position.');
  const c = S.chats.get(S.chatId); if (!c) return;
  closeLayer(); locBusy('Recherche de votre position');
  // On écoute le GPS jusqu'à 10 secondes et on garde la position la plus précise (on s'arrête dès 15 m).
  let best = null, done = false, wid = null;
  const finish = async err => {
    if (done) return; done = true; if (wid != null) navigator.geolocation.clearWatch(wid); clearTimeout(tm);
    if (!best) { locBusy(null); return toast(err && err.code === 1 ? 'Tam-Tam n’a pas accès à votre position. Autorisez la localisation dans les réglages de votre téléphone ou de votre navigateur.' : 'Position introuvable pour l’instant. Vérifiez que la localisation (GPS) est activée, puis réessayez.'); }
    const l = {la: +best.latitude.toFixed(6), lo: +best.longitude.toFixed(6), acc: Math.round(best.accuracy || 0)};
    try { const sealed = await E2E.seal({t: '', loc: l}, recipients(c)); const r = await api(`/api/chats/${c.id}/messages`, {enc: sealed.env, kind: 'loc'}); locBusy(null); onMsg(r.msg); } catch (e) { locBusy(null); toast(e.message); }
  };
  const tm = setTimeout(() => finish(), 10000);
  wid = navigator.geolocation.watchPosition(p => { if (!best || p.coords.accuracy < best.accuracy) best = p.coords; if (best.accuracy <= 15) finish(); }, err => { if (err.code === 1 || !best) finish(err); }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 0});
}
function msgHide(chatId, id) { const l = S.msgs.get(chatId); if (l) { const i = l.findIndex(x => x.id === id); if (i >= 0) l.splice(i, 1); } if (S.chatId === chatId) renderMessages(true); loadChats().then(() => { if (S.tab === 'chats') renderBody(); }).catch(() => {}); }
// Photo ou vidéo en plein écran, avec le point en haut à droite (répondre, transférer, supprimer…).
function zoomOpen(kind, src, mid) {
  const m = mid && (S.msgs.get(S.chatId) || []).find(x => x.id === mid), u = m && uOf(m.from);
  const who = m ? `<span class="zm-who"><b>${esc(m.from === S.me.id ? 'Vous' : u.name)}</b><small>${new Date(m.at).toLocaleString('fr-FR', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</small></span>` : '<span class="grow"></span>';
  layer.innerHTML = `<div class="zoom${m && S.chats.get(S.chatId)?.hidden ? ' nocopy' : ''}" role="dialog" aria-modal="true" aria-label="${kind === 'video' ? 'Vidéo' : 'Photo'}"><div class="zm-top"><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.back}</button>${who}${m && !m.once ? `<button class="ib dotb" type="button" data-act="zoomMenu" data-id="${mid}" aria-label="Actions" title="Actions">${DOT(S.chats.get(S.chatId)?.hidden)}</button>` : ''}</div>
    <div class="zm-stage">${kind === 'video' ? `<video src="${esc(src)}" controls autoplay playsinline controlslist="nodownload" disablepictureinpicture></video>` : `<img src="${esc(src)}" alt="Photo" draggable="false">`}</div>${m && m.text ? `<p class="zm-cap">${esc(m.text)}</p>` : ''}</div>`;
}
/* Export d'une discussion en fichier ZIP (texte, et si demandé les photos, vidéos, documents déchiffrés). */
const Zip = {
  crcT: (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })(),
  crc(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = Zip.crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; },
  make(files) {   // fichiers stockés sans compression (photos et vidéos sont déjà compressées)
    const enc = new TextEncoder(), parts = [], cent = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = Zip.crc(data), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, data);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      cent.push(c.buffer, name); off += 30 + name.length + data.length;
    }
    const csize = cent.reduce((s, x) => s + (x.byteLength || x.length), 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cent, e.buffer], {type: 'application/zip'});
  },
};
async function exportChat(id, withMedia) {
  const c = S.chats.get(id); if (!c || c.hidden) return toast('Les discussions privées ne peuvent pas être exportées.');
  toast('Préparation de l’export…');
  try {
    let list = S.msgs.get(id) || [];
    while (S.more.get(id) && list.length) { const r = await api(`/api/chats/${id}/messages?before=${list[0].id}`); for (const m of r.messages) { m._raw = JSON.stringify(m); await reveal(m); } list = r.messages.concat(list); S.msgs.set(id, list); S.more.set(id, r.more); }
    const files = [], lines = [], enc = new TextEncoder(); let n = 0, size = 0;
    const ext = m => m.kind === 'video' ? ((m.amime || '').includes('webm') ? 'webm' : 'mp4') : m.kind === 'audio' ? ((m.amime || '').includes('ogg') ? 'ogg' : (m.amime || '').includes('mp4') ? 'm4a' : 'webm') : 'jpg';
    for (const m of list) {
      if (m.kind === 'sys') { lines.push(`— ${m.text}`); continue; }
      const when = new Date(m.at).toLocaleString('fr-FR'), who = m.from === S.me.id ? S.me.name : uOf(m.from).name;
      if (m.deleted) { lines.push(`[${when}] ${who} : (message supprimé)`); continue; }
      if (m.once) { lines.push(`[${when}] ${who} : (vue unique, non exportée)`); continue; }
      let att = '';
      if (m.media && m.kind !== 'loc') {
        const fname = m.kind === 'doc' && m.fname ? `${String(++n).padStart(4, '0')}-${m.fname.replace(/[\\/:*?"<>|]/g, '_')}` : `${m.kind === 'video' ? 'VID' : m.kind === 'audio' ? 'AUD' : 'IMG'}-${String(++n).padStart(4, '0')}.${ext(m)}`;
        att = ` <pièce jointe : ${fname}>`;
        if (withMedia && m._key && m.miv && size < 400e6) { try { const r = await fetch(m.media, {credentials: 'same-origin'}); if (r.ok) { const b = new Uint8Array(await E2E.decBytes(m._key, m.miv, await r.arrayBuffer())); size += b.length; files.push({name: 'pieces-jointes/' + fname, data: b}); } } catch {} }
      }
      lines.push(`[${when}] ${who} : ${m.kind === 'loc' ? '(position partagée)' : (m.text || '')}${att}`);
    }
    const title = chatTitle(c), intro = `Discussion Tam-Tam : ${title}\nExportée le ${new Date().toLocaleString('fr-FR')} par ${S.me.name}\n\n`;
    files.unshift({name: 'discussion.txt', data: enc.encode(intro + lines.join('\n'))});
    const safe = title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) || 'discussion', zipName = `Tam-Tam - ${safe}.zip`;
    // Par e-mail : la messagerie (Gmail…) reçoit la discussion et les pièces jointes directement, sans rien enregistrer sur le téléphone.
    const typeOf = n => /\.txt$/.test(n) ? 'text/plain' : /\.jpe?g$/.test(n) ? 'image/jpeg' : /\.png$/.test(n) ? 'image/png' : /\.mp4$/.test(n) ? 'video/mp4' : /\.webm$/.test(n) ? (n.startsWith('AUD') ? 'audio/webm' : 'video/webm') : /\.m4a$/.test(n) ? 'audio/mp4' : /\.ogg$/.test(n) ? 'audio/ogg' : /\.pdf$/.test(n) ? 'application/pdf' : 'application/octet-stream';
    const all = files.map(f => { const n = f.name.split('/').pop(); return new File([f.data], f.name === 'discussion.txt' ? `Tam-Tam - ${safe}.txt` : n, {type: typeOf(n)}); });
    const can = !!(navigator.canShare && navigator.share), ok = can ? all.filter(f => { try { return navigator.canShare({files: [f]}); } catch { return false; } }) : [];
    S.exp = {files: ok, title: `Discussion Tam-Tam : ${title}`, text: `Discussion Tam-Tam « ${title} », exportée le ${new Date().toLocaleDateString('fr-FR')}.`, zip: Zip.make(files), zipName};
    const left = all.length - ok.length;
    sheet(`${head('Discussion prête')}<div class="sheet-body"><p class="hint">${ok.length ? `${ok.length} fichier${ok.length > 1 ? 's' : ''} prêt${ok.length > 1 ? 's' : ''}. Touchez « Envoyer par e-mail », puis choisissez <b>Gmail</b> (ou votre messagerie) : un brouillon s’ouvre avec tout en pièce jointe.${left ? ` ${left} document${left > 1 ? 's' : ''} d’un format non accepté par la messagerie ne ${left > 1 ? 'sont' : 'est'} pas joint${left > 1 ? 's' : ''}.` : ''}` : 'Cet appareil ne permet pas d’ouvrir la messagerie directement : vous pouvez récupérer le fichier ZIP.'}</p>
      <div class="actions">${ok.length ? '<button class="btn" type="button" data-act="exportSend">✉ Envoyer par e-mail</button>' : '<button class="btn" type="button" data-act="exportZip">Récupérer le fichier ZIP</button>'}</div></div>`, 'Export');
  } catch (e) { toast(e.message || 'Export impossible.'); }
}
/* Suivre la position d'un proche qui la partage avec moi (il l'a choisi dans ses réglages). */
let locT = null;
async function locFollow(uid) {
  const u = uOf(uid); clearInterval(locT);
  const draw = async () => {
    const box = $('#locBox'); if (!box) { clearInterval(locT); return; }
    try {
      const r = await api('/api/loc/' + uid); const o = r.env ? await E2E.open(r.env, S.me.id) : null, p = o && o.payload;
      if (!p) { box.innerHTML = `<p class="hint">${esc(first(u.name))} partage sa position avec vous, mais aucune position n’a encore été reçue. Elle arrive dès que Tam-Tam est ouvert sur son téléphone.</p>`; return; }
      const ago = Math.max(0, Math.round((Date.now() - p.t) / 60000)), q = `${(+p.lat).toFixed(6)},${(+p.lng).toFixed(6)}`;
      box.innerHTML = `<a class="locb live" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener"><span class="loc-pin" aria-hidden="true">📍</span><span><b>Ouvrir sur la carte</b><small>${ago < 1 ? 'À l’instant' : ago < 60 ? `Il y a ${ago} min` : `Il y a ${Math.round(ago / 60)} h`}${p.acc ? ` · précision ${p.acc < 1000 ? Math.round(p.acc) + ' m' : (p.acc / 1000).toFixed(1) + ' km'}` : ''}</small></span></a>
        <p class="hint">Mise à jour automatique toutes les 20 secondes, tant que cette fenêtre est ouverte.</p>`;
    } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
  sheet(`${head('Position de ' + esc(first(u.name)))}<div class="sheet-body" id="locBox"><p class="hint">Recherche de la position…</p></div>`, 'Position');
  await draw(); locT = setInterval(draw, 20000);
}
function msgMenu(id) {
  const list = S.msgs.get(S.chatId) || [], m = list.find(x => x.id === id); if (!m) return;
  document.querySelectorAll('#msgs .msg.menu-on').forEach(e => e.classList.remove('menu-on')); const row = document.querySelector(`#msgs .msg[data-mid="${id}"]`); if (row) queueMicrotask(() => { if (layer.innerHTML.trim() || document.getElementById('pop')) row.classList.add('menu-on'); });
  // Ordinateur : le menu s'ouvre dans une petite fenêtre en haut à droite de la discussion, sans cacher les messages.
  if (isDesk() && !(popFrom && Date.now() - popAt < 900)) { const a = document.querySelector('#chatHead .dotb'); if (a) { popFrom = a; popAt = Date.now(); popRect = a.getBoundingClientRect(); } }
  if (m.deleted) return sheet(`<div class="menu" style="padding-top:12px"><button type="button" class="danger" data-act="hideAsk" data-id="${id}">${I.trash}Supprimer pour moi</button></div>`, 'Message');
  const c = S.chats.get(S.chatId) || {}, modo = c.type === 'group' && c.admin && m.from !== S.me.id && (c.gset || {}).del === 'admins', canAll = (m.from === S.me.id && Date.now() - m.at < DEL_ALL_MAX) || modo, myR = (m.reacts || []).find(r => r.u === S.me.id);
  const canFwd = !m.once && !m.locked && !c.hidden && m.kind !== 'sys', pinned = c.pinMsg && c.pinMsg.id === m.id;
  sheet(`<div class="react-bar" role="group" aria-label="Réagir">${QUICK.map(e => `<button type="button" data-act="react" data-id="${id}" data-e="${e}" aria-pressed="${!!myR && myR.e === e}">${e}</button>`).join('')}<button type="button" class="more" data-act="reactMore" data-id="${id}" aria-label="Plus d’émoticônes">${I.plus}</button></div><div class="menu" style="padding-top:4px">${m.once ? '' : `<button type="button" data-act="reply" data-id="${id}">${I.reply}Répondre</button>`}${trMenu(m, id)}${m.text && !m.once && !(S.chats.get(S.chatId) || {}).hidden ? `<button type="button" data-act="copy" data-id="${id}">${I.copy}Copier le texte</button>` : ''}
    ${m.from === S.me.id && m.kind === 'text' && !m.media && !m.once && !m.locked && !m.fl && Date.now() - m.at < EDIT_MAX ? `<button type="button" data-act="editMsg" data-id="${id}"><span class="pin-ic" aria-hidden="true">✎</span>Modifier mon message</button>` : ''}
    ${canFwd ? `<button type="button" data-act="fwd" data-id="${id}">${FWD_IC}Transférer</button>` : ''}${canFwd && m.media && (m.kind === 'video' || !m.kind || m.kind === 'image' || m.kind === 'photo') ? `<button type="button" data-act="toStatus" data-id="${id}"><span class="pin-ic" aria-hidden="true">⭕</span>Mettre sur mon statut</button>` : ''}${!m.once ? `<button type="button" data-act="${pinned ? 'pinMsgOff' : 'pinMsg'}" data-id="${id}"><span class="pin-ic" aria-hidden="true">📌</span>${pinned ? 'Retirer l’épingle' : 'Épingler en haut de la discussion'}</button>` : ''}
    ${S.msel ? '' : `<button type="button" data-act="mselStart" data-id="${id}"><span class="pin-ic" aria-hidden="true">☑</span>Sélectionner</button>`}
    <button type="button" class="danger" data-act="hideAsk" data-id="${id}">${I.trash}Supprimer pour moi</button>
    ${canAll ? `<button type="button" class="danger" data-act="delAsk" data-id="${id}">${I.trash}Supprimer pour tout le monde${modo ? ' (administrateur)' : ''}</button>` : ''}</div>`, 'Message');
}

