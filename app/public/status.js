/* tam-tam — Statuts : création, lecture, musique.
   Extrait de app.js (nov. 2026) : chargé après app.js, partage ses variables globales. */
'use strict';
/* ---------- statuts : création et lecture ---------- */
const BGS = [362, 170, 200, 260, 300, 340, 20, 45, 130, 360, 361];
// 360 = noir, 361 = gris foncé ; les autres nombres sont des teintes.
// 362 = blanc (texte foncé), 360 = noir, 361 = gris foncé ; les autres nombres sont des teintes.
const stBgc = h => +h === 362 ? '#fff' : +h === 360 ? '#000' : +h === 361 ? '#2b3034' : '';
const stBgStyle = h => `--h:${h}${stBgc(h) ? `;--bgc:${stBgc(h)}` : ''}${+h === 362 ? ';--stc:#14181b;--stph:rgb(20 24 27/.45)' : ''}`;
// Polices des statuts (chargées à la demande depuis Google Fonts).
const ST_FONTS = [['Classique', 'inherit', ''], ['Élégante', "'Playfair Display', Georgia, serif", 'Playfair+Display:wght@700'], ['Manuscrite', "Pacifico, 'Brush Script MT', cursive", 'Pacifico'],
  ['Écriture', "Caveat, 'Segoe Print', cursive", 'Caveat:wght@700'], ['Affiche', "'Bebas Neue', Impact, sans-serif", 'Bebas+Neue'], ['Machine', "'Courier Prime', 'Courier New', monospace", 'Courier+Prime:wght@700']];
function stFontsLoad() {
  if (document.getElementById('stFonts')) return;
  const l = document.createElement('link'); l.id = 'stFonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' + ST_FONTS.filter(f => f[2]).map(f => 'family=' + f[2]).join('&') + '&display=swap'; document.head.appendChild(l);
}
const stFont = i => (ST_FONTS[i] || ST_FONTS[0])[1];
const ST_MUS_MAX = 8_000_000;
function stOpts() {
  return {target: stMedia, title: 'Pour mon statut', gallery: () => $('#stIn') && $('#stIn').click(), native: () => $('#stCamIn') && $('#stCamIn').click()};
}
function stMedia(r) {
  const s = S.sc; if (!s) return; if (s.url) URL.revokeObjectURL(s.url);
  Object.assign(s, {kind: r.kind, blob: r.blob, url: URL.createObjectURL(r.blob), mime: r.mime, dur: r.dur || 0, mirror: !!r.mirror, parts: r.parts || null});
  if (r.cap) s.text = r.cap; s.tab = null; stComposer();
}
function stComposer() {
  S.sc = S.sc || {aud: 'public', bg: 362, text: '', font: 0, kind: 'text', blob: null, url: null, music: null, tab: null, grp: false};
  if (!S.sc.kind) S.sc.kind = S.sc.blob ? 'photo' : 'text'; if (S.sc.font == null) S.sc.font = 0;
  const s = S.sc, closeN = (S.me.close || []).length, media = s.kind !== 'text', capSel = media ? '#stCap' : '#stText'; stFontsLoad(); stPre(s);
  const tool = (act, ic, label, on) => `<button class="st-tool${on ? ' on' : ''}" type="button" data-act="${act}">${ic}<span>${label}</span></button>`;
  layer.innerHTML = `<div class="st-comp" role="dialog" aria-modal="true" aria-label="Nouveau statut">
    <div class="st-head"><button class="ib" type="button" data-act="stCancel" aria-label="Annuler">${I.close}</button>
      <div class="seg st-aud" role="group" aria-label="Qui voit ce statut"><button type="button" data-act="stAud" data-a="public" aria-pressed="${s.aud === 'public'}" title="Visible par tous vos amis Tam-Tam">${I.users}Mes amis</button><button type="button" data-act="stAud" data-a="private" aria-pressed="${s.aud === 'private'}">${I.lock}Privé</button></div>
      <button class="btn sm" type="button" data-act="stPublish" id="stPub">Publier</button></div>
    ${s.aud === 'private' ? `<button class="st-grp-row" type="button" data-act="stGrp">${closeN ? '' : '<span class="need" aria-hidden="true"></span>'}${I.users}<span><b>Mon groupe privé</b><small>${closeN ? `${closeN} personne${closeN > 1 ? 's' : ''} verront ce statut` : 'Touchez ici pour choisir qui verra ce statut'}</small></span>${I.chev || '›'}</button>`
      : '<p class="st-note">Visible seulement par vos amis Tam-Tam (vos contacts), pendant 24 heures. Les autres membres ne le voient pas.</p>'}
    <div class="stage"><div class="st-box${media ? ' media' : ''}" style="${stBgStyle(s.bg)};--stf:${stFont(s.font)}">
      ${s.kind === 'photo' ? `<img src="${s.url}" alt="Aperçu">` : s.kind === 'video' ? `<video src="${s.url}" class="${s.mirror ? 'mirror' : ''}" autoplay loop muted playsinline></video>${s.parts ? `<span class="st-parts">${s.parts.length} parties · ${s.parts.length} statuts à la suite</span>` : ''}` : `<textarea id="stText" maxlength="700" placeholder="Touchez pour écrire…">${esc(s.text)}</textarea>`}
      ${media ? `<button class="st-rm" type="button" data-act="stNoPhoto" aria-label="Retirer ${s.kind === 'video' ? 'la vidéo' : 'la photo'}">${I.close}</button><input id="stCap" class="st-cap" maxlength="700" placeholder="Ajouter une légende…" value="${esc(s.text)}" autocomplete="off">` : ''}
      ${s.music ? `<div class="st-mus">🎵 <span>${esc(s.music.name)}</span><button type="button" data-act="stMusOff" aria-label="Retirer la musique">${I.close}</button></div><audio src="${s.music.url}" id="stMusPrev"></audio>` : ''}
    </div></div>
    ${s.tab === 'font' ? `<div class="st-fonts">${ST_FONTS.map(([n, f], i) => `<button type="button" data-act="stFont" data-i="${i}" aria-pressed="${s.font === i}" style="font-family:${f}">Aa<small>${n}</small></button>`).join('')}</div>` : ''}
    ${!media ? `<div class="bgs st-bgs">${BGS.map(h => `<button class="sw" type="button" style="--c:${stBgc(h) || `hsl(${h} 62% 47%)`}" data-act="stBg" data-h="${h}" aria-pressed="${s.bg === h}" aria-label="${h === 362 ? 'Fond blanc' : h === 360 ? 'Fond noir' : h === 361 ? 'Fond gris foncé' : 'Couleur de fond'}"></button>`).join('')}</div>` : ''}
    <div class="st-tools">${tool('stText', '<b class="aa">Aa</b>', 'Texte', !media)}${tool('stPhoto', I.image, 'Photo', s.kind === 'photo')}${tool('stCam', CI.photo, 'Caméra', false)}${tool('stVid', CI.video, 'Vidéo', s.kind === 'video')}${tool('stFontTab', '<b class="aa serif">F</b>', 'Police', s.tab === 'font')}${tool('stMus', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>', 'Musique', !!s.music)}${Emoji.btn(capSel, 'st-tool emo')}</div>
    <input type="file" id="stIn" accept="image/*,video/*" hidden><input type="file" id="stCamIn" accept="image/*" capture="environment" hidden><input type="file" id="stMusIn" accept="audio/*" hidden>
    ${s.grp ? `<div class="st-grp-panel" data-act="stGrpBg"><div class="st-grp-card">${closePicker(true)}</div></div>` : ''}
  </div>`;
  if (s.kind === 'text' && !s.grp && matchMedia('(min-width:821px) and (pointer:fine)').matches) { const t = $('#stText'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
}
// Envoi anticipé (comme Instagram) : la photo ou la vidéo part chiffrée dès qu'elle est choisie, pendant qu'on écrit la légende
// ou qu'on choisit qui la verra. Au clic sur « Publier », il ne reste presque plus rien à envoyer.
function stPre(s) {
  if (!s || s.kind === 'text' || dataSaver()) return;
  const list = s.kind === 'video' && s.parts ? s.parts : (s.blob ? [{blob: s.blob}] : []);
  if (!list.length || (s.pre && s.preFor === list[0].blob)) return;
  s.preFor = list[0].blob; s.preProg = list.map(() => 0);
  let chain = Promise.resolve();   // une partie après l'autre, pour ne pas partager la connexion
  s.pre = list.map((p, i) => (chain = chain.then(async () => {
    const pre = await E2E.preSeal(await p.blob.arrayBuffer());
    const up = await upMedia(pre.blob, f => { s.preProg[i] = Math.min(.99, f); });
    s.preProg[i] = 1; return {raw: pre.raw, iv: pre.iv, id: up.id};
  })));
  s.pre.forEach(x => x.catch(() => {}));
}
async function stPublish() {
  const s = S.sc; keepSt();
  if (s.kind === 'text' && !s.text.trim()) return toast('Écrivez un texte, ou ajoutez une photo ou une vidéo.');
  if (s.aud === 'private' && !(S.me.close || []).length) { s.grp = true; stComposer(); return toast('Choisissez d’abord qui verra ce statut privé.'); }
  const b = $('#stPub'); if (b) { b.disabled = true; b.textContent = 'Publication…'; }
  try {
    // Statut chiffré de bout en bout pour vos contacts (ou votre seul groupe privé).
    const cs = S.contacts.contacts.filter(u => u.pubkey && !u.blocked && (s.aud !== 'private' || (S.me.close || []).includes(u.id)));
    // Vidéo longue : une partie par statut, publiées dans l'ordre (la légende sur chacune avec 1/3, 2/3…).
    const list = s.kind === 'video' && s.parts ? s.parts : [{blob: s.blob, mime: s.mime, dur: s.dur}];
    for (let i = 0; i < list.length; i++) {
      const p = list[i], n = list.length;
      if (b && n > 1) b.textContent = `${i + 1}/${n}…`;
      const payload = {t: n > 1 ? `${s.text ? s.text + ' ' : ''}(${i + 1}/${n})` : s.text, f: s.font || 0}; if (s.kind === 'video') Object.assign(payload, {mime: p.mime, dur: p.dur, mir: s.mirror ? 1 : 0}); if (s.music && i === 0) payload.mname = s.music.name;
      // la photo ou la vidéo est peut-être déjà partie pendant qu'on écrivait (envoi anticipé)
      let pr = null; if (s.pre && s.preFor === list[0].blob && s.pre[i]) { try { while (s.preProg[i] < 1 && b) { b.textContent = `Envoi ${Math.round(s.preProg[i] * 100)} %${n > 1 ? ` (${i + 1}/${n})` : ''}`; await Promise.race([s.pre[i], new Promise(r => setTimeout(r, 400))]); } pr = await s.pre[i]; } catch { pr = null; } }
      const sealed = await E2E.seal(payload, [[S.me.id, E2E.pubJwk], ...cs.map(u => [u.id, u.pubkey])], !pr && p.blob ? await p.blob.arrayBuffer() : undefined, s.music && i === 0 ? await s.music.blob.arrayBuffer() : undefined, pr);
      let media = pr ? pr.id : null, music = null;
      if (sealed.blob) media = (await upMedia(sealed.blob)).id;
      if (sealed.blob2) music = (await upMedia(sealed.blob2)).id;
      await api('/api/statuses', {enc: sealed.env, bg: s.bg, media, music, aud: s.aud, ...(s.kind === 'video' ? {kind: 'video'} : {})});
    }
    if (s.url) URL.revokeObjectURL(s.url); if (s.music) URL.revokeObjectURL(s.music.url);
    S.sc = null; closeLayer(); await loadStatuses(); renderStories();
  } catch (e) { toast(e.message); if (b) { b.disabled = false; b.textContent = 'Publier'; } }
}
let svT;
const SV_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const SV_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
// Pause / reprise de la lecture d'un statut : le temps restant, la barre, la vidéo et la musique s'arrêtent ensemble.
// Trois petites flammes s'envolent et se dissipent au-dessus du bouton.
function flameBurst(el) {
  const r = el.getBoundingClientRect();
  [[-26, 0], [0, 120], [24, 240]].forEach(([dx, delay], k) => {
    const f = document.createElement('span'); f.className = 'fly-flame'; f.textContent = '🔥';
    f.style.left = (r.left + r.width / 2 - 12) + 'px'; f.style.top = (r.top - 4) + 'px'; f.style.setProperty('--dx', dx + 'px'); f.style.animationDelay = delay + 'ms'; f.style.fontSize = (20 + k * 3) + 'px';
    document.body.appendChild(f); setTimeout(() => f.remove(), 1600 + delay);
  });
}
async function directWith(uid) {
  let c = [...S.chats.values()].find(x => x.type === 'direct' && x.peer === uid); if (c) return c;
  const r = await api('/api/chats/direct', {userId: uid}); keepUsers(Object.values(r.chat.users)); S.chats.set(r.chat.id, r.chat); return r.chat;
}
function svCur() { const v = S.sv; if (!v) return null; const g = S.statuses.others.find(x => x.user.id === v.uid); return g ? {g, it: g.items[v.i]} : null; }
async function svSend(extra, bytes, kind) {
  const cur = svCur(); if (!cur) return; const {g, it} = cur, c = await directWith(g.user.id);
  const payload = Object.assign({sr: {k: it.media ? (it.kind === 'video' ? 'video' : 'image') : 'text', t: (it.text || '').slice(0, 80), id: it.id}}, extra);
  const sealed = await E2E.seal(payload, recipients(c), bytes);
  let media = null; if (sealed.blob) media = (await upMedia(sealed.blob)).id;
  const r = await api(`/api/chats/${c.id}/messages`, {enc: sealed.env, media, kind, stReply: !extra.fl, flame: !!extra.fl}); onMsg(r.msg);
}
async function svRecStop(send) {
  const c = S.svRec; S.svRec = null; if (!c) return; clearInterval(c.tick); const rb = layer.querySelector('.sv-recbar'); if (rb) rb.remove();
  await new Promise(res => { c.mr.onstop = res; try { c.mr.stop(); } catch { res(); } }); c.stream.getTracks().forEach(t => t.stop());
  const rf = layer.querySelector('.sv-reply'); if (rf) rf.classList.remove('rec');
  const dur = Math.round((Date.now() - c.t0) / 1000); if (!send || dur < 1 || !c.chunks.length) return;
  try { const blob = new Blob(c.chunks, {type: c.mime}); await svSend({t: '', mime: c.mime.split(';')[0], dur}, await blob.arrayBuffer(), 'audio'); toast('Message vocal envoyé'); } catch (e) { toast(e.message); }
}
// Le statut (photo ou vidéo) est prêt : le chrono et la barre démarrent maintenant.
function svReady() {
  const v = S.sv; if (!v || !v.wait) return; v.wait = false; const w = layer.querySelector('.sv-wait'); if (w) w.remove();
  v.t0 = Date.now(); if (v.paused) return; const bar = layer.querySelector('.sv-bars i.run b'); if (bar) bar.style.animationPlayState = 'running';
  clearTimeout(svT); svT = setTimeout(() => svStep(1), v.left);
}
function svPause(on) {
  const v = S.sv; if (!v) return; on = on == null ? !v.paused : on; if (on === v.paused) return;
  const box = layer.querySelector('.sv'), bar = layer.querySelector('.sv-bars i.run b'), med = [...layer.querySelectorAll('video[data-stvid], audio[data-stmus]')], bt = layer.querySelector('.sv-pp');
  if (on) { clearTimeout(svT); if (!v.wait) v.left = Math.max(300, v.left - (Date.now() - v.t0)); med.forEach(m => m.pause()); }
  else { v.t0 = Date.now(); if (!v.wait) svT = setTimeout(() => svStep(1), v.left); med.forEach(m => { if (m.src) m.play().catch(() => {}); }); }
  v.paused = on; if (bar) bar.style.animationPlayState = on || v.wait ? 'paused' : 'running'; if (box) box.classList.toggle('paused', on);
  if (bt) { bt.innerHTML = on ? SV_PLAY : SV_PAUSE; bt.setAttribute('aria-label', on ? 'Reprendre la lecture' : 'Mettre en pause'); }
}
document.addEventListener('keydown', e => { if (S.sv && e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { e.preventDefault(); svPause(); } });
function stOpen(uid) {
  const g = uid === S.me.id ? {user: S.me, items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === uid);
  if (!g || !g.items.length) return; const i = Math.max(0, g.items.findIndex(x => !x.seen)); S.sv = {uid, i: uid === S.me.id ? 0 : i}; renderSV();
}
function renderSV() {
  const v = S.sv; if (!v) return;
  const mine = v.uid === S.me.id, g = mine ? {user: S.me, items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === v.uid);
  const it = g && g.items[v.i]; if (!it) return svNextUser();
  if (!mine && !it.seen) { it.seen = true; api(`/api/statuses/${it.id}/view`, {}).catch(() => {}); }
  const vid = it.kind === 'video', dur = vid ? (Math.min(62, Math.max(3, it.dur || 15)) + 2) * 1000 : it.music ? 15000 : 6000; stFontsLoad();
  layer.innerHTML = `<div class="sv${it.media ? ' media' : ''}" style="${stBgStyle(it.bg || 170)}${stBgc(it.bg) ? `;--bgd:${+it.bg === 362 ? '#1b1f22' : stBgc(it.bg)}` : ''}" role="dialog" aria-modal="true" aria-label="Statut"><div class="sv-bars">${g.items.map((_, k) => `<i class="${k < v.i ? 'done' : k === v.i ? 'run' : ''}"><b${k === v.i ? ` style="animation-duration:${dur / 1000}s"` : ''}></b></i>`).join('')}</div>
    <div class="sv-head">${avatar(g.user, 'sm')}<div class="grow"><b>${esc(mine ? 'Mon statut' : g.user.name)}</b><small>${dayLabel(it.at)}, ${hm(it.at)}${it.aud === 'private' ? ' · Privé' : ''}</small></div>${mine ? '' : `<button class="ib sv-call" type="button" data-act="svCall" data-v="1" aria-label="Appel vidéo" title="Appel vidéo">${I.video}</button><button class="ib sv-call" type="button" data-act="svCall" data-v="" aria-label="Appel vocal" title="Appel vocal">${I.phone}</button>`}<button class="ib sv-pp" type="button" data-act="svPause" aria-label="Mettre en pause" title="Pause (barre d’espace)">${SV_PAUSE}</button><button class="ib" type="button" data-act="close" aria-label="Fermer">${I.close}</button></div><span class="sv-paused" aria-live="polite">En pause</span>
    <div class="sv-stage"><div class="sv-box${it.aud === 'private' ? ' nocopy' : ''}">${it.media ? (vid ? `<video data-stvid="${it.id}" class="${it.mir ? 'mirror' : ''}" playsinline autoplay controlslist="nodownload" disablepictureinpicture></video>` : it.enc ? `<img data-stenc="${it.id}" alt="" draggable="false">` : `<img src="${esc(it.media)}" alt="" draggable="false">`) : `<div class="sv-text" style="font-family:${stFont(it.font)}">${esc(it.text)}</div>`}${it.media && it.text ? `<div class="sv-cap" style="font-family:${stFont(it.font)}">${esc(it.text)}</div>` : ''}${it.music ? `<div class="sv-mus">🎵 ${esc(it.mname || 'Musique')}</div><audio data-stmus="${it.id}" loop></audio>` : ''}
      ${it.aud === 'private' && !mine ? watermark() : ''}</div><button class="sv-nav prev" type="button" data-act="svPrev" aria-label="Statut précédent"></button><button class="sv-nav next" type="button" data-act="svNext" aria-label="Statut suivant"></button></div>
    ${mine ? `<div class="sv-foot"><button class="btn sm ghost" type="button" data-act="svViews">${I.eye}${(it.views || []).length} vue${(it.views || []).length > 1 ? 's' : ''}</button><button class="btn sm ghost" type="button" data-act="stNew">${I.plus}Ajouter</button><button class="btn sm ghost" type="button" data-act="stDelAsk" data-id="${it.id}">${I.trash}Supprimer</button></div>` : `<form class="sv-reply" data-form="svReply" autocomplete="off"><div class="svr-in">${Emoji.btn('#svrIn', 'ib svr-x')}<input id="svrIn" maxlength="1000" placeholder="Répondre à ${esc(first(g.user.name))}…" aria-label="Répondre au statut"><button class="ib svr-x svr-mic" type="button" data-act="svrMic" aria-label="Message vocal">${I.mic}</button><button class="ib svr-send" type="submit" aria-label="Envoyer">${I.send}</button></div><button class="svr-fire${it.flamed ? ' on' : ''}" type="button" data-act="svFlame" aria-label="Envoyer une flamme" title="Envoyer une flamme">🔥</button></form>`}</div>`;
  clearTimeout(svT); Object.assign(v, {t0: Date.now(), left: dur, paused: false, wait: !!it.media});
  if (!it.media) svT = setTimeout(() => svStep(1), dur);
  else { const bar = layer.querySelector('.sv-bars i.run b'); if (bar) bar.style.animationPlayState = 'paused'; layer.querySelector('.sv-box').insertAdjacentHTML('beforeend', '<div class="lk-spin sv-wait" aria-label="Chargement"></div>'); }
  // Répondre : le statut se met en pause pendant qu'on écrit ; émoticônes et micro n'apparaissent qu'à ce moment-là.
  const ri = layer.querySelector('#svrIn'), rf = layer.querySelector('.sv-reply');
  if (ri) {
    ri.addEventListener('focus', () => { rf.classList.add('on'); svPause(true); });
    ri.addEventListener('input', () => rf.classList.toggle('typed', !!ri.value.trim()));
    rf.addEventListener('pointerdown', e => { if (e.target.closest('button,.emo-panel')) rf._keep = Date.now(); });
    ri.addEventListener('blur', () => setTimeout(() => { if (!layer.contains(ri) || document.activeElement === ri || Emoji.el || ri.value.trim() || S.svRec || Date.now() - (rf._keep || 0) < 4000) return; rf.classList.remove('on'); svPause(false); }, 250));
  }
  // Doigt posé sur le statut (ou clic maintenu) : pause le temps de lire, reprise au relâchement.
  const stg = layer.querySelector('.sv-stage'); let holdT = 0, held = false;
  stg.addEventListener('pointerdown', () => { held = false; clearTimeout(holdT); holdT = setTimeout(() => { if (!S.sv || S.sv.paused) return; held = true; svPause(true); }, 220); });
  const up = () => { clearTimeout(holdT); if (held) { svPause(false); setTimeout(() => { held = false; }, 0); } };
  stg.addEventListener('pointerup', up); stg.addEventListener('pointercancel', up); stg.addEventListener('pointerleave', up);
  stg.addEventListener('click', e => { if (held) { e.stopPropagation(); e.preventDefault(); } }, true);
  stg.addEventListener('contextmenu', e => e.preventDefault());
  const dec = (url, iv, type) => svFetch(it, url, iv, type);
  const vv = layer.querySelector('video[data-stvid]');
  if (vv && it._key && it.miv) dec(it.media, it.miv, it.vmime || 'video/mp4').then(u => { if (!layer.contains(vv)) return; vv.onplaying = () => svReady(); vv.src = u; if (S.sv && S.sv.paused) return; vv.play().catch(() => { vv.muted = true; vv.play().catch(() => {}); }); vv.onended = () => { clearTimeout(svT); svStep(1); }; }).catch(() => {});
  const au = layer.querySelector('audio[data-stmus]');
  if (au && it._key && it.mmiv) dec(it.music, it.mmiv, 'audio/mpeg').then(u => { if (!layer.contains(au)) return; au.src = u; if (!(S.sv && S.sv.paused)) au.play().catch(() => {}); }).catch(() => {});
  const im = layer.querySelector('img[data-stenc]');
  if (im && it._key && it.miv) dec(it.media, it.miv, 'image/jpeg').then(u => { if (!layer.contains(im)) return; im.onload = () => svReady(); im.src = u; }).catch(() => svReady());
  svPrefetch(it);
}
/* Préchargement (comme TikTok) : pendant qu'on regarde un statut, le suivant est déjà téléchargé et déchiffré.
   Un seul à l'avance, et rien en mode économie de données. */
const svCache = new Map();
function svFetch(it, url, iv, type) {
  if (!svCache.has(url)) {
    const p = fetch(url, {credentials: 'same-origin'}).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(b => E2E.decBytes(it._key, iv, b)).then(b => URL.createObjectURL(new Blob([b], {type})));
    p.catch(() => svCache.delete(url)); svCache.set(url, p);
    // on ne garde que les 4 derniers (le courant, le suivant, et de quoi revenir en arrière)
    while (svCache.size > 4) { const [k, old] = svCache.entries().next().value; svCache.delete(k); old.then(u => setTimeout(() => URL.revokeObjectURL(u), 60_000)).catch(() => {}); }
  }
  return svCache.get(url);
}
function svNextOf(v) {
  const mine = v.uid === S.me.id, g = mine ? {items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === v.uid);
  if (g && g.items[v.i + 1]) return g.items[v.i + 1];
  if (mine) return null;
  const k = S.statuses.others.findIndex(x => x.user.id === v.uid), nx = S.statuses.others[k + 1]; return nx ? nx.items[0] : null;
}
function svPrefetch() {
  if (!S.sv || dataSaver()) return; const nx = svNextOf(S.sv); if (!nx || !nx._key || !nx.miv || !nx.media) return;
  setTimeout(() => { if (S.sv) svFetch(nx, nx.media, nx.miv, nx.kind === 'video' ? (nx.vmime || 'video/mp4') : 'image/jpeg').catch(() => {}); }, 300);
}
function svCacheClear() { for (const p of svCache.values()) p.then(u => URL.revokeObjectURL(u)).catch(() => {}); svCache.clear(); }
const dataSaver = () => { try { return localStorage.getItem('tt:saver') === '1'; } catch { return false; } };
function svStep(d) {
  const v = S.sv; if (!v) return; const mine = v.uid === S.me.id, g = mine ? {items: S.statuses.mine.items} : S.statuses.others.find(x => x.user.id === v.uid);
  const n = v.i + d; if (n < 0) return svPrevUser(); if (!g || n >= g.items.length) return svNextUser(); v.i = n; renderSV();
}
function svPrevUser() {
  const v = S.sv; if (!v) return; if (v.uid === S.me.id) { v.i = 0; return renderSV(); }
  const k = S.statuses.others.findIndex(x => x.user.id === v.uid), pv = S.statuses.others[k - 1];
  if (pv) { S.sv = {uid: pv.user.id, i: pv.items.length - 1}; renderSV(); } else { v.i = 0; renderSV(); }
}
function svNextUser() {
  const v = S.sv; if (!v || v.uid === S.me.id) { closeLayer(); renderStories(); return; }
  const k = S.statuses.others.findIndex(x => x.user.id === v.uid), nx = S.statuses.others[k + 1];
  for (const g of S.statuses.others) g.allSeen = g.items.every(i => i.seen);
  if (nx) { S.sv = {uid: nx.user.id, i: 0}; renderSV(); } else { closeLayer(); renderStories(); }
}

