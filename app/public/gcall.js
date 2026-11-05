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
    this.c = {id: callId, chatId: r.chatId, video, local, mic: true, cam: local.getVideoTracks().length > 0, peers: new Map(), since: Date.now()};
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
  stopRing() { clearTimeout(this.ringT); clearInterval(this.toneT); this.toneT = null; },
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
    root.className = 'call gcall';
    root.innerHTML = `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel de groupe">
      <div class="g-top"><b>${esc(chat ? chat.name : 'Groupe')}</b><span><span id="gTime">0:00</span> · ${n} personne${n > 1 ? 's' : ''}</span></div>
      <div class="g-grid n${Math.min(n, 8)}">${this.tile(S.me.id, c.local, c.cam, c.mic, true)}${[...c.peers.values()].map(p => this.tile(p.uid, p.stream, p.cam, p.mic, false, p.state)).join('')}</div>
      ${n === 1 ? '<p class="g-wait">En attente des autres membres du groupe…</p>' : ''}
      <div class="call-bar">${btn('gcallMic', I.mic, c.mic ? 'Micro' : 'Micro coupé', c.mic ? '' : 'off')}${btn('gcallCam', I.video, c.cam ? 'Caméra' : 'Caméra coupée', c.cam ? '' : 'off')}${btn('gcallLeave', I.phone, 'Quitter', 'red down')}</div></div>`;
    root.querySelectorAll('video[data-v]').forEach(v => { const uid = +v.dataset.v; v.srcObject = uid === S.me.id ? c.local : c.peers.get(uid)?.stream || null; });
    root.querySelectorAll('audio[data-a]').forEach(a => { const p = c.peers.get(+a.dataset.a); if (p && p.stream) { a.srcObject = p.stream; a.play && a.play().catch(() => {}); } });
    this.clock();
  },
};
window.addEventListener('beforeunload', () => { if (GCall.c) GCall.leave(); });
Object.assign(ACT, {
  gcallVideo() { GCall.start(true); }, gcallAudio() { GCall.start(false); },
  gcallJoin(d) { GCall.join(d.id); }, gcallAccept() { GCall.accept(); }, gcallDecline() { GCall.dismiss(); },
  gcallMic() { GCall.toggleMic(); }, gcallCam() { GCall.toggleCam(); }, gcallLeave() { GCall.leave(); },
});
