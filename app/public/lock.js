/* tam-tam — Clés de chiffrement (création, récupération) et verrouillage par schéma ou empreinte.
   Extrait de app.js (nov. 2026) : chargé après app.js, partage ses variables globales. */
'use strict';
/* ---------- clés de chiffrement : création ou récupération ---------- */
// Code de sauvegarde : 8 caractères au moins, pas une suite évidente (les anciens codes restent valables).
function codeWeak(c) {
  c = String(c || ''); if (c.length < 8) return 'Le code doit contenir au moins 8 caractères (lettres, chiffres ou signes).';
  if (/^(.)\1+$/.test(c) || '01234567890123456789'.includes(c) || '98765432109876543210'.includes(c)) return 'Ce code est trop facile à deviner. Mélangez lettres et chiffres, par exemple « Baobab-2026 ».';
  return '';
}
async function keySetup(reupload) {
  let r = null; try { r = await api('/api/keys/backup'); } catch (e) { r = {err: e.message}; }
  if (!reupload && r && (r.stale || r.err)) { S.ks = {mode: 'stale', msg: r.err}; return renderKeySetup(); }
  const bk = r && r.backup;
  const mode = reupload ? 'new' : bk ? 'restore' : 'new';
  S.ks = {mode, bk};
  renderKeySetup();
}
function renderKeySetup(msg) {
  const k = S.ks, top = `<div class="auth-top"><h1 class="brand-h">${BRAND()}</h1></div>`;
  const h = k.mode === 'restore'
    ? `<h2>${I.lock} Retrouver vos messages</h2><p class="hint">Vos messages sont chiffrés de bout en bout. Sur ce nouvel appareil ou ce navigateur, entrez votre code de sauvegarde pour les relire.</p>
      <div class="field"><label for="kCode">Code de sauvegarde</label><input id="kCode" type="password" autocomplete="off"></div>
      <p class="err" id="kErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Retrouver mes messages</button>
      <button class="linkb" type="button" data-act="ksLost">J’ai oublié mon code</button>`
    : k.mode === 'stale'
    ? `<h2>${I.lock} Reconnexion nécessaire</h2><p class="hint">${k.msg ? esc(k.msg) : 'Pour votre sécurité, vos messages ne peuvent être récupérés que juste après une connexion avec votre mot de passe.'}</p>
      <p class="hint">Reconnectez-vous, puis entrez votre code de sauvegarde.</p><button class="btn" type="button" data-act="logout">Se reconnecter</button>`
    : k.mode === 'lost'
    ? `<h2>Code oublié</h2><p>Sans le code, les anciens messages chiffrés ne peuvent plus être relus sur cet appareil. Personne ne peut les récupérer, pas même le responsable de tam-tam.</p><p class="hint">Vous pouvez repartir avec une nouvelle clé : vos contacts verront que votre code de sécurité a changé, et les nouveaux messages seront lisibles.</p>
      <div class="actions"><button class="btn ghost" type="button" data-act="ksBack">Réessayer mon code</button><button class="btn danger" type="button" data-act="ksNew">Repartir avec une nouvelle clé</button></div>`
    : `<h2>${I.lock} Protéger vos messages</h2><p class="hint">tam-tam chiffre vos messages et vos photos de bout en bout : seuls les appareils des personnes qui discutent peuvent les lire, pas même le serveur (sauf les textes que vous faites traduire : voir les conditions).</p>
      <p class="hint">Choisissez un <b>code de sauvegarde</b>. Il vous servira à retrouver vos messages si vous changez de téléphone. Notez-le en lieu sûr : personne ne pourra le retrouver pour vous.</p>
      <div class="field"><label for="kCode">Code de sauvegarde <span class="req">· au moins 8 caractères</span></label><input id="kCode" type="password" autocomplete="new-password" placeholder="Ex. : Baobab-2026"></div>
      <div class="field"><label for="kCode2">Confirmez le code</label><input id="kCode2" type="password" autocomplete="new-password"></div>
      <p class="err" id="kErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p><button class="btn" type="submit">Activer le chiffrement</button>`;
  root.innerHTML = `<div class="auth"><form class="auth-card" data-form="keys" novalidate>${top}${h}</form></div>`;
  const f = root.querySelector('input'); if (f) f.focus();
}
async function submitKeys() {
  const k = S.ks, code = ($('#kCode') || {}).value || '', btn = root.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    if (k.mode === 'restore') {
      if (!await E2E.restore(S.me.id, code, k.bk)) { if (btn) btn.disabled = false; return renderKeySetup('Code incorrect. Vérifiez et réessayez.'); }
    } else {
      if (codeWeak(code)) { if (btn) btn.disabled = false; return renderKeySetup(codeWeak(code)); }
      if (code !== $('#kCode2').value) { if (btn) btn.disabled = false; return renderKeySetup('Les deux codes ne sont pas identiques.'); }
      if (!E2E.ready() || S.ks.fresh) await E2E.create(S.me.id);
      await api('/api/keys', {pubkey: E2E.pubJwk, backup: await E2E.backup(code)});
      S.me.pubkey = E2E.pubJwk;
    }
    const r = await api('/api/me'); S.me = r.me; keepUsers([r.me]); start();
  } catch (e) { if (btn) btn.disabled = false; renderKeySetup(e.message); }
}
async function myFingerprint() { return E2E.fingerprint(E2E.pubJwk); }

/* ---------- verrouillage par schéma ou empreinte ---------- */
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!S.me || !S.lock || S.lock.type === 'off') return;
  if (document.hidden) hiddenAt = Date.now();
  else if (!S.locked && Date.now() - hiddenAt >= (S.lock.delay || 0) * 1000) { S.locked = true; showLock(); }
});
function patternPad(id) { return `<div class="pad" id="${id}" role="group" aria-label="Schéma de déverrouillage">${Array.from({length: 9}, (_, i) => `<span class="pd" data-i="${i}"></span>`).join('')}<svg class="pad-line" viewBox="0 0 300 300" aria-hidden="true"><polyline points=""/></svg></div>`; }
function bindPad(id, done) {
  const pad = $('#' + id); if (!pad) return; let seq = [], on = false;
  const dots = [...pad.querySelectorAll('.pd')], line = pad.querySelector('polyline');
  const center = i => { const r = pad.getBoundingClientRect(), d = dots[i].getBoundingClientRect(); return [(d.left + d.width / 2 - r.left) / r.width * 300, (d.top + d.height / 2 - r.top) / r.height * 300]; };
  // zone ronde autour de chaque point : un trait en diagonale ne touche plus les voisins par erreur
  const hit = (x, y) => { const r = pad.getBoundingClientRect(), rad = r.width / 3 * 0.3; return dots.findIndex(d => { const b = d.getBoundingClientRect(); return Math.hypot(x - (b.left + b.width / 2), y - (b.top + b.height / 2)) < rad; }); };
  const draw = (fx, fy) => { const pts = seq.map(i => center(i).join(',')); if (on && fx != null) { const r = pad.getBoundingClientRect(); pts.push(`${(fx - r.left) / r.width * 300},${(fy - r.top) / r.height * 300}`); } line.setAttribute('points', pts.join(' ')); dots.forEach((d, i) => d.classList.toggle('on', seq.includes(i))); };
  const add = e => {
    const i = hit(e.clientX, e.clientY);
    if (i >= 0) {
      if (seq.length >= 2 && i === seq[seq.length - 2]) { seq.pop(); if (navigator.vibrate) try { navigator.vibrate(6); } catch {} }   // revenir sur le point précédent l'efface
      else if (!seq.includes(i)) {
        const last = seq[seq.length - 1];
        if (last != null) { const mid = (last + i) / 2; if (Number.isInteger(mid) && (last % 3) + (i % 3) === 2 * (mid % 3) && !seq.includes(mid)) seq.push(mid); }  // point sauté au milieu
        seq.push(i); if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      }
    }
    draw(e.clientX, e.clientY);
  };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); on = true; seq = []; pad.setPointerCapture(e.pointerId); add(e); });
  pad.addEventListener('pointermove', e => { if (on) add(e); });
  const end = () => { if (!on) return; on = false; draw(); const s2 = seq.slice(); setTimeout(() => { seq = []; draw(); }, 350); if (s2.length) done(s2); };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
// Écran de verrouillage : fond noir, logo turquoise, rien de personnel.
// Ordre : empreinte ou visage → si échec, schéma → après 5 schémas faux, mot de passe Tam-Tam.
function showLock(msg) {
  const L = S.lock; S.lockTries = S.lockTries || 0;
  if (!S.lockStep) S.lockStep = L.bio && !S.bioTried ? 'bio' : 'pattern';
  let el = $('#lockScreen'); if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; el.className = 'lock-screen'; document.body.appendChild(el); }
  el.classList.add('dark'); const st = S.lockStep;
  el.innerHTML = `<div class="lock-card dark" role="dialog" aria-modal="true" aria-label="Tam-Tam est verrouillé"><div class="auth-top"><h1 class="brand-h">${BRAND('lock-logo')}</h1></div>
    ${st === 'bio' ? `<p class="lk-hint">Déverrouillage par empreinte ou visage…</p><div class="lk-spin" aria-hidden="true"></div>`
    : st === 'pattern' ? `<p class="lk-hint">Dessinez votre schéma</p>${patternPad('lockPad')}`
    : `<form class="lk-pass" data-form="lockPass"><p class="lk-hint">Schéma oublié ? Entrez votre mot de passe Tam-Tam.</p><input id="lkPass" type="password" autocomplete="current-password" placeholder="Mot de passe" aria-label="Mot de passe"><button class="btn" type="submit">Déverrouiller</button></form>`}
    <p class="err" id="lkErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p>
    <div class="lk-links">${st !== 'bio' && L.bio ? `<button class="linkb" type="button" data-act="lockBio">Utiliser l’empreinte ou le visage</button>` : ''}
    ${st === 'pattern' ? '<button class="linkb" type="button" data-act="lockPassStep">Utiliser mon mot de passe</button>' : ''}${st === 'pass' ? '<button class="linkb" type="button" data-act="lockPatStep">Revenir au schéma</button><button class="linkb" type="button" data-act="lockForgot">Mot de passe oublié ? Me reconnecter</button>' : ''}</div></div>`;
  if (st === 'pattern') bindPad('lockPad', async seq => {
    if (await Lock.hashPattern(seq, L.salt) === L.hash) return unlock();
    S.lockTries++;
    if (S.lockTries >= 5) { S.lockTries = 0; S.lockStep = 'pass'; return showLock('Schéma incorrect 5 fois : entrez votre mot de passe.'); }
    showLock(`Schéma incorrect. ${5 - S.lockTries} essai${5 - S.lockTries > 1 ? 's' : ''} restant${5 - S.lockTries > 1 ? 's' : ''}.`);
  });
  if (st === 'pass') setTimeout(() => { const i = $('#lkPass'); if (i) i.focus(); }, 50);
  if (st === 'bio' && !S.bioTried) { S.bioTried = true; setTimeout(() => ACT.lockBio(), 250); }
}
function unlock() { S.locked = false; S.lockTries = 0; S.bioTried = false; S.lockStep = null; const el = $('#lockScreen'); if (el) el.remove(); if (S.chatId) markRead(); }
function lockSettingsHtml() {
  const L = S.lock || {type: 'off', delay: 60};
  return `<div class="set-block"><h2>${I.lock} Verrouillage de l’application</h2><p class="hint">Vous restez connecté, mais tam-tam demande votre schéma${L.bio ? ' ou votre empreinte' : ''} à chaque ouverture. Personne ne peut lire vos messages si on prend votre téléphone.</p>
    ${L.type === 'off' ? `<div><button class="btn sm" type="button" data-act="lockSetup">Choisir un schéma de déverrouillage</button></div>` : `
    <p>${I.check || ''} Verrouillage actif${L.bio ? ' · schéma + empreinte ou visage' : ' · schéma'}</p>
    <span class="lbl">Verrouiller après</span><div class="chips">${[[0, 'Tout de suite'], [60, '1 minute'], [300, '5 minutes'], [1800, '30 minutes']].map(([v, l]) => `<button class="chip" type="button" data-act="lockDelay" data-v="${v}" aria-pressed="${(L.delay || 0) === v}">${l}</button>`).join('')}</div>
    <div class="actions" style="justify-content:flex-start">${L.bio ? '<button class="btn sm ghost" type="button" data-act="bioOff">Retirer l’empreinte</button>' : `<button class="btn sm ghost" type="button" data-act="bioOn" id="bioBtn">${I.key}Ajouter l’empreinte ou le visage</button>`}<button class="btn sm ghost" type="button" data-act="lockSetup">Changer le schéma</button></div>`}</div>`;
}
/* Verrouillage obligatoire : sans lui, une notification ouvrirait les messages à n'importe qui. */
function requireLock(step, first, msg) {
  let el = $('#lockScreen'); if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; el.className = 'lock-screen'; document.body.appendChild(el); }
  el.innerHTML = `<div class="lock-card" role="dialog" aria-modal="true" aria-label="Protéger tam-tam"><div class="auth-top"><h1 class="brand-h">${BRAND()}</h1></div>
    <h2 style="margin:0">${I.lock} Protégez vos messages</h2>
    <p class="hint">${step === 2 ? 'Dessinez le même schéma pour confirmer.' : 'Choisissez un schéma de déverrouillage : tam-tam le demandera à chaque ouverture, même depuis une notification. Reliez au moins 4 points sans lever le doigt.'}</p>
    ${patternPad('reqPad')}<p class="err" id="rqErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p></div>`;
  bindPad('reqPad', async seq => {
    if (seq.length < 4) return requireLock(step, first, 'Reliez au moins 4 points.');
    if (step !== 2) return requireLock(2, seq);
    if (seq.join() !== first.join()) return requireLock(1, null, 'Les deux schémas sont différents. Recommencez.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    S.lock = {type: 'pattern', delay: 0, salt, hash: await Lock.hashPattern(seq, salt)}; await Lock.set(S.me.id, S.lock);
    el.remove(); toast('Schéma enregistré : tam-tam se verrouille à chaque ouverture.');
    if (await Lock.bioCheck()) sheet(`${head('Empreinte ou visage')}<div class="sheet-body"><p class="hint">Voulez-vous aussi déverrouiller tam-tam avec votre empreinte ou votre visage ? C’est plus rapide que le schéma.</p><div class="actions"><button class="btn ghost" type="button" data-act="close">Plus tard</button><button class="btn" type="button" data-act="bioOn">Oui, utiliser mon empreinte</button></div></div>`, 'Empreinte');
  });
}
function lockSetupSheet(step, first, msg) {
  sheet(`${head('Schéma de déverrouillage')}<div class="sheet-body" style="align-items:center"><p class="hint" style="text-align:center">${step === 2 ? 'Dessinez le même schéma pour confirmer.' : 'Reliez au moins 4 points sans lever le doigt.'}</p>${patternPad('setPad')}<p class="err" id="spErr" role="alert"${msg ? '' : ' hidden'}>${esc(msg || '')}</p></div>`, 'Schéma');
  bindPad('setPad', async seq => {
    if (seq.length < 4) return lockSetupSheet(step, first, 'Reliez au moins 4 points.');
    if (step !== 2) return lockSetupSheet(2, seq);
    if (seq.join() !== first.join()) return lockSetupSheet(1, null, 'Les deux schémas sont différents. Recommencez.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    S.lock = Object.assign({delay: 0}, S.lock || {}, {type: 'pattern', salt, hash: await Lock.hashPattern(seq, salt)});
    await Lock.set(S.me.id, S.lock); closeLayer(); renderBody(); toast('Schéma enregistré : tam-tam se verrouillera automatiquement');
  });
}

