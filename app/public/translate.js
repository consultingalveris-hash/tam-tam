/* tam-tam — Traduction à la demande (Google puis Claude), corrections et base de traduction.
   Extrait de app.js (nov. 2026) : fichier chargé après app.js, partage ses variables globales (S, api, toast…). */
'use strict';
/* ---------- traduction à la demande ---------- */
const LANG_FR = {bas: 'bassa (essai)', dua: 'duala (essai)', ewo: 'ewondo (essai)', srr: 'sérère (essai)', mnk: 'mandinka (essai)', snk: 'soninké (essai)', dyo: 'diola (essai)', fan: 'fang (essai)', bum: 'boulou (essai)', mos: 'mooré (essai)', fon: 'fon (essai)', dyu: 'dioula (essai)', kab: 'kabyle (essai)', tzm: 'tamazight (essai)', ber: 'berbère (essai)', kri: 'krio (essai)', fr: 'français', en: 'anglais', wo: 'wolof', ff: 'peul (pulaar)', bm: 'bambara', ln: 'lingala', sw: 'swahili', ha: 'haoussa', yo: 'yoruba', ig: 'igbo', ee: 'ewe', ak: 'twi', rw: 'kinyarwanda', sg: 'sango', ar: 'arabe', pt: 'portugais', es: 'espagnol', de: 'allemand', it: 'italien', zh: 'chinois', ru: 'russe', tr: 'turc', nl: 'néerlandais', hi: 'hindi', am: 'amharique', so: 'somali', zu: 'zoulou', xh: 'xhosa', mg: 'malgache', rn: 'kirundi', kg: 'kikongo', ts: 'tsonga', tn: 'tswana', st: 'sotho', sn: 'shona', ny: 'chichewa', om: 'oromo', ti: 'tigrigna', lg: 'luganda', ki: 'kikuyu'};
const Tr = {
  st: null,
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { return null; } },
  // Langue par défaut pour « Traduire » sur un message (menu du message).
  lang() { return this.ls('tt-trlang') || 'fr'; },
  setLang(l) { this.ls('tt-trlang', l); },
  // Par discussion : la langue dans laquelle JE reçois, et celle dans laquelle MON CONTACT reçoit.
  // Discussion à deux : les langues sont partagées. Chacun choisit ce qu'il reçoit ; on peut proposer une langue à son contact.
  row(cid, mine) { const c = S.chats.get(cid); if (!c || (c.type !== 'direct' && !(mine && c.type === 'group'))) return null; return (c.members || []).find(x => mine ? x.id === S.me.id : x.id !== S.me.id) || null; },
  inL(cid) { const r = this.row(cid, true); if (r && r.trIn !== undefined) return this.pendR(r, cid) ? '' : r.trIn || ''; return this.ls('tt-trin:' + cid) || (this.ls('tt-trauto:' + cid) === '1' ? this.lang() : ''); },
  outL(cid) { const r = this.row(cid, false); if (r && r.trIn !== undefined) return r.trIn || ''; return this.ls('tt-trout:' + cid) || ''; },
  setIn(cid, l) { this.ls('tt-trauto:' + cid, ''); this.ls('tt-trin:' + cid, l); this.share(cid, 'me', l); },
  setOut(cid, l) { const r = this.row(cid, false); if (r && r.trBy === r.id) { toast(`${first(chatTitle(S.chats.get(cid)))} a choisi sa propre langue de réception : vous ne pouvez plus la changer.`); return false; } this.ls('tt-trout:' + cid, l); this.share(cid, 'peer', l); return true; },
  share(cid, who, l) {
    const r = this.row(cid, who === 'me'); if (!r) return; const old = {trIn: r.trIn, trBy: r.trBy}; r.trIn = l || ''; r.trBy = S.me.id;
    api(`/api/chats/${cid}/trlang`, {who, lang: l || ''}).then(x => { S.chats.set(cid, Object.assign(S.chats.get(cid), x.chat)); }).catch(e => { Object.assign(r, old); toast(e.message); renderComposer(); if (layer.querySelector('.tr-body')) trSheet(); });
  },
  // Langue choisie POUR moi par mon contact : rien n'est traduit tant que je ne l'ai pas acceptée
  // (sinon quelqu'un pourrait, pour s'amuser, me faire recevoir ses messages dans une langue que je ne connais pas).
  pendR(r, cid) { const c = S.chats.get(cid); return !!(c && c.type === 'direct' && r && r.trIn && r.trBy && r.trBy !== S.me.id); },
  pend(cid) { const r = this.row(cid, true); return this.pendR(r, cid) ? r.trIn : ''; },
  imposed(c) {
    const l = c && this.pend(c.id); if (!l || !S.me.trConsent) return ''; const L = (LANG_FR[l] || l).replace(/ \(essai\)$/, '');
    return `<div class="tr-imp">${I.translate}<span><b>${esc(first(chatTitle(c)))}</b> propose que vous receviez ses messages en <b>${esc(L)}</b>. En attendant votre choix, ils restent dans la langue où ils ont été écrits.</span>
      <div class="tr-imp-a"><button class="btn sm" type="button" data-act="trImpKeep">Accepter</button><button class="btn sm ghost" type="button" data-act="trImpOff">Sans traduction</button><button class="btn sm ghost" type="button" data-act="trAuto">Autre langue</button></div></div>`;
  },
  view(cid) { return this.inL(cid) || this.lang(); },
  get(id, l) { try { return JSON.parse(this.ls(`tt-tr:${id}:${l}`) || 'null'); } catch { return null; } },
  put(id, l, v) { this.ls(`tt-tr:${id}:${l}`, JSON.stringify(v)); },
  shown: new Set(), off: new Set(), flip: new Set(), busy: false,
  // Empreinte et clé tirées du texte : seul quelqu'un qui a déjà le message peut retrouver sa traduction.
  async keys(text, lang) {
    const h = async p => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p + '|' + lang + '|' + text)));
    const id = [...await h('tt-tr-id')].map(b => b.toString(16).padStart(2, '0')).join('');
    return {id, key: await crypto.subtle.importKey('raw', await h('tt-tr-key'), 'AES-GCM', false, ['encrypt', 'decrypt'])};
  },
  // Traduit un texte, en réutilisant d'abord la traduction déjà payée par quelqu'un d'autre.
  // Même phrase, à quelques espaces, majuscules ou ponctuation près.
  norm(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*([?!.,;:])\s*/g, '$1').replace(/[.!?]+$/, '').trim(); },
  b64(u) { return btoa(String.fromCharCode(...u)); }, unb64(t) { return Uint8Array.from(atob(t), x => x.charCodeAt(0)); },
  async mineGet(text, to) {
    const k = await this.keys(this.norm(text), to + '|mine'), c = await api('/api/translate/mine/' + k.id).catch(() => null);
    if (!c || !c.hit) return null; try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: this.unb64(c.hit.iv)}, k.key, this.unb64(c.hit.ct)))); } catch { return null; }
  },
  async minePut(text, to, v) {
    const k = await this.keys(this.norm(text), to + '|mine'), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k.key, new TextEncoder().encode(JSON.stringify(v))));
    await api('/api/translate/mine', {id: k.id, iv: this.b64(iv), ct: this.b64(ct)});
  },
  async fetch(text, to, ctx) {
    const mine = await this.mineGet(text, to); if (mine && mine.text) return {text: mine.text, from: mine.from || null, mine: true};
    const k = await this.keys(text, to), c = await api('/api/translate/cache/' + k.id).catch(() => null);
    if (c && c.hit) { try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: Uint8Array.from(atob(c.hit.iv), x => x.charCodeAt(0))}, k.key, Uint8Array.from(atob(c.hit.ct), x => x.charCodeAt(0))))); } catch {} }
    const r = await api('/api/translate', {text, to, ctx: ctx || []});
    r.fresh = true; const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k.key, new TextEncoder().encode(JSON.stringify(r))));
    const b64 = u => btoa(String.fromCharCode(...u)); api('/api/translate/cache', {id: k.id, iv: b64(iv), ct: b64(ct)}).catch(() => {});
    return r;
  },
  // Statut du service (activé, langues) : chargé au démarrage ; s'il arrive après l'ouverture d'une discussion, on relance la traduction.
  stLoading: null,
  loadSt() {
    if (this.stLoading) return this.stLoading;
    this.stAt = Date.now(); this.stLoading = api('/api/translate/status').then(r => { this.st = r; renderComposer(); if (S.chatId) renderMessages(true); })
      .catch(() => { setTimeout(() => this.loadSt(), 5000); }).finally(() => { this.stLoading = null; });
    return this.stLoading;
  },
  // Après un échec (réseau, service occupé) : nouvel essai après 3 s, puis 8 s, puis toutes les 20 s, sans rien perdre.
  retryT: 0,
  tries: 0,
  retry(c) { clearTimeout(this.retryT); const wait = [3000, 8000, 20000][Math.min(this.tries++, 2)]; this.retryT = setTimeout(() => { if (S.chatId === c.id) this.autoRun(S.chats.get(c.id) || c); }, wait); },
  // Groupe : la langue de réception choisie sur un appareil est enregistrée sur le compte, pour tous mes appareils.
  syncGroup(c, l) { if (c.type !== 'group') return; const r = this.row(c.id, true); if (r && r.trIn === undefined && !this.synced) { this.synced = true; this.share(c.id, 'me', l); } },
  async run(id, silent, l) {
    l = l || this.view(S.chatId);
    const m = (S.msgs.get(S.chatId) || []).find(x => x.id === id); if (!m || !m.text) return false;
    const srcText = m.orig != null ? m.orig : m.text;
    if (this.get(id, l)) { this.shown.add(id); if (!silent) renderMessages(true); return true; } // déjà traduit : rien n'est recompté
    try {
      const list = S.msgs.get(S.chatId) || [], i = list.indexOf(m), ctx = list.slice(Math.max(0, i - 4), i).filter(x => x.kind === 'text' && x.text && !x.once).map(x => x.text);
      const r = await this.fetch(srcText, l, ctx); this.put(id, l, {text: r.text, from: r.from}); this.shown.add(id);
      if (r.fresh) this.give(srcText, r.from, r.text, l, 'mt', m.from);
      if (!silent) renderMessages(true); return true;
    }
    catch (e) { if (!silent) toast(e.message); return false; }
  },
  async autoRun(c) {
    // Tout message reçu qui n'est pas dans ma langue est traduit ici, même si l'expéditeur ne l'a pas fait (ancienne version, réseau coupé…).
    const l = c && this.inL(c.id); if (!l || !S.me.trConsent) return;
    if (!this.st) return this.loadSt();
    if (!this.st.on) { if (Date.now() - (this.stAt || 0) > 60000) this.loadSt(); return; } if (this.busy) { this.again = c; return; }
    this.syncGroup(c, l);
    const todo = (S.msgs.get(c.id) || []).filter(m => m.from && m.from !== S.me.id && !m.once && !m.deleted && !m.locked && m.kind === 'text' && m.text && m.text.trim().length > 1 && m.tlang !== l && !this.shown.has(m.id) && !this.off.has(m.id)).slice(-30);
    if (!todo.length) return; this.busy = true;
    try { let ok = true; for (const m of todo) { if (S.chatId !== c.id || this.inL(c.id) !== l) break; if (this.get(m.id, l)) { this.shown.add(m.id); continue; } if (!await this.run(m.id, true, l)) { ok = false; this.retry(c); break; } } if (ok) this.tries = 0; }
    finally { this.busy = false; } if (S.chatId === c.id) renderMessages(true); const ag = this.again; this.again = null; if (ag && ag.id === S.chatId) this.autoRun(ag);
  },
  // Envoie une paire « texte d'origine → traduction » à la base de Tam-Tam (le serveur vérifie les accords).
  give(src, sl, tgt, tl, kind, author) { const a = author === S.me.id ? S.me : uOf(author); if (!a || !(author === S.me.id ? S.me.trConsent : a.trc) || (kind === 'fix' && !S.me.trConsent)) return; api('/api/corpus', {src, sl: sl || '', tgt, tl, kind, author}).catch(() => {}); },
  fix(id) { try { return JSON.parse(this.ls('tt-fix:' + id) || 'null'); } catch { return null; } },
  note(txt, act, id, lbl, more) { return `<span class="trl">${I.translate}${txt} · <button class="linkb" type="button" data-act="${act}" data-id="${id}">${lbl}</button>${more || ''}</span>`; },
  fixBtn(id, lbl) { return ` · <button class="linkb" type="button" data-act="trFix" data-id="${id}">✎ ${lbl || 'Corriger'}</button>`; },
  from(l) { const n = l && LANG_FR[l]; return n ? (/^[aeiouhé]/.test(n) ? 'de l’' : 'du ') + n.replace(/ \(essai\)$/, '') : ''; },
  // Proposer des corrections : voir le message d'origine sous la traduction, avec « Votre correction ».
  contrib() { const v = this.ls('tt-trcontrib'); return v ? v === '1' : !!(S.me && S.me.amb); },
  once: new Set(),
  origAll(cid) { return this.ls('tt-trorig:' + cid) === '1'; },
  setOrigAll(cid, on) { this.ls('tt-trorig:' + cid, on ? '1' : ''); },
  translated(m) { return !!(m && m.text && (m.orig != null && m.tlang || this.get(m.id, this.inL(m.chatId || S.chatId)))); },
  // Texte d'une bulle : le message, la traduction juste en dessous et « Votre correction » (modèle unique).
  txt(m) {
    const L = l => (LANG_FR[l] || l || '').replace(/ \(essai\)$/, ''), cid = m.chatId || S.chatId;
    const box = (label, text, extra) => `<span class="tr-recv"><small>${I.translate}${label}</small><span>${esc(text)}</span>${extra || ''}<button class="linkb" type="button" data-act="trFix" data-id="${m.id}">✎ Votre correction</button></span>`;
    if (m.from === S.me.id) {
      if (m.orig != null && m.tlang) {
        const c = S.chats.get(m.chatId), who = c && c.type === 'direct' ? first(chatTitle(c)) : 'Vos contacts';
        return `<span class="txt">${escL(m.orig)}</span>` + (this.once.has(m.id) ? box(`${esc(who)} a reçu (${esc(L(m.tlang))})${m.fx ? ' · corrigé' : ''} :`, m.text) : '');
      }
      return `<span class="txt">${escL(m.text)}</span>`;
    }
    // Sans traduction (refusée ou non activée) : le message tel qu'il a été écrit.
    const plain = `<span class="txt">${escL(m.orig != null ? m.orig : m.text)}</span>`;
    if (!S.me.trConsent || this.pend(cid)) return plain;
    const inL = this.inL(cid), fx = this.fix(m.id);
    // Le message arrive d'abord dans MA langue. Le message d'origine (langue de l'expéditeur) et « Votre correction »
    // apparaissent en dessous seulement pour ceux qui ont choisi de proposer des corrections.
    // Le message s'affiche traduit, sans rien en dessous. Le message d'origine apparaît seulement si on le demande
    // (« Message d'origine » sur ce message, ou « Toujours afficher les messages d'origine » pour la discussion).
    const show = (main, orig, ol, note) => `<span class="txt">${escL(main)}</span>` + ((this.origAll(cid) || this.once.has(m.id)) && orig.trim() !== String(main).trim() ? box(`Message d’origine${ol ? ` (${esc(L(ol))})` : ''}${note} :`, orig) : '');
    if (m.orig != null && m.tlang && (!inL || inL === m.tlang)) return show(fx ? fx.text : m.text, m.orig, m.olang, fx ? ' · votre correction appliquée' : m.fx ? ' · corrigé par l’expéditeur' : '');
    const src = m.orig != null ? m.orig : m.text, tl = inL || (this.shown.has(m.id) ? this.lang() : ''), t = tl && this.get(m.id, tl);
    if (!t || t.from === tl || t.text.trim() === src.trim()) return plain;
    return show(fx ? fx.text : t.text, src, t.from, fx ? ' · votre correction appliquée' : '');
  },
  label(cid) { const a = this.inL(cid), b = this.outL(cid); if (!S.me.trConsent) return ''; return a || b ? `<span>${a ? a.toUpperCase() : '—'}</span><i aria-hidden="true">⇄</i><span>${b ? b.toUpperCase() : '—'}</span>` : ''; },
  settingsHtml() {
    if (!this.st || !this.st.on) return '';
    return `<div class="set-block"><h2>${I.translate} Traduction</h2><p class="hint">Dans une discussion, touchez le bouton 文A à gauche de la zone d’écriture pour choisir les langues.</p>
      <label class="pick chk"><input type="checkbox" data-act="trConsentTog"${S.me.trConsent ? ' checked' : ''}><span><b>Utiliser la traduction</b></span></label>
      <div class="field"><label for="trLang">Langue pour « Traduire » sur un message</label><select id="trLang">${this.st.langs.map(l => `<option value="${l}"${l === this.lang() ? ' selected' : ''}>${LANG_FR[l] || l}</option>`).join('')}</select></div></div>`;
  },
};
