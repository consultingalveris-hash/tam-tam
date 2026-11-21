/* tam-tam — appels de groupe.
   Jusqu'à 4 personnes : chacun est relié directement aux autres (le son et l'image ne passent pas par le serveur).
   Au-delà (jusqu'à 32) : un serveur de répartition reçoit l'image de chacun une seule fois et la renvoie aux autres ;
   elle reste chiffrée de bout en bout avec une clé propre à l'appel, remise aux seuls membres du groupe. */
'use strict';
function gcallBanner() {
  const list = [...(S.gcalls || new Map()).values()].filter(g => g.parts.length && !(GCall.c && GCall.c.id === g.callId));
  return list.map(g => { const c = S.chats.get(g.chatId); if (!c) return '';
    return `<div class="gban">${g.video ? I.video : I.phone}<div><b>Appel en cours · ${esc(c.name || 'Groupe')}</b><span>${g.parts.length} personne${g.parts.length > 1 ? 's' : ''} en ligne</span></div><button class="btn sm" type="button" data-act="gcallJoin" data-id="${g.callId}">Rejoindre</button></div>`; }).join('');
}
const GCall = {
  c: null, inc: null,
  sig(to, type, data) { const c = this.c; if (!c) return; api('/api/gcall/signal', {callId: c.id, to, type, data}).catch(() => {}); },
  async loadActive() { try { const r = await api('/api/gcall/active'); S.sfuOk = !!r.sfu; S.gcalls = new Map(r.calls.map(g => [g.chatId, g])); if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead(); } catch {} },
  active(chatId) { const g = S.gcalls && S.gcalls.get(chatId); return g && g.parts.length ? g : null; },
  busy() { return !!(this.c || (Call.c && !Call.over())); },

  async start(video) {
    const chat = S.chats.get(S.chatId); if (!chat || chat.type !== 'group') return;
    if (this.busy()) return toast('Un appel est déjà en cours.');
    const ex = this.active(chat.id); if (ex) return this.join(ex.callId);
    let extra = {};
    // Plus de 4 membres : appel par le serveur de répartition, avec une clé d'appel chiffrée pour chaque membre.
    if (S.sfuOk && (chat.members || []).length > 4) { try { const raw = crypto.getRandomValues(new Uint8Array(32)); extra = {sfu: true, keyEnv: (await E2E.seal({k: btoa(String.fromCharCode(...raw))}, recipients(chat))).env}; } catch {} }
    try { const r = await api('/api/gcall/start', {chatId: chat.id, video, ...extra}); this.join(r.callId, video); } catch (e) { toast(e.message); }
  },
  async join(callId, video) {
    if (this.busy() && !(this.inc && this.inc.callId === callId)) return toast('Un appel est déjà en cours.');
    this.stopRing(); this.inc = null;
    const g = [...(S.gcalls || new Map()).values()].find(x => x.callId === callId); if (video === undefined) video = g ? g.video : true;
    this.joining = true; this.render(); // écran « connexion » tout de suite, sans retour furtif à la liste
    const fail = m => { this.joining = false; this.render(); toast(m); };
    let local;
    try { local = await this.media(video); } catch (e) { return fail(e.message); }
    let r; try { r = await api('/api/gcall/join', {callId}); } catch (e) { local.getTracks().forEach(t => t.stop()); return fail(e.message); }
    this.joining = false;
    let lay = 'grid'; try { lay = localStorage.getItem('tt-glay') || 'grid'; } catch {}
    this.c = {id: callId, chatId: r.chatId, video, local, mic: true, cam: local.getVideoTracks().length > 0, peers: new Map(), since: Date.now(), lay, main: null, layMenu: false, ringing: new Map((r.ringing || []).map(u => [u, Date.now() + 20000]))};
    Spk.start(video);
    this.c.tick = setInterval(() => this.clock(), 1000);
    this.render();
    if (r.mode === 'sfu') return this.lk(r);
    for (const uid of r.parts) { const p = await this.peer(uid); await p.pc.setLocalDescription(await p.pc.createOffer()); this.sig(uid, 'offer', p.pc.localDescription); }
  },
  // Serveur de répartition (LiveKit) : chargé seulement quand il sert.
  lkLib() { return window.LivekitClient ? Promise.resolve(window.LivekitClient) : (this.lkP = this.lkP || new Promise((ok, ko) => { const s = document.createElement('script'); s.src = '/lkc/livekit-client.umd.js'; s.onload = () => ok(window.LivekitClient); s.onerror = () => { this.lkP = null; ko(new Error('Chargement impossible')); }; document.head.appendChild(s); })); },
  async lk(r) {
    const c = this.c; let L;
    try { L = await this.lkLib(); } catch { toast('Impossible de rejoindre l’appel. Vérifiez votre connexion.'); return this.leave(); }
    if (this.c !== c) return;
    let opts = {adaptiveStream: true, dynacast: true};
    try { const o = await E2E.open(r.keyEnv, S.me.id); if (o.err || !o.payload.k) throw 0;
      if (L.isE2EESupported && L.isE2EESupported()) { const kp = new L.ExternalE2EEKeyProvider(); await kp.setKey(o.payload.k); opts.e2ee = {keyProvider: kp, worker: new Worker('/lkc/e2ee.worker.mjs', {type: 'module'})}; }
    } catch { toast('Vous n’avez pas la clé de cet appel (membre arrivé après son début).'); return this.leave(); }
    // Jamais d'appel de groupe en clair : sans chiffrement de bout en bout, on ne rejoint pas.
    if (!opts.e2ee) { toast('Ce navigateur ne sait pas chiffrer les grands appels de groupe. Mettez-le à jour ou essayez Chrome.'); return this.leave(); }
    const room = c.room = new L.Room(opts), E = L.RoomEvent;
    const peerOf = part => { const uid = +part.identity; if (!uid || uid === S.me.id) return null; let p = c.peers.get(uid); if (!p) { p = {uid, stream: new MediaStream(), cam: undefined, mic: true, state: 'connected', lk: true}; c.peers.set(uid, p); } return p; };
    room.on(E.ParticipantConnected, part => { peerOf(part); toast(`${first(uOf(+part.identity).name)} a rejoint l’appel`); this.render(); });
    room.on(E.ParticipantDisconnected, part => { c.peers.delete(+part.identity); this.render(); });
    room.on(E.TrackSubscribed, (track, pub, part) => { const p = peerOf(part); if (!p) return; p.stream.getTracks().filter(t => t.kind === track.kind).forEach(t => p.stream.removeTrack(t)); p.stream.addTrack(track.mediaStreamTrack); if (track.kind === 'video') p.cam = true; this.render(); });
    room.on(E.TrackUnsubscribed, (track, pub, part) => { const p = c.peers.get(+part.identity); if (p) { p.stream.removeTrack(track.mediaStreamTrack); this.render(); } });
    room.on(E.TrackMuted, (pub, part) => { const p = c.peers.get(+part.identity); if (!p) return; if (pub.kind === 'audio') p.mic = false; else p.cam = false; this.render(); });
    room.on(E.TrackUnmuted, (pub, part) => { const p = c.peers.get(+part.identity); if (!p) return; if (pub.kind === 'audio') p.mic = true; else p.cam = true; this.render(); });
    room.on(E.Disconnected, () => { if (this.c === c && !c.leaving) { toast('L’appel a été coupé.'); this.leave(); } });
    try {
      const t0 = performance.now(); await room.connect(r.sfu.url, r.sfu.token); Perf.add('call', performance.now() - t0);
      if (opts.e2ee) await room.setE2EEEnabled(true);
      for (const t of c.local.getTracks()) await room.localParticipant.publishTrack(t, t.kind === 'video' ? {source: L.Track.Source.Camera, simulcast: true, videoEncoding: {maxBitrate: 500_000, maxFramerate: 15}} : {source: L.Track.Source.Microphone, dtx: true, red: true});
      c.pubs = room.localParticipant;
      room.remoteParticipants.forEach(part => peerOf(part)); this.render();
    } catch (e) { console.warn(e); toast('Impossible de rejoindre l’appel de groupe. Réessayez.'); this.leave(); }
  },
  async media(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Ce navigateur ne permet pas les appels. Essayez Chrome, Brave ou Safari à jour.');
    // jusqu'à 4 personnes (liaisons directes) : image plus nette ; au-delà, plus légère
    const big = ((S.chats.get(S.chatId) || {}).members || []).length <= 4, v = video ? (big ? {facingMode: 'user', width: {ideal: 960}, height: {ideal: 540}, frameRate: {ideal: 24, max: 24}} : {facingMode: 'user', width: {ideal: 640}, height: {ideal: 360}, frameRate: {max: 15}}) : false;
    try { return Beauty.stream(await getAV(v)); }
    catch (e) {
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
      if (p.state === 'connected') { this.sig(uid, 'media', {cam: c.cam, mic: c.mic}); if (!p.net) p.net = NetAdapt.watch(pc, true); }
      if (p.state === 'failed') { this.drop(uid); }
      clearTimeout(p.lostT); if (p.state === 'disconnected') p.lostT = setTimeout(() => { if (this.c === c && p.pc.connectionState !== 'connected') this.drop(uid); }, 6000);
      this.render();
    };
    this.render(); return p;
  },
  drop(uid) { const c = this.c, p = c && c.peers.get(uid); if (!p) return; if (p.lk) return; try { p.pc.close(); } catch {} c.peers.delete(uid); this.render(); },
  async flush(p) { while (p.q.length) { try { await p.pc.addIceCandidate(p.q.shift()); } catch {} } },

  async onEvent(ev) {
    if (ev.type === 'state') {
      S.gcalls = S.gcalls || new Map();
      if (ev.parts.length) S.gcalls.set(ev.chatId, {callId: ev.callId, chatId: ev.chatId, video: ev.video, parts: ev.parts}); else S.gcalls.delete(ev.chatId);
      if (this.inc && this.inc.callId === ev.callId && !ev.parts.length) this.dismiss();
      if (S.tab === 'chats') renderBody(); if (S.chatId === ev.chatId) renderChatHead();
      return;
    }
    if (ev.type === 'cancel') { if (this.inc && this.inc.callId === ev.callId) { this.dismiss(); toast('Appel de groupe annulé'); } return; }
    if (ev.type === 'ring') {
      if (this.busy()) { if (!(Call.c && Call.c.peer === ev.from)) toast(`${first(uOf(ev.from).name)} lance un appel de groupe.`); return; }
      if (Call.c) Call.cleanup(); this.inc = ev; this.render(); this.ringT = setTimeout(() => this.dismiss(), 20000);
      Call.tone.call(this, 'ring'); return;
    }
    const c = this.c; if (!c || ev.callId !== c.id) return;
    if (ev.type === 'joined') { c.ringing.delete(ev.user); toast(`${first(uOf(ev.user).name)} a rejoint l’appel`); this.render(); return; }
    if (ev.type === 'left') { c.ringing.delete(ev.user); c.peers.has(ev.user) ? this.drop(ev.user) : this.render(); return; }
    if (ev.type === 'ringing') { (ev.users || []).forEach(u => c.ringing.set(u, Date.now() + 20000)); this.render(); return; }
    if (ev.type === 'declined') { if (c.ringing.delete(ev.user)) this.render(); return; }
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
  decline() { const ev = this.inc; if (ev) api('/api/gcall/decline', {callId: ev.callId}).catch(() => {}); this.dismiss(); },
  // appui long sur la case de quelqu'un qui ne décroche pas : on arrête de le faire sonner
  cancelRing(uid) { const c = this.c; if (!c || !c.ringing.has(uid)) return; c.ringing.delete(uid); this.render(); api('/api/gcall/cancel', {callId: c.id, user: uid}).then(() => toast(`Appel annulé pour ${first(uOf(uid).name)}`)).catch(e => toast(e.message)); },
  accept() { const ev = this.inc; if (!ev) return; this.inc = null; this.join(ev.callId, ev.video); },

  leave() {
    const c = this.c; if (!c) return;
    api('/api/gcall/leave', {callId: c.id}, {keep: true}).catch(() => {});
    c.leaving = true; if (c.room) { try { c.room.disconnect(); } catch {} }
    clearInterval(c.tick); c.peers.forEach(p => { try { if (p.net) p.net(); if (p.pc) p.pc.close(); } catch {} }); c.local.getTracks().forEach(t => t.stop());
    Spk.stop(); this.c = null; this.render(); if (S.tab === 'chats') renderBody(); if (S.chatId) renderChatHead();
  },
  lkMute(kind, on) { const c = this.c; if (!c || !c.room) return; c.room.localParticipant.trackPublications.forEach(pub => { if (pub.kind === kind && pub.track) (on ? pub.unmute() : pub.mute()).catch(() => {}); }); },
  toggleMic() { const c = this.c; if (!c) return; c.mic = !c.mic; c.local.getAudioTracks().forEach(t => { t.enabled = c.mic; }); this.lkMute('audio', c.mic); c.peers.forEach((p, uid) => this.sig(uid, 'media', {cam: c.cam, mic: c.mic})); this.render(); },
  toggleCam() {
    const c = this.c; if (!c) return; const v = c.local.getVideoTracks()[0];
    if (!v) return toast('Pour la vidéo, quittez et rejoignez l’appel en vidéo.');
    c.cam = !c.cam; v.enabled = c.cam; this.lkMute('video', c.cam); c.peers.forEach((p, uid) => this.sig(uid, 'media', {cam: c.cam, mic: c.mic})); this.render();
  },

  /* ---------- ajouter quelqu'un pendant l'appel ---------- */
  pickList() {
    const c = this.c, chat = S.chats.get(c.chatId) || {}, here = new Set([S.me.id, ...c.peers.keys()]), mem = new Set((chat.members || []).map(m => m.id));
    const absent = [...mem].filter(id => !here.has(id)), others = ((S.contacts && S.contacts.contacts) || []).map(u => u.id).filter(id => !mem.has(id) && id !== S.me.id);
    return [['Membres du groupe pas encore là', absent], ['Vos autres contacts (ajoutés au groupe)', others]];
  },
  async addPerson(uid) {
    const c = this.c; if (!c) return; c.addMenu = false; this.render();
    const chat = S.chats.get(c.chatId) || {};
    if (!(chat.members || []).some(m => m.id === uid)) {
      try { const r = await api(`/api/chats/${c.chatId}/members`, {add: [uid]}); S.chats.set(r.chat.id, r.chat); keepUsers(Object.values(r.chat.users)); } catch (e) { return toast(e.message); }
    }
    try { await api('/api/gcall/ring', {callId: c.id, users: [uid]}); toast(`Ça sonne chez ${first(uOf(uid).name)}…`); } catch (e) { toast(e.message); }
    if (this.c === c) this.render();
  },

  /* ---------- affichage ---------- */
  el() { let e = document.getElementById('gcall'); if (!e) { e = document.createElement('div'); e.id = 'gcall'; document.body.appendChild(e); } return e; },
  clock() { const c = this.c, el = document.getElementById('gTime'); if (!c || !el) return;
    // Seul dans l'appel : tout le monde a raccroché, ou personne n'a décroché → l'appel se termine tout seul.
    const now = Date.now(), ringOn = [...c.ringing.values()].some(t => t > now);
    if (!c.peers.size && (c.hadPeers || (!ringOn && now - c.since > 23_000))) { c.aloneAt = c.aloneAt || now; if (now - c.aloneAt > 4000) { toast(c.hadPeers ? 'Tout le monde a raccroché : appel terminé.' : 'Personne n’a décroché : appel terminé.'); return this.leave(); } } else c.aloneAt = 0;
    if ([...c.ringing.values()].some(t => t <= Date.now())) { for (const [u, t] of c.ringing) if (t <= Date.now()) c.ringing.delete(u); return this.render(); } const s = Math.floor((Date.now() - c.since) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  tile(uid, stream, cam, mic, me, state) {
    const u = me ? S.me : uOf(uid), vid = stream && cam !== false && stream.getVideoTracks().length;
    return `<div class="gt${me ? ' me' : ''}" data-uid="${uid}">${vid ? `<video autoplay playsinline muted data-k="v${uid}" data-v="${uid}"></video>` : `<div class="gt-av">${avatar(u, 'xl')}</div>`}
      ${!me ? `<audio autoplay data-k="a${uid}" data-a="${uid}"></audio>` : ''}
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
    if (!c && !ev && this.joining) { root.hidden = false; root.className = 'call'; document.body.classList.add('in-call'); noKeyboard(); root.innerHTML = '<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel de groupe"><div class="call-who"><p>Connexion à l’appel de groupe…</p></div></div>'; return; }
    if (!c && !ev) { root.innerHTML = ''; root.hidden = true; if (!Call.c) document.body.classList.remove('in-call'); return; }
    root.hidden = false; document.body.classList.add('in-call'); noKeyboard();
    const btn = (act, icon, label, cls = '') => `<button class="cb ${cls}" type="button" data-act="${act}" aria-label="${label}">${icon}<span>${label}</span></button>`;
    if (!c) {
      const chat = S.chats.get(ev.chatId);
      root.className = 'call';
      root.innerHTML = `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel de groupe"><div class="call-who"><div class="call-av pulse">${chat ? grpAv(chat, 'xl') : avatar(uOf(ev.from), 'xl')}</div><h2>${esc(chat ? chat.name : 'Groupe')}</h2><p>${esc(first(uOf(ev.from).name))} lance un appel ${ev.video ? 'vidéo' : 'vocal'} de groupe</p></div>
        <div class="call-bar">${btn('gcallDecline', I.phone, 'Ignorer', 'red down')}${btn('gcallAccept', ev.video ? I.video : I.phone, 'Rejoindre', 'green')}</div></div>`;
      return;
    }
    // Une case n'apparaît que lorsque la personne a décroché et que son image arrive (pas de case vide pendant que ça sonne).
    const live = [...c.peers.values()].filter(p => p.lk || p.state === 'connected' || p.state === 'disconnected').map(p => p.uid), chat = S.chats.get(c.chatId), n = live.length + 1;
    if (c.peers.size) c.hadPeers = true;
    // Membres pas encore arrivés : leur photo de profil sous les caméras.
    const here = new Set([S.me.id, ...c.peers.keys()]), t0 = Date.now(), waiting = [...c.ringing].filter(([u, t]) => t > t0 && !here.has(u)).map(([u]) => u);
    const ids = [S.me.id, ...live];
    if (!ids.includes(c.main)) c.main = ids.find(id => id !== S.me.id) || S.me.id;
    // Les membres qui n'ont pas encore décroché ont déjà leur case (photo de profil) ; ils prennent leur place à leur arrivée.
    const W = uid => `<div class="gt wait" data-uid="${uid}" title="Appui long pour annuler l’appel"><div class="gt-av">${avatar(uOf(uid), 'xl')}</div><span class="gt-name">${esc(first(uOf(uid).name))} · appel…</span></div>`;
    const T = uid => uid === S.me.id ? this.tile(S.me.id, c.local, c.cam, c.mic, true) : c.peers.has(uid) ? (p => this.tile(p.uid, p.stream, p.cam, p.mic, false, p.state))(c.peers.get(uid)) : W(uid);
    const all = ids, lay = all.length > 1 ? c.lay : 'grid', tot = all.length;
    const stage = lay === 'grid'
      ? `<div class="g-grid n${tot > 8 ? 'x' : tot}">${all.map(T).join('')}</div>`
      : `<div class="g-stage l-${lay}"><div class="g-main">${T(c.main)}</div><div class="g-secs">${all.filter(id => id !== c.main).map(T).join('')}</div></div>`;
    const LAYS = [['grid', 'Équilibré', 'Toutes les caméras de la même taille'], ['side', 'Principale à gauche', 'Une grande caméra, les autres à droite'], ['top', 'Principale en haut', 'Une grande caméra, les autres en dessous']];
    root.className = 'call gcall';
    keepMedia(root, `<div class="call-in" role="dialog" aria-modal="true" aria-label="Appel de groupe">
      <div class="g-top"><b>${esc(chat ? chat.name : 'Groupe')}</b><span><span id="gTime">0:00</span> · ${n} personne${n > 1 ? 's' : ''}</span></div>
      ${stage}
      ${c.fxMenu ? '' : waiting.length ? `<p class="g-wait">📞 Ça sonne chez ${esc(waiting.map(u => first(uOf(u).name)).join(', '))}…</p>` : n === 1 ? '<p class="g-wait">En attente des autres membres du groupe…</p>' : ''}
      ${c.layMenu ? `<div class="g-laymenu" role="menu" aria-label="Disposition des caméras">${LAYS.map(([k, l, h]) => `<button type="button" role="menuitemradio" aria-checked="${c.lay === k}" data-act="gcallLaySet" data-k="${k}"><span class="g-ico ${k}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><b>${l}</b><small>${h}</small></button>`).join('')}</div>` : ''}
      ${callSide({add: true, mic: c.mic, cam: c.cam, flip: false, fx: c.cam && c.local.getVideoTracks().length > 0, end: 'gcallLeave', pre: 'gcall'})}
      ${c.fxMenu ? fxPick('gcall') : ''}
      ${all.length > 1 ? `<button class="g-laydot" type="button" data-act="gcallLay" aria-label="Disposition des caméras" title="Disposition des caméras" aria-expanded="${!!c.layMenu}"><i aria-hidden="true"></i></button>` : ''}
      ${c.addMenu ? callPick(this.pickList()) : ''}</div>`);
    if (lay !== 'grid') this.dragInit(root);
    root.querySelectorAll('.gt.wait').forEach(el => { let t = null; const off = () => { clearTimeout(t); t = null; el.classList.remove('press'); };
      el.addEventListener('pointerdown', () => { el.classList.add('press'); t = setTimeout(() => { off(); if (navigator.vibrate) try { navigator.vibrate(30); } catch {} this.cancelRing(+el.dataset.uid); }, 650); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(k => el.addEventListener(k, off)); el.addEventListener('contextmenu', e => e.preventDefault()); });
    root.querySelectorAll('video[data-v]').forEach(v => { const uid = +v.dataset.v; playOn(v, uid === S.me.id ? c.local : c.peers.get(uid)?.stream); });
    root.querySelectorAll('audio[data-a]').forEach(a => { const p = c.peers.get(+a.dataset.a); if (p && p.stream) playOn(a, p.stream); });
    Spk.apply();
    this.clock();
  },
};
Object.assign(ACT, {
  gcallVideo() { GCall.start(true); }, gcallAudio() { GCall.start(false); },
  gcallJoin(d) { GCall.join(d.id); }, gcallAccept() { GCall.accept(); }, gcallDecline() { GCall.decline(); },
  gcallMic() { GCall.toggleMic(); },
  gcallFx() { const c = GCall.c; if (!c) return; c.fxMenu = !c.fxMenu; c.addMenu = false; c.layMenu = false; GCall.render(); },
  gcallFxSet(d) { Beauty.mode = d.k; Beauty.apply(GCall); }, gcallSpk() { spkToggle(() => GCall.render()); },
  gcallLay() { const c = GCall.c; if (!c) return; c.layMenu = !c.layMenu; c.addMenu = false; GCall.render(); },
  gcallLaySet(d) { const c = GCall.c; if (!c) return; c.lay = d.k; c.layMenu = false; try { localStorage.setItem('tt-glay', d.k); } catch {} GCall.render(); }, gcallCam() { GCall.toggleCam(); }, gcallLeave() { GCall.leave(); },
});
