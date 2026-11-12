/* tam-tam — Messages vocaux, taille réservée des photos/vidéos, aperçus flous, lecture et accusés de lecture.
   Extrait de app.js (nov. 2026) : fichier chargé après app.js, partage ses variables globales (S, api, toast…). */
'use strict';
/* ---------- messages vocaux ---------- */
const Rec = {
  async start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Ce navigateur ne permet pas d’enregistrer la voix.');
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}); } catch (e) { return micErr(e); }
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
      const up = await upMedia(sealed.blob);
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
  const kOther = c.type !== 'group' && (c.members.find(x => x.id !== S.me.id) || {}).id;
  if (kOther && KeyPin.changed.has(kOther)) h += `<div class="sys key-alert" role="alert">🔐 Le code de sécurité de ${esc(first(uOf(kOther).name))} a changé. C’est normal après un changement de téléphone ou une réinstallation de Tam-Tam ; sinon, comparez ensemble le code de sécurité affiché sur son profil. <button class="btn sm ghost" type="button" data-act="keyAck" data-id="${kOther}">J’ai compris</button></div>`;
  if (!list.length) h += `<div class="sys">Début de la discussion. Les messages sont visibles uniquement par ${c.type === 'group' ? 'les membres du groupe' : 'vous deux'}.</div>`;
  let pd = null, pf = null;
  for (const m of list) {
    const d = dayStart(m.at); if (d !== pd) { h += `<div class="day">${dayLabel(m.at)}</div>`; pd = d; pf = null; }
    if (m.kind === 'sys') { h += `<div class="sys">${esc(m.text)}</div>`; pf = null; continue; }
    const out = m.from === S.me.id, isFirst = m.from !== pf; pf = m.from;
    const u = uOf(m.from);
    let body;
    if (m.deleted) body = `<span class="txt gone">${m.delBy ? (m.delBy === S.me.id ? 'Vous avez supprimé ce message (administrateur)' : 'Supprimé par un administrateur') : out ? 'Vous avez supprimé ce message' : 'Ce message a été supprimé'}</span>`;
    else if (m.once) body = onceBubble(m, out);
    else if (m.kind === 'video') body = (m.replyTo ? quoteHtml(c, m.replyTo) : '') + `<div class="vidb"><video class="photo vid" data-vid="${m.id}" ${Dim.style(m, true)} playsinline muted preload="metadata" disablepictureinpicture controlslist="nodownload"${E2E.vids.has(m.id) ? ` src="${E2E.vids.get(m.id)}"` : ''}></video><button class="vid-play" type="button" data-act="zoomVid" data-id="${m.id}" aria-label="Lire la vidéo en grand"><span>▶</span></button>${m.dur ? `<small class="vid-d">${Math.floor(m.dur / 60)}:${String(m.dur % 60).padStart(2, '0')}</small>` : ''}</div>` + (m.text ? Tr.txt(m) : '');
    else if (m.fl) body = `<span class="flame-msg"><span class="fl-ic">🔥</span><b>${out ? 'Vous avez envoyé une flamme' : `${esc(first(u.name))} t’a envoyé une flamme`}</b></span>` + stQuote(m, out, c);
    else if (m.kind === 'loc') body = locHtml(m);
    else if (m.kind === 'doc') body = docHtml(m) + (m.text ? Tr.txt(m) : '');
    else if (m.kind === 'audio') body = stQuote(m, out, c) + `<div class="voice">${I.mic}<audio controls preload="metadata" data-aud="${m.id}"></audio>${m.dur ? `<small>${Math.floor(m.dur / 60)}:${String(m.dur % 60).padStart(2, '0')}</small>` : ''}</div>`;
    else body = stQuote(m, out, c) + (m.replyTo ? quoteHtml(c, m.replyTo) : '') + (m.media ? (m.enc ? `<img class="photo" data-enc="${m.id}" ${Dim.style(m)} alt="Photo chiffrée"${E2E.imgs.has(m.id) ? ` src="${E2E.imgs.get(m.id)}"` : ''} data-act="zoom">` : `<img class="photo" src="${esc(m.media)}" ${Dim.style(m)} alt="Photo" loading="lazy" data-act="zoom">`) : '') + (m.text ? Tr.txt(m) : '');
    h += `<div class="msg ${out ? 'out' : 'in'}${isFirst ? ' first' : ''}" data-mid="${m.id}"><div class="bubble${!m.deleted && !m.once && (m.kind === 'video' || (m.media && m.kind !== 'audio' && m.kind !== 'doc' && m.kind !== 'loc')) ? ' mb' : ''}${m.pending ? ' pending' + (m.text ? ' cap' : '') : ''}">${m.pending ? '<span class="pend-spin" role="status" aria-label="Envoi en cours"></span>' : ''}
      ${!out && c.type === 'group' && isFirst ? `<span class="who" style="--h:${(m.from * 67) % 360}">${esc(u.name)}</span>` : ''}${m.fwd ? `<span class="fwd">${FWD_IC}Transféré</span>` : ''}${body}<span class="meta">${!out && m.pc ? PC_IC : ''}${m.edited ? '<i class="edited">modifié</i> ' : ''}${hm(m.at)}${m.pending ? ' 🕓' : out && !m.deleted ? tick(readState(c, m)) : ''}</span>
      ${m.deleted || m.pending ? '' : `<button class="msg-more" type="button" data-act="msgMenu" data-id="${m.id}" aria-label="Options du message" title="Options : réagir, répondre, transférer, épingler…">${I.chev}</button>`}</div>${reactsHtml(m)}</div>`;
  }
  const tu = typingIn(c.id); if (tu) h += `<div class="msg in first typing-b"><div class="bubble" aria-label="En train d’écrire"><span class="dots"><i></i><i></i><i></i></span></div></div>`;
  morph(box, h);
  if (!keep || atBottom || box._stick) box.scrollTop = box.scrollHeight;
  hydrateImgs(c.id); hydrateAuds(c.id); if (typeof hydrateVids === 'function') hydrateVids(c.id); Tr.autoRun(c); Local.saveChat(c.id);
}
/* ---------- taille des photos et vidéos réservée à l'avance ----------
   Comme les grandes messageries : la place de chaque photo ou vidéo est connue avant son chargement
   (dimensions envoyées avec le message, ou mémorisées sur l'appareil au premier affichage).
   La discussion ne bouge donc plus quand une image ou une vidéo arrive. */
const Dim = {
  get(m) { if (m.w > 0 && m.h > 0) return [m.w, m.h]; try { const v = localStorage.getItem('tt-dim:' + m.id); if (v) { const [w, h] = v.split(',').map(Number); if (w > 0 && h > 0) return [w, h]; } } catch {} return null; },
  put(id, w, h) { if (!(w > 0 && h > 0)) return; try { localStorage.setItem('tt-dim:' + id, Math.round(w) + ',' + Math.round(h)); } catch {} },
  style(m, video) {
    const d = this.get(m), maxW = 260, maxH = video ? 360 : 340, [w, h] = d || (video ? [9, 16] : [4, 3]), k = Math.min(maxW / w, maxH / h);
    return `style="width:${Math.max(120, Math.round(w * k))}px;aspect-ratio:${w}/${h};height:auto;max-height:none${Thumb.ok(m.th) ? `;background:url(${m.th}) center/cover no-repeat` : ''}"`;
  },
};
// Aperçu flou : une image minuscule (moins d'1 Ko) glissée dans le message chiffré ; elle s'affiche dès l'arrivée du message.
const Thumb = {
  ok: t => typeof t === 'string' && t.length < 6000 && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(t),
  async make(bytes, mime) {
    const blob = new Blob([bytes], {type: mime || 'image/jpeg'}); let src, w, h, url;
    if (/^video\//.test(mime || '')) { url = URL.createObjectURL(blob); src = await new Promise((ok, ko) => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.onloadeddata = () => { v.currentTime = Math.min(0.3, (v.duration || 1) / 4); }; v.onseeked = () => ok(v); v.onerror = ko; setTimeout(() => ko(new Error('lent')), 4000); v.src = url; }); w = src.videoWidth; h = src.videoHeight; }
    else { if (!window.createImageBitmap) return null; src = await createImageBitmap(blob); w = src.width; h = src.height; }
    try { if (!(w && h)) return null; const k = 20 / Math.max(w, h), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k)); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); return cv.toDataURL('image/jpeg', .5); }
    finally { if (url) URL.revokeObjectURL(url); if (src && src.close) src.close(); }
  },
};
// Photos : WebP quand l'appareil sait le faire (25 à 35 % plus léger), sinon JPEG.
function encImg(cv, q) { return new Promise((ok, ko) => cv.toBlob(b => { if (b && b.type === 'image/webp') return ok(b); cv.toBlob(j => j ? ok(j) : ko(new Error('Photo illisible.')), 'image/jpeg', q); }, 'image/webp', q)); }
// Qualité d'envoi : standard (rapide, comme WhatsApp) ou HD ; l'économie de données passe avant.
const hdOn = () => { try { return localStorage.getItem('tt:hd') === '1' && !dataSaver(); } catch { return false; } };
async function dimsOf(bytes, mime) {
  const blob = new Blob([bytes], {type: mime || 'image/jpeg'});
  if (/^video\//.test(mime || '')) return new Promise(ok => { const v = document.createElement('video'), u = URL.createObjectURL(blob), done = d => { URL.revokeObjectURL(u); ok(d); }; v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => done(v.videoWidth ? [v.videoWidth, v.videoHeight] : null); v.onerror = () => done(null); setTimeout(() => done(null), 4000); v.src = u; });
  if (!window.createImageBitmap) return null; const b = await createImageBitmap(blob); const d = [b.width, b.height]; b.close && b.close(); return d;
}
if (typeof E2E !== 'undefined' && !E2E._dimWrap) {
  const seal0 = E2E.seal.bind(E2E); E2E._dimWrap = true;
  E2E.seal = async (payload, rec, bytes, ...rest) => {
    if (bytes && payload && typeof payload === 'object' && payload.w == null && !payload.name && !payload.loc && !/^audio\//.test(payload.mime || '')) { try { const d = await dimsOf(bytes, payload.mime); if (d) { payload.w = d[0]; payload.h = d[1]; } } catch {} }
    if (bytes && payload && typeof payload === 'object' && !payload.th && !payload.name && !payload.loc && !/^audio\//.test(payload.mime || '')) { try { const th = await Thumb.make(bytes, payload.mime); if (th) payload.th = th; } catch {} }
    return seal0(payload, rec, bytes, ...rest);
  };
}
// Au premier chargement, on note la vraie taille : les affichages suivants l'utilisent directement.
['load', 'loadedmetadata'].forEach(ev => document.addEventListener(ev, e => { const el = e.target; if (!el || !el.closest) return; const row = el.closest('#msgs .msg'); if (!row) return;
  const w = el.naturalWidth || el.videoWidth, h = el.naturalHeight || el.videoHeight; if (!(w && h)) return; const id = +row.dataset.mid; const m = (S.msgs.get(S.chatId) || []).find(x => x.id === id);
  if (m && !(m.w > 0)) { Dim.put(id, w, h); const st = Dim.style({id, w, h}, el.tagName === 'VIDEO'), mm = /width:(\d+)px;aspect-ratio:([\d.]+\/[\d.]+)/.exec(st); if (mm) { el.style.width = mm[1] + 'px'; el.style.aspectRatio = mm[2]; } } }, true));
// Redessiner la discussion sans recréer les messages qui n'ont pas changé : une photo ou une vidéo déjà chargée reste en place.
function morph(box, html) {
  const t = document.createElement('template'); t.innerHTML = html;
  const old = new Map(); for (const el of box.children) if (el._h) old.set(el.dataset.mid ? 'm' + el.dataset.mid : el._h, el);
  const next = [...t.content.children].map(el => { const h = el.outerHTML, k = el.dataset.mid ? 'm' + el.dataset.mid : h, o = old.get(k); if (o && o._h === h) { old.delete(k); return o; } el._h = h; return el; });
  const same = next.length === box.children.length && next.every((el, i) => box.children[i] === el);
  if (!same) box.replaceChildren(...next);
}
function onMsg(m, update) { if (m && !m._raw && m.id > 0) { try { m._raw = JSON.stringify(m); } catch {} } reveal(m).then(() => onMsgIn(m, update)); }
async function hydrateImgs(chatId) {
  const list = S.msgs.get(chatId) || [];
  for (const el of document.querySelectorAll('#msgs img[data-enc]:not([src])')) {
    const m = list.find(x => x.id === +el.dataset.enc); if (!m || !m._key || !m.miv) continue;
    try {
      const t0 = performance.now(); const r = await fetch(m.media, {credentials: 'same-origin'}); const buf = await r.arrayBuffer();
      const url = URL.createObjectURL(new Blob([await E2E.decBytes(m._key, m.miv, buf)], {type: 'image/jpeg'})); Perf.add('img', performance.now() - t0);
      E2E.imgs.set(m.id, url); Stock.note(m); const box = $('#msgs'), stick = box && box.scrollHeight - box.scrollTop - box.clientHeight < 80;
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
    if (m.at) Perf.add('recv', Date.now() - m.at);
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
  const last = list[list.length - 1].id; c.unread = 0; c.marked = false; const me = c.members.find(x => x.id === S.me.id); if (me) me.lastRead = Math.max(me.lastRead, last);
  clearTimeout(readT); readT = setTimeout(() => api(`/api/chats/${c.id}/read`, {upTo: last}).catch(() => {}), 300);
  renderTabs(); if (S.tab === 'chats') renderBody();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.chatId) markRead(); });
