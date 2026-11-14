/* Vitrine Tam-Tam : formulaire « Nous écrire » et bulle de discussion avec l'équipe.
   Les messages sont chiffrés dans le navigateur (secure.js, comme dans l'application) : la clé du visiteur reste ici. */
'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const KEY = 'visite';
  const V = {owner: null, guest: null, chatId: 0, es: null, open: false, unread: 0, seen: new Set()};

  async function api(path, body) {
    const r = await fetch('/api/visite/' + path, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), credentials: 'same-origin'} : {credentials: 'same-origin'});
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j.error || 'Connexion impossible. Réessayez.');
    return j;
  }
  const hhmm = t => new Date(t).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});

  /* ---------- clé et compte visiteur ---------- */
  async function ensureKey() {
    if (E2E.ready()) return;
    if (!(await E2E.load(KEY))) await E2E.create(KEY);
  }
  async function ensureGuest(name, contact) {
    if (V.guest) return;
    await ensureKey();
    const r = await api('debut', {name, contact, pubkey: E2E.pubJwk});
    V.guest = {id: r.guest.id, name}; V.chatId = r.chatId; connect();
  }
  async function seal(text) {
    await ensureKey();
    if (!V.owner || !V.owner.pubkey) throw new Error('La discussion n’est pas disponible pour le moment.');
    return (await E2E.seal({t: text}, [[V.owner.id, V.owner.pubkey], [V.guest.id, E2E.pubJwk]])).env;
  }
  async function textOf(m) {
    if (m.deleted) return {t: 'Message supprimé', del: true};
    if (!m.enc) return {t: m.text || ''};
    const o = E2E.ready() ? await E2E.open(m.enc, V.guest.id) : {err: 1};
    return o.err ? {t: '(message illisible sur cet appareil)', del: true} : {t: String(o.payload.t || '')};
  }

  /* ---------- bulle ---------- */
  const bulle = $('#bulle'), bp = $('#bp'), fil = $('.fil', bp), form = $('form', bp), intro = $('.intro', bp), typ = $('.typ', bp);
  function status() {
    const on = V.owner && V.owner.online;
    $('.st', bp).textContent = on ? 'En ligne' : 'Nous répondons dès que possible';
    $('.pt', bulle).hidden = !on;
    const nb = $('.nb', bulle); nb.hidden = !V.unread || V.open; nb.textContent = V.unread;
  }
  function showChat() { intro.hidden = true; fil.hidden = false; form.hidden = false; typ.hidden = false; }
  function note(t) { const d = document.createElement('div'); d.className = 'note'; d.textContent = t; fil.append(d); fil.scrollTop = fil.scrollHeight; }
  async function add(m) {
    if (V.seen.has(m.id)) return; V.seen.add(m.id);
    const x = await textOf(m), d = document.createElement('div'), mine = m.from === V.guest.id;
    d.className = 'm ' + (mine ? 'moi' : 'eux'); if (x.del) d.style.opacity = '.6';
    d.textContent = x.t; const s = document.createElement('small'); s.textContent = hhmm(m.at); d.append(s);
    fil.append(d); fil.scrollTop = fil.scrollHeight;
    if (!mine) { if (V.open) read(m.id); else { V.unread++; status(); } }
  }
  let readT = 0; function read(id) { clearTimeout(readT); readT = setTimeout(() => api('lu', {upTo: id}).catch(() => {}), 400); }
  function connect() {
    if (V.es || !V.guest) return;
    V.es = new EventSource('/api/visite/flux');
    V.es.onmessage = e => {
      let ev; try { ev = JSON.parse(e.data); } catch { return; }
      if (ev.t === 'msg' && ev.msg && ev.msg.chatId === V.chatId) { typ.textContent = ''; if (ev.update) return; add(ev.msg); }
      else if (ev.t === 'typing' && ev.chatId === V.chatId && ev.user !== V.guest.id) { typ.textContent = 'L’équipe Tam-Tam écrit…'; clearTimeout(V.tt); V.tt = setTimeout(() => { typ.textContent = ''; }, 5000); }
      else if (ev.t === 'presence' && V.owner && ev.id === V.owner.id) { V.owner.online = !!ev.online; status(); }
    };
  }
  function openBulle() {
    V.open = true; bp.hidden = false; bulle.hidden = true; V.unread = 0; status();
    if (V.guest) { showChat(); const last = [...V.seen].pop(); if (last) read(last); setTimeout(() => $('textarea', form).focus(), 50); }
    else setTimeout(() => $('[name=nom]', intro).focus(), 50);
  }
  function closeBulle() { V.open = false; bp.hidden = true; bulle.hidden = false; status(); }
  async function send(text) {
    const r = await api('message', {enc: await seal(text)}); await add(r.msg);
  }
  $('button', bulle).addEventListener('click', openBulle);
  $('[data-fermer]', bp).addEventListener('click', closeBulle);
  $('[data-commencer]', intro).addEventListener('click', async e => {
    const err = $('.err', intro), name = $('[name=nom]', intro).value.trim(), contact = $('[name=contact]', intro).value.trim(), msg = $('[name=msg]', intro).value.trim();
    err.hidden = true;
    if (name.length < 2) { err.textContent = 'Indiquez votre prénom.'; err.hidden = false; return; }
    if (!msg) { err.textContent = 'Écrivez votre message.'; err.hidden = false; return; }
    e.target.disabled = true;
    try {
      await ensureGuest(name, contact); showChat(); await send(msg);
      if (!V.owner.online) note(contact ? 'Merci ! Nous ne sommes pas connectés pour le moment : nous vous répondrons ici ou à l’adresse indiquée.' : 'Merci ! Nous ne sommes pas connectés pour le moment. Revenez sur cette page plus tard, ou laissez ici votre e-mail ou numéro pour que nous vous répondions.');
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    e.target.disabled = false;
  });
  const ta = $('textarea', form);
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); const t = ta.value.trim(); if (!t) return;
    ta.value = ''; ta.style.height = 'auto';
    try { await send(t); } catch (x) { ta.value = t; note(x.message); }
  });
  document.querySelectorAll('[data-ouvrir="bulle"]').forEach(b => b.addEventListener('click', openBulle));

  /* ---------- formulaire « Nous écrire » ---------- */
  const md = $('#ecrire'), mf = $('form', md);
  const openForm = () => { md.hidden = false; $('.ok', mf).hidden = true; $('.err', mf).hidden = true; $('[type=submit]', mf).hidden = false; setTimeout(() => mf.nom.focus(), 50); };
  const closeForm = () => { md.hidden = true; };
  document.querySelectorAll('[data-ouvrir="ecrire"]').forEach(b => b.addEventListener('click', openForm));
  $('[data-fermer]', mf).addEventListener('click', closeForm);
  md.addEventListener('click', e => { if (e.target === md) closeForm(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!md.hidden) closeForm(); else if (V.open) closeBulle(); } });
  mf.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('.err', mf), ok = $('.ok', mf), btn = $('[type=submit]', mf);
    const f = {nom: mf.nom.value.trim(), email: mf.email.value.trim(), tel: mf.tel.value.trim(), objet: mf.objet.value.trim(), message: mf.message.value.trim()};
    err.hidden = true;
    const miss = !f.nom ? 'votre nom' : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) ? 'une adresse e-mail valide' : !f.objet ? 'l’objet' : f.message.length < 5 ? 'votre message' : '';
    if (miss) { err.textContent = 'Merci d’indiquer ' + miss + '.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      if (!V.owner) await load();
      await ensureGuest(f.nom, f.email + (f.tel ? ' · ' + f.tel : ''));
      const text = `📩 Formulaire « Nous écrire »\nObjet : ${f.objet}\nNom : ${f.nom}\nE-mail : ${f.email}\nNuméro : ${f.tel || '—'}\n\n${f.message}`;
      const r = await api('formulaire', {...f, enc: await seal(text)});
      await add(r.msg);
      ok.textContent = 'Merci ' + f.nom.split(' ')[0] + ' ! Votre message est bien arrivé. Nous vous répondrons par e-mail' + (f.tel ? ' ou par téléphone' : '') + ', ou ici dans la bulle Tam-Tam en bas de la page.';
      ok.hidden = false; btn.hidden = true; mf.objet.value = ''; mf.message.value = '';
      $('[data-fermer]', mf).textContent = 'Fermer';
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    btn.disabled = false;
  });

  /* ---------- démarrage ---------- */
  async function load() {
    let st; try { st = await api('etat'); } catch { return; }
    if (st.off) { bulle.hidden = true; document.querySelectorAll('[data-ouvrir="bulle"]').forEach(b => { b.closest('.cc').hidden = true; }); return; }
    V.owner = st.owner;
    if (st.guest) {
      V.guest = st.guest; V.chatId = st.chatId || 0; await E2E.load(KEY);
      for (const m of st.msgs || []) await add(m);
      V.unread = 0; connect();
    }
    status();
  }
  load();
})();
