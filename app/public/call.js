/* tam-tam — appels audio et vidéo à deux.
   Le son et l'image passent directement d'un appareil à l'autre, chiffrés (WebRTC) ;
   le serveur ne fait que transmettre la sonnerie et les informations de connexion. */
'use strict';
const Call = {
  c: null, // appel en cours
  rid: () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''),
  sig(type, extra = {}) { const c = this.c; if (!c) return Promise.resolve(); return api('/api/call/signal', {type, callId: c.id, chatId: c.chatId, to: c.peer, video: c.video, ...extra}).catch(() => {}); },

  async media(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Ce navigateur ne permet pas les appels. Essayez Chrome, Brave ou Safari à jour.');
    try { return await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}, video: video ? {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}} : false}); }
    catch (e) {
      if (video) { try { const s = await navigator.mediaDevices.getUserMedia({audio: true}); toast('Caméra indisponible : l’appel continue en audio.'); return s; } catch {} }
      throw new Error(e && e.name === 'NotAllowedError' ? 'Autorisez le micro' + (video ? ' et la caméra' : '') + ' pour tam-tam dans votre navigateur (icône à gauche de l’adresse), puis réessayez.' : 'Micro introuvable sur cet appareil.');
    }
  },

  /* ---------- appeler ---------- */
  async start(video) {
    const chat = S.chats.get(S.chatId); if (!chat || chat.type !== 'direct') return;
    if (this.c || GCall.c) return toast('Un appel est déjà en cours.');
    if (chat.blocked) return toast('Appel impossible : cette discussion est bloquée.');
    this.c = {id: this.rid(), chatId: chat.id, peer: chat.peer, video, out: true, state: 'calling', q: [], mic: true, cam: video};
    this.render();
    try { this.c.local = await this.media(video); } catch (e) { toast(e.message); return this.cleanup(); }
    if (!this.c) return this.stopTracks();
    this.c.cam = this.c.local.getVideoTracks().length > 0; this.render();
    const r = await api('/api/call/signal', {type: 'ring', callId: this.c.id, chatId: this.c.chatId, to: this.c.peer, video}).catch(e => ({err: e.message}));
    if (!this.c) return;
    if (r.err) { toast(r.err); return this.cleanup(); }
    this.c.pushed = !!r.pushed;
    this.c.state = 'ringing'; this.render(); this.tone('back');
    this.c.timer = setTimeout(() => { if (this.c && this.c.state === 'ringing') { this.sig('end', {log: {dur: 0}}); this.c.state = 'noanswer'; this.render(); setTimeout(() => this.cleanup(), 2200); } }, 45000);
  },

  /* ---------- signaux reçus ---------- */
  async onSignal(ev) {
    const c = this.c;
    if (ev.type === 'ring') {
      if (c || GCall.c) { api('/api/call/signal', {type: 'busy', callId: ev.callId, chatId: ev.chatId, to: ev.from, video: ev.video}).catch(() => {}); return; }
      this.c = {id: ev.callId, chatId: ev.chatId, peer: ev.from, video: ev.video, out: false, state: 'incoming', q: [], mic: true, cam: ev.video};
      this.render(); this.tone('ring'); this.notify(ev);
      this.c.timer = setTimeout(() => { if (this.c && this.c.state === 'incoming' && this.c.id === ev.callId) this.cleanup(); }, 50000);
      return;
    }
    if (!c || ev.callId !== c.id) return;
    if (ev.elsewhere) { if (c.state === 'incoming') { this.cleanup(); if (ev.type === 'accept') toast('Appel décroché sur un autre appareil.'); } return; }
    switch (ev.type) {
      case 'accept':
        clearTimeout(c.timer); this.tone(null); c.state = 'connecting'; this.render();
        await this.peer(); this.addTracks();
        await c.pc.setLocalDescription(await c.pc.createOffer());
        this.sig('offer', {data: c.pc.localDescription}); break;
      case 'offer':
        if (!c.pc) await this.peer();
        await c.pc.setRemoteDescription(ev.data); this.addTracks(); await this.flush();
        await c.pc.setLocalDescription(await c.pc.createAnswer());
        this.sig('answer', {data: c.pc.localDescription}); break;
      case 'answer': if (c.pc) { await c.pc.setRemoteDescription(ev.data); await this.flush(); } break;
      case 'ice': if (ev.data) { if (c.pc && c.pc.remoteDescription) c.pc.addIceCandidate(ev.data).catch(() => {}); else c.q.push(ev.data); } break;
      case 'media': c.peerCam = !!(ev.data && ev.data.cam); c.peerMic = !(ev.data && ev.data.mic === false); this.render(); break;
      case 'decline': case 'busy':
        clearTimeout(c.timer); this.tone(null); c.state = ev.type === 'busy' ? 'busy' : 'declined'; this.render();
        if (c.out) this.sig('end', {log: {dur: 0}});
        setTimeout(() => this.cleanup(), 2200); break;
      case 'end':
        if (c.state === 'incoming') { this.cleanup(); toast('Appel manqué de ' + first(uOf(c.peer).name)); }
        else { c.state = 'ended'; this.render(); setTimeout(() => this.cleanup(), 1200); }
        break;
    }
  },

  async accept() {
    const c = this.c; if (!c || c.state !== 'incoming') return;
    clearTimeout(c.timer); this.tone(null); c.state = 'connecting'; this.render();
    try { c.local = await this.media(c.video); } catch (e) { toast(e.message); this.sig('decline'); return this.cleanup(); }
    if (this.c !== c) return this.stopTracks(c.local);
    c.cam = c.local.getVideoTracks().length > 0; this.render();
    await this.peer(); this.sig('accept');
  },
  decline() { const c = this.c; if (!c) return; this.sig('decline'); this.cleanup(); },
  hangup() {
    const c = this.c; if (!c) return;
    const dur = c.since ? (Date.now() - c.since) / 1000 : 0;
    if (c.state === 'incoming') return this.decline();
    // le compte rendu (« Appel vocal · 2 min ») est écrit une seule fois, par la personne qui raccroche
    this.sig('end', c.since ? {log: {dur}} : c.out ? {log: {dur: 0}} : {});
    this.cleanup();
  },

  /* ---------- connexion directe ---------- */
  async peer() {
    const c = this.c; if (c.pc) return c.pc;
    if (!Call.iceCache || Date.now() - Call.iceAt > 6 * 3600e3) { try { Call.iceCache = (await api('/api/call/ice')).ice; Call.iceAt = Date.now(); } catch { Call.iceCache = [{urls: 'stun:stun.l.google.com:19302'}]; } }
    const pc = c.pc = new RTCPeerConnection({iceServers: Call.iceCache});
    pc.onicecandidate = e => { if (e.candidate && this.c === c) this.sig('ice', {data: e.candidate}); };
    pc.ontrack = e => { c.remote = e.streams[0] || new MediaStream([e.track]); this.attach(); };
    pc.onconnectionstatechange = () => {
      if (this.c !== c) return;
      if (pc.connectionState === 'connected') { if (!c.since) { c.since = Date.now(); c.tick = setInterval(() => this.clock(), 1000); } c.state = 'live'; c.lost && clearTimeout(c.lost); this.render(); this.sig('media', {data: {cam: c.cam, mic: c.mic}}); }
      else if (pc.connectionState === 'disconnected') { c.state = 'reconnecting'; this.render(); c.lost = setTimeout(() => { if (this.c === c && pc.connectionState !== 'connected') this.hangup(); }, 15000); }
      else if (pc.connectionState === 'failed') { toast('La connexion a échoué. Vérifiez votre réseau et rappelez.'); this.hangup(); }
    };
    return pc;
  },
  addTracks() { const c = this.c; if (!c || !c.local || c.added) return; c.added = true; c.local.getTracks().forEach(t => c.pc.addTrack(t, c.local)); },
  async flush() { const c = this.c; while (c && c.q.length) { try { await c.pc.addIceCandidate(c.q.shift()); } catch {} } },

  /* ---------- boutons pendant l'appel ---------- */
  toggleMic() { const c = this.c; if (!c || !c.local) return; c.mic = !c.mic; c.local.getAudioTracks().forEach(t => { t.enabled = c.mic; }); this.render(); this.sig('media', {data: {cam: c.cam, mic: c.mic}}); },
  async toggleCam() {
    const c = this.c; if (!c || !c.local) return;
    let v = c.local.getVideoTracks()[0];
    if (!v) { // passer d'un appel vocal à la vidéo
      try { const s = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}}); v = s.getVideoTracks()[0]; c.local.addTrack(v); if (c.pc) { c.pc.addTrack(v, c.local); await c.pc.setLocalDescription(await c.pc.createOffer()); this.sig('offer', {data: c.pc.localDescription}); } c.cam = true; }
      catch { return toast('Caméra indisponible.'); }
    } else { c.cam = !c.cam; v.enabled = c.cam; }
    this.render(); this.sig('media', {data: {cam: c.cam, mic: c.mic}});
  },
  async flip() {
    const c = this.c, v = c && c.local && c.local.getVideoTracks()[0]; if (!v || c.flipping) return;
    c.flipping = true; const back = c.front !== false; // on passe à l'arrière si on était devant
    // Sur la plupart des téléphones, il faut d'abord libérer la caméra en cours avant d'ouvrir l'autre.
    const oldId = v.getSettings ? v.getSettings().deviceId : null;
    c.local.removeTrack(v); v.stop();
    const tries = [{facingMode: {exact: back ? 'environment' : 'user'}}];
    try { const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      const want = cams.find(d => d.deviceId !== oldId && (back ? /back|rear|arri|environment/i : /front|avant|user|face/i).test(d.label)) || cams.find(d => d.deviceId && d.deviceId !== oldId);
      if (want) tries.push({deviceId: {exact: want.deviceId}}); } catch {}
    tries.push({facingMode: back ? 'environment' : 'user'});
    let nv = null;
    for (const t of tries) { try { nv = (await navigator.mediaDevices.getUserMedia({video: {...t, width: {ideal: 1280}, height: {ideal: 720}}})).getVideoTracks()[0]; if (nv) break; } catch {} }
    let ok = !!nv;
    if (!nv) { try { nv = (await navigator.mediaDevices.getUserMedia({video: oldId ? {deviceId: {exact: oldId}} : {facingMode: 'user'}})).getVideoTracks()[0]; } catch {} }
    if (nv) {
      const snd = c.pc && (c.pc.getSenders().find(x => x.track && x.track.kind === 'video') || c.pc.getSenders().find(x => !x.track));
      if (snd) await snd.replaceTrack(nv).catch(() => {});
      c.local.addTrack(nv);
      if (ok) c.front = !back;
      const l = document.getElementById('callLocal'); if (l) { l.srcObject = null; l.srcObject = c.local; l.play && l.play().catch(() => {}); l.classList.toggle('rear', c.front === false); }
    }
    c.flipping = false; this.render();
    if (!ok) toast('Ce téléphone ne permet pas de changer de caméra pendant l’appel.');
  },

  /* ---------- affichage ---------- */
  el() { let e = document.getElementById('call'); if (!e) { e = document.createElement('div'); e.id = 'call'; document.body.appendChild(e); } return e; },
  label() {
    const c = this.c; return {calling: 'Préparation de l’appel…', ringing: c.pushed ? 'Ça sonne sur son téléphone…' : 'Ça sonne…', incoming: c.video ? 'Appel vidéo entrant' : 'Appel vocal entrant', connecting: 'Connexion…',
      reconnecting: 'Connexion perdue, on réessaie…', live: '', declined: 'Appel refusé', busy: 'Déjà en ligne', noanswer: 'Pas de réponse', offline: 'Hors ligne : nous lui signalons votre appel', ended: 'Appel terminé'}[c.state] || '';
  },
  clock() { const c = this.c, el = document.getElementById('callTime'); if (!c || !el || !c.since) return; const s = Math.floor((Date.now() - c.since) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  render() {
    const c = this.c, root = this.el(); if (!c) { root.innerHTML = ''; root.hidden = true; document.body.classList.remove('in-call'); return; }
    const u = uOf(c.peer), showRemote = c.state === 'live' && c.remote && c.peerCam !== false && c.remote.getVideoTracks().length > 0, showLocal = c.cam && c.local && c.local.getVideoTracks().length;
    root.hidden = false; document.body.classList.add('in-call');
    root.className = 'call' + (showRemote ? ' has-video' : '');
    const btn = (act, icon, label, cls = '') => `<button class="cb ${cls}" type="button" data-act="${act}" aria-label="${label}">${icon}<span>${label}</span></button>`;
    root.innerHTML = `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel avec ${esc(u.name)}">
      <video id="callRemote" class="call-remote" autoplay playsinline${showRemote ? '' : ' hidden'}></video>
      <audio id="callAudio" autoplay></audio>
      ${showRemote ? '' : `<div class="call-who"><div class="call-av${c.state === 'ringing' || c.state === 'incoming' ? ' pulse' : ''}">${avatar(u, 'xl')}</div><h2>${esc(u.name)}</h2>
        <p id="callTime">${esc(this.label())}</p>${c.state === 'live' && c.peerMic === false ? '<p class="call-note">Micro coupé de son côté</p>' : ''}</div>`}
      ${showRemote ? `<div class="call-top"><b>${esc(u.name)}</b><span id="callTime"></span></div>` : ''}
      <video id="callLocal" class="call-local${c.front === false ? ' rear' : ''}" autoplay playsinline muted${showLocal ? '' : ' hidden'}></video>
      <div class="call-bar">${c.state === 'incoming'
        ? `${btn('callDecline', I.phone, 'Refuser', 'red down')}${btn('callAccept', c.video ? I.video : I.phone, 'Décrocher', 'green')}`
        : `${btn('callMic', I.mic, c.mic ? 'Micro' : 'Micro coupé', c.mic ? '' : 'off')}${btn('callCam', I.video, c.cam ? 'Caméra' : 'Caméra coupée', c.cam ? '' : 'off')}${showLocal ? btn('callFlip', I.camera, 'Retourner') : ''}${btn('callEnd', I.phone, 'Raccrocher', 'red down')}`}</div></div>`;
    this.attach(); this.clock();
  },
  attach() {
    const c = this.c; if (!c) return;
    const r = document.getElementById('callRemote'), a = document.getElementById('callAudio'), l = document.getElementById('callLocal');
    if (c.remote) { if (r && r.srcObject !== c.remote) r.srcObject = c.remote; if (a && a.srcObject !== c.remote) { a.srcObject = c.remote; a.play && a.play().catch(() => {}); } if (r) r.muted = true; }
    if (l && c.local && l.srcObject !== c.local) l.srcObject = c.local;
    if (c.state === 'live' && c.remote && c.remote.getVideoTracks().length && r && r.hidden && c.peerCam !== false) this.render();
  },

  /* ---------- sonnerie (sons générés, aucun fichier) ---------- */
  tone(kind) {
    clearInterval(this.toneT); this.toneT = null; if (this.toneP) { this.toneP.stop(); this.toneP = null; } if (!kind) return;
    // sonnerie d'appel entrant : celle choisie dans les réglages (tam-tam, balafon, kora, ma musique…)
    if (kind === 'ring' && typeof Tones !== 'undefined') { this.toneP = Tones.play(Tones.get('call'), {loop: true}); if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate([400, 250, 400]); } catch {} return; }
    Sound.unlock(); const ctx = Sound.ctx; if (!ctx) return;
    const T = (dt, f0, f1, d, v) => Sound.drum(ctx.currentTime + .02 + dt, f0, f1, d, v);
    // sonnerie d'appel : un rythme de tam-tam (grave, aigu, grave-grave, aigu, roulement)
    const ring = () => {
      T(0, 150, 75, .42, .7); T(.24, 320, 170, .16, .45); T(.40, 300, 160, .14, .4);
      T(.62, 150, 75, .42, .7); T(.86, 150, 78, .30, .55); T(1.06, 330, 175, .16, .45);
      T(1.30, 240, 120, .12, .35); T(1.40, 250, 125, .12, .38); T(1.50, 260, 130, .12, .42); T(1.62, 160, 80, .5, .75);
      if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate([400, 250, 400]); } catch {}
    };
    // tonalité côté appelant : deux coups doux, comme un tam-tam au loin
    const back = () => { T(0, 140, 80, .5, .28); T(.35, 140, 80, .5, .22); };
    const play = kind === 'ring' ? ring : back;
    play(); this.toneT = setInterval(play, kind === 'ring' ? 2800 : 3200);
  },
  notify(ev) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { const n = new Notification('tam-tam', {body: `${uOf(ev.from).name} vous appelle (${ev.video ? 'vidéo' : 'vocal'})`, tag: 'call-' + ev.callId, requireInteraction: true}); n.onclick = () => { window.focus(); n.close(); }; } catch {}
  },

  stopTracks(s) { (s || (this.c && this.c.local))?.getTracks().forEach(t => t.stop()); },
  cleanup() {
    const c = this.c; if (!c) return;
    clearTimeout(c.timer); clearInterval(c.tick); clearTimeout(c.lost); this.tone(null);
    this.stopTracks(c.local); try { c.pc && c.pc.close(); } catch {}
    this.c = null; this.render();
  },
};
// ouvert depuis la notification « touchez pour répondre » : on reprend la sonnerie en attente
Call.checkPending = async function () { if (this.c || GCall.c) return; try { const r = await api('/api/call/pending'); if (r.ev && !this.c) this.onSignal(r.ev); } catch {} };
window.addEventListener('beforeunload', () => { if (Call.c && Call.c.state !== 'incoming') Call.hangup(); });
Object.assign(ACT, {
  callAudio() { Call.start(false); }, callVideo() { Call.start(true); },
  callAccept() { Call.accept(); }, callDecline() { Call.decline(); }, callEnd() { Call.hangup(); },
  callMic() { Call.toggleMic(); }, callCam() { Call.toggleCam(); }, callFlip() { Call.flip(); },
});
