/* tam-tam — appels audio et vidéo à deux.
   Le son et l'image passent directement d'un appareil à l'autre, chiffrés (WebRTC) ;
   le serveur ne fait que transmettre la sonnerie et les informations de connexion. */
'use strict';
/* Appels sur réseau faible (3G, coupures) : le son passe en priorité ; l'image baisse en netteté et en fluidité
   selon le débit réellement disponible, puis remonte quand le réseau s'améliore. */
const NetAdapt = {
  TIERS: [{min: 3_000_000, br: 2_500_000, gbr: 900_000, sc: 1, fps: 30, gfps: 24}, {min: 1_500_000, br: 1_400_000, gbr: 500_000, sc: 1, fps: 30, gfps: 15}, {min: 600_000, br: 600_000, gbr: 300_000, sc: 1.5, fps: 24, gfps: 15}, {min: 250_000, br: 250_000, gbr: 150_000, sc: 2.5, fps: 15, gfps: 10}, {min: 0, br: 100_000, gbr: 80_000, sc: 4, fps: 8, gfps: 8}],
  async apply(pc, t, group) {
    for (const s of pc.getSenders()) { if (!s.track) continue; try { const p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      if (s.track.kind === 'audio') { p.encodings[0].priority = 'high'; p.encodings[0].networkPriority = 'high'; p.encodings[0].maxBitrate = t.min < 250_000 ? 24_000 : 40_000; }
      else { p.degradationPreference = 'balanced'; p.encodings[0].maxBitrate = group ? t.gbr : t.br; p.encodings[0].scaleResolutionDownBy = t.sc; p.encodings[0].maxFramerate = group ? t.gfps : t.fps; p.encodings[0].priority = 'low'; }
      await s.setParameters(p); } catch {} }
  },
  // Toutes les 4 secondes : débit disponible et pertes ; on change de palier au plus toutes les 8 secondes.
  watch(pc, group, onTier) {
    const st = {tier: -1, at: 0, lostP: 0, sentP: 0};
    const tick = async () => {
      if (pc.connectionState === 'closed') return clearInterval(st.iv);
      let bw = 0, loss = 0;
      try { const r = await pc.getStats(); st.q = callQ(r); r.forEach(x => {
        if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded' && x.availableOutgoingBitrate) bw = Math.max(bw, x.availableOutgoingBitrate);
        if (x.type === 'remote-inbound-rtp' && x.kind === 'video' && x.fractionLost != null) loss = Math.max(loss, x.fractionLost);
        if (x.type === 'remote-inbound-rtp' && x.kind === 'audio' && x.fractionLost != null) loss = Math.max(loss, x.fractionLost * 1.5);
      }); } catch { return; }
      if (!bw) return; let i = this.TIERS.findIndex(t => bw >= t.min); const last = this.TIERS.length - 1; if (loss > 0.12) i = Math.min(last, i + 2); else if (loss > 0.05) i = Math.min(last, i + 1);
      const now = Date.now(); if (i === st.tier || (now - st.at < 8000 && st.tier >= 0 && i < st.tier)) return;
      st.tier = i; st.at = now; await this.apply(pc, this.TIERS[i], group); if (onTier) onTier(i, bw, loss);
    };
    st.iv = setInterval(tick, 4000); setTimeout(tick, 1500); const stop = () => clearInterval(st.iv); stop.st = st; return stop;
  },
};
// Qualité d'un appel (pour l'état du serveur, aucun contenu) : passé par le relais ou non, aller-retour, pertes, images par seconde.
function callQ(r) {
  const q = {relais: false, rtt: null, perte: null, ips: null}; let pair = null, lost = 0, got = 0;
  r.forEach(x => { if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') pair = x;
    if (x.type === 'inbound-rtp') { lost += x.packetsLost || 0; got += x.packetsReceived || 0; if (x.kind === 'video' && x.framesPerSecond != null) q.ips = x.framesPerSecond; } });
  if (pair) { if (pair.currentRoundTripTime != null) q.rtt = Math.round(pair.currentRoundTripTime * 1000); const lc = r.get(pair.localCandidateId), rc = r.get(pair.remoteCandidateId); q.relais = !!((lc && lc.candidateType === 'relay') || (rc && rc.candidateType === 'relay')); }
  if (got + lost > 0) q.perte = Math.round(lost / (got + lost) * 1000) / 1000;
  return q;
}
function callQSend(net, dur, video, groupe) {
  const q = net && net.st && net.st.q; if (!q || !dur || dur < 5) return;
  api('/api/call/qualite', {dur: Math.round(dur), rtt: q.rtt, perte: q.perte, relais: q.relais, ips: q.ips, video: !!video, groupe: !!groupe}, {keep: true}).catch(() => {});
}
const Call = {
  c: null, // appel en cours
  rid: () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''),
  sig(type, extra = {}) { const c = this.c; if (!c) return Promise.resolve(); return api('/api/call/signal', {type, callId: c.id, chatId: c.chatId, to: c.peer, video: c.video, ...extra}, {keep: type === 'end'}).catch(() => {}); },

  async media(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Ce navigateur ne permet pas les appels. Essayez Chrome, Brave ou Safari à jour.');
    try { return Beauty.stream(await getAV(video ? {facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}, frameRate: {ideal: 30}} : false)); }
    catch (e) {
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
      if ((c && !this.over()) || GCall.c) { api('/api/call/signal', {type: 'busy', callId: ev.callId, chatId: ev.chatId, to: ev.from, video: ev.video}).catch(() => {}); return; }
      if (c) this.cleanup();
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
      case 'move': this.moved(ev); break;
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
    const pc = c.pc = new RTCPeerConnection({iceServers: Call.iceCache}); c.pcAt = performance.now();
    pc.onicecandidate = e => { if (e.candidate && this.c === c) this.sig('ice', {data: e.candidate}); };
    pc.ontrack = e => { c.remote = e.streams[0] || new MediaStream([e.track]); this.attach(); };
    pc.onconnectionstatechange = () => {
      if (this.c !== c) return;
      if (pc.connectionState === 'connected') { if (!c.since && c.pcAt) Perf.add('call', performance.now() - c.pcAt); if (!c.net) c.net = NetAdapt.watch(pc, false, i => { const w = i >= NetAdapt.TIERS.length - 1; if (w !== !!c.weak) { c.weak = w; if (this.c === c) this.render(); } }); if (!c.since) { Spk.start(c.video); c.since = Date.now(); c.tick = setInterval(() => this.clock(), 1000); } c.state = 'live'; c.lost && clearTimeout(c.lost); this.render(); this.sig('media', {data: {cam: c.cam, mic: c.mic}}); }
      else if (pc.connectionState === 'disconnected') { c.state = 'reconnecting'; this.render(); clearTimeout(c.lost); c.lost = setTimeout(() => { if (this.c === c && pc.connectionState !== 'connected') { toast('Appel coupé : la connexion avec l’autre personne est perdue.'); this.hangup(); } }, 8000); }
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
      try { const t = await camTrack(); if (!t || this.c !== c) { if (t) t.stop(); return; } v = Beauty.track(t); c.local.addTrack(v); if (c.pc) { c.pc.addTrack(v, c.local); await c.pc.setLocalDescription(await c.pc.createOffer()); this.sig('offer', {data: c.pc.localDescription}); } c.cam = true; }
      catch { return toast('Caméra indisponible.'); }
    } else { c.cam = !c.cam; v.enabled = c.cam; }
    this.render(); this.sig('media', {data: {cam: c.cam, mic: c.mic}});
  },
  async flip() {
    const c = this.c, v = c && c.local && c.local.getVideoTracks()[0]; if (!v || c.flipping) return;
    c.flipping = true; const back = c.front !== false; // on passe à l'arrière si on était devant
    // Sur la plupart des téléphones, il faut d'abord libérer la caméra en cours avant d'ouvrir l'autre.
    const vr = Beauty.rawOf(v), oldId = vr.getSettings ? vr.getSettings().deviceId : null;
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
      nv = Beauty.track(nv);
      const snd = c.pc && (c.pc.getSenders().find(x => x.track && x.track.kind === 'video') || c.pc.getSenders().find(x => !x.track));
      if (snd) await snd.replaceTrack(nv).catch(() => {});
      c.local.addTrack(nv);
      if (ok) c.front = !back;
      const l = document.getElementById('callLocal'); if (l) { l.srcObject = null; playOn(l, c.local); l.classList.toggle('rear', c.front === false); }
    }
    c.flipping = false; this.render();
    if (!ok) toast('Ce téléphone ne permet pas de changer de caméra pendant l’appel.');
  },

  /* ---------- ajouter quelqu'un : l'appel à deux devient un appel de groupe ---------- */
  // appel en train de se fermer (« Appel terminé » affiché un instant) : ne bloque pas un nouvel appel
  over() { return !!this.c && ['ended', 'declined', 'busy', 'noanswer'].includes(this.c.state); },
  pickList() { const c = this.c, list = ((S.contacts && S.contacts.contacts) || []).map(u => u.id).filter(id => id !== c.peer && id !== S.me.id); return [['Vos contacts', list]]; },
  async addPerson(uid) {
    const c = this.c; if (!c || c.state !== 'live' || c.moving) return;
    c.addMenu = false;
    if (!((S.contacts && S.contacts.contacts) || []).some(u => u.id === c.peer)) { this.render(); return toast('Pour ajouter quelqu’un, la personne en ligne doit être dans vos contacts.'); }
    c.moving = true; this.render(); toast('Passage en appel de groupe…');
    let chat, g;
    try {
      const r = await api('/api/chats/group', {name: `Appel · ${first(uOf(c.peer).name)}, ${first(uOf(uid).name)}`.slice(0, 50), members: [c.peer, uid]});
      keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat); chat = r.chat;
      g = await api('/api/gcall/start', {chatId: chat.id, video: c.video});
    } catch (e) { c.moving = false; this.render(); return toast(e.message); }
    if (this.c !== c) return;
    await this.sig('move', {data: {callId: g.callId, chatId: chat.id}});
    await this.sig('end', {log: {dur: c.since ? (Date.now() - c.since) / 1000 : 0}});
    const video = c.video; this.cleanup();
    renderTabs(); if (S.tab === 'chats') renderBody();
    GCall.join(g.callId, video);
  },
  // l'autre personne a ajouté quelqu'un : on la suit dans l'appel de groupe
  async moved(ev) {
    const c = this.c; if (!c || ev.from !== c.peer || !ev.data || typeof ev.data.callId !== 'string') return;
    const video = c.video; c.moving = true; this.cleanup();
    try { await loadChats(); } catch {}
    if (GCall.inc && GCall.inc.callId === ev.data.callId) GCall.stopRing(), GCall.inc = null;
    GCall.join(ev.data.callId, video);
  },

  /* ---------- affichage ---------- */
  el() { let e = document.getElementById('call'); if (!e) { e = document.createElement('div'); e.id = 'call'; document.body.appendChild(e); } return e; },
  label() {
    const c = this.c; return {calling: 'Préparation de l’appel…', ringing: c.pushed ? 'Ça sonne sur son téléphone…' : 'Ça sonne…', incoming: c.video ? 'Appel vidéo entrant' : 'Appel vocal entrant', connecting: 'Connexion…',
      reconnecting: 'Connexion perdue, on réessaie…', live: '', declined: 'Appel refusé', busy: 'Déjà en ligne', noanswer: 'Pas de réponse', offline: 'Hors ligne : nous lui signalons votre appel', ended: 'Appel terminé'}[c.state] || '';
  },
  clock() { const c = this.c, el = document.getElementById('callTime'); if (!c || !el || !c.since) return; const s = Math.floor((Date.now() - c.since) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  render() {
    const c = this.c, root = this.el(); if (!c) { root.innerHTML = ''; root.hidden = true; if (!GCall.c && !GCall.inc) document.body.classList.remove('in-call'); return; }
    const u = uOf(c.peer), showRemote = c.state === 'live' && c.remote && c.peerCam !== false && c.remote.getVideoTracks().length > 0, showLocal = c.cam && c.local && c.local.getVideoTracks().length;
    root.hidden = false; document.body.classList.add('in-call'); noKeyboard();
    root.className = 'call' + (showRemote ? ' has-video' : '') + (c.fxMenu && showLocal ? ' fx-open' : '');
    const btn = (act, icon, label, cls = '') => `<button class="cb ${cls}" type="button" data-act="${act}" aria-label="${label}">${icon}<span>${label}</span></button>`;
    keepMedia(root, `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel avec ${esc(u.name)}">
      <video id="callRemote" data-k="remote" class="call-remote" autoplay playsinline muted${showRemote ? '' : ' hidden'}></video>
      <audio id="callAudio" data-k="audio" autoplay></audio>
      ${showRemote ? '' : `<div class="call-who"><div class="call-av${c.state === 'ringing' || c.state === 'incoming' ? ' pulse' : ''}">${avatar(u, 'xl')}</div><h2>${esc(u.name)}</h2>
        <p id="callTime">${esc(this.label())}</p>${c.state === 'live' && c.peerMic === false ? '<p class="call-note">Micro coupé de son côté</p>' : ''}</div>`}
      ${c.weak && c.state === 'live' ? '<div class="call-weak" role="status">📶 Réseau faible : image réduite pour garder un son clair</div>' : ''}
      ${showRemote ? `<div class="call-top"><b>${esc(u.name)}</b><span id="callTime"></span></div>` : ''}
      <video id="callLocal" data-k="local" class="call-local${c.front === false ? ' rear' : ''}" autoplay playsinline muted${showLocal ? '' : ' hidden'}></video>
      <div class="call-bar"${c.state === 'incoming' ? '' : ' hidden'}>${c.state === 'incoming'
        ? `${btn('callDecline', I.phone, 'Refuser', 'red down')}${btn('callAccept', c.video ? I.video : I.phone, 'Décrocher', 'green')}`
        : ''}</div>${c.state === 'incoming' ? '' : callSide({add: c.state === 'live', mic: c.mic, cam: c.cam, flip: showLocal, fx: showLocal, end: 'callEnd', pre: 'call'})}${c.addMenu ? callPick(this.pickList()) : ''}${c.fxMenu && showLocal ? fxPick('call') : ''}</div>`);
    this.attach(); this.clock(); pipInit(document.getElementById('callLocal'));
  },
  attach() {
    const c = this.c; if (!c) return;
    const r = document.getElementById('callRemote'), a = document.getElementById('callAudio'), l = document.getElementById('callLocal');
    if (c.remote) { if (r) r.muted = true; playOn(r, c.remote); playOn(a, c.remote); }
    if (l && c.local) playOn(l, c.local);
    Spk.apply();
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
    clearTimeout(c.timer); clearInterval(c.tick); clearTimeout(c.lost); if (c.net) { callQSend(c.net, c.since ? (Date.now() - c.since) / 1000 : 0, c.cam || c.peerCam, false); c.net(); } this.tone(null);
    this.stopTracks(c.local); try { c.pc && c.pc.close(); } catch {}
    if (c.since) Spk.stop();
    this.c = null; this.render();
  },
};
// ouvert depuis la notification « touchez pour répondre » : on reprend la sonnerie en attente
Call.checkPending = async function () { if (this.c || GCall.c) return; try { const r = await api('/api/call/pending'); if (r.ev && !this.c) this.onSignal(r.ev); } catch {} };
// Page fermée ou application quittée : on raccroche vraiment (requête qui part même si la page se ferme).
const callBye = () => { if (Call.c && Call.c.state !== 'incoming') Call.hangup(); if (GCall.c) GCall.leave(); };
window.addEventListener('pagehide', callBye); window.addEventListener('beforeunload', callBye);

/* Haut-parleur : dans l'application Android, le pont bascule vraiment la sortie du son ;
   dans le navigateur, on choisit la sortie quand le navigateur le permet (setSinkId). */
const Spk = {
  on: false, sink: '',
  nat() { try { return !!(window.TamTamAndroid && window.TamTamAndroid.version() >= 4); } catch { return false; } },
  start(video) { this.on = !!video; this.sink = ''; if (this.nat()) try { window.TamTamAndroid.speaker(this.on); } catch {} },
  stop() { this.on = false; this.sink = ''; if (this.nat()) try { window.TamTamAndroid.callOver(); } catch {} },
  apply(root) { if (!this.sink) return; (root || document).querySelectorAll('#call audio, #gcall audio, audio[data-a]').forEach(a => { if (a.setSinkId && a.sinkId !== this.sink) a.setSinkId(this.sink).catch(() => {}); }); },
  async toggle() {
    const want = !this.on;
    if (this.nat()) { try { window.TamTamAndroid.speaker(want); this.on = want; } catch {} return true; }
    if (!('setSinkId' in HTMLMediaElement.prototype)) return false;
    let outs = [];
    try { outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput' && d.deviceId); } catch {}
    const spk = outs.find(d => /speaker|haut-parleur|haut parleur|loud/i.test(d.label));
    const ear = outs.find(d => d !== spk && !/^(default|communications)$/.test(d.deviceId));
    const id = want ? (spk && spk.deviceId) : (ear ? ear.deviceId : 'default');
    if (!id) return false;
    this.sink = id; this.on = want; this.apply(); return true;
  },
};
async function spkToggle(redraw) {
  const ok = await Spk.toggle();
  if (!ok) { toast('Dans le navigateur, c’est le téléphone qui choisit où va le son (casque ou écouteurs s’ils sont branchés, sinon haut-parleur). Pour choisir vous-même, utilisez l’application Tam-Tam de Google Play.', 7000); return; }
  toast(Spk.on ? 'Haut-parleur activé' : 'Haut-parleur coupé'); redraw();
}
// Micro + caméra. Si la caméra ne s'ouvre pas avec les réglages demandés, on réessaie plus simplement ;
// si elle est occupée (autre onglet, autre application) ou refusée, l'appel continue en audio et on dit pourquoi.
async function getAV(v) {
  const audio = {echoCancellation: true, noiseSuppression: true}, gum = c => navigator.mediaDevices.getUserMedia(c);
  if (!v) return gum({audio, video: false});
  let err;
  for (const video of [v, {facingMode: 'user'}, true]) { try { return await gum({audio, video}); } catch (e) { err = e; if (e && e.name === 'NotAllowedError') break; } }
  const s = await gum({audio});
  camWhy(err);
  return s;
}
// Ouvrir la caméra en cours d'appel (appel commencé sans image) : plusieurs essais, puis la raison si elle refuse.
async function camTrack() {
  let err;
  for (const video of [{facingMode: 'user', width: {ideal: 1280}, height: {ideal: 720}}, {facingMode: 'user'}, true]) {
    try { const t = (await navigator.mediaDevices.getUserMedia({video})).getVideoTracks()[0]; if (t) return t; } catch (e) { err = e; if (e && e.name === 'NotAllowedError') break; }
  }
  camWhy(err, true); return null;
}
function camWhy(err, mid) {
  const n = err && err.name, busy = n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError';
  toast(mid
    ? (busy ? 'La caméra est déjà utilisée par un autre onglet ou une autre application. Fermez-la, puis touchez à nouveau la caméra.'
      : n === 'NotAllowedError' ? 'La caméra n’est pas autorisée pour Tam-Tam. Autorisez-la (icône à gauche de l’adresse), puis touchez à nouveau la caméra.'
      : 'Caméra introuvable sur cet appareil.')
    : (busy ? 'La caméra est déjà utilisée par un autre onglet ou une autre application : l’appel continue en audio. Fermez l’autre, puis touchez la caméra.'
      : n === 'NotAllowedError' ? 'La caméra n’est pas autorisée pour Tam-Tam : l’appel continue en audio. Autorisez-la (icône à gauche de l’adresse), puis touchez la caméra.'
      : 'Caméra introuvable : l’appel continue en audio.'), 8000);
}
// Redessiner l'écran d'appel sans recréer les vidéos : on garde les mêmes lecteurs (sinon l'image se fige ou clignote).
function keepMedia(root, html) {
  const old = new Map(); root.querySelectorAll('video[data-k],audio[data-k]').forEach(v => old.set(v.dataset.k, v));
  root.innerHTML = html;
  root.querySelectorAll('video[data-k],audio[data-k]').forEach(n => { const o = old.get(n.dataset.k); if (!o) return; o.className = n.className; o.hidden = n.hidden; n.replaceWith(o); });
}
const playOn = (el, s) => { if (!el) return; if (s && el.srcObject !== s) el.srcObject = s; if (el.srcObject && el.paused) el.play().catch(() => {}); };
// L'écran d'appel s'ouvre : on referme le clavier s'il était sorti (zone de message encore active).
function noKeyboard() { const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) a.blur(); }
// Petite image de soi : appui long (ou clic maintenu à la souris), puis on la pose où l'on veut. La place est retenue.
function pipInit(el) {
  if (!el || el.dataset.pip) return; el.dataset.pip = '1';
  const put = (x, y) => { const p = el.parentElement.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    x = Math.max(8, Math.min(p.width - w - 8, x)); y = Math.max(8, Math.min(p.height - h - 8, y));
    Object.assign(el.style, {left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto'}); return [x, y, p, w, h]; };
  try { const s = JSON.parse(localStorage.getItem('tt-pip') || 'null'); if (s) requestAnimationFrame(() => { const p = el.parentElement.getBoundingClientRect(); put(s.x * (p.width - el.offsetWidth), s.y * (p.height - el.offsetHeight)); }); } catch {}
  let t = null, drag = false, dx = 0, dy = 0;
  el.addEventListener('pointerdown', e => { const r = el.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; el.setPointerCapture(e.pointerId);
    const go = () => { t = null; drag = true; el.classList.add('moving'); if (navigator.vibrate) try { navigator.vibrate(20); } catch {} };
    if (e.pointerType === 'mouse') go(); else t = setTimeout(go, 280); });
  el.addEventListener('pointermove', e => { if (!drag) return; e.preventDefault(); const p = el.parentElement.getBoundingClientRect(); put(e.clientX - p.left - dx, e.clientY - p.top - dy); });
  const end = () => { clearTimeout(t); t = null; if (!drag) return; drag = false; el.classList.remove('moving');
    const p = el.parentElement.getBoundingClientRect(), x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    try { localStorage.setItem('tt-pip', JSON.stringify({x: x / Math.max(1, p.width - el.offsetWidth), y: y / Math.max(1, p.height - el.offsetHeight)})); } catch {} };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('contextmenu', e => e.preventDefault());
}
/* Boutons pendant l'appel : de simples icônes alignées en haut à droite.
   Coupé = trait rouge en travers de l'icône ; on touche à nouveau pour rallumer. */
function callSide(o) {
  const b = (act, icon, label, cls = '') => `<button class="ci ${cls}" type="button" data-act="${act}" aria-label="${label}" title="${label}">${icon}</button>`, p = o.pre;
  return `<div class="call-side">${o.add ? b(p + 'Add', I.addUser, 'Ajouter quelqu’un à l’appel', 'add') : ''}${b(p + 'Mic', I.mic, o.mic ? 'Couper le micro' : 'Rallumer le micro', o.mic ? '' : 'off')}${b(p + 'Cam', I.video, o.cam ? 'Couper la caméra' : 'Rallumer la caméra', o.cam ? '' : 'off')}${b(p + 'Spk', I.speaker, Spk.on ? 'Couper le haut-parleur' : 'Mettre le haut-parleur', Spk.on ? '' : 'off')}${o.fx && Beauty.ok ? b(p + 'Fx', I.wand, 'Filtres vidéo', Beauty.mode !== 'off' ? 'fxon' : '') : ''}${o.flip ? b(p + 'Flip', I.flip, 'Retourner la caméra') : ''}${b(o.end, I.phone, o.end === 'gcallLeave' ? 'Quitter l’appel' : 'Raccrocher', 'end')}</div>`;
}
function callPick(groups) {
  const rows = groups.filter(g => g[1].length).map(([t, ids]) => `<p class="cp-t">${esc(t)}</p>${ids.map(id => `<button type="button" class="cp-row" data-act="callAddPick" data-id="${id}">${avatar(uOf(id), 'sm')}<span class="cp-n">${esc(uOf(id).name)}</span>${I.addUser}</button>`).join('')}`).join('');
  return `<div class="call-pick" role="dialog" aria-label="Ajouter quelqu’un à l’appel"><div class="cp-head"><b>Ajouter à l’appel</b><button class="ci" type="button" data-act="callAddClose" aria-label="Fermer">${I.close}</button></div><div class="cp-list">${rows || '<p class="cp-none">Aucun autre contact à ajouter pour l’instant.</p>'}</div></div>`;
}
async function callAddOpen() {
  const k = GCall.c ? GCall : Call; if (!k.c) return;
  if (!S.contacts) { try { await loadContacts(); } catch {} }
  if (!k.c) return; k.c.addMenu = !k.c.addMenu; k.c.layMenu = false; k.render();
}
Object.assign(ACT, {
  callFx() { const c = Call.c; if (!c) return; c.fxMenu = !c.fxMenu; c.addMenu = false; Call.render(); },
  callFxSet(d) { Beauty.mode = d.k; Beauty.apply(Call); },
  callAdd() { callAddOpen(); }, gcallAdd() { callAddOpen(); },
  callAddClose() { const k = GCall.c ? GCall : Call; if (k.c) { k.c.addMenu = false; k.render(); } },
  callAddPick(d) { const k = GCall.c ? GCall : Call; k.addPerson(+d.id); },
  callSpk() { spkToggle(() => Call.render()); },
  callAudio() { Call.start(false); }, callVideo() { Call.start(true); },
  callAccept() { Call.accept(); }, callDecline() { Call.decline(); }, callEnd() { Call.hangup(); },
  callMic() { Call.toggleMic(); }, callCam() { Call.toggleCam(); }, callFlip() { Call.flip(); },
});
