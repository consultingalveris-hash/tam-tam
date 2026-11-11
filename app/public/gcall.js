/* tam-tam — appels de groupe (jusqu'à 8 personnes).
   Chaque participant est relié directement à chacun des autres ; le serveur tient seulement la liste des présents
   et transmet les informations de connexion. Le son et l'image ne passent pas par le serveur. */
'use strict';
function gcallBanner() {
  const list = [...(S.gcalls || new Map()).values()].filter(g => g.parts.length && !(GCall.c && GCall.c.id === g.callId));
  return list.map(g => { const c = S.chats.get(g.chatId); if (!c) return '';
    return `<div class="gban">${g.video ? I.video : I.phone}<div><b>Appel en cours · ${esc(c.name || 'Groupe')}</b><span>${g.parts.length} personne${g.parts.length > 1 ? 's' : ''} en ligne</span></div><button class="btn sm" type="button" data-act="gcallJoin" data-id="${g.callId}">Rejoindre</button></div>`; }).join('');
}
const GCall = {
  c: null, inc: null,
  sig(to, type, data) { const c = this.c; if (!c) return; api('/api/gcall/signal', {callId: c.id, to, type, data}).catch(() => {}); },
  async loadActive() { try { const r = await api('/api/gcall/active'); S.gcalls = new Map(r.calls.map(g => [g.chatId, g])); if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); } catch {} },
  active(chatId) { const g = S.gcalls && S.gcalls.get(chatId); return g && g.parts.length ? g : null; },
  busy() { return !!(this.c || Call.c); },

  async start(video) {
    const chat = S.chats.get(S.chatId); if (!chat || chat.type !== 'group') return;
    if (this.busy()) return toast('Un appel est déjà en cours.');
    const ex = this.active(chat.id); if (ex) return this.join(ex.callId);
    try { const r = await api('/api/gcall/start', {chatId: chat.id, video}); this.join(r.callId, video); } catch (e) { toast(e.message); }
  },
  async join(callId, video) {
    if (this.busy() && !(this.inc && this.inc.callId === callId)) return toast('Un appel est déjà en cours.');
    this.stopRing();
    const g = [...(S.gcalls || new Map()).values()].find(x => x.callId === callId); if (video === undefined) video = g ? g.video : true;
    let local;
    try { local = await this.media(video); } catch (e) { return toast(e.message); }
    let r; try { r = await api('/api/gcall/join', {callId}); } catch (e) { local.getTracks().forEach(t => t.stop()); return toast(e.message); }
    let lay = 'grid'; try { lay = localStorage.getItem('tt-glay') || 'grid'; } catch {}
    this.c = {id: callId, chatId: r.chatId, video, local, mic: true, cam: local.getVideoTracks().length > 0, peers: new Map(), since: Date.now(), lay, main: null, layMenu: false};
    this.c.tick = setInterval(() => this.clock(), 1000);
    this.render();
    for (const uid of r.parts) { const p = await this.peer(uid); await p.pc.setLocalDescription(await p.pc.createOffer()); this.sig(uid, 'offer', p.pc.localDescription); }
  },
  async media(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Ce navigateur ne permet pas les appels. Essayez Chrome, Brave ou Safari à jour.');
    const v = video ? {facingMode: 'user', width: {ideal: 640}, height: {ideal: 360}, frameRate: {max: 15}} : false;
    try { return await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: v}); }
    catch (e) {
      if (video) { try { const s = await navigator.mediaDevices.getUserMedia({audio: true}); toast('Caméra indisponible : vous participez en audio.'); return s; } catch {} }
      throw new Error(e && e.name === 'NotAllowedError' ? 'Autorisez le micro' + (video ? ' et la caméra' : '') + ' pour tam-tam dans votre navigateur, puis réessayez.' : 'Micro introuvable sur cet appareil.');
    }
  },
  async peer(uid) {
    const c = this.c; if (c.peers.has(uid)) return c.peers.get(uid);
    if (!Call.iceCache || Date.now() - (Call.iceAt || 0) > 6 * 3600e3) { try { Call.iceCache = (await api('/api/call/ice')).ice; Call.iceAt = Date.now(); } catch { Call.iceCache = [{urls: 'stun:stun.l.google.com:19302'}]; } }
    const pc = new RTCPeerConnection({iceServers: Call.iceCache}), p = {uid, pc, q: [], stream: null, cam: undefined, mic: true, state: 'connecting'};
    c.peers.set(uid, p);
    c.local.getTracks().forEach(t => pc.addTrack(t, c.local));
    pc.onicecandidate = e => { if (e.candidate && this.c === c) this.sig(uid, 'ice', e.candidate); };
    pc.ontrack = e => { p.stream = e.streams[0] || new MediaStream([e.track]); this.render(); };
    pc.onconnectionstatechange = () => {
      if (this.c !== c) return; p.state = pc.connectionState;
      if (p.state === 'connected') this.sig(uid, 'media', {cam: c.cam, mic: c.mic});
      if (p.state === 'failed') { this.drop(uid); }
      this.render();
    };
    this.render(); return p;
  },
  drop(uid) { const c = this.c, p = c && c.peers.get(uid); if (!p) return; try { p.pc.close(); } catch {} c.peers.delete(uid); this.render(); },
  async flush(p) { while (p.q.length) { try { await p.pc.addIceCandidate(p.q.shift()); } catch {} } },

  async onEvent(ev) {
    if (ev.type === 'state') {
      S.gcalls = S.gcalls || new Map();
      if (ev.parts.length) S.gcalls.set(ev.chatId, {callId: ev.callId, chatId: ev.chatId, video: ev.video, parts: ev.parts}); else S.gcalls.delete(ev.chatId);
      if (this.inc && this.inc.callId === ev.callId && !ev.parts.length) this.dismiss();
      if (S.tab === 'chats') renderBody(); if (S.chatId === ev.chatId) renderChatHead();
      return;
    }
    if (ev.type === 'ring') {
      if (this.busy()) { toast(`${first(uOf(ev.from).name)} lance un appel de groupe.`); return; }
      this.inc = ev; this.render(); this.ringT = setTimeout(() => this.dismiss(), 45000);
      Call.tone.call(this, 'ring'); return;
    }
    const c = this.c; if (!c || ev.callId !== c.id) return;
    if (ev.type === 'joined') { toast(`${first(uOf(ev.user).name)} a rejoint l’appel`); return; }
    if (ev.type === 'left') { this.drop(ev.user); return; }
    let p = c.peers.get(ev.from);
    if (ev.type === 'offer') {
      if (!p) p = await this.peer(ev.from);
      await p.pc.setRemoteDescription(ev.data); await this.flush(p);
      await p.pc.setLocalDescription(await p.pc.createAnswer()); this.sig(ev.from, 'answer', p.pc.localDescription);
    } else if (!p) return;
    else if (ev.type === 'answer') { await p.pc.setRemoteDescription(ev.data); await this.flush(p); }
    else if (ev.type === 'ice') { if (p.pc.remoteDescription) p.pc.addIceCandidate(ev.data).catch(() => {}); else p.q.push(ev.data); }
    else if (ev.type === 'media') { p.cam = !!(ev.data && ev.data.cam); p.mic = !(ev.data && ev.data.mic === false); this.render(); }
  },
  stopRing() { clearTimeout(this.ringT); Call.tone.call(this, null); },
  dismiss() { this.stopRing(); this.inc = null; this.render(); },
  accept() { const ev = this.inc; if (!ev) return; this.inc = null; this.join(ev.callId, ev.video); },

  leave() {
    const c = this.c; if (!c) return;
    api('/api/gcall/leave', {callId: c.id}).catch(() => {});
    clearInterval(c.tick); c.peers.forEach(p => { try { p.pc.close(); } catch {} }); c.local.getTracks().forEach(t => t.stop());
    this.c = null; this.render(); if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead();
  },
  toggleMic() { const c = this.c; if (!c) return; c.mic = !c.mic; c.local.getAudioTracks().forEach(t => { t.enabled = c.mic; }); c.peers.forEach((p, uid) => this.sig(uid, 'media', {cam: c.cam, mic: c.mic})); this.render(); },
  toggleCam() {
    const c = this.c; if (!c) return; const v = c.local.getVideoTracks()[0];
    if (!v) return toast('Pour la vidéo, quittez et rejoignez l’appel en vidéo.');
    c.cam = !c.cam; v.enabled = c.cam; c.peers.forEach((p, uid) => this.sig(uid, 'media', {cam: c.cam, mic: c.mic})); this.render();
  },

  /* ---------- affichage ---------- */
  el() { let e = document.getElementById('gcall'); if (!e) { e = document.createElement('div'); e.id = 'gcall'; document.body.appendChild(e); } return e; },
  clock() { const c = this.c, el = document.getElementById('gTime'); if (!c || !el) return; const s = Math.floor((Date.now() - c.since) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  tile(uid, stream, cam, mic, me, state) {
    const u = me ? S.me : uOf(uid), vid = stream && cam !== false && stream.getVideoTracks().length;
    return `<div class="gt${me ? ' me' : ''}" data-uid="${uid}">${vid ? `<video autoplay playsinline${me ? ' muted' : ''} data-v="${uid}"></video>` : `<div class="gt-av">${avatar(u, 'xl')}</div>`}
      ${!me ? `<audio autoplay data-a="${uid}"></audio>` : ''}
      <span class="gt-name">${mic === false ? '🔇 ' : ''}${esc(me ? 'Vous' : first(u.name))}${state && state !== 'connected' ? ' · connexion…' : ''}</span></div>`;
  },
  // Appui long sur une petite caméra, puis glisser sur la grande : elles échangent leur place.
  dragInit(root) {
    const c = this.c, main = root.querySelector('.g-main');
    root.querySelectorAll('.g-secs .gt:not(.wait)').forEach(el => {
      let t = null, ghost = null, sx = 0, sy = 0;
      const end = (e, drop) => { clearTimeout(t); t = null; if (!ghost) return; const r = main.getBoundingClientRect(), x = e.clientX, y = e.clientY; ghost.remove(); ghost = null; el.classList.remove('lift'); main.classList.remove('drop');
        if (drop && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { c.main = +el.dataset.uid; this.render(); } };
      el.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; el.setPointerCapture(e.pointerId);
        t = setTimeout(() => { t = null; ghost = el.cloneNode(true); ghost.querySelectorAll('video,audio').forEach(v => v.remove()); ghost.classList.add('g-ghost'); const r = el.getBoundingClientRect(); ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px'; ghost.style.left = (sx - r.width / 2) + 'px'; ghost.style.top = (sy - r.height / 2) + 'px'; root.appendChild(ghost); el.classList.add('lift'); if (navigator.vibrate) try { navigator.vibrate(30); } catch {} }, 450); });
      el.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) { clearTimeout(t); t = null; } if (!ghost) return; e.preventDefault(); ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + 'px'; ghost.style.top = (e.clientY - ghost.offsetHeight / 2) + 'px'; const r = main.getBoundingClientRect(); main.classList.toggle('drop', e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom); });
      el.addEventListener('pointerup', e => end(e, true)); el.addEventListener('pointercancel', e => end(e, false));
      el.addEventListener('contextmenu', e => e.preventDefault());
    });
  },
  render() {
    const root = this.el(), c = this.c, ev = this.inc;
    if (!c && !ev) { root.innerHTML = ''; root.hidden = true; if (!Call.c) document.body.classList.remove('in-call'); return; }
    root.hidden = false; document.body.classList.add('in-call');
    const btn = (act, icon, label, cls = '') => `<button class="cb ${cls}" type="button" data-act="${act}" aria-label="${label}">${icon}<span>${label}</span></button>`;
    if (!c) {
      const chat = S.chats.get(ev.chatId);
      root.className = 'call';
      root.innerHTML = `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel de groupe"><div class="call-who"><div class="call-av pulse">${chat ? grpAv(chat, 'xl') : avatar(uOf(ev.from), 'xl')}</div><h2>${esc(chat ? chat.name : 'Groupe')}</h2><p>${esc(first(uOf(ev.from).name))} lance un appel ${ev.video ? 'vidéo' : 'vocal'} de groupe</p></div>
        <div class="call-bar">${btn('gcallDecline', I.phone, 'Ignorer', 'red down')}${btn('gcallAccept', ev.video ? I.video : I.phone, 'Rejoindre', 'green')}</div></div>`;
      return;
    }
    const chat = S.chats.get(c.chatId), n = c.peers.size + 1;
    // Membres pas encore arrivés : leur photo de profil sous les caméras.
    const here = new Set([S.me.id, ...c.peers.keys()]), waiting = chat ? (chat.members || []).map(m => m.id).filter(id => !here.has(id)) : [];
    const ids = [S.me.id, ...c.peers.keys()];
    if (!ids.includes(c.main)) c.main = ids.find(id => id !== S.me.id) || S.me.id;
    // Les membres qui n'ont pas encore décroché ont déjà leur case (photo de profil) ; ils prennent leur place à leur arrivée.
    const W = uid => `<div class="gt wait" data-uid="${uid}"><div class="gt-av">${avatar(uOf(uid), 'xl')}</div><span class="gt-name">${esc(first(uOf(uid).name))} · appel…</span></div>`;
    const T = uid => uid === S.me.id ? this.tile(S.me.id, c.local, c.cam, c.mic, true) : c.peers.has(uid) ? (p => this.tile(p.uid, p.stream, p.cam, p.mic, false, p.state))(c.peers.get(uid)) : W(uid);
    const all = ids.concat(waiting.slice(0, 7)), lay = all.length > 1 ? c.lay : 'grid', tot = all.length;
    const stage = lay === 'grid'
      ? `<div class="g-grid n${Math.min(tot, 8)}">${all.map(T).join('')}</div>`
      : `<div class="g-stage l-${lay}"><div class="g-main">${T(c.main)}</div><div class="g-secs">${all.filter(id => id !== c.main).map(T).join('')}</div></div>`;
    const LAYS = [['grid', 'Équilibré', 'Toutes les caméras de la même taille'], ['side', 'Principale à gauche', 'Une grande caméra, les autres à droite'], ['top', 'Principale en haut', 'Une grande caméra, les autres en dessous']];
    root.className = 'call gcall';
    root.innerHTML = `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel de groupe">
      <div class="g-top"><b>${esc(chat ? chat.name : 'Groupe')}</b><span><span id="gTime">0:00</span> · ${n} personne${n > 1 ? 's' : ''}</span></div>
      ${stage}
      ${lay !== 'grid' ? '<p class="g-hint">Appui long sur une petite caméra, puis glissez-la sur la grande pour les échanger.</p>' : ''}
      ${n === 1 ? '<p class="g-wait">En attente des autres membres du groupe…</p>' : ''}
      ${c.layMenu ? `<div class="g-laymenu" role="menu" aria-label="Disposition des caméras">${LAYS.map(([k, l, h]) => `<button type="button" role="menuitemradio" aria-checked="${c.lay === k}" data-act="gcallLaySet" data-k="${k}"><span class="g-ico ${k}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>${l}</b><small>${h}</small></button>`).join('')}</div>` : ''}
      <div class="call-bar"><button class="cb lay-dot" type="button" data-act="gcallLay" aria-label="Disposition des caméras" aria-expanded="${!!c.layMenu}"><i aria-hidden="true"></i><span>Disposition</span></button>${btn('gcallMic', I.mic, c.mic ? 'Micro' : 'Micro coupé', c.mic ? '' : 'off')}${btn('gcallCam', I.video, c.cam ? 'Caméra' : 'Caméra coupée', c.cam ? '' : 'off')}${btn('gcallLeave', I.phone, 'Quitter', 'red down')}</div></div>`;
    if (lay !== 'grid') this.dragInit(root);
    root.querySelectorAll('video[data-v]').forEach(v => { const uid = +v.dataset.v; v.srcObject = uid === S.me.id ? c.local : c.peers.get(uid)?.stream || null; });
    root.querySelectorAll('audio[data-a]').forEach(a => { const p = c.peers.get(+a.dataset.a); if (p && p.stream) { a.srcObject = p.stream; a.play && a.play().catch(() => {}); } });
    this.clock();
  },
};
window.addEventListener('beforeunload', () => { if (GCall.c) GCall.leave(); });
Object.assign(ACT, {
  gcallVideo() { GCall.start(true); }, gcallAudio() { GCall.start(false); },
  gcallJoin(d) { GCall.join(d.id); }, gcallAccept() { GCall.accept(); }, gcallDecline() { GCall.dismiss(); },
  gcallMic() { GCall.toggleMic(); },
  gcallLay() { const c = GCall.c; if (!c) return; c.layMenu = !c.layMenu; GCall.render(); },
  gcallLaySet(d) { const c = GCall.c; if (!c) return; c.lay = d.k; c.layMenu = false; try { localStorage.setItem('tt-glay', d.k); } catch {} GCall.render(); }, gcallCam() { GCall.toggleCam(); }, gcallLeave() { GCall.leave(); },
});
